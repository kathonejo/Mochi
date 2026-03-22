#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="$ROOT_DIR/.chain"
PID_FILE="$STATE_DIR/anvil.pid"
LOG_FILE="$STATE_DIR/anvil.log"
RPC_URL="${LOCAL_RPC_URL:-http://127.0.0.1:8545}"
CHAIN_ID="${LOCAL_CHAIN_ID:-43112}"
HOST="${LOCAL_CHAIN_HOST:-127.0.0.1}"
PORT="${LOCAL_CHAIN_PORT:-8545}"
BLOCK_TIME="${LOCAL_BLOCK_TIME:-2}"
ACCOUNTS="${LOCAL_CHAIN_ACCOUNTS:-10}"
BALANCE="${LOCAL_CHAIN_BALANCE:-1000000}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

die() {
  echo "Error: $*" >&2
  exit 1
}

is_running() {
  [ -f "$PID_FILE" ] || return 1
  kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1
}

print_hints() {
  cat <<HINTS
Local Avalanche-compatible chain is running.
RPC: $RPC_URL
Chain ID: $CHAIN_ID

Useful commands:
  pnpm chain:logs
  pnpm deploy:local
  cast block-number --rpc-url $RPC_URL
  cast tx <tx-hash> --rpc-url $RPC_URL
HINTS
}

start_chain() {
  need_cmd anvil || die "anvil not found in PATH"
  mkdir -p "$STATE_DIR"

  if is_running; then
    echo "anvil already running (PID $(cat "$PID_FILE"))"
    print_hints
    return 0
  fi

  nohup anvil \
    --host "$HOST" \
    --port "$PORT" \
    --chain-id "$CHAIN_ID" \
    --block-time "$BLOCK_TIME" \
    --accounts "$ACCOUNTS" \
    --balance "$BALANCE" \
    >"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  for _ in $(seq 1 30); do
    if cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; then
      print_hints
      return 0
    fi
    sleep 0.5
  done

  echo "anvil failed to start; recent logs:" >&2
  tail -n 80 "$LOG_FILE" >&2 || true
  exit 1
}

stop_chain() {
  if ! is_running; then
    echo "anvil is not running"
    return 0
  fi
  kill "$(cat "$PID_FILE")"
  rm -f "$PID_FILE"
  echo "anvil stopped"
}

status_chain() {
  if is_running; then
    echo "running PID $(cat "$PID_FILE")"
    print_hints
  else
    echo "stopped"
  fi
}

case "${1:-start}" in
  start) start_chain ;;
  stop|off) stop_chain ;;
  logs) mkdir -p "$STATE_DIR"; touch "$LOG_FILE"; tail -n 120 -f "$LOG_FILE" ;;
  status) status_chain ;;
  *) die "Usage: ./scripts/chain.sh [start|stop|logs|status]" ;;
esac
