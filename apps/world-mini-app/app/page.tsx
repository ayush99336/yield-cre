import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <section className="rounded-3xl border border-slate-700/40 bg-surface/80 p-10 shadow-2xl shadow-black/40">
        <p className="text-sm uppercase tracking-[0.22em] text-accent">Omni-Yield MVP</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">
          Cross-chain yield optimization for World Mini App users.
        </h1>
        <p className="mt-4 max-w-2xl text-muted">
          Stage 12 scaffold is active. Next commits add World ID gate, wallet auth, deposit, withdraw,
          and dashboard integration.
        </p>

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
        </div>
      </section>
    </main>
  )
}
