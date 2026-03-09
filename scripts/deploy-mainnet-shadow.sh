#!/usr/bin/env bash
set -euo pipefail

# Deploy a cap-limited "mainnet shadow" vault for MiniKit live transaction demos.
#
# Usage:
#   cp scripts/deploy-mainnet-shadow.env.example .env.deploy.mainnet
#   # edit .env.deploy.mainnet
#   bash scripts/deploy-mainnet-shadow.sh .env.deploy.mainnet

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts"
ENV_FILE="${1:-$REPO_ROOT/.env.deploy.mainnet}"
CHAIN_ID_EXPECTED="${CHAIN_ID_EXPECTED:-480}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "Env file not found: $ENV_FILE"
  echo "Create one from scripts/deploy-mainnet-shadow.env.example"
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_var() {
  if [[ -z "${!1:-}" ]]; then
    echo "Missing required env var: $1"
    exit 1
  fi
}

require_cmd forge
require_cmd cast
require_cmd jq

WORLD_MAINNET_RPC_URL="${WORLD_MAINNET_RPC_URL:-https://worldchain-mainnet.g.alchemy.com/public}"
CRE_FORWARDER="${CRE_FORWARDER:-${OWNER:-}}"
HOME_ROUTER_OVERRIDE="${HOME_ROUTER_OVERRIDE:-0x000000000000000000000000000000000000dEaD}"
INITIAL_YIELD_CHAIN="${INITIAL_YIELD_CHAIN:-worldMainnetLocal}"
MAINNET_MAX_DEPOSIT_UNITS="${MAINNET_MAX_DEPOSIT_UNITS:-5000000}" # 5 USDC (6 decimals)
MAINNET_DEPOSITS_PAUSED="${MAINNET_DEPOSITS_PAUSED:-false}"

require_var DEPLOYER_PRIVATE_KEY
require_var OWNER
require_var CRE_FORWARDER
require_var MAINNET_HOME_USDC

echo "== Omni-Yield Mainnet Shadow Deploy =="
echo "RPC: $WORLD_MAINNET_RPC_URL"
echo "OWNER: $OWNER"
echo "CRE_FORWARDER: $CRE_FORWARDER"
echo "MAINNET_HOME_USDC: $MAINNET_HOME_USDC"
echo

ACTUAL_CHAIN_ID="$(cast chain-id --rpc-url "$WORLD_MAINNET_RPC_URL")"
if [[ "$ACTUAL_CHAIN_ID" != "$CHAIN_ID_EXPECTED" ]]; then
  echo "Unexpected chain ID: got $ACTUAL_CHAIN_ID, expected $CHAIN_ID_EXPECTED"
  exit 1
fi

