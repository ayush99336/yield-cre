# Yield CRE Monorepo

Cross-chain yield optimizer scaffold for a World Mini App that uses Chainlink CRE and CCIP.

## Structure

- `apps/world-mini-app` - user-facing mini app
- `services/cre-workflow` - workflow automation service for APR monitoring + rebalance decisions
- `contracts` - smart contracts for vault/manager logic and bridge hooks
- `packages/shared` - shared types and utilities

## Quick start

```bash
npm install
npm run dev:workflow
npm run dev:mini-app
```

## Next implementation steps

1. Set up MiniKit app shell in `apps/world-mini-app`.
2. Integrate `@chainlink/cre-sdk` in `services/cre-workflow`.
3. Add Foundry or Hardhat config in `contracts`.
4. Implement strategy and guardrails from `omni-yield-spec.docx`.
