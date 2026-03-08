import { NextResponse } from 'next/server'
import { createPublicClient, formatUnits, http } from 'viem'

import { loadSession } from '@/src/lib/server/auth'
import { prisma } from '@/src/lib/server/db'
import { worldSepolia } from '@/src/lib/chains'

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

  const vaultAddress = (process.env.HOME_VAULT_ADDRESS ??
    process.env.NEXT_PUBLIC_HOME_VAULT_ADDRESS) as `0x${string}` | undefined
  const rpcUrl = process.env.NEXT_PUBLIC_WORLD_SEPOLIA_RPC_URL
  const isWalletAddress = /^0x[a-fA-F0-9]{40}$/.test(session.walletAddress)
  const isVaultAddress = !!vaultAddress && /^0x[a-fA-F0-9]{40}$/.test(vaultAddress)

  let position = latestSnapshot
  let warning: string | undefined
  let source: 'onchain' | 'snapshot' | 'empty' = latestSnapshot ? 'snapshot' : 'empty'

  if (isVaultAddress && rpcUrl && isWalletAddress) {
    try {
      const client = createPublicClient({
        chain: worldSepolia,
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

  return NextResponse.json({
    walletAddress: session.walletAddress,
    position,
    recentRebalances: recentActions,
    meta: {
      warning,
      source,
    },
  })
}
