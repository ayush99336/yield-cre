# Yield CRE Monorepo

Cross-chain yield optimizer scaffold for a World Mini App using Chainlink CRE + CCIP + Aave.

## Structure

- `apps/world-mini-app` - Next.js mini app + API routes
- `services/cre-workflow` - CRE workflow (APR monitoring + rebalance logic)
- `contracts` - Foundry contracts (`YieldVault`, `YieldReceiver`)
- `packages/shared` - shared TypeScript types/utilities
- `docs/ops-runbook.md` - deploy, fallback, and demo runbook

## Quick start

```bash
npm install
npm run build -w @yield-cre/world-mini-app
cd contracts && forge build && forge test
cd .. && npm run simulate:cre
```

## Key commands

- CRE simulation: `npm run simulate:cre`
- CRE unit tests: `cd services/cre-workflow/cre/omni-yield && bun test`
- Contracts tests: `cd contracts && forge test`
- Mini app local dev: `npm run dev:mini-app`

## Fallback policy

- Default home chain mode is World Chain Sepolia.
- If CCIP lanes block the flow, switch deployment to Ethereum Sepolia (`HOME_CHAIN_MODE=eth`) and update app/API envs.

Full procedure: see [`docs/ops-runbook.md`](docs/ops-runbook.md).
