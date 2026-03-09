import { createPublicClient, formatUnits, http } from 'viem'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAdminKey } from '@/src/lib/server/auth'
import { prisma } from '@/src/lib/server/db'
import { getServerRuntimeConfig } from '@/src/lib/server/runtime-config'

const bodySchema = z.object({
  walletAddress: z.string().optional(),
})

const vaultReadAbi = [
  {
    type: 'function',
    name: 'currentYieldChain',
    inputs: [],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUserBalance',
    inputs: [{ name: 'user', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
] as const

const aaveDataProviderAbi = [
  {
    type: 'function',
    name: 'getReserveData',
    inputs: [{ name: 'asset', type: 'address', internalType: 'address' }],
    outputs: [
      { name: 'unbacked', type: 'uint256', internalType: 'uint256' },
      { name: 'accruedToTreasuryScaled', type: 'uint256', internalType: 'uint256' },
      { name: 'totalAToken', type: 'uint256', internalType: 'uint256' },
      { name: 'totalStableDebt', type: 'uint256', internalType: 'uint256' },
      { name: 'totalVariableDebt', type: 'uint256', internalType: 'uint256' },
      { name: 'liquidityRate', type: 'uint256', internalType: 'uint256' },
      { name: 'variableBorrowRate', type: 'uint256', internalType: 'uint256' },
      { name: 'stableBorrowRate', type: 'uint256', internalType: 'uint256' },
      { name: 'averageStableBorrowRate', type: 'uint256', internalType: 'uint256' },
      { name: 'liquidityIndex', type: 'uint256', internalType: 'uint256' },
      { name: 'variableBorrowIndex', type: 'uint256', internalType: 'uint256' },
      { name: 'lastUpdateTimestamp', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
] as const

const RAY_TO_BPS_DIVISOR = 100000000000000000000000n

export async function POST(request: Request) {
  const isAdmin = await requireAdminKey(request)
  if (!isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  const runtime = getServerRuntimeConfig()
  if (!runtime.home.vaultAddress) {
    return NextResponse.json({ error: 'HOME_VAULT_ADDRESS is not configured' }, { status: 500 })
  }
  if (runtime.destinationChains.length === 0) {
    return NextResponse.json({ error: 'no destination chains configured' }, { status: 500 })
  }

  const action = await prisma.rebalanceAction.create({
    data: {
      targetChain: 'sync',
      triggeredBy: 'admin-api',
      status: 'queued',
      notes: 'sync started',
    },
  })

  try {
    const homeClient = createPublicClient({
      chain: runtime.home.chain,
      transport: http(runtime.home.rpcUrl),
    })

    const chainStatuses = await Promise.all(
      runtime.destinationChains.map(async (chain) => {
        if (
          !chain.enabled ||
          !/^0x[a-fA-F0-9]{40}$/.test(chain.usdc) ||
          !/^0x[a-fA-F0-9]{40}$/.test(chain.dataProvider)
        ) {
          return {
            id: chain.id,
            aprBps: 0,
            lastUpdate: 0,
            enabled: chain.enabled,
            warning: 'missing_chain_config',
          }
        }
        try {
          const client = createPublicClient({
            chain: {
              id: chain.chainId,
              name: chain.chainName,
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: { default: { http: [chain.rpcUrl] } },
            },
            transport: http(chain.rpcUrl),
          })
          const reserveData = await client.readContract({
            address: chain.dataProvider as `0x${string}`,
            abi: aaveDataProviderAbi,
            functionName: 'getReserveData',
            args: [chain.usdc as `0x${string}`],
          })
          const liquidityRate = reserveData[5]
          const lastUpdateTimestamp = Number(reserveData[11])
          const aprBps = Number(liquidityRate / RAY_TO_BPS_DIVISOR)
          return {
            id: chain.id,
            aprBps,
            lastUpdate: lastUpdateTimestamp,
            enabled: true,
          }
        } catch (error) {
          return {
            id: chain.id,
            aprBps: 0,
            lastUpdate: 0,
            enabled: chain.enabled,
            warning: error instanceof Error ? error.message : 'apr_read_failed',
          }
        }
      }),
    )

    const currentYieldChain = await homeClient.readContract({
      address: runtime.home.vaultAddress,
      abi: vaultReadAbi,
      functionName: 'currentYieldChain',
    })

    const best = chainStatuses.reduce((acc, current) => (current.aprBps > acc.aprBps ? current : acc), chainStatuses[0])
    const currentSnapshot = chainStatuses.find((snapshot) => snapshot.id === currentYieldChain)
    const currentAprBps = currentSnapshot?.aprBps ?? 0
    const diffBps = Math.max(best.aprBps - currentAprBps, 0)

    const latestRebalance = await prisma.rebalanceAction.findFirst({
      where: { targetChain: { not: 'sync' } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    const nowSeconds = Math.floor(Date.now() / 1000)
    const lastRebalanceAtSeconds = latestRebalance ? Math.floor(latestRebalance.createdAt.getTime() / 1000) : 0
    const cooldownRemaining = Math.max(0, runtime.cooldownSeconds - Math.max(nowSeconds - lastRebalanceAtSeconds, 0))

    const decision =
      currentYieldChain === best.id
        ? { decision: 'skip' as const, reason: 'already-best-chain' }
        : diffBps < runtime.rebalanceThresholdBps
          ? { decision: 'skip' as const, reason: 'below-threshold' }
          : cooldownRemaining > 0
            ? { decision: 'skip' as const, reason: 'cooldown-active' }
            : { decision: 'rebalance' as const, reason: 'threshold-met' }

    const wallets =
      parsed.data.walletAddress && /^0x[a-fA-F0-9]{40}$/.test(parsed.data.walletAddress)
        ? [parsed.data.walletAddress]
        : (
            await prisma.userSession.findMany({
              where: { expiresAt: { gte: new Date() } },
              select: { walletAddress: true },
              distinct: ['walletAddress'],
            })
          ).map((session) => session.walletAddress)

    const positionWrites = await Promise.all(
      wallets
        .filter((wallet) => /^0x[a-fA-F0-9]{40}$/.test(wallet))
        .map(async (walletAddress) => {
          const userBalance = await homeClient.readContract({
            address: runtime.home.vaultAddress as `0x${string}`,
            abi: vaultReadAbi,
            functionName: 'getUserBalance',
            args: [walletAddress as `0x${string}`],
          })
          return prisma.positionSnapshot.create({
            data: {
              walletAddress,
              totalAssets: formatUnits(userBalance, 6),
              activeChain: currentYieldChain || 'unknown',
              aprBps: currentAprBps,
            },
          })
        }),
    )

    const batchId = crypto.randomUUID()
    await prisma.vaultEvent.createMany({
      data: [
        {
          chain: runtime.home.chain.name,
          txHash: `sync-apr-${batchId}`,
          eventType: 'apr_snapshot',
          payload: {
            mode: runtime.mode,
            chainStatusSnapshots: chainStatuses,
            bestChain: best.id,
            actionId: action.id,
          },
        },
        {
          chain: runtime.home.chain.name,
          txHash: `sync-decision-${batchId}`,
          eventType: 'rebalance_decision',
          payload: {
            mode: runtime.mode,
            currentChain: currentYieldChain,
            bestChain: best.id,
            diffBps,
            thresholdBps: runtime.rebalanceThresholdBps,
            cooldownRemaining,
            decision: decision.decision,
            reason: decision.reason,
            actionId: action.id,
          },
        },
      ],
    })

    await prisma.rebalanceAction.update({
      where: { id: action.id },
      data: {
        status: 'completed',
        notes: `snapshots=${positionWrites.length}`,
      },
    })

    return NextResponse.json({
      id: action.id,
      status: 'ok',
      executionMode: runtime.mode,
      currentYieldChain,
      chainStatusSnapshots: chainStatuses,
      rebalanceDecision: {
        currentChain: currentYieldChain,
        bestChain: best.id,
        diffBps,
        thresholdBps: runtime.rebalanceThresholdBps,
        cooldownRemaining,
        decision: decision.decision,
        reason: decision.reason,
      },
      snapshotsWritten: positionWrites.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sync_failed'
    await prisma.rebalanceAction.update({
      where: { id: action.id },
      data: {
        status: 'failed',
        notes: message,
      },
    })
    return NextResponse.json({ error: 'sync_failed', detail: message }, { status: 500 })
  }
}
