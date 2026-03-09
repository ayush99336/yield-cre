#!/usr/bin/env bash
set -euo pipefail

# Deploy real cross-chain testnet stack:
# - Home vault on Ethereum Sepolia (USDC + CCIP router)
# - YieldReceiver on Arbitrum Sepolia (Aave)
# - YieldReceiver on OP Sepolia (Aave)
# - Wire vault chain configs + trusted vault on receivers
#
# Usage:
#   cp scripts/deploy-testnet-crosschain.env.example .env.deploy.testnet.crosschain
#   # edit .env.deploy.testnet.crosschain
#   bash scripts/deploy-testnet-crosschain.sh .env.deploy.testnet.crosschain

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts"
ENV_FILE="${1:-$REPO_ROOT/.env.deploy.testnet.crosschain}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "Env file not found: $ENV_FILE"
  echo "Create one from scripts/deploy-testnet-crosschain.env.example"
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

require_var DEPLOYER_PRIVATE_KEY
require_var OWNER
require_var CRE_FORWARDER

ETH_SEPOLIA_RPC_URL="${ETH_SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
ARBITRUM_SEPOLIA_RPC_URL="${ARBITRUM_SEPOLIA_RPC_URL:-https://arbitrum-sepolia-rpc.publicnode.com}"
OPTIMISM_SEPOLIA_RPC_URL="${OPTIMISM_SEPOLIA_RPC_URL:-https://sepolia.optimism.io}"

HOME_CHAIN_MODE="${HOME_CHAIN_MODE:-eth}"
HOME_SELECTOR="${HOME_SELECTOR:-16015286601757825753}"
HOME_ROUTER="${HOME_ROUTER:-0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59}"
HOME_USDC="${HOME_USDC:-0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238}"
INITIAL_YIELD_CHAIN="${INITIAL_YIELD_CHAIN:-arbitrumSepolia}"

ARBITRUM_SELECTOR="${ARBITRUM_SELECTOR:-3478487238524512106}"
ARBITRUM_ROUTER="${ARBITRUM_ROUTER:-0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165}"
ARBITRUM_POOL="${ARBITRUM_POOL:-0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff}"
ARBITRUM_USDC="${ARBITRUM_USDC:-0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d}"
ARBITRUM_A_TOKEN="${ARBITRUM_A_TOKEN:-0x460b97BD498E1157530AEb3086301d5225b91216}"
ARBITRUM_DATA_PROVIDER="${ARBITRUM_DATA_PROVIDER:-0x12373B5085e3b42D42C1D4ABF3B3Cf4Df0E0Fa01}"

OPTIMISM_SELECTOR="${OPTIMISM_SELECTOR:-5224473277236331295}"
OPTIMISM_ROUTER="${OPTIMISM_ROUTER:-0x114A20A10b43D4115e5aeef7345a1A71d2a60C57}"
OPTIMISM_POOL="${OPTIMISM_POOL:-0xb50201558B00496A145fE76f7424749556E326D8}"
OPTIMISM_USDC="${OPTIMISM_USDC:-0x5fd84259d66Cd46123540766Be93DFE6D43130D7}"
OPTIMISM_A_TOKEN="${OPTIMISM_A_TOKEN:-0xa818F1B57c201E092C4A2017A91815034326Efd1}"
OPTIMISM_DATA_PROVIDER="${OPTIMISM_DATA_PROVIDER:-0x501B4c19dd9C2e06E94dA7b6D5Ed4ddA013EC741}"

TESTNET_CROSSCHAIN_REGISTRY="${TESTNET_CROSSCHAIN_REGISTRY:-deployments/addresses.testnet.crosschain.json}"
VAULT_NATIVE_FUND_WEI="${VAULT_NATIVE_FUND_WEI:-0}"
ARBITRUM_RECEIVER_NATIVE_FUND_WEI="${ARBITRUM_RECEIVER_NATIVE_FUND_WEI:-0}"
OPTIMISM_RECEIVER_NATIVE_FUND_WEI="${OPTIMISM_RECEIVER_NATIVE_FUND_WEI:-0}"

