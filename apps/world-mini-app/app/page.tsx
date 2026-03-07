'use client'

import { MiniKit } from '@worldcoin/minikit-js'
import Link from 'next/link'
import { useState } from 'react'

import { useAppStore } from '@/src/lib/store'

export default function LandingPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState<'verify' | 'wallet' | ''>('')

  const { isVerified, walletAddress, setVerified, setWalletAddress, setSession, proofId } = useAppStore()

  async function handleVerify() {
    setLoading('verify')
    setError('')
    try {
      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action: 'omni-yield-access',
        signal: walletAddress || 'wallet-pending',
      })

      if (finalPayload.status !== 'success') {
        throw new Error(`verification failed: ${finalPayload.error_code}`)
      }

      const verifyRes = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proof: finalPayload,
          signal: walletAddress || 'wallet-pending',
          action: 'omni-yield-access',
        }),
      })

      if (!verifyRes.ok) {
        const payload = await verifyRes.json()
        throw new Error(payload.error || 'server verification failed')
      }

      const payload = await verifyRes.json()
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
      const nonce = crypto.randomUUID()
      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce,
        statement: 'Sign in to Omni-Yield',
      })

      if (finalPayload.status !== 'success') {
        throw new Error(`wallet auth failed: ${finalPayload.error_code}`)
      }

      setWalletAddress(finalPayload.address)

      const sessionRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          walletAddress: finalPayload.address,
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
