'use client'

import { Command, MiniKit, VerificationLevel, isCommandAvailable } from '@worldcoin/minikit-js'
import Link from 'next/link'
import { useState } from 'react'

import { env } from '@/src/lib/env'
import { useAppStore } from '@/src/lib/store'

export default function LandingPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState<'verify' | 'wallet' | ''>('')

  const { isVerified, walletAddress, setVerified, setWalletAddress, setSession, proofId } = useAppStore()

  const isMiniKitAvailable = () => {
    try {
      return MiniKit.isInstalled()
    } catch {
      return false
    }
  }

  async function readJsonSafely<T = Record<string, unknown>>(response: Response): Promise<T | null> {
    const raw = await response.text()
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async function handleVerify() {
    setLoading('verify')
    setError('')
    try {
      const signal = walletAddress || 'wallet-pending'
      const hasVerifyCommand = isMiniKitAvailable() && isCommandAvailable(Command.Verify)

      let proofPayload: unknown
      if (hasVerifyCommand) {
        const { finalPayload } = await MiniKit.commandsAsync.verify({
          action: env.worldIdAction,
          signal,
          verification_level: VerificationLevel.Device,
        })

        if (finalPayload.status !== 'success') {
          if (env.worldIdDevBypass) {
            proofPayload = {
              nullifier_hash: `dev-${crypto.randomUUID()}`,
              verification_level: 'device',
              merkle_root: '0x0',
              proof: '0x0',
            }
          } else {
            throw new Error(`verification failed: ${finalPayload.error_code}`)
          }
        } else {
          proofPayload = finalPayload
        }
      } else if (env.worldIdDevBypass) {
        proofPayload = {
          nullifier_hash: `dev-${crypto.randomUUID()}`,
          verification_level: 'device',
          merkle_root: '0x0',
          proof: '0x0',
        }
      } else {
        throw new Error(
          "MiniKit 'verify' command is unavailable. Open inside World App or enable NEXT_PUBLIC_WORLD_ID_DEV_BYPASS=true for local dev.",
        )
      }

      const verifyRes = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proof: proofPayload,
          signal,
          action: env.worldIdAction,
        }),
      })

      const payload = await readJsonSafely<{ error?: string; detail?: string; proofId?: string }>(verifyRes)

      if (!verifyRes.ok) {
        throw new Error(
          payload?.detail
            ? `${payload.error || 'verification_failed'}: ${payload.detail}`
            : payload?.error || `server verification failed (${verifyRes.status})`,
        )
      }

      if (!payload?.proofId) {
        throw new Error('verify endpoint returned no proof id')
      }

      setVerified(true)
      setSession('', payload.proofId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'verification failed')
    } finally {
      setLoading('')
    }
  }

  async function handleWalletAuth() {
    setLoading('wallet')
    setError('')
    try {
      const hasWalletAuthCommand = isMiniKitAvailable() && isCommandAvailable(Command.WalletAuth)
      let resolvedWalletAddress = ''

      if (hasWalletAuthCommand) {
        const nonce = crypto.randomUUID()
        const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
          nonce,
          statement: 'Sign in to Omni-Yield',
        })

        if (finalPayload.status !== 'success') {
          throw new Error(`wallet auth failed: ${finalPayload.error_code}`)
        }
        resolvedWalletAddress = finalPayload.address
      } else if (env.worldIdDevBypass) {
        resolvedWalletAddress = env.devWalletAddress
      } else {
        throw new Error(
          "MiniKit 'wallet-auth' command is unavailable. Open inside World App or enable NEXT_PUBLIC_WORLD_ID_DEV_BYPASS=true for local dev.",
        )
      }

      setWalletAddress(resolvedWalletAddress)

      const sessionRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          walletAddress: resolvedWalletAddress,
          proofId: proofId || undefined,
        }),
      })
      if (!sessionRes.ok) {
        throw new Error('session creation failed')
      }

      const payload = await sessionRes.json()
      setSession(payload.sessionToken, proofId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'wallet auth failed')
    } finally {
      setLoading('')
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <section className="rounded-3xl border border-slate-700/40 bg-surface/80 p-10 shadow-2xl shadow-black/40">
        <p className="text-sm uppercase tracking-[0.22em] text-accent">Omni-Yield MVP</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">
          World ID gated cross-chain yield optimizer.
        </h1>

        <div className="mt-8 grid gap-3 sm:max-w-xl">
          <button
            className="rounded-xl bg-accent px-5 py-3 text-left text-sm font-semibold text-black disabled:opacity-50"
            onClick={handleVerify}
            disabled={loading !== ''}
          >
            {loading === 'verify' ? 'Verifying with World ID...' : '1) Verify with World ID'}
          </button>

          <button
            className="rounded-xl border border-slate-600 px-5 py-3 text-left text-sm font-medium text-ink disabled:opacity-50"
            onClick={handleWalletAuth}
            disabled={loading !== '' || !isVerified}
          >
            {loading === 'wallet' ? 'Requesting wallet auth...' : '2) Authenticate wallet (MiniKit wallet_auth)'}
          </button>
        </div>

        <div className="mt-6 space-y-1 text-sm text-muted">
          <p>Verified: {isVerified ? 'yes' : 'no'}</p>
          <p>Wallet: {walletAddress || 'not connected'}</p>
        </div>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

        <div className="mt-8 flex gap-4">
          <Link
            className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-black"
            href="/app"
          >
            Open Dashboard
          </Link>
          <Link
            className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-medium text-ink"
            href="/deposit"
          >
            Deposit Flow
          </Link>
          <Link
            className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-medium text-ink"
            href="/withdraw"
          >
            Withdraw Flow
          </Link>
        </div>
      </section>
    </main>
  )
}