for var in \
  HOME_SELECTOR HOME_ROUTER HOME_USDC \
  ARBITRUM_SELECTOR ARBITRUM_ROUTER ARBITRUM_POOL ARBITRUM_USDC ARBITRUM_A_TOKEN \
  OPTIMISM_SELECTOR OPTIMISM_ROUTER OPTIMISM_POOL OPTIMISM_USDC OPTIMISM_A_TOKEN \
  ARBITRUM_DATA_PROVIDER OPTIMISM_DATA_PROVIDER
do
  require_var "$var"
done

echo "== Omni-Yield Testnet Cross-Chain Deploy =="
echo "HOME_CHAIN_MODE=$HOME_CHAIN_MODE"
echo "HOME_RPC=$ETH_SEPOLIA_RPC_URL"
echo "OWNER=$OWNER"
echo "CRE_FORWARDER=$CRE_FORWARDER"
echo

ETH_CHAIN_ID="$(cast chain-id --rpc-url "$ETH_SEPOLIA_RPC_URL")"
ARB_CHAIN_ID="$(cast chain-id --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL")"
OP_CHAIN_ID="$(cast chain-id --rpc-url "$OPTIMISM_SEPOLIA_RPC_URL")"

if [[ "$ETH_CHAIN_ID" != "11155111" ]]; then
  echo "Unexpected ETH Sepolia chain id: $ETH_CHAIN_ID"
  exit 1
fi
if [[ "$ARB_CHAIN_ID" != "421614" ]]; then
  echo "Unexpected Arbitrum Sepolia chain id: $ARB_CHAIN_ID"
  exit 1
fi
if [[ "$OP_CHAIN_ID" != "11155420" ]]; then
  echo "Unexpected OP Sepolia chain id: $OP_CHAIN_ID"
  exit 1
fi

cd "$CONTRACTS_DIR"
forge build >/dev/null

deploy_receiver() {
  local label="$1"
  local rpc_url="$2"
  local chain_id="$3"
  local router="$4"
  local pool="$5"
  local usdc="$6"
  local a_token="$7"

  echo "Deploying ${label} receiver..."
  export DEST_ROUTER="$router"
  export DEST_POOL="$pool"
  export DEST_USDC="$usdc"
  export DEST_A_TOKEN="$a_token"
  export HOME_SELECTOR
  export TRUSTED_VAULT="0x0000000000000000000000000000000000000000"
  export OWNER

  forge script script/DeployReceiver.s.sol:DeployReceiver \
    --rpc-url "$rpc_url" \
    --broadcast \
    --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null

  local broadcast_file="$CONTRACTS_DIR/broadcast/DeployReceiver.s.sol/$chain_id/run-latest.json"
  if [[ ! -f "$broadcast_file" ]]; then
    echo "Missing broadcast file: $broadcast_file"
    exit 1
  fi
  local receiver
  receiver="$(jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$broadcast_file" | tail -n 1)"
  if [[ -z "$receiver" || "$receiver" == "null" ]]; then
    echo "Failed to parse receiver address for ${label}"
    exit 1
  fi
  echo "${label} receiver: $receiver"
  echo "$receiver"
}

ARBITRUM_RECEIVER="$(deploy_receiver "arbitrumSepolia" "$ARBITRUM_SEPOLIA_RPC_URL" "$ARB_CHAIN_ID" "$ARBITRUM_ROUTER" "$ARBITRUM_POOL" "$ARBITRUM_USDC" "$ARBITRUM_A_TOKEN" | tail -n 1)"
OPTIMISM_RECEIVER="$(deploy_receiver "optimismSepolia" "$OPTIMISM_SEPOLIA_RPC_URL" "$OP_CHAIN_ID" "$OPTIMISM_ROUTER" "$OPTIMISM_POOL" "$OPTIMISM_USDC" "$OPTIMISM_A_TOKEN" | tail -n 1)"

