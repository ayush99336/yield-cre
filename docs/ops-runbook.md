# Omni-Yield Ops Runbook

## 1) Environment Matrix

### Root/Shared
- `POLYGON_AMOY_RPC_URL`
- `ARBITRUM_SEPOLIA_RPC_URL`
- `ETH_SEPOLIA_RPC_URL`
- `WORLD_SEPOLIA_RPC_URL`

### Contracts Deploy
- `HOME_CHAIN_MODE` (`world` default, `eth` fallback)
- `HOME_ROUTER_OVERRIDE` (optional)
- `OWNER`
- `CRE_FORWARDER`
- `HOME_USDC`
- `POLYGON_USDC`
- `POLYGON_POOL`
- `POLYGON_A_TOKEN`
- `ARBITRUM_USDC`
- `ARBITRUM_POOL`
- `ARBITRUM_A_TOKEN`

### Mini App/API
- `DATABASE_URL`
- `WORLD_APP_ID`
- `WORLD_ID_DEV_BYPASS`
- `ADMIN_API_KEY`
- `ADMIN_REBALANCE_PRIVATE_KEY`
- `HOME_VAULT_ADDRESS`
- `NEXT_PUBLIC_WORLD_APP_ID`
- `NEXT_PUBLIC_WORLD_CLIENT_ID`
- `NEXT_PUBLIC_HOME_VAULT_ADDRESS`
- `NEXT_PUBLIC_WORLD_SEPOLIA_RPC_URL`

### CRE
- `CRE_ETH_PRIVATE_KEY`
- `CRE_TARGET`

## 2) Home Chain Fallback Procedure

If World Chain Sepolia CCIP lane status blocks end-to-end settlement:
1. Set `HOME_CHAIN_MODE=eth` in deploy env.
2. Redeploy vault + receivers via Foundry deploy script.
3. Update `HOME_VAULT_ADDRESS` and `NEXT_PUBLIC_HOME_VAULT_ADDRESS`.
4. Re-run `npm run simulate:cre` and sanity-check `/api/admin/rebalance`.

## 3) Demo Playbook (Judge Flow)

1. Pre-stage at least one deposit before demo window.
2. Show dashboard active chain + APY.
3. Run CRE simulation:
   - `npm run simulate:cre`
4. Trigger manual fallback rebalance:
   - `POST /api/admin/rebalance` with `x-admin-key`.
5. Show tx hash and updated status on dashboard.
6. Explain that CRE cron is primary and admin trigger is demo reliability fallback.

## 4) Verification Checklist

- Contracts:
  - `cd contracts && forge build && forge test`
- CRE:
  - `npm run simulate:cre`
  - `cd services/cre-workflow/cre/omni-yield && bun test`
- Mini App/API:
  - `npm run build -w @yield-cre/world-mini-app`

## 5) Incident Notes

- If CRE reads fail, verify `services/cre-workflow/cre/project.yaml` RPC endpoints.
- If rebalance route returns `skipped`, check missing envs in API logs.
- If World ID fails during local demo, set `WORLD_ID_DEV_BYPASS=true` only in dev.
