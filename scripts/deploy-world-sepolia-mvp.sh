#!/usr/bin/env bash
set -euo pipefail

# Deploys:
# 1) TestUSDC (6 decimals) on World Sepolia
# 2) YieldVault in "vault-only" mode for local MVP tx flow inside World App
#
# Usage:
#   cp scripts/deploy-world-sepolia-mvp.env.example .env.deploy.world
#   # edit .env.deploy.world
#   bash scripts/deploy-world-sepolia-mvp.sh .env.deploy.world
#
# Optional:
#   MINT_AMOUNT_UNITS=50000000000 bash scripts/deploy-world-sepolia-mvp.sh .env.deploy.world

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts"
ENV_FILE="${1:-$REPO_ROOT/.env.deploy.world}"
CHAIN_ID_EXPECTED="${CHAIN_ID_EXPECTED:-4801}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "Env file not found: $ENV_FILE"
  echo "Create one from scripts/deploy-world-sepolia-mvp.env.example"
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

WORLD_SEPOLIA_RPC_URL="${WORLD_SEPOLIA_RPC_URL:-https://worldchain-sepolia.g.alchemy.com/public}"
MINT_AMOUNT_UNITS="${MINT_AMOUNT_UNITS:-100000000000}" # 100,000 USDC at 6 decimals
CRE_FORWARDER="${CRE_FORWARDER:-${OWNER:-}}"
HOME_ROUTER_OVERRIDE="${HOME_ROUTER_OVERRIDE:-0x000000000000000000000000000000000000dEaD}"
INITIAL_YIELD_CHAIN="${INITIAL_YIELD_CHAIN:-worldLocal}"

require_var DEPLOYER_PRIVATE_KEY
require_var OWNER
require_var CRE_FORWARDER

echo "== Omni-Yield World Sepolia MVP Deploy =="
echo "RPC: $WORLD_SEPOLIA_RPC_URL"
echo "OWNER: $OWNER"
echo "CRE_FORWARDER: $CRE_FORWARDER"
echo

ACTUAL_CHAIN_ID="$(cast chain-id --rpc-url "$WORLD_SEPOLIA_RPC_URL")"
if [[ "$ACTUAL_CHAIN_ID" != "$CHAIN_ID_EXPECTED" ]]; then
  echo "Unexpected chain ID: got $ACTUAL_CHAIN_ID, expected $CHAIN_ID_EXPECTED"
  exit 1
fi

cd "$CONTRACTS_DIR"

echo "1/4 Building contracts..."
forge build >/dev/null

echo "2/4 Deploying TestUSDC..."
forge script script/DeployTestUSDC.s.sol:DeployTestUSDC \
  --rpc-url "$WORLD_SEPOLIA_RPC_URL" \
  --broadcast \
  --private-key "$DEPLOYER_PRIVATE_KEY"

USDC_BROADCAST_FILE="$CONTRACTS_DIR/broadcast/DeployTestUSDC.s.sol/$ACTUAL_CHAIN_ID/run-latest.json"
if [[ ! -f "$USDC_BROADCAST_FILE" ]]; then
  echo "Expected broadcast file not found: $USDC_BROADCAST_FILE"
  exit 1
fi

HOME_USDC="$(jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$USDC_BROADCAST_FILE" | tail -n 1)"
if [[ -z "$HOME_USDC" || "$HOME_USDC" == "null" ]]; then
  echo "Failed to parse HOME_USDC from $USDC_BROADCAST_FILE"
  exit 1
fi
echo "HOME_USDC=$HOME_USDC"

echo "3/4 Minting TestUSDC to OWNER..."
cast send "$HOME_USDC" "mint(address,uint256)" "$OWNER" "$MINT_AMOUNT_UNITS" \
  --rpc-url "$WORLD_SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null
echo "Minted $MINT_AMOUNT_UNITS units to $OWNER"

echo "4/4 Deploying vault-only..."
export OWNER CRE_FORWARDER HOME_USDC HOME_ROUTER_OVERRIDE INITIAL_YIELD_CHAIN
forge script script/DeployVaultOnly.s.sol:DeployVaultOnly \
  --rpc-url "$WORLD_SEPOLIA_RPC_URL" \
  --broadcast \
  --private-key "$DEPLOYER_PRIVATE_KEY"

VAULT_BROADCAST_FILE="$CONTRACTS_DIR/broadcast/DeployVaultOnly.s.sol/$ACTUAL_CHAIN_ID/run-latest.json"
if [[ ! -f "$VAULT_BROADCAST_FILE" ]]; then
  echo "Expected broadcast file not found: $VAULT_BROADCAST_FILE"
  exit 1
fi

HOME_VAULT_ADDRESS="$(jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$VAULT_BROADCAST_FILE" | tail -n 1)"
if [[ -z "$HOME_VAULT_ADDRESS" || "$HOME_VAULT_ADDRESS" == "null" ]]; then
  echo "Failed to parse HOME_VAULT_ADDRESS from $VAULT_BROADCAST_FILE"
  exit 1
fi

OUT_FILE="$REPO_ROOT/.env.deploy.world.output"
cat >"$OUT_FILE" <<EOF
WORLD_SEPOLIA_RPC_URL=$WORLD_SEPOLIA_RPC_URL
OWNER=$OWNER
CRE_FORWARDER=$CRE_FORWARDER
HOME_USDC=$HOME_USDC
HOME_VAULT_ADDRESS=$HOME_VAULT_ADDRESS
NEXT_PUBLIC_HOME_USDC_ADDRESS=$HOME_USDC
NEXT_PUBLIC_HOME_VAULT_ADDRESS=$HOME_VAULT_ADDRESS
NEXT_PUBLIC_WORLD_SEPOLIA_RPC_URL=$WORLD_SEPOLIA_RPC_URL
EOF

echo
echo "Deployment complete."
echo "HOME_USDC=$HOME_USDC"
echo "HOME_VAULT_ADDRESS=$HOME_VAULT_ADDRESS"
echo
echo "Wrote output env file: $OUT_FILE"
echo "Copy these into apps/world-mini-app/.env:"
echo "  HOME_VAULT_ADDRESS=$HOME_VAULT_ADDRESS"
echo "  NEXT_PUBLIC_HOME_VAULT_ADDRESS=$HOME_VAULT_ADDRESS"
echo "  NEXT_PUBLIC_HOME_USDC_ADDRESS=$HOME_USDC"
echo "  NEXT_PUBLIC_WORLD_SEPOLIA_RPC_URL=$WORLD_SEPOLIA_RPC_URL"
echo
echo "For real phone flow (no bypass), ensure:"
echo "  WORLD_ID_DEV_BYPASS=false"
echo "  NEXT_PUBLIC_WORLD_ID_DEV_BYPASS=false"