echo "Deploying Ethereum Sepolia home vault..."
export OWNER
export CRE_FORWARDER
export HOME_USDC
export HOME_ROUTER_OVERRIDE="$HOME_ROUTER"
export INITIAL_YIELD_CHAIN

forge script script/DeployVaultOnly.s.sol:DeployVaultOnly \
  --rpc-url "$ETH_SEPOLIA_RPC_URL" \
  --broadcast \
  --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null

VAULT_BROADCAST_FILE="$CONTRACTS_DIR/broadcast/DeployVaultOnly.s.sol/$ETH_CHAIN_ID/run-latest.json"
HOME_VAULT_ADDRESS="$(jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$VAULT_BROADCAST_FILE" | tail -n 1)"
if [[ -z "$HOME_VAULT_ADDRESS" || "$HOME_VAULT_ADDRESS" == "null" ]]; then
  echo "Failed to parse HOME_VAULT_ADDRESS"
  exit 1
fi
echo "Home vault: $HOME_VAULT_ADDRESS"

echo "Configuring vault chain routes..."
cast send "$HOME_VAULT_ADDRESS" "setChainConfig(string,uint64,address)" \
  "arbitrumSepolia" "$ARBITRUM_SELECTOR" "$ARBITRUM_RECEIVER" \
  --rpc-url "$ETH_SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null

cast send "$HOME_VAULT_ADDRESS" "setChainConfig(string,uint64,address)" \
  "optimismSepolia" "$OPTIMISM_SELECTOR" "$OPTIMISM_RECEIVER" \
  --rpc-url "$ETH_SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null

echo "Setting trusted vault on receivers..."
cast send "$ARBITRUM_RECEIVER" "setTrustedVault(address)" "$HOME_VAULT_ADDRESS" \
  --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null

cast send "$OPTIMISM_RECEIVER" "setTrustedVault(address)" "$HOME_VAULT_ADDRESS" \
  --rpc-url "$OPTIMISM_SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null

if [[ "$ARBITRUM_RECEIVER_NATIVE_FUND_WEI" != "0" ]]; then
  echo "Funding Arbitrum receiver with native gas: $ARBITRUM_RECEIVER_NATIVE_FUND_WEI wei"
  cast send "$ARBITRUM_RECEIVER" --value "$ARBITRUM_RECEIVER_NATIVE_FUND_WEI" \
    --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null
fi

if [[ "$OPTIMISM_RECEIVER_NATIVE_FUND_WEI" != "0" ]]; then
  echo "Funding Optimism receiver with native gas: $OPTIMISM_RECEIVER_NATIVE_FUND_WEI wei"
  cast send "$OPTIMISM_RECEIVER" --value "$OPTIMISM_RECEIVER_NATIVE_FUND_WEI" \
    --rpc-url "$OPTIMISM_SEPOLIA_RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null
fi

if [[ "$VAULT_NATIVE_FUND_WEI" != "0" ]]; then
  echo "Funding vault with native ETH for CCIP fees: $VAULT_NATIVE_FUND_WEI wei"
  cast send "$HOME_VAULT_ADDRESS" --value "$VAULT_NATIVE_FUND_WEI" \
    --rpc-url "$ETH_SEPOLIA_RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null
fi

