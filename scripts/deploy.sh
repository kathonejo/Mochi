#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FOUNDRY_DIR="$ROOT_DIR/foundry"
DEPLOY_ENV_DIR="$ROOT_DIR/.deploy-env"
FOUNDRY_ENV_FILE="${FOUNDRY_ENV_FILE:-$FOUNDRY_DIR/.env}"
NEXTJS_DIR="$ROOT_DIR/nextjs"
LOCAL_RPC_URL="${LOCAL_RPC_URL:-http://127.0.0.1:8545}"
LOCAL_CHAIN_ID="${LOCAL_CHAIN_ID:-43112}"
ANVIL_DEFAULT_PRIVATE_KEY="${ANVIL_DEFAULT_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
FUJI_FAUCET_URL="${FUJI_FAUCET_URL:-https://core.app/tools/testnet-faucet/?subnet=c&token=c}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

die() {
  echo "Error: $*" >&2
  exit 1
}

load_env() {
  if [ -f "$FOUNDRY_ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$FOUNDRY_ENV_FILE"
    set +a
  fi
}

ensure_local_chain() {
  if cast block-number --rpc-url "$LOCAL_RPC_URL" >/dev/null 2>&1; then
    return 0
  fi
  "$SCRIPT_DIR/chain.sh" start >/dev/null
}

extract_address() {
  node -e 'const fs=require("fs"); const text=fs.readFileSync(0,"utf8"); const data=JSON.parse(text); process.stdout.write(String(data.deployedTo||data.address||""));'
}

extract_tx_hash() {
  node -e 'const fs=require("fs"); const text=fs.readFileSync(0,"utf8"); const data=JSON.parse(text); process.stdout.write(String(data.transactionHash||""));'
}

format_wei_to_avax() {
  cast --from-wei "$1" ether 2>/dev/null || echo "0"
}

get_native_balance_wei() {
  cast balance "$1" --rpc-url "$2"
}

wait_for_deployer_funding() {
  local network="$1"
  local address="$2"
  local rpc_url="$3"
  local min_avax="$4"
  local wait_enabled="$5"
  local faucet_url="$6"

  local min_wei current_wei current_avax
  min_wei="$(cast --to-wei "$min_avax" ether)"
  current_wei="$(get_native_balance_wei "$address" "$rpc_url")"

  if [ "$current_wei" -ge "$min_wei" ]; then
    current_avax="$(format_wei_to_avax "$current_wei")"
    echo "Deployer $address funded on $network with ${current_avax} AVAX."
    return 0
  fi

  current_avax="$(format_wei_to_avax "$current_wei")"
  echo "Deployer address for $network: $address"
  echo "Current balance: ${current_avax} AVAX"
  echo "Minimum required before deploy: ${min_avax} AVAX"
  if [ -n "$faucet_url" ]; then
    echo "Fund it here: $faucet_url"
  fi

  if [ "$wait_enabled" != "1" ]; then
    die "Wallet is underfunded. Fund $address and re-run deploy."
  fi

  echo "Waiting for funds..."
  while true; do
    sleep 15
    current_wei="$(get_native_balance_wei "$address" "$rpc_url")"
    if [ "$current_wei" -ge "$min_wei" ]; then
      current_avax="$(format_wei_to_avax "$current_wei")"
      echo "Funding detected: ${current_avax} AVAX."
      return 0
    fi
    current_avax="$(format_wei_to_avax "$current_wei")"
    echo "Still waiting. Current balance: ${current_avax} AVAX"
  done
}

sync_vercel_envs_if_requested() {
  local network="$1"
  local sync_enabled="$2"
  local environment="$3"
  if [ "$sync_enabled" != "1" ]; then
    return 0
  fi
  echo "Syncing Vercel envs for $network ($environment)..."
  "$SCRIPT_DIR/vercel-env-sync.sh" "$network" "$environment"
}

refresh_pending_nonce() {
  local rpc_url="$1"
  local deployer_address="$2"
  CURRENT_NONCE="$(cast nonce --block pending --rpc-url "$rpc_url" "$deployer_address")"
}

deploy_contract() {
  local rpc_url="$1"
  local private_key="$2"
  local deployer_address
  local contract="$3"
  shift 3
  local out nonce next
  deployer_address="$(cast wallet address --private-key "$private_key")"
  while true; do
    nonce="$(next_nonce)"
    out="$(cd "$FOUNDRY_DIR" && forge create "$contract" --rpc-url "$rpc_url" --private-key "$private_key" --broadcast --nonce "$nonce" --json "$@" 2>&1)" && {
      printf '%s' "$out"
      return 0
    }
    next="$(printf '%s' "$out" | sed -nE 's/.*nonce too low: next nonce ([0-9]+), tx nonce [0-9]+.*/\1/p' | tail -n1)"
    if [ -n "$next" ]; then
      CURRENT_NONCE="$next"
      echo "Retrying deploy for $contract with nonce $CURRENT_NONCE..." >&2
      continue
    fi
    if printf '%s' "$out" | grep -qi 'nonce too low'; then
      refresh_pending_nonce "$rpc_url" "$deployer_address"
      echo "Retrying deploy for $contract with refreshed nonce $CURRENT_NONCE..." >&2
      continue
    fi
    echo "$out" >&2
    return 1
  done
}

send_transaction() {
  local rpc_url="$1"
  local private_key="$2"
  local deployer_address
  local to="$3"
  local signature="$4"
  shift 4
  local nonce out next
  deployer_address="$(cast wallet address --private-key "$private_key")"
  while true; do
    nonce="$(next_nonce)"
    out="$(cast send --rpc-url "$rpc_url" --private-key "$private_key" --nonce "$nonce" "$to" "$signature" "$@" 2>&1)" && return 0
    next="$(printf '%s' "$out" | sed -nE 's/.*nonce too low: next nonce ([0-9]+), tx nonce [0-9]+.*/\1/p' | tail -n1)"
    if [ -n "$next" ]; then
      CURRENT_NONCE="$next"
      echo "Retrying transaction $signature with nonce $CURRENT_NONCE..." >&2
      continue
    fi
    if printf '%s' "$out" | grep -qi 'nonce too low'; then
      refresh_pending_nonce "$rpc_url" "$deployer_address"
      echo "Retrying transaction $signature with refreshed nonce $CURRENT_NONCE..." >&2
      continue
    fi
    echo "$out" >&2
    return 1
  done
}

send_value_transaction() {
  local rpc_url="$1"
  local private_key="$2"
  local deployer_address
  local value="$3"
  local to="$4"
  local signature="$5"
  shift 5
  local nonce out next
  deployer_address="$(cast wallet address --private-key "$private_key")"
  while true; do
    nonce="$(next_nonce)"
    out="$(cast send --rpc-url "$rpc_url" --private-key "$private_key" --nonce "$nonce" --value "$value" "$to" "$signature" "$@" 2>&1)" && return 0
    next="$(printf '%s' "$out" | sed -nE 's/.*nonce too low: next nonce ([0-9]+), tx nonce [0-9]+.*/\1/p' | tail -n1)"
    if [ -n "$next" ]; then
      CURRENT_NONCE="$next"
      echo "Retrying payable transaction $signature with nonce $CURRENT_NONCE..." >&2
      continue
    fi
    if printf '%s' "$out" | grep -qi 'nonce too low'; then
      refresh_pending_nonce "$rpc_url" "$deployer_address"
      echo "Retrying payable transaction $signature with refreshed nonce $CURRENT_NONCE..." >&2
      continue
    fi
    echo "$out" >&2
    return 1
  done
}

call_contract() {
  local rpc_url="$1"
  local to="$2"
  local signature="$3"
  shift 3
  cast call --rpc-url "$rpc_url" "$to" "$signature" "$@"
}

next_nonce() {
  local nonce="$CURRENT_NONCE"
  CURRENT_NONCE=$((CURRENT_NONCE + 1))
  printf '%s' "$nonce"
}

seed_showcase_data() {
  local rpc_url="$1"
  local private_key="$2"
  local nft_address="$3"
  local editions_address="$4"
  local auction_address="$5"
  local marketplace_address="$6"
  local swap_address="$7"

  local default_base_url
  if [ "$rpc_url" = "$LOCAL_RPC_URL" ]; then
    default_base_url="${SHOWCASE_LOCAL_BASE_URL:-http://localhost:3000/deploy-seed/local/metadata}"
  else
    default_base_url="${SHOWCASE_REMOTE_BASE_URL:-https://raw.githubusercontent.com/shimeji-ai/Mochi/main/nextjs/public/deploy-seed/testnet/metadata}"
  fi

  local bunny_token_uri="${SHOWCASE_BUNNY_TOKEN_URI:-$default_base_url/bunny.json}"
  local lobster_token_uri="${SHOWCASE_LOBSTER_TOKEN_URI:-$default_base_url/lobster.json}"
  local mushroom_token_uri="${SHOWCASE_MUSHROOM_TOKEN_URI:-$default_base_url/mushroom.json}"
  local egg_token_uri="${SHOWCASE_EGG_TOKEN_URI:-$default_base_url/egg.json}"

  local bunny_copies="${SHOWCASE_BUNNY_COPIES:-100}"
  local bunny_price_wei lobster_auction_start_price_wei egg_listing_price_wei
  local auction_duration_seconds

  bunny_price_wei="$(cast --to-wei "${SHOWCASE_BUNNY_PRICE_AVAX:-0.03}" ether)"
  lobster_auction_start_price_wei="$(cast --to-wei "${SHOWCASE_LOBSTER_AUCTION_START_PRICE_AVAX:-0.08}" ether)"
  egg_listing_price_wei="$(cast --to-wei "${SHOWCASE_EGG_COMMISSION_PRICE_AVAX:-0.18}" ether)"
  auction_duration_seconds="${SHOWCASE_AUCTION_DURATION_SECONDS:-604800}"

  echo "Seeding showcase marketplace data..."

  local deployer_address
  deployer_address="$(cast wallet address --private-key "$private_key")"

  send_transaction "$rpc_url" "$private_key" "$editions_address" "createEdition(address,uint256,string,address)" "$deployer_address" "$bunny_copies" "$bunny_token_uri" "$deployer_address"
  send_transaction "$rpc_url" "$private_key" "$nft_address" "createFinishedNft(string)" "$lobster_token_uri"
  send_transaction "$rpc_url" "$private_key" "$nft_address" "createFinishedNft(string)" "$mushroom_token_uri"
  send_transaction "$rpc_url" "$private_key" "$nft_address" "createCommissionEgg(string)" "$egg_token_uri"

  send_transaction "$rpc_url" "$private_key" "$nft_address" "setApprovalForAll(address,bool)" "$marketplace_address" true
  send_transaction "$rpc_url" "$private_key" "$nft_address" "setApprovalForAll(address,bool)" "$auction_address" true
  send_transaction "$rpc_url" "$private_key" "$nft_address" "setApprovalForAll(address,bool)" "$swap_address" true
  send_transaction "$rpc_url" "$private_key" "$editions_address" "setApprovalForAll(address,bool)" "$marketplace_address" true
  send_transaction "$rpc_url" "$private_key" "$marketplace_address" "listEditionForSale(uint256,uint256,uint256,uint8)" 0 "$bunny_copies" "$bunny_price_wei" 0

  local lobster_token_id=0
  local mushroom_token_id=1
  local egg_token_id=2

  send_transaction "$rpc_url" "$private_key" "$auction_address" "createItemAuction(uint256,uint256,uint8,uint64)" "$lobster_token_id" "$lobster_auction_start_price_wei" 0 "$auction_duration_seconds"
  send_transaction "$rpc_url" "$private_key" "$swap_address" "createSwapListing(uint256,string)" "$mushroom_token_id" "${SHOWCASE_MUSHROOM_SWAP_INTENTION:-Looking to swap this Mushroom Mochi for another rare animated companion.}"
  send_transaction "$rpc_url" "$private_key" "$marketplace_address" "listCommissionEgg(uint256,uint256,uint8,uint64)" "$egg_token_id" "$egg_listing_price_wei" 0 "${SHOWCASE_EGG_COMMISSION_ETA_DAYS:-14}"

  echo "Seeded showcase data:"
  echo "  Marketplace Bunny edition listing: edition #0 with ${bunny_copies} copies (edition listing #0)"
  echo "  Auction showcase: Lobster (token #${lobster_token_id}, auction #0)"
  echo "  Swap showcase: Mushroom (token #${mushroom_token_id}, swap listing #0)"
  echo "  Commission showcase: Egg (token #${egg_token_id}, listing #0)"
}

write_env_file() {
  local network="$1"
  local chain_id="$2"
  local rpc_url="$3"
  local explorer_url="$4"
  local usdc_address="$5"
  local oracle_address="$6"
  local nft_address="$7"
  local editions_address="$8"
  local auction_address="$9"
  local marketplace_address="${10}"
  local swap_address="${11}"
  local commission_address="${12}"
  local escrow_address="${13}"
  local deployer_address="${14}"
  mkdir -p "$DEPLOY_ENV_DIR"
  cat > "$DEPLOY_ENV_DIR/$network.env" <<ENVVARS
NEXT_PUBLIC_NETWORK=$network
NEXT_PUBLIC_CHAIN_ID=$chain_id
NEXT_PUBLIC_RPC_URL=$rpc_url
NEXT_PUBLIC_BLOCK_EXPLORER_URL=$explorer_url
NEXT_PUBLIC_USDC_ADDRESS=$usdc_address
NEXT_PUBLIC_AVAX_USD_ORACLE_ADDRESS=$oracle_address
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=$nft_address
NEXT_PUBLIC_EDITIONS_CONTRACT_ADDRESS=$editions_address
NEXT_PUBLIC_AUCTION_CONTRACT_ADDRESS=$auction_address
NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS=$marketplace_address
NEXT_PUBLIC_SWAP_CONTRACT_ADDRESS=$swap_address
NEXT_PUBLIC_COMMISSION_CONTRACT_ADDRESS=$commission_address
NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=$escrow_address
NEXT_PUBLIC_DEPLOYER_ADDRESS=$deployer_address
NEXT_PUBLIC_SIWE_DOMAIN=${NEXT_PUBLIC_SIWE_DOMAIN:-localhost}
ENVVARS
  echo "Wrote $DEPLOY_ENV_DIR/$network.env"
}

print_deploy_summary() {
  local rpc_url="$1"
  shift
  echo "Deployment complete."
  while [ "$#" -gt 0 ]; do
    echo "  $1"
    shift
  done
  echo "Inspect transactions with: cast tx <tx-hash> --rpc-url $rpc_url"
}

load_env
need_cmd forge || die "forge not found"
need_cmd cast || die "cast not found"

NETWORK="${1:-${NETWORK:-local}}"
case "$NETWORK" in
  local|fuji|mainnet) ;;
  *) die "Usage: ./scripts/deploy.sh [local|fuji|mainnet]" ;;
