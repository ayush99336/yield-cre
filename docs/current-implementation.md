# Omni-Yield Current Implementation

Last updated: March 8, 2026

## 1. Product Scope

Omni-Yield is implemented as a World Mini App with a CRE-driven cross-chain yield backend.

- User-facing UX: World ID verify, wallet auth, dashboard, deposit, withdraw.
- Backend orchestration: APR monitoring on destination chains and rebalance decisions.
- Settlement path: `YieldVault` (home chain) + `YieldReceiver` (destination chains) over CCIP.

## 2. Runtime Modes

Two explicit runtime modes are implemented:

- `testnet_hybrid`:
  - ETH Sepolia home vault path (World Sepolia fallback preserved).
  - Arbitrum Sepolia + OP Sepolia APR monitoring.
  - Deposit/withdraw in UI are explicitly operator-assisted.
  - Admin APIs (`/api/admin/deposit`, `/api/admin/rebalance`, `/api/admin/sync`) are primary demo path.
- `mainnet_live`:
  - Mainnet shadow vault path for real MiniKit transaction execution.
  - Direct in-app deposit/withdraw enabled.
  - Cap + pause guardrails available on vault.

## 3. Architecture

### 3.1 Contracts

- `contracts/src/YieldVault.sol`
  - Share accounting: `shares`, `totalShares`, `managedAssets`
  - User actions: `deposit`, `depositPrefunded`, `depositPrefundedFor`, `withdraw`
  - Rebalance authority: `creForwarder || owner`
  - CCIP handling: source selector/sender checks, rebalance/withdraw completion handlers
  - Guardrails: `setMaxDepositAmount`, `setDepositsPaused`
- `contracts/src/YieldReceiver.sol`
  - CCIP receiver on destination chain
  - Aave supply/withdraw routing
  - Trusted sender validation
- `contracts/src/libraries/MessageCodec.sol`
  - cross-chain message encode/decode + message type enum

### 3.2 CRE Workflow

- `services/cre-workflow/cre/omni-yield/workflow.ts`
  - Reads Aave `liquidityRate` per enabled destination
  - Reads vault `currentYieldChain`
  - Applies deterministic threshold + cooldown decision
  - Calls vault `initiateRebalance` when criteria pass
- `services/cre-workflow/cre/omni-yield/config.json`
  - generated from registry using `npm run config:sync`

### 3.3 API + Persistence

- Next.js API routes:
  - `POST /api/verify`
  - `POST /api/session`
  - `GET /api/position`
  - `POST /api/admin/rebalance`
  - `POST /api/admin/deposit`
  - `POST /api/admin/sync`
  - `GET /api/health`
- Prisma models:
  - `WorldIdProof`, `UserSession`, `PositionSnapshot`, `VaultEvent`, `RebalanceAction`
- Action/event persistence:
  - admin rebalance/deposit/sync paths create status transitions and event records

### 3.4 Frontend

- Pages:
  - `/` verify + wallet auth
  - `/app` dashboard with observability cards
  - `/deposit`, `/withdraw`
- Mode-aware behavior:
  - `testnet_hybrid`: direct MiniKit tx disabled with explicit operator CTA
  - `mainnet_live`: direct MiniKit tx enabled
- Dashboard telemetry:
  - current chain
  - best chain candidate
  - spread vs threshold
  - latest rebalance status
  - latest CRE decision payload

## 4. Registry + Config Pipeline

Implemented single source-of-truth registry artifacts:

- `deployments/addresses.testnet.json`
- `deployments/addresses.mainnet.json`

Generated consumers:

- CRE config: `services/cre-workflow/cre/omni-yield/config.json`
- env export file: `.env.registry.generated`

Command:

```bash
npm run config:sync
```

## 5. Deployment Assets

- Testnet hybrid deploy:
  - `scripts/deploy-world-sepolia-mvp.sh`
  - `scripts/deploy-testnet-crosschain.sh`
- Mainnet shadow deploy:
  - `scripts/deploy-mainnet-shadow.sh`
  - `scripts/deploy-mainnet-shadow.env.example`
- Allowlist checklist artifacts:
  - `deployments/allowlist.mainnet-shadow.example.json`
  - generated `deployments/allowlist.mainnet-shadow.json` (local)

## 6. Verification Status

Validated in current tree:

- Contracts: `forge test` passing.
- CRE workflow tests: `bun test` passing.
- App: `npm run typecheck -w @yield-cre/world-mini-app` passing.
- App production build: `npm run build -w @yield-cre/world-mini-app` passing.

## 7. Known Constraints

- MiniKit transaction rail is only dependable in `mainnet_live` mode.
- Testnet hybrid mode intentionally routes tx execution through admin/operator APIs for demo reliability.
- CCIP world-home testnet lanes may require ETH Sepolia fallback depending on lane availability.

## 8. Primary Resources

- World docs: `reference.txt`
- Product requirements: `omni-yield-spec.md`
- Ops guide: `docs/ops-runbook.md`
