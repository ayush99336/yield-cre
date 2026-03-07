import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { worldSepolia } from '@/src/lib/chains'
import { requireAdminKey } from '@/src/lib/server/auth'
import { prisma } from '@/src/lib/server/db'

const bodySchema = z.object({
  targetChain: z.string().min(1),
  notes: z.string().optional(),
})

const vaultAbi = [
  {
    type: 'function',
    name: 'initiateRebalance',
    inputs: [{ name: 'newChain', type: 'string', internalType: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

export async function POST(request: Request) {
  const isAdmin = await requireAdminKey(request)
  if (!isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  const action = await prisma.rebalanceAction.create({
    data: {
      targetChain: parsed.data.targetChain,
      triggeredBy: 'admin-api',
      status: 'queued',
      notes: parsed.data.notes,
    },
  })

  const privateKey = process.env.ADMIN_REBALANCE_PRIVATE_KEY as `0x${string}` | undefined
  const vaultAddress = process.env.HOME_VAULT_ADDRESS as `0x${string}` | undefined
  const rpcUrl = process.env.NEXT_PUBLIC_WORLD_SEPOLIA_RPC_URL

  if (!privateKey || !vaultAddress || !rpcUrl) {
    await prisma.rebalanceAction.update({
      where: { id: action.id },
      data: { status: 'skipped', notes: 'missing onchain env config' },
    })

    return NextResponse.json({
      id: action.id,
      status: 'skipped',
      reason: 'missing onchain env config',
    })
  }

  const account = privateKeyToAccount(privateKey)
  const client = createWalletClient({
    account,
    chain: worldSepolia,
    transport: http(rpcUrl),
  })

  const hash = await client.writeContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'initiateRebalance',
    args: [parsed.data.targetChain],
  })

  await prisma.rebalanceAction.update({
    where: { id: action.id },
    data: {
      status: 'submitted',
      txHash: hash,
    },
  })

  return NextResponse.json({
    id: action.id,
    status: 'submitted',
    txHash: hash,
  })
}