esac

SYNC_VERCEL="${SYNC_VERCEL:-0}"
VERCEL_ENVIRONMENT="${VERCEL_ENVIRONMENT:-production}"

if [ "$NETWORK" = "local" ]; then
  ensure_local_chain
  RPC_URL="$LOCAL_RPC_URL"
  CHAIN_ID="$LOCAL_CHAIN_ID"
  PRIVATE_KEY="${LOCAL_DEPLOYER_PRIVATE_KEY:-$ANVIL_DEFAULT_PRIVATE_KEY}"
  EXPLORER_URL=""
  DEPLOYER_ADDRESS="$(cast wallet address --private-key "$PRIVATE_KEY")"
  CURRENT_NONCE="$(cast nonce --block pending --rpc-url "$RPC_URL" "$DEPLOYER_ADDRESS")"

  (cd "$FOUNDRY_DIR" && forge build >/dev/null)

  MOCK_USDC_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MockUSDC.sol:MockUSDC --constructor-args "$DEPLOYER_ADDRESS")"
  MOCK_USDC_ADDRESS="$(printf '%s' "$MOCK_USDC_JSON" | extract_address)"
  MOCK_USDC_TX="$(printf '%s' "$MOCK_USDC_JSON" | extract_tx_hash)"

  ORACLE_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MockPriceOracle.sol:MockPriceOracle --constructor-args "$DEPLOYER_ADDRESS" 250000000000)"
  ORACLE_ADDRESS="$(printf '%s' "$ORACLE_JSON" | extract_address)"
  ORACLE_TX="$(printf '%s' "$ORACLE_JSON" | extract_tx_hash)"

  NFT_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiNFT.sol:MochiNFT --constructor-args "$DEPLOYER_ADDRESS")"
  NFT_ADDRESS="$(printf '%s' "$NFT_JSON" | extract_address)"
  NFT_TX="$(printf '%s' "$NFT_JSON" | extract_tx_hash)"

  EDITIONS_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiEditions.sol:MochiEditions --constructor-args "$DEPLOYER_ADDRESS")"
  EDITIONS_ADDRESS="$(printf '%s' "$EDITIONS_JSON" | extract_address)"
  EDITIONS_TX="$(printf '%s' "$EDITIONS_JSON" | extract_tx_hash)"

  AUCTION_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiAuction.sol:MochiAuction --constructor-args "$DEPLOYER_ADDRESS" "$NFT_ADDRESS" "$MOCK_USDC_ADDRESS" "$ORACLE_ADDRESS")"
  AUCTION_ADDRESS="$(printf '%s' "$AUCTION_JSON" | extract_address)"
  AUCTION_TX="$(printf '%s' "$AUCTION_JSON" | extract_tx_hash)"

  MARKETPLACE_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiMarketplace.sol:MochiMarketplace --constructor-args "$DEPLOYER_ADDRESS" "$NFT_ADDRESS" "$EDITIONS_ADDRESS" "$MOCK_USDC_ADDRESS")"
  MARKETPLACE_ADDRESS="$(printf '%s' "$MARKETPLACE_JSON" | extract_address)"
  MARKETPLACE_TX="$(printf '%s' "$MARKETPLACE_JSON" | extract_tx_hash)"

  SWAP_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiSwap.sol:MochiSwap --constructor-args "$DEPLOYER_ADDRESS" "$NFT_ADDRESS")"
  SWAP_ADDRESS="$(printf '%s' "$SWAP_JSON" | extract_address)"
  SWAP_TX="$(printf '%s' "$SWAP_JSON" | extract_tx_hash)"

  COMMISSION_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiCommission.sol:MochiCommission --constructor-args "$DEPLOYER_ADDRESS" "$MOCK_USDC_ADDRESS")"
  COMMISSION_ADDRESS="$(printf '%s' "$COMMISSION_JSON" | extract_address)"
  COMMISSION_TX="$(printf '%s' "$COMMISSION_JSON" | extract_tx_hash)"

  ESCROW_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiEscrowVault.sol:MochiEscrowVault --constructor-args "$DEPLOYER_ADDRESS")"
  ESCROW_ADDRESS="$(printf '%s' "$ESCROW_JSON" | extract_address)"
  ESCROW_TX="$(printf '%s' "$ESCROW_JSON" | extract_tx_hash)"

  for account in \
    0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 \
    0x70997970c51812dc3a010c7d01b50e0d17dc79c8 \
    0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc; do
    cast send "$MOCK_USDC_ADDRESS" "mint(address,uint256)" "$account" 1000000000000 --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" >/dev/null
  done

  if [ "${LOCAL_SEED_SHOWCASE_DATA:-1}" = "1" ]; then
    seed_showcase_data "$RPC_URL" "$PRIVATE_KEY" "$NFT_ADDRESS" "$EDITIONS_ADDRESS" "$AUCTION_ADDRESS" "$MARKETPLACE_ADDRESS" "$SWAP_ADDRESS"
  fi

  write_env_file "$NETWORK" "$CHAIN_ID" "$RPC_URL" "$EXPLORER_URL" "$MOCK_USDC_ADDRESS" "$ORACLE_ADDRESS" "$NFT_ADDRESS" "$EDITIONS_ADDRESS" "$AUCTION_ADDRESS" "$MARKETPLACE_ADDRESS" "$SWAP_ADDRESS" "$COMMISSION_ADDRESS" "$ESCROW_ADDRESS" "$DEPLOYER_ADDRESS"

  print_deploy_summary "$RPC_URL" \
    "MockUSDC:      $MOCK_USDC_ADDRESS ($MOCK_USDC_TX)" \
    "Oracle:        $ORACLE_ADDRESS ($ORACLE_TX)" \
    "NFT:           $NFT_ADDRESS ($NFT_TX)" \
    "Editions:      $EDITIONS_ADDRESS ($EDITIONS_TX)" \
    "Auction:       $AUCTION_ADDRESS ($AUCTION_TX)" \
    "Marketplace:   $MARKETPLACE_ADDRESS ($MARKETPLACE_TX)" \
    "Swap:          $SWAP_ADDRESS ($SWAP_TX)" \
    "Commission:    $COMMISSION_ADDRESS ($COMMISSION_TX)" \
    "EscrowVault:   $ESCROW_ADDRESS ($ESCROW_TX)"
  exit 0
