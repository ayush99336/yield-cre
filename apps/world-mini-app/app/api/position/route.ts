import { NextResponse } from 'next/server'
import { createPublicClient, formatUnits, http } from 'viem'

import { loadSession } from '@/src/lib/server/auth'
import { prisma } from '@/src/lib/server/db'
import { getServerRuntimeConfig } from '@/src/lib/server/runtime-config'

const positionReadAbi = [
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

export async function GET(request: Request) {
  const session = await loadSession(request)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const latestSnapshot = await prisma.positionSnapshot.findFirst({
    where: { walletAddress: session.walletAddress },
    orderBy: { createdAt: 'desc' },
  })

  const recentActions = await prisma.rebalanceAction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  const runtime = getServerRuntimeConfig()
  const vaultAddress = runtime.home.vaultAddress
  const rpcUrl = runtime.home.rpcUrl
  const isWalletAddress = /^0x[a-fA-F0-9]{40}$/.test(session.walletAddress)
  const isVaultAddress = !!vaultAddress && /^0x[a-fA-F0-9]{40}$/.test(vaultAddress)

  let position = latestSnapshot
  let warning: string | undefined
  let source: 'onchain' | 'snapshot' | 'empty' = latestSnapshot ? 'snapshot' : 'empty'

  if (isVaultAddress && rpcUrl && isWalletAddress) {
    try {
      const client = createPublicClient({
        chain: runtime.home.chain,
        transport: http(rpcUrl),
      })

      const [userBalanceRaw, activeChainRaw] = await Promise.all([
        client.readContract({
          address: vaultAddress,
          abi: positionReadAbi,
          functionName: 'getUserBalance',
          args: [session.walletAddress as `0x${string}`],
        }),
        client.readContract({
          address: vaultAddress,
          abi: positionReadAbi,
          functionName: 'currentYieldChain',
        }),
      ])

      const computedPosition = {
        id: latestSnapshot?.id ?? `onchain-${session.walletAddress}`,
        walletAddress: session.walletAddress,
        totalAssets: formatUnits(userBalanceRaw, 6),
        activeChain: activeChainRaw || 'unknown',
        aprBps: latestSnapshot?.aprBps ?? 0,
        createdAt: latestSnapshot?.createdAt ?? new Date(),
      }
      position = computedPosition
      source = 'onchain'
    } catch (error) {
      console.error('position on-chain read failed:', error)
      warning = 'onchain_read_failed'
    }
  } else if (!isVaultAddress) {
    warning = 'vault_not_configured'
  }

  if (!latestSnapshot) {
    warning = warning ?? 'apr_snapshot_missing'
  }

  const latestAprSnapshot = await prisma.vaultEvent.findFirst({
    where: { eventType: 'apr_snapshot' },
    orderBy: { createdAt: 'desc' },
  })
  const latestDecision = await prisma.vaultEvent.findFirst({
    where: { eventType: 'rebalance_decision' },
    orderBy: { createdAt: 'desc' },
  })

  const chainStatusSnapshots = (latestAprSnapshot?.payload as { chainStatusSnapshots?: unknown } | null)
    ?.chainStatusSnapshots
  const rebalanceDecision = latestDecision?.payload ?? null

  return NextResponse.json({
    walletAddress: session.walletAddress,
    position,
    recentRebalances: recentActions,
    chainStatusSnapshots: Array.isArray(chainStatusSnapshots) ? chainStatusSnapshots : [],
    rebalanceDecision,
    meta: {
      warning,
      source,
      executionMode: runtime.mode,
    },
  })
}
