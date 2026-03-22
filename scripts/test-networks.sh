#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FOUNDRY_DIR="$ROOT_DIR/foundry"
DEPLOY_ENV_DIR="$ROOT_DIR/.deploy-env"

NETWORKS=(local fuji mainnet)
if [ "${1:-}" = "--local-only" ]; then
  NETWORKS=(local)
fi

cd "$FOUNDRY_DIR"
forge test

for network in "${NETWORKS[@]}"; do
  env_file="$DEPLOY_ENV_DIR/$network.env"
  [ -f "$env_file" ] || continue
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
  if [ -n "${NEXT_PUBLIC_NFT_CONTRACT_ADDRESS:-}" ] && [ -n "${NEXT_PUBLIC_RPC_URL:-}" ]; then
    echo "[$network] NFT code size: $(cast codesize "$NEXT_PUBLIC_NFT_CONTRACT_ADDRESS" --rpc-url "$NEXT_PUBLIC_RPC_URL")"
  fi
done