fi

case "$NETWORK" in
  fuji)
    RPC_URL="${FUJI_RPC_URL:-}"
    CHAIN_ID="43113"
    EXPLORER_URL="https://testnet.snowscan.xyz"
    USDC_ADDRESS="${FUJI_USDC_ADDRESS:-}"
    ORACLE_ADDRESS="${FUJI_AVAX_USD_ORACLE_ADDRESS:-}"
    MIN_DEPLOYER_AVAX="${FUJI_MIN_DEPLOYER_AVAX:-0.2}"
    WAIT_FOR_DEPLOYER_FUNDING="${WAIT_FOR_DEPLOYER_FUNDING:-1}"
    FUNDING_URL="$FUJI_FAUCET_URL"
    ;;
  mainnet)
    RPC_URL="${MAINNET_RPC_URL:-}"
    CHAIN_ID="43114"
    EXPLORER_URL="https://snowscan.xyz"
    USDC_ADDRESS="${MAINNET_USDC_ADDRESS:-}"
    ORACLE_ADDRESS="${MAINNET_AVAX_USD_ORACLE_ADDRESS:-}"
    MIN_DEPLOYER_AVAX="${MAINNET_MIN_DEPLOYER_AVAX:-0.2}"
    WAIT_FOR_DEPLOYER_FUNDING="${WAIT_FOR_DEPLOYER_FUNDING:-0}"
    FUNDING_URL=""
    ;;
