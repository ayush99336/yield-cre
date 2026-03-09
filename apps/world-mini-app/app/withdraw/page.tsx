'use client'

import { Command, MiniKit, isCommandAvailable } from '@worldcoin/minikit-js'
import { useState } from 'react'
import { parseUnits } from 'viem'

import { env } from '@/src/lib/env'
import { homeVaultAddress, isHomeVaultConfigured, vaultAbi } from '@/src/lib/vault'
import { useAppStore } from '@/src/lib/store'

export default function WithdrawPage() {
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

  async function submitWithdraw() {
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
        throw new Error('Enter a valid share amount greater than 0')
      }

      const shareUnits = parseUnits(amount, 6)

      if (env.isTestnetHybridMode) {
        setTxStatus('admin_required')
        setError(
          'Testnet Hybrid mode: direct MiniKit withdraw is disabled. Use operator flow (manual tx or admin scripts).',
        )
        return
      }

      if (canUseMiniKitTx()) {
        const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
          transaction: [
            {
              address: homeVaultAddress,
              abi: vaultAbi,
              functionName: 'withdraw',
              args: [shareUnits],
            },
          ],
        })

        if (finalPayload.status !== 'success') {
          setTxStatus('failed')
          const details = JSON.stringify(finalPayload.details ?? {})
          const detailDebugUrl =
            (finalPayload.details?.debugUrl as string | undefined) ??
            (finalPayload.details?.debug_url as string | undefined) ??
            (finalPayload.details?.tenderlyUrl as string | undefined) ??
            ''
          if (detailDebugUrl) setDebugUrl(detailDebugUrl)
          setError(
            finalPayload.error_code === 'simulation_failed'
              ? `Simulation failed (${details}).`
              : `${finalPayload.error_code} (${details})`,
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
      setError(e instanceof Error ? e.message : 'withdraw failed')
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Withdraw</h1>
      <p className="mt-2 text-sm text-muted">
        {env.isMainnetLiveMode
          ? 'Calls `YieldVault.withdraw()` from MiniKit in live mode.'
          : 'Testnet Hybrid mode: withdraw should be handled through operator scripts/admin fallback.'}
      </p>

      {env.isTestnetHybridMode ? (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          <p>Operator CTA:</p>
          <code>{`Use cast/admin tooling to execute vault.withdraw(shares) for demo accounts on testnet.`}</code>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        <input
          className="rounded-xl border border-slate-600 bg-surface px-4 py-3"
          placeholder="Shares to withdraw"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button className="rounded-xl bg-accent px-5 py-3 font-semibold text-black" onClick={submitWithdraw}>
          Submit Withdraw
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
