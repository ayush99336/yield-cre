import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAdminKey } from '@/src/lib/server/auth'
import { prisma } from '@/src/lib/server/db'
import { getServerRuntimeConfig } from '@/src/lib/server/runtime-config'

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

  const runtime = getServerRuntimeConfig()
  const privateKey = runtime.adminRebalancePrivateKey
  const vaultAddress = runtime.home.vaultAddress
  const rpcUrl = runtime.home.rpcUrl

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
    chain: runtime.home.chain,
    transport: http(rpcUrl),
  })

  try {
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
    await prisma.vaultEvent.create({
      data: {
        chain: runtime.home.chain.name,
        txHash: hash,
        eventType: 'admin_rebalance_submitted',
        payload: {
          actionId: action.id,
          targetChain: parsed.data.targetChain,
          executionMode: runtime.mode,
        },
      },
    })

    return NextResponse.json({
      id: action.id,
      status: 'submitted',
      txHash: hash,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'rebalance_failed'
    const shouldSimulate = runtime.mode === 'testnet_hybrid' && process.env.TESTNET_REBALANCE_SIMULATION !== 'false'
    if (shouldSimulate) {
      await prisma.rebalanceAction.update({
        where: { id: action.id },
        data: {
          status: 'simulated',
          notes: `simulated due to onchain failure: ${message}`,
        },
      })
      await prisma.vaultEvent.create({
        data: {
          chain: runtime.home.chain.name,
          txHash: `sim-rebalance-${action.id}`,
          eventType: 'admin_rebalance_simulated',
          payload: {
            actionId: action.id,
            targetChain: parsed.data.targetChain,
            reason: message,
            executionMode: runtime.mode,
          },
        },
      })

      return NextResponse.json({
        id: action.id,
        status: 'simulated',
        reason: message,
      })
    }

    await prisma.rebalanceAction.update({
      where: { id: action.id },
      data: {
        status: 'failed',
        notes: message,
      },
    })
    return NextResponse.json({ error: 'rebalance_failed', detail: message }, { status: 500 })
  }
}