esac

PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-}"
[ -n "$RPC_URL" ] || die "RPC URL missing for $NETWORK"
[ -n "$PRIVATE_KEY" ] || die "DEPLOYER_PRIVATE_KEY missing"
[ -n "$USDC_ADDRESS" ] || die "USDC address missing for $NETWORK"
[ -n "$ORACLE_ADDRESS" ] || die "AVAX/USD oracle address missing for $NETWORK"
DEPLOYER_ADDRESS="$(cast wallet address --private-key "$PRIVATE_KEY")"

wait_for_deployer_funding "$NETWORK" "$DEPLOYER_ADDRESS" "$RPC_URL" "$MIN_DEPLOYER_AVAX" "$WAIT_FOR_DEPLOYER_FUNDING" "$FUNDING_URL"
CURRENT_NONCE="$(cast nonce --block pending --rpc-url "$RPC_URL" "$DEPLOYER_ADDRESS")"

(cd "$FOUNDRY_DIR" && forge build >/dev/null)

NFT_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiNFT.sol:MochiNFT --constructor-args "$DEPLOYER_ADDRESS")"
NFT_ADDRESS="$(printf '%s' "$NFT_JSON" | extract_address)"
NFT_TX="$(printf '%s' "$NFT_JSON" | extract_tx_hash)"

