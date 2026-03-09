'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { useAppStore } from '@/src/lib/store'

export default function DashboardPage() {
  const [error, setError] = useState('')
  const { sessionToken, walletAddress, position, setPosition } = useAppStore()

  useEffect(() => {
    async function fetchPosition() {
      if (!sessionToken) return
      const res = await fetch('/api/position', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
      if (!res.ok) {
        setError('Failed to load position')
        return
      }
      const payload = await res.json()
      setPosition(payload)
    }

    fetchPosition().catch(() => setError('Failed to load position'))
  }, [sessionToken, setPosition])

  const activeChain = position?.position?.activeChain ?? 'unknown'
  const aprBps = position?.position?.aprBps ?? 0
  const totalAssets = position?.position?.totalAssets ?? '0'
  const dataSource = position?.meta?.source ?? 'empty'
  const warning = position?.meta?.warning
  const executionMode = position?.meta?.executionMode ?? 'testnet_hybrid'
  const rebalanceDecision = position?.rebalanceDecision
  const bestChain = rebalanceDecision?.bestChain ?? 'unknown'
  const spreadBps = rebalanceDecision?.diffBps ?? 0
  const lastRebalance = position?.recentRebalances?.[0]

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Omni-Yield Dashboard</h1>
      <p className="mt-2 text-sm text-muted">Wallet: {walletAddress || 'not authenticated'}</p>
      <p className="mt-1 text-xs text-accent">
        Mode: {executionMode === 'mainnet_live' ? 'Mainnet Live' : 'Testnet Hybrid'}
      </p>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-700/50 bg-surface p-4">
          <p className="text-xs uppercase text-muted">Current APY</p>
          <p className="mt-2 text-2xl font-semibold">{(aprBps / 100).toFixed(2)}%</p>
        </div>
        <div className="rounded-2xl border border-slate-700/50 bg-surface p-4">
          <p className="text-xs uppercase text-muted">Vault Balance</p>
          <p className="mt-2 text-2xl font-semibold">{totalAssets}</p>
        </div>
        <div className="rounded-2xl border border-slate-700/50 bg-surface p-4">
          <p className="text-xs uppercase text-muted">Active Chain</p>
          <p className="mt-2 text-2xl font-semibold">{activeChain}</p>
        </div>
        <div className="rounded-2xl border border-slate-700/50 bg-surface p-4">
          <p className="text-xs uppercase text-muted">Best Chain</p>
          <p className="mt-2 text-2xl font-semibold">{bestChain}</p>
        </div>
        <div className="rounded-2xl border border-slate-700/50 bg-surface p-4">
          <p className="text-xs uppercase text-muted">Spread vs Threshold</p>
          <p className="mt-2 text-2xl font-semibold">
            {(spreadBps / 100).toFixed(2)}% /{' '}
            {rebalanceDecision ? (rebalanceDecision.thresholdBps / 100).toFixed(2) : '0.00'}%
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700/50 bg-surface p-4">
          <p className="text-xs uppercase text-muted">Last Rebalance</p>
          <p className="mt-2 text-sm font-semibold">
            {lastRebalance ? `${lastRebalance.status} -> ${lastRebalance.targetChain}` : 'none'}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-700/50 bg-surface p-4">
        <p className="text-sm text-muted">CRE status</p>
        <p className="mt-1 text-sm">APR monitor enabled. Rebalances run on cron + admin fallback trigger.</p>
        <p className="mt-2 text-xs text-muted">Position source: {dataSource}</p>
        {warning ? <p className="mt-1 text-xs text-amber-300">Warning: {warning}</p> : null}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-700/50 bg-surface p-4">
        <p className="text-sm text-muted">Latest CRE Decision</p>
        {rebalanceDecision ? (
          <>
            <p className="mt-1 text-sm">
              Decision: {rebalanceDecision.decision} ({rebalanceDecision.reason})
            </p>
            <p className="mt-1 text-xs text-muted">
              current={rebalanceDecision.currentChain} best={rebalanceDecision.bestChain} diffBps=
              {rebalanceDecision.diffBps} cooldownRemaining={rebalanceDecision.cooldownRemaining}s
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">No decision snapshot yet. Run admin sync.</p>
        )}
      </section>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <div className="mt-8 flex gap-3">
        <Link className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black" href="/deposit">
          Deposit
        </Link>
        <Link className="rounded-xl border border-slate-600 px-4 py-2 text-sm" href="/withdraw">
          Withdraw
        </Link>
      </div>
    </main>
  )
}
