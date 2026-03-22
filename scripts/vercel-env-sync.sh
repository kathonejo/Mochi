#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NEXTJS_DIR="$ROOT_DIR/nextjs"
DEPLOY_ENV_DIR="$ROOT_DIR/.deploy-env"
ENVIRONMENT="${2:-production}"
NETWORK="${1:-testnet}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

die() {
  echo "Error: $*" >&2
  exit 1
}

ENV_FILE="$DEPLOY_ENV_DIR/$NETWORK.env"
[ -f "$ENV_FILE" ] || die "Missing deploy env: $ENV_FILE"
need_cmd vercel || die "Install Vercel CLI first"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

upsert() {
  local key="$1"
  local value="$2"
  [ -n "$value" ] || return 0
  vercel --cwd "$NEXTJS_DIR" env rm "$key" "$ENVIRONMENT" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel --cwd "$NEXTJS_DIR" env add "$key" "$ENVIRONMENT" >/dev/null
  echo "synced $key"
}

upsert NEXT_PUBLIC_NETWORK "${NEXT_PUBLIC_NETWORK:-}"
upsert NEXT_PUBLIC_CHAIN_ID "${NEXT_PUBLIC_CHAIN_ID:-}"
upsert NEXT_PUBLIC_RPC_URL "${NEXT_PUBLIC_RPC_URL:-}"
upsert NEXT_PUBLIC_BLOCK_EXPLORER_URL "${NEXT_PUBLIC_BLOCK_EXPLORER_URL:-}"
upsert NEXT_PUBLIC_USDC_ADDRESS "${NEXT_PUBLIC_USDC_ADDRESS:-}"
upsert NEXT_PUBLIC_AVAX_USD_ORACLE_ADDRESS "${NEXT_PUBLIC_AVAX_USD_ORACLE_ADDRESS:-}"
upsert NEXT_PUBLIC_NFT_CONTRACT_ADDRESS "${NEXT_PUBLIC_NFT_CONTRACT_ADDRESS:-}"
upsert NEXT_PUBLIC_EDITIONS_CONTRACT_ADDRESS "${NEXT_PUBLIC_EDITIONS_CONTRACT_ADDRESS:-}"
upsert NEXT_PUBLIC_AUCTION_CONTRACT_ADDRESS "${NEXT_PUBLIC_AUCTION_CONTRACT_ADDRESS:-}"
upsert NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS "${NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS:-}"
upsert NEXT_PUBLIC_SWAP_CONTRACT_ADDRESS "${NEXT_PUBLIC_SWAP_CONTRACT_ADDRESS:-}"
upsert NEXT_PUBLIC_COMMISSION_CONTRACT_ADDRESS "${NEXT_PUBLIC_COMMISSION_CONTRACT_ADDRESS:-}"
upsert NEXT_PUBLIC_ESCROW_VAULT_ADDRESS "${NEXT_PUBLIC_ESCROW_VAULT_ADDRESS:-}"
upsert NEXT_PUBLIC_DEPLOYER_ADDRESS "${NEXT_PUBLIC_DEPLOYER_ADDRESS:-}"
upsert NEXT_PUBLIC_SIWE_DOMAIN "${NEXT_PUBLIC_SIWE_DOMAIN:-}"
