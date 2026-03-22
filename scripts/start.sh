#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NEXTJS_DIR="$ROOT_DIR/nextjs"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT_DIR/.deploy-env/local.env}"
FRONTEND_ENV_FILE="$ROOT_DIR/.deploy-env/frontend.env"
DEFAULT_PORT="${PORT:-3000}"

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return
  fi
  if command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@10.24.0 --activate >/dev/null 2>&1 || true
  fi
  command -v pnpm >/dev/null 2>&1 || {
    echo "pnpm is required" >&2
    exit 1
  }
}

find_available_port() {
  node - "$1" <<'NODE'
const net = require("net");

const start = Number(process.argv[2] || 3000);
const host = "127.0.0.1";
const maxAttempts = 20;

function tryPort(port, remaining) {
  const server = net.createServer();
  server.unref();
  server.once("error", () => {
    if (remaining <= 0) {
      console.error(`Could not find a free port starting from ${start}`);
      process.exit(1);
    }
    tryPort(port + 1, remaining - 1);
  });
  server.listen(port, host, () => {
    const actual = server.address().port;
    server.close(() => process.stdout.write(String(actual)));
  });
}

tryPort(start, maxAttempts);
NODE
}

write_frontend_env_file() {
  local port="$1"
  local url="$2"
  mkdir -p "$ROOT_DIR/.deploy-env"
  cat > "$FRONTEND_ENV_FILE" <<EOF
FRONTEND_PORT=$port
FRONTEND_URL=$url
EOF
}

ensure_pnpm
cd "$NEXTJS_DIR"
if [ -f "$DEPLOY_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$DEPLOY_ENV_FILE"
  set +a
fi

if [ ! -d node_modules ]; then
  pnpm install
fi

ACTUAL_PORT="$(find_available_port "$DEFAULT_PORT")"
FRONTEND_URL="http://localhost:$ACTUAL_PORT"

if [ "$ACTUAL_PORT" != "$DEFAULT_PORT" ]; then
  echo "Port $DEFAULT_PORT is busy. Using $ACTUAL_PORT for the frontend."
fi

if [ -z "${NEXT_PUBLIC_BASE_URL:-}" ] || [ "$NEXT_PUBLIC_BASE_URL" = "http://localhost:$DEFAULT_PORT" ] || [ "$NEXT_PUBLIC_BASE_URL" = "http://127.0.0.1:$DEFAULT_PORT" ]; then
  export NEXT_PUBLIC_BASE_URL="$FRONTEND_URL"
fi

export PORT="$ACTUAL_PORT"
write_frontend_env_file "$ACTUAL_PORT" "$FRONTEND_URL"
echo "Frontend URL: $FRONTEND_URL"

exec pnpm exec next dev --port "$ACTUAL_PORT"