REGISTRY_PATH="$REPO_ROOT/$TESTNET_CROSSCHAIN_REGISTRY"
mkdir -p "$(dirname "$REGISTRY_PATH")"
cat >"$REGISTRY_PATH" <<EOF
{
  "environment": "testnet-crosschain",
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "home": {
    "chainName": "ethereum-sepolia",
    "chainSelector": "$HOME_SELECTOR",
    "rpcUrl": "$ETH_SEPOLIA_RPC_URL",
    "router": "$HOME_ROUTER",
    "vault": "$HOME_VAULT_ADDRESS",
    "usdc": "$HOME_USDC"
  },
  "destinations": {
    "arbitrumSepolia": {
      "id": "arbitrumSepolia",
      "chainName": "ethereum-testnet-sepolia-arbitrum-1",
      "chainId": 421614,
      "chainSelector": "$ARBITRUM_SELECTOR",
      "rpcUrl": "$ARBITRUM_SEPOLIA_RPC_URL",
      "receiver": "$ARBITRUM_RECEIVER",
      "dataProvider": "$ARBITRUM_DATA_PROVIDER",
      "pool": "$ARBITRUM_POOL",
      "aToken": "$ARBITRUM_A_TOKEN",
      "usdc": "$ARBITRUM_USDC",
      "enabled": true
    },
    "optimismSepolia": {
      "id": "optimismSepolia",
      "chainName": "ethereum-testnet-sepolia-optimism-1",
      "chainId": 11155420,
      "chainSelector": "$OPTIMISM_SELECTOR",
      "rpcUrl": "$OPTIMISM_SEPOLIA_RPC_URL",
      "receiver": "$OPTIMISM_RECEIVER",
      "dataProvider": "$OPTIMISM_DATA_PROVIDER",
      "pool": "$OPTIMISM_POOL",
      "aToken": "$OPTIMISM_A_TOKEN",
      "usdc": "$OPTIMISM_USDC",
      "enabled": true
    }
  }
}
EOF

OUT_FILE="$REPO_ROOT/.env.deploy.testnet.crosschain.output"
cat >"$OUT_FILE" <<EOF
HOME_CHAIN_MODE=eth
TESTNET_HOME_CHAIN_MODE=eth
HOME_USDC=$HOME_USDC
HOME_VAULT_ADDRESS=$HOME_VAULT_ADDRESS
NEXT_PUBLIC_HOME_USDC_ADDRESS=$HOME_USDC
NEXT_PUBLIC_HOME_VAULT_ADDRESS=$HOME_VAULT_ADDRESS

TESTNET_HOME_USDC=$HOME_USDC
TESTNET_HOME_VAULT_ADDRESS=$HOME_VAULT_ADDRESS
TESTNET_HOME_RPC_URL=$ETH_SEPOLIA_RPC_URL
TESTNET_WORLD_RPC_URL=$ETH_SEPOLIA_RPC_URL
NEXT_PUBLIC_TESTNET_HOME_CHAIN_MODE=eth
NEXT_PUBLIC_TESTNET_HOME_USDC_ADDRESS=$HOME_USDC
NEXT_PUBLIC_TESTNET_HOME_VAULT_ADDRESS=$HOME_VAULT_ADDRESS
NEXT_PUBLIC_TESTNET_HOME_RPC_URL=$ETH_SEPOLIA_RPC_URL
NEXT_PUBLIC_TESTNET_WORLD_RPC_URL=$ETH_SEPOLIA_RPC_URL

TESTNET_ARBITRUM_SEPOLIA_USDC=$ARBITRUM_USDC
TESTNET_ARBITRUM_SEPOLIA_DATA_PROVIDER=$ARBITRUM_DATA_PROVIDER
TESTNET_OPTIMISM_SEPOLIA_USDC=$OPTIMISM_USDC
TESTNET_OPTIMISM_SEPOLIA_DATA_PROVIDER=$OPTIMISM_DATA_PROVIDER
TESTNET_ADDRESS_REGISTRY_PATH=$TESTNET_CROSSCHAIN_REGISTRY
EOF

echo
echo "Cross-chain deployment complete."
echo "HOME_VAULT_ADDRESS=$HOME_VAULT_ADDRESS"
echo "ARBITRUM_RECEIVER=$ARBITRUM_RECEIVER"
echo "OPTIMISM_RECEIVER=$OPTIMISM_RECEIVER"
echo
echo "Wrote registry: $REGISTRY_PATH"
echo "Wrote env output: $OUT_FILE"
echo
echo "Next steps:"
echo "1) export TESTNET_ADDRESS_REGISTRY_PATH=$TESTNET_CROSSCHAIN_REGISTRY"
echo "2) npm run config:sync"
echo "3) copy values from .env.deploy.testnet.crosschain.output into your .env"
echo "4) run admin sync + rebalance APIs against this deployment"
