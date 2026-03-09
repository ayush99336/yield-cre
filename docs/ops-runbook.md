# Omni-Yield Ops Runbook

Last updated: March 8, 2026

## 1. Execution Modes

- `testnet_hybrid` (default): full cross-chain backend on testnets, admin-assisted deposit/rebalance.
- `mainnet_live`: minimal capped mainnet shadow vault for real MiniKit transaction rail.

Set mode:

```bash
EXECUTION_MODE=testnet_hybrid
NEXT_PUBLIC_EXECUTION_MODE=testnet_hybrid
```

or

```bash
EXECUTION_MODE=mainnet_live
NEXT_PUBLIC_EXECUTION_MODE=mainnet_live
```

## 2. Environment Matrix

- World ID v4:
  - `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_ID_SIGNER_PRIVATE_KEY`
  - `WORLD_ID_ACTION`, `WORLD_ID_ENVIRONMENT`
- Testnet addresses:
  - `TESTNET_HOME_CHAIN_MODE`, `TESTNET_HOME_VAULT_ADDRESS`, `TESTNET_HOME_USDC`, `TESTNET_HOME_RPC_URL`
  - `NEXT_PUBLIC_TESTNET_HOME_CHAIN_MODE`, `NEXT_PUBLIC_TESTNET_HOME_VAULT_ADDRESS`, `NEXT_PUBLIC_TESTNET_HOME_USDC_ADDRESS`, `NEXT_PUBLIC_TESTNET_HOME_RPC_URL`
- Mainnet addresses:
  - `MAINNET_HOME_VAULT_ADDRESS`, `MAINNET_HOME_USDC`, `MAINNET_WORLD_RPC_URL`
  - `NEXT_PUBLIC_MAINNET_HOME_VAULT_ADDRESS`, `NEXT_PUBLIC_MAINNET_HOME_USDC_ADDRESS`, `NEXT_PUBLIC_MAINNET_WORLD_RPC_URL`
- Admin/API:
  - `ADMIN_API_KEY`, `ADMIN_REBALANCE_PRIVATE_KEY`
- Registry:
  - `TESTNET_ADDRESS_REGISTRY_PATH=deployments/addresses.testnet.json`
  - `MAINNET_ADDRESS_REGISTRY_PATH=deployments/addresses.mainnet.json`

## 3. Phase 1: Testnet Hybrid Demo

### 3.1 Deploy real cross-chain testnet stack (ETH Sepolia home)

```bash
cp scripts/deploy-testnet-crosschain.env.example .env.deploy.testnet.crosschain
# edit .env.deploy.testnet.crosschain
bash scripts/deploy-testnet-crosschain.sh .env.deploy.testnet.crosschain
```

Important:
- Keep `VAULT_NATIVE_FUND_WEI` non-zero (home CCIP send fees).
- Keep `ARBITRUM_RECEIVER_NATIVE_FUND_WEI` and `OPTIMISM_RECEIVER_NATIVE_FUND_WEI` non-zero (receiver return-message fees).

Outputs:
- `.env.deploy.testnet.crosschain.output`
- `deployments/addresses.testnet.crosschain.json`

### 3.2 Sync generated addresses into CRE/app env vars

```bash
npm run config:sync
cat .env.registry.generated
```

Copy relevant values into root `.env` and `apps/world-mini-app/.env` as needed.
Set:

```bash
TESTNET_ADDRESS_REGISTRY_PATH=deployments/addresses.testnet.crosschain.json
TESTNET_HOME_CHAIN_MODE=eth
NEXT_PUBLIC_TESTNET_HOME_CHAIN_MODE=eth
```

### 3.3 Start app and run migrations

```bash
npm run db:push -w @yield-cre/world-mini-app
npm run dev:mini-app
```

### 3.4 Sync telemetry + position snapshots

```bash
curl -X POST http://localhost:3000/api/admin/sync \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{}'
```