EDITIONS_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiEditions.sol:MochiEditions --constructor-args "$DEPLOYER_ADDRESS")"
EDITIONS_ADDRESS="$(printf '%s' "$EDITIONS_JSON" | extract_address)"
EDITIONS_TX="$(printf '%s' "$EDITIONS_JSON" | extract_tx_hash)"

AUCTION_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiAuction.sol:MochiAuction --constructor-args "$DEPLOYER_ADDRESS" "$NFT_ADDRESS" "$USDC_ADDRESS" "$ORACLE_ADDRESS")"
AUCTION_ADDRESS="$(printf '%s' "$AUCTION_JSON" | extract_address)"
AUCTION_TX="$(printf '%s' "$AUCTION_JSON" | extract_tx_hash)"

MARKETPLACE_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiMarketplace.sol:MochiMarketplace --constructor-args "$DEPLOYER_ADDRESS" "$NFT_ADDRESS" "$EDITIONS_ADDRESS" "$USDC_ADDRESS")"
MARKETPLACE_ADDRESS="$(printf '%s' "$MARKETPLACE_JSON" | extract_address)"
MARKETPLACE_TX="$(printf '%s' "$MARKETPLACE_JSON" | extract_tx_hash)"

SWAP_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiSwap.sol:MochiSwap --constructor-args "$DEPLOYER_ADDRESS" "$NFT_ADDRESS")"
SWAP_ADDRESS="$(printf '%s' "$SWAP_JSON" | extract_address)"
SWAP_TX="$(printf '%s' "$SWAP_JSON" | extract_tx_hash)"

