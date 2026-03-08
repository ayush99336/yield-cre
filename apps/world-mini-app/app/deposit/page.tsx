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
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

export default function DepositPage() {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [debugUrl, setDebugUrl] = useState('')
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
    setDebugUrl('')
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
        if (!/^0x[a-fA-F0-9]{40}$/.test(env.homeUsdcAddress)) {
          throw new Error('NEXT_PUBLIC_HOME_USDC_ADDRESS is not configured to a valid token address.')
        }

        const depositTx = await MiniKit.commandsAsync.sendTransaction({
          transaction: [
            {
              address: env.homeUsdcAddress as `0x${string}`,
              abi: erc20Abi,
              functionName: 'transfer',
              args: [homeVaultAddress, amountUnits],
            },
            {
              address: homeVaultAddress,
              abi: vaultAbi,
              functionName: 'depositPrefunded',
              args: [amountUnits],
            },
          ],
        })

        if (depositTx.finalPayload.status !== 'success') {
          setTxStatus('failed')
          const details = JSON.stringify(depositTx.finalPayload.details ?? {})
          const detailDebugUrl =
            (depositTx.finalPayload.details?.debugUrl as string | undefined) ??
            (depositTx.finalPayload.details?.debug_url as string | undefined) ??
            (depositTx.finalPayload.details?.tenderlyUrl as string | undefined) ??
            ''
          if (detailDebugUrl) setDebugUrl(detailDebugUrl)
          setError(
            depositTx.finalPayload.error_code === 'simulation_failed'
              ? `Deposit simulation failed (${details}).`
              : `${depositTx.finalPayload.error_code} (${details})`,
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
        Uses approve-free flow for World App: token `transfer()` to vault + `depositPrefunded()` in a single
        MiniKit transaction.
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
      {debugUrl ? (
        <p className="mt-2 text-xs text-amber-300">
          Debug URL: <a className="underline" href={debugUrl}>{debugUrl}</a>
        </p>
      ) : null}
    </main>
  )
}
