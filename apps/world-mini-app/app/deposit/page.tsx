'use client'

import { MiniKit } from '@worldcoin/minikit-js'
import { useState } from 'react'

import { homeVaultAddress, vaultAbi } from '@/src/lib/vault'
import { useAppStore } from '@/src/lib/store'

export default function DepositPage() {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const { txStatus, setTxStatus } = useAppStore()

  async function submitDeposit() {
    setError('')
    setTxStatus('submitted')

    try {
      const amountUnits = BigInt(Math.floor(Number(amount) * 1_000_000))
      const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: homeVaultAddress,
            abi: vaultAbi,
            functionName: 'deposit',
            args: [amountUnits],
          },
        ],
      })

      if (finalPayload.status !== 'success') {
        setTxStatus('failed')
        setError(finalPayload.error_code)
        return
      }

      setTxStatus('ccip_pending')
      setTimeout(() => setTxStatus('settled'), 1200)
    } catch (e) {
      setTxStatus('failed')
      setError(e instanceof Error ? e.message : 'deposit failed')
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Deposit</h1>
      <p className="mt-2 text-sm text-muted">Calls `YieldVault.deposit()` using MiniKit `send_transaction`.</p>

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
