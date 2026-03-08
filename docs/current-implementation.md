# Omni-Yield Current Implementation Documentation

Last updated: March 8, 2026

## 1) Project Goal

Omni-Yield is a World Mini App that abstracts cross-chain yield management:

1. User verifies with World ID and authenticates wallet in World App.
2. User deposits into a home-chain vault.
3. CRE workflow monitors APR across destination chains.
4. When yield spread crosses threshold, vault/receiver contracts rebalance via CCIP.
5. User sees a simple "high-yield account" UX.

## 2) Monorepo Layout

- `apps/world-mini-app`: Next.js mini app + API routes + Prisma
- `services/cre-workflow`: CRE workflow implementation and simulation config
- `contracts`: Foundry contracts and deployment scripts
- `docs`: runbook and project docs
- `scripts`: helper deploy scripts for World Sepolia MVP

## 3) Architecture Overview

### 3.1 Logical planes

- User plane: World App webview + MiniKit commands + Next.js UI
- API plane: session, verification, position reads, admin rebalance
- Orchestration plane: CRE cron workflow with deterministic APR decision logic
- Settlement plane: `YieldVault` + `YieldReceiver` contracts, CCIP messaging, Aave integration

### 3.2 High-level flow

1. World ID verification (`/api/world-id/rp-context` + `/api/verify`)
2. Wallet authentication (`wallet_auth` + `/api/session`)
3. Deposit/withdraw request from mini app UI
4. Vault accounting updates shares/assets
5. CRE reads APR on destination chains and triggers rebalance when rules pass
6. CCIP moves funds via receiver contracts and vault updates active chain

## 4) Current Implementation by Component

## 4.1 Smart contracts (`contracts/`)

### Implemented contracts

- `YieldVault.sol`
- `YieldReceiver.sol`
- `MessageCodec.sol`
- chain config and deployment scripts (`Deploy.s.sol`, `DeployVaultOnly.s.sol`, helper scripts)

### `YieldVault` highlights

- Share accounting:
  - `shares[user]`
  - `totalShares`
  - `managedAssets`
- Core public methods:
  - `deposit(uint256)` (ERC20 transferFrom path)
  - `depositPrefunded(uint256)` (approve-free path for MiniKit)
  - `withdraw(uint256 shares)`
  - `initiateRebalance(string newChain)` with `onlyRebalanceAuthority`
  - `currentYieldChain()`, `totalAssets()`, `getUserBalance(address)`
- Rebalance authority:
  - `msg.sender == creForwarder || msg.sender == owner()`
- CCIP guards in `ccipReceive`:
  - router check
  - source selector check
  - source sender check
- Message types handled:
  - `DEPOSIT`
  - `WITHDRAW_ALL`
  - `WITHDRAW_FOR_USER`
  - `REBALANCE_COMPLETE`
  - `WITHDRAW_COMPLETE`

### `YieldReceiver` highlights

- Accepts CCIP messages from trusted home selector and trusted vault sender.
- On `DEPOSIT`: supplies to Aave pool.
- On `WITHDRAW_ALL`: withdraws all and returns `REBALANCE_COMPLETE`.
- On `WITHDRAW_FOR_USER`: withdraws requested amount and returns `WITHDRAW_COMPLETE`.

### Test coverage status

- `forge test` passing.
- Includes accounting, auth, rebalance lifecycle, invalid source, and prefunded deposit coverage.

## 4.2 CRE workflow (`services/cre-workflow/cre/omni-yield`)

### Implemented logic

- Cron-driven handler (`schedule` in config, default `*/10 * * * *`)
- Reads Aave reserve `liquidityRate` per enabled chain
- Converts APR RAY to BPS
- Reads `currentYieldChain` from vault
- Applies decision rules:
  - best chain different from current
  - spread >= `rebalanceThresholdBps`
  - cooldown elapsed (`cooldownSeconds`)
- Writes `initiateRebalance(targetChain)` to vault when conditions pass

### Deterministic behavior

- Uses scheduled execution time from payload
- No `Date.now`/`Math.random`-based decision logic in workflow path

### Tests

- Decision tests cover:
  - already-best-chain
  - below-threshold
  - cooldown-active
  - current-chain-not-enabled
  - successful rebalance decision
- Guard tests for invalid runtime conditions

## 4.3 World Mini App frontend (`apps/world-mini-app/app`)

### Implemented pages

- `/`: verify + wallet auth gate
- `/app`: dashboard
- `/deposit`: deposit flow
- `/withdraw`: withdraw flow

### Verification flow (current)

- RP-context-first World ID v4:
  - client requests signed `rp_context` from `/api/world-id/rp-context`
  - client runs IDKit request/poll
  - proof posted to `/api/verify`
- Fallback chain:
  - MiniKit `verify`
  - dev bypass (when enabled)

### Transaction flow (current)

- Deposit path changed to avoid `approve`:
  - token `transfer(vault, amount)`
  - vault `depositPrefunded(amount)`
- Withdraw path:
  - vault `withdraw(shares)`
- UI now surfaces MiniKit error details and debug URL if provided.

## 4.4 API backend (`apps/world-mini-app/app/api`)

### Implemented routes

- `POST /api/world-id/rp-context`
  - signs RP request context using server-side key
- `POST /api/verify`
  - supports protocol payload and legacy proof payload shape
  - verifies against World Developer API v4 (`rp_` preferred, `app_` fallback)
  - stores unique nullifier in DB