if ! [[ "$MAINNET_HOME_USDC" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
  echo "MAINNET_HOME_USDC must be a valid 0x address"
  exit 1
fi

cd "$CONTRACTS_DIR"
echo "1/3 Building contracts..."
forge build >/dev/null

echo "2/3 Deploying mainnet shadow vault..."
export OWNER CRE_FORWARDER INITIAL_YIELD_CHAIN HOME_ROUTER_OVERRIDE
export HOME_USDC="$MAINNET_HOME_USDC"

forge script script/DeployVaultOnly.s.sol:DeployVaultOnly \
  --rpc-url "$WORLD_MAINNET_RPC_URL" \
  --broadcast \
  --private-key "$DEPLOYER_PRIVATE_KEY"

VAULT_BROADCAST_FILE="$CONTRACTS_DIR/broadcast/DeployVaultOnly.s.sol/$ACTUAL_CHAIN_ID/run-latest.json"
if [[ ! -f "$VAULT_BROADCAST_FILE" ]]; then
  echo "Expected broadcast file not found: $VAULT_BROADCAST_FILE"
  exit 1
fi

MAINNET_HOME_VAULT_ADDRESS="$(jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$VAULT_BROADCAST_FILE" | tail -n 1)"
if [[ -z "$MAINNET_HOME_VAULT_ADDRESS" || "$MAINNET_HOME_VAULT_ADDRESS" == "null" ]]; then
  echo "Failed to parse MAINNET_HOME_VAULT_ADDRESS from $VAULT_BROADCAST_FILE"
  exit 1
fi

echo "3/3 Applying guardrails (cap/pause)..."
cast send "$MAINNET_HOME_VAULT_ADDRESS" "setMaxDepositAmount(uint256)" "$MAINNET_MAX_DEPOSIT_UNITS" \
  --rpc-url "$WORLD_MAINNET_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null

cast send "$MAINNET_HOME_VAULT_ADDRESS" "setDepositsPaused(bool)" "$MAINNET_DEPOSITS_PAUSED" \
  --rpc-url "$WORLD_MAINNET_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null

OUT_FILE="$REPO_ROOT/.env.deploy.mainnet.output"
cat >"$OUT_FILE" <<EOF
EXECUTION_MODE=mainnet_live
NEXT_PUBLIC_EXECUTION_MODE=mainnet_live
MAINNET_HOME_USDC=$MAINNET_HOME_USDC
MAINNET_HOME_VAULT_ADDRESS=$MAINNET_HOME_VAULT_ADDRESS
MAINNET_WORLD_RPC_URL=$WORLD_MAINNET_RPC_URL
NEXT_PUBLIC_MAINNET_HOME_USDC_ADDRESS=$MAINNET_HOME_USDC
NEXT_PUBLIC_MAINNET_HOME_VAULT_ADDRESS=$MAINNET_HOME_VAULT_ADDRESS
NEXT_PUBLIC_MAINNET_WORLD_RPC_URL=$WORLD_MAINNET_RPC_URL
MAINNET_MAX_DEPOSIT_UNITS=$MAINNET_MAX_DEPOSIT_UNITS
MAINNET_DEPOSITS_PAUSED=$MAINNET_DEPOSITS_PAUSED
EOF

REGISTRY_DIR="$REPO_ROOT/deployments"
mkdir -p "$REGISTRY_DIR"

REGISTRY_FILE="$REGISTRY_DIR/addresses.mainnet.json"
cat >"$REGISTRY_FILE" <<EOF
{
  "environment": "mainnet",
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "home": {
    "chainName": "world-mainnet",
    "chainSelector": "0",
    "rpcUrl": "$WORLD_MAINNET_RPC_URL",
    "router": "$HOME_ROUTER_OVERRIDE",
    "vault": "$MAINNET_HOME_VAULT_ADDRESS",
    "usdc": "$MAINNET_HOME_USDC"
  },
  "limits": {
    "maxDepositAmount": "$MAINNET_MAX_DEPOSIT_UNITS",
    "depositsPaused": $MAINNET_DEPOSITS_PAUSED
  },
  "destinations": {}
}
EOF

ALLOWLIST_FILE="$REGISTRY_DIR/allowlist.mainnet-shadow.json"
cat >"$ALLOWLIST_FILE" <<EOF
{
  "miniappId": "${WORLD_APP_ID:-<set-in-env>}",
  "network": "world-mainnet",
  "permit2Tokens": [
    "$MAINNET_HOME_USDC"
  ],
  "contractEntrypoints": [
    "$MAINNET_HOME_VAULT_ADDRESS"
  ],
  "expectedFunctions": {
    "$MAINNET_HOME_USDC": ["transfer(address,uint256)"],
    "$MAINNET_HOME_VAULT_ADDRESS": ["depositPrefunded(uint256)", "withdraw(uint256)"]
  },
  "notes": [
    "Configure these addresses under Developer Portal -> Configuration -> Advanced.",
    "Do not include testnet addresses in the mainnet live profile.",
    "Keep deposit cap small for demo safety."
  ]
}
EOF

echo
echo "Mainnet shadow deployment complete."
echo "MAINNET_HOME_VAULT_ADDRESS=$MAINNET_HOME_VAULT_ADDRESS"
echo "Wrote env output: $OUT_FILE"
echo "Wrote registry: $REGISTRY_FILE"
echo "Wrote allowlist checklist: $ALLOWLIST_FILE"