Expected: `200` with `chainStatusSnapshots` and `rebalanceDecision`.

### 3.5 Admin-assisted testnet deposit

```bash
curl -X POST http://localhost:3000/api/admin/deposit \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"walletAddress":"0xYourWallet","amount":"1"}'
```

Expected: `submitted` + `transferTxHash` + `creditTxHash`.

### 3.6 Rebalance trigger path

Primary proof path:

```bash
npm run simulate:cre:sync
```

For hackathon simulation-only proof (no live CRE writes required), keep:

```bash
CRE_WRITE_ENABLED=false
CRE_CURRENT_YIELD_CHAIN_FALLBACK=arbitrumSepolia
```

Manual fallback:

```bash
curl -X POST http://localhost:3000/api/admin/rebalance \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"targetChain":"arbitrumSepolia","notes":"demo fallback"}'
```

Expected: `submitted` + `txHash`.

In `testnet_hybrid`, if on-chain rebalance cannot execute, the API can return `simulated` when:

```bash
TESTNET_REBALANCE_SIMULATION=true
```

## 4. Phase 2: Mainnet Shadow (Live MiniKit Rail)

### 4.1 Deploy capped shadow vault

```bash
cp scripts/deploy-mainnet-shadow.env.example .env.deploy.mainnet
# edit .env.deploy.mainnet
bash scripts/deploy-mainnet-shadow.sh .env.deploy.mainnet
```

Outputs:
- `.env.deploy.mainnet.output`
- `deployments/addresses.mainnet.json`
- `deployments/allowlist.mainnet-shadow.json`

### 4.2 Developer Portal allowlist

Use `deployments/allowlist.mainnet-shadow.json` values:
- `permit2Tokens` -> Configuration > Advanced > Permit2 Tokens
- `contractEntrypoints` -> Configuration > Advanced > Contract Entrypoints

### 4.3 Switch app mode to live

```bash
EXECUTION_MODE=mainnet_live
NEXT_PUBLIC_EXECUTION_MODE=mainnet_live
```

In live mode, `/deposit` and `/withdraw` enable direct MiniKit transaction flow.

## 5. World Sepolia Fallback

If you need Mini App on World Sepolia only:

1. Set `TESTNET_HOME_CHAIN_MODE=world` and `NEXT_PUBLIC_TESTNET_HOME_CHAIN_MODE=world`.
2. Set testnet registry/env addresses to the World Sepolia vault deployment.
3. Keep CRE simulation as proof path when CCIP lanes do not support the destination pair.

## 6. Verification Gates

- Contracts:
  - `cd contracts && forge test`
- CRE:
  - `cd services/cre-workflow/cre/omni-yield && bun test`
  - `npm run simulate:cre:sync`
- Mini app/API:
  - `npm run typecheck -w @yield-cre/world-mini-app`
  - `npm run build -w @yield-cre/world-mini-app`

## 7. Judge Demo Script (Timestamped)

- T+00:00: Open Mini App in World App, show `Execution Mode`.
- T+00:20: World ID verify + wallet auth success.
- T+00:45: Show dashboard cards: active chain, best chain, spread, latest decision.
- T+01:10: Run admin deposit (testnet hybrid) and show returned tx hashes.
- T+01:40: Run `/api/admin/sync`, refresh dashboard, show non-zero APY snapshots.
- T+02:10: Run CRE simulate logs and show threshold/cooldown decision.
- T+02:40: Trigger `/api/admin/rebalance`, show `submitted` txHash and latest action status.
- T+03:10: Final dashboard refresh proving updated chain/action state.

## 8. Guardrails

- Keep `MAINNET_MAX_DEPOSIT_UNITS` low for demo.
- Use `setDepositsPaused(true)` immediately if abnormal behavior occurs.
- Never expose private keys in `NEXT_PUBLIC_*`.
- Keep `WORLD_ID_DEV_BYPASS=false` during judged demo.