- `POST /api/session`
  - issues 24h session token
- `GET /api/position`
  - auth with bearer session
  - reads on-chain `currentYieldChain` and `getUserBalance`
  - merges optional snapshot/APR data
- `POST /api/admin/rebalance`
  - admin-key-protected manual fallback to `initiateRebalance`
  - records action in DB
- `GET /api/health`
  - basic health response

## 4.5 Data layer (Prisma + Postgres)

Implemented models:

- `WorldIdProof`
- `UserSession`
- `PositionSnapshot`
- `VaultEvent`
- `RebalanceAction`

Current usage:

- Verification and session tables are actively used.
- Rebalance actions are written by admin API.
- Position snapshots/events are partially wired (dashboard can run without snapshots via on-chain reads).

## 5) Deployment and Environment

## 5.1 Supported deployment scripts

- Full contracts deploy: `contracts/script/Deploy.s.sol`
- Vault-only MVP deploy: `contracts/script/DeployVaultOnly.s.sol`
- Helper shell script: `scripts/deploy-world-sepolia-mvp.sh`

## 5.2 Important environment groups

- Contracts:
  - `HOME_CHAIN_MODE`, `OWNER`, `CRE_FORWARDER`, token/pool/aToken addresses
- Mini app/API:
  - `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_ID_SIGNER_PRIVATE_KEY`
  - `HOME_VAULT_ADDRESS`, `NEXT_PUBLIC_HOME_VAULT_ADDRESS`
  - `NEXT_PUBLIC_HOME_USDC_ADDRESS`
  - `DATABASE_URL`
  - `ADMIN_API_KEY`, `ADMIN_REBALANCE_PRIVATE_KEY`
- CRE:
  - `CRE_TARGET`, RPCs in `services/cre-workflow/cre/project.yaml`

## 6) Known Hurdles and Current Status

## 6.1 Resolved

- CRE simulation historical-state read error on one run:
  - transient, later simulations passed.
- World ID `invalid_action` failures:
  - fixed by moving to v4 verification path and proper RP/App wiring.
- MiniKit "not installed"/command unavailable during desktop testing:
  - expected; works inside World App; dev bypass available for local-only flows.
- Deposit flow using `approve`:
  - blocked by MiniKit policy; replaced with approve-free path.

## 6.2 Active constraints

- Mini app transaction rail constraint (as documented by World docs):
  - mini app tx flows are mainnet-oriented.
  - testnet contract execution from MiniKit is not the supported target path.
- Developer Portal allowlisting still required:
  - calling contracts must be whitelisted in "Contract Entrypoints"
  - token usage must match configured allowed token behavior.

## 6.3 Practical implication for demo

- On testnet, full backend optimization (CRE + contracts + CCIP + Aave reads/rebalance logic) can be demonstrated.
- The exact "tap in World App -> live on-chain tx via MiniKit" path is constrained unless deployed on supported mainnet tx rail.

## 7) Current State Matrix

- Contracts core (vault/receiver/message codec): implemented, tested
- CCIP flow wiring: implemented in contracts, test-covered
- CRE APR monitor + rebalance decision: implemented, tested
- World ID + session: implemented, working
- Dashboard on-chain reads: implemented, working
- Deposit/withdraw UI integration: implemented
- In-app tx on testnet via MiniKit: constrained by platform policy
- Manual rebalance fallback API: implemented
- Snapshot/APR persistence pipeline: partial (not fully automated yet)

## 8) Demo Guidance (Hackathon)

Recommended narrative:

1. Show real World ID verify + wallet auth in World App.
2. Show dashboard identity and position.
3. Run CRE simulation and show deterministic rebalance decision logs.
4. Trigger manual rebalance fallback API and show tx hash + updated state.
5. Show on-chain reads (`currentYieldChain`, `getUserBalance`) to prove settlement state.

If full MiniKit live tx is required in-demo, prepare a mainnet-safe shadow deployment with low limits.

## 9) Security and Operational Notes

- Keep private keys server-side only.
- Never expose signer keys with `NEXT_PUBLIC_*`.
- Rotate any leaked keys immediately.
- Keep `WORLD_ID_DEV_BYPASS=false` in demo/prod.
- Keep admin rebalance endpoint protected by strong `ADMIN_API_KEY`.

## 10) Key Resources

Official docs:

- World Mini Apps overview: https://docs.world.org/mini-apps
- World Mini Apps FAQ: https://docs.world.org/mini-apps/more/faq
- MiniKit send transaction: https://docs.world.org/mini-apps/commands/send-transaction
- MiniKit errors reference: https://docs.world.org/mini-apps/reference/errors
- World ID docs: https://docs.world.org/world-id
- Chainlink CRE docs: https://docs.chain.link/cre
- Chainlink CCIP docs: https://docs.chain.link/ccip
- CCIP testnet directory: https://docs.chain.link/ccip/directory/testnet
- Polygon Amoy CCIP directory page: https://docs.chain.link/ccip/directory/testnet/chain/polygon-testnet-amoy
- Arbitrum Sepolia CCIP directory page: https://docs.chain.link/ccip/directory/testnet/chain/ethereum-testnet-sepolia-arbitrum-1

Project-local references:

- Product spec: `omni-yield-spec.md`
- Ops runbook: `docs/ops-runbook.md`
- Root quickstart: `README.md`
