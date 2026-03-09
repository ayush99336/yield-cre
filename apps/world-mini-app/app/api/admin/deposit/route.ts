import { createPublicClient, createWalletClient, http, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAdminKey } from '@/src/lib/server/auth'
import { prisma } from '@/src/lib/server/db'
import { getServerRuntimeConfig } from '@/src/lib/server/runtime-config'

const bodySchema = z
  .object({
    walletAddress: z.string().min(1),
    amount: z.string().optional(),
    amountUnits: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((value) => Boolean(value.amount || value.amountUnits), {
    message: 'amount or amountUnits is required',
    path: ['amount'],
  })

const erc20Abi = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address', internalType: 'address' },
      { name: 'value', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

const vaultAbi = [
  {
    type: 'function',
    name: 'depositPrefundedFor',
    inputs: [
      { name: 'depositor', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

const parseAmountUnits = (amount?: string, amountUnits?: string): bigint => {
  if (amountUnits) {
    return BigInt(amountUnits)
  }
  if (!amount) {
    throw new Error('amount is required')
  }
  return parseUnits(amount, 6)
}

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

  if (!/^0x[a-fA-F0-9]{40}$/.test(parsed.data.walletAddress)) {
    return NextResponse.json({ error: 'walletAddress must be a valid EVM address' }, { status: 400 })
  }

  const runtime = getServerRuntimeConfig()
  const privateKey = runtime.adminRebalancePrivateKey
  const vaultAddress = runtime.home.vaultAddress
  const usdcAddress = runtime.home.usdcAddress

  const action = await prisma.rebalanceAction.create({
    data: {
      targetChain: 'deposit',
      triggeredBy: 'admin-api',
      status: 'queued',
      notes: parsed.data.notes,
    },
  })

  if (!privateKey || !vaultAddress || !usdcAddress) {
    await prisma.rebalanceAction.update({
      where: { id: action.id },
      data: { status: 'skipped', notes: 'missing onchain env config for deposit' },
    })
    return NextResponse.json(
      {
        id: action.id,
        status: 'skipped',
        reason: 'missing onchain env config',
      },
      { status: 200 },
    )
  }

  try {
    const amountUnits = parseAmountUnits(parsed.data.amount, parsed.data.amountUnits)
    const account = privateKeyToAccount(privateKey)

    const walletClient = createWalletClient({
      account,
      chain: runtime.home.chain,
      transport: http(runtime.home.rpcUrl),
    })
    const publicClient = createPublicClient({
      chain: runtime.home.chain,
      transport: http(runtime.home.rpcUrl),
    })

    const transferHash = await walletClient.writeContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [vaultAddress, amountUnits],
    })
    await publicClient.waitForTransactionReceipt({ hash: transferHash })

    const creditHash = await walletClient.writeContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: 'depositPrefundedFor',
      args: [parsed.data.walletAddress as `0x${string}`, amountUnits],
    })
    await publicClient.waitForTransactionReceipt({ hash: creditHash })

    await prisma.vaultEvent.createMany({
      data: [
        {
          chain: runtime.home.chain.name,
          txHash: transferHash,
          eventType: 'admin_deposit_transfer',
          payload: {
            beneficiary: parsed.data.walletAddress,
            amountUnits: amountUnits.toString(),
            actionId: action.id,
          },
        },
        {
          chain: runtime.home.chain.name,
          txHash: creditHash,
          eventType: 'admin_deposit_credit',
          payload: {
            beneficiary: parsed.data.walletAddress,
            amountUnits: amountUnits.toString(),
            actionId: action.id,
          },
        },
      ],
      skipDuplicates: true,
    })

    await prisma.rebalanceAction.update({
      where: { id: action.id },
      data: {
        status: 'submitted',
        txHash: creditHash,
        notes: `transfer=${transferHash}`,
      },
    })

    return NextResponse.json({
      id: action.id,
      status: 'submitted',
      transferTxHash: transferHash,
      creditTxHash: creditHash,
      amountUnits: amountUnits.toString(),
      walletAddress: parsed.data.walletAddress,
      executionMode: runtime.mode,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'admin deposit failed'
    await prisma.rebalanceAction.update({
      where: { id: action.id },
      data: {
        status: 'failed',
        notes: message,
      },
    })
    return NextResponse.json({ error: 'deposit_failed', detail: message }, { status: 500 })
  }
}