COMMISSION_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiCommission.sol:MochiCommission --constructor-args "$DEPLOYER_ADDRESS" "$USDC_ADDRESS")"
COMMISSION_ADDRESS="$(printf '%s' "$COMMISSION_JSON" | extract_address)"
COMMISSION_TX="$(printf '%s' "$COMMISSION_JSON" | extract_tx_hash)"

ESCROW_JSON="$(deploy_contract "$RPC_URL" "$PRIVATE_KEY" src/MochiEscrowVault.sol:MochiEscrowVault --constructor-args "$DEPLOYER_ADDRESS")"
ESCROW_ADDRESS="$(printf '%s' "$ESCROW_JSON" | extract_address)"
ESCROW_TX="$(printf '%s' "$ESCROW_JSON" | extract_tx_hash)"

if [ "$NETWORK" = "fuji" ] && [ "${FUJI_SEED_SAMPLE_DATA:-1}" = "1" ]; then
  seed_showcase_data "$RPC_URL" "$PRIVATE_KEY" "$NFT_ADDRESS" "$EDITIONS_ADDRESS" "$AUCTION_ADDRESS" "$MARKETPLACE_ADDRESS" "$SWAP_ADDRESS"
fi

write_env_file "$NETWORK" "$CHAIN_ID" "$RPC_URL" "$EXPLORER_URL" "$USDC_ADDRESS" "$ORACLE_ADDRESS" "$NFT_ADDRESS" "$EDITIONS_ADDRESS" "$AUCTION_ADDRESS" "$MARKETPLACE_ADDRESS" "$SWAP_ADDRESS" "$COMMISSION_ADDRESS" "$ESCROW_ADDRESS" "$DEPLOYER_ADDRESS"
sync_vercel_envs_if_requested "$NETWORK" "$SYNC_VERCEL" "$VERCEL_ENVIRONMENT"

print_deploy_summary "$RPC_URL" \
  "NFT:           $NFT_ADDRESS ($NFT_TX)" \
  "Editions:      $EDITIONS_ADDRESS ($EDITIONS_TX)" \
  "Auction:       $AUCTION_ADDRESS ($AUCTION_TX)" \
  "Marketplace:   $MARKETPLACE_ADDRESS ($MARKETPLACE_TX)" \
  "Swap:          $SWAP_ADDRESS ($SWAP_TX)" \
  "Commission:    $COMMISSION_ADDRESS ($COMMISSION_TX)" \
  "EscrowVault:   $ESCROW_ADDRESS ($ESCROW_TX)"
