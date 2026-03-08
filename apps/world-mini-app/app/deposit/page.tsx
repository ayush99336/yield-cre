'use client'

import { Command, MiniKit, isCommandAvailable } from '@worldcoin/minikit-js'
import { useState } from 'react'
import { parseUnits } from 'viem'

import { env } from '@/src/lib/env'
import { homeVaultAddress, isHomeVaultConfigured, vaultAbi } from '@/src/lib/vault'
import { useAppStore } from '@/src/lib/store'

const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

export default function DepositPage() {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const { txStatus, setTxStatus } = useAppStore()

  const canUseMiniKitTx = () => {
    try {
      return MiniKit.isInstalled() && isCommandAvailable(Command.SendTransaction)
    } catch {
      return false
    }
  }

  const simulateTxLifecycle = () => {
    setTxStatus('ccip_pending')
    setTimeout(() => setTxStatus('settled'), 1200)
  }

  async function submitDeposit() {
    setError('')
    setTxStatus('signing')

    try {
      if (!isHomeVaultConfigured) {
        throw new Error(
          'Vault is not configured. Set NEXT_PUBLIC_HOME_VAULT_ADDRESS to your deployed YieldVault address.',
        )
      }

      const parsedAmount = Number(amount)
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Enter a valid deposit amount greater than 0')
      }

      const amountUnits = parseUnits(amount, 6)

      if (canUseMiniKitTx()) {
        const transactions = [
          ...(/^0x[a-fA-F0-9]{40}$/.test(env.homeUsdcAddress)
            ? [
                {
                  address: env.homeUsdcAddress as `0x${string}`,
                  abi: erc20Abi,
                  functionName: 'approve',
                  args: [homeVaultAddress, amountUnits],
                },
              ]
            : []),
          {
            address: homeVaultAddress,
            abi: vaultAbi,
            functionName: 'deposit',
            args: [amountUnits],
          },
        ]

        const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
          transaction: transactions,
        })

        if (finalPayload.status !== 'success') {
          setTxStatus('failed')
          setError(
            finalPayload.error_code === 'simulation_failed'
              ? 'Simulation failed: check USDC allowance, vault address, and vault gas funding for CCIP fees.'
              : finalPayload.error_code,
          )
          return
        }

        setTxStatus('submitted')
        return
      }

      if (env.worldIdDevBypass) {
        simulateTxLifecycle()
        return
      }

      throw new Error(
        "MiniKit 'send-transaction' command is unavailable. Open in World App, or enable NEXT_PUBLIC_WORLD_ID_DEV_BYPASS=true for desktop testing.",
      )
    } catch (e) {
      setTxStatus('failed')
      setError(e instanceof Error ? e.message : 'deposit failed')
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Deposit</h1>
      <p className="mt-2 text-sm text-muted">
        Calls `YieldVault.deposit()` with MiniKit `send_transaction`; falls back to simulated lifecycle in
        dev bypass mode.
      </p>

      <div className="mt-6 grid gap-3">
        <input
          className="rounded-xl border border-slate-600 bg-surface px-4 py-3"
          placeholder="Amount in USDC"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button className="rounded-xl bg-accent px-5 py-3 font-semibold text-black" onClick={submitDeposit}>
          Submit Deposit
        </button>
      </div>

      <p className="mt-6 text-sm text-muted">TX status: {txStatus}</p>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </main>
  )
}
