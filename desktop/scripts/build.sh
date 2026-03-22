#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$ROOT_DIR/dist"
BUILD_LOG="$BUILD_DIR/build.log"
CORE_SYNC_SCRIPT="$ROOT_DIR/../scripts/sync-runtime-core.js"
CORE_SYNCED=0

sync_runtime_core() {
  if [ $CORE_SYNCED -eq 1 ]; then
    return
  fi
  if [ ! -f "$CORE_SYNC_SCRIPT" ]; then
    echo "Missing runtime core sync script: $CORE_SYNC_SCRIPT" >&2
    exit 1
  fi
  echo "==> Syncing runtime core assets"
  node "$CORE_SYNC_SCRIPT" >/dev/null
  CORE_SYNCED=1
}

install_dmg_license() {
  if [ -d "$ROOT_DIR/node_modules/dmg-license" ]; then
    return
  fi

  mkdir -p "$ROOT_DIR/node_modules"
  echo "==> Installing dmg-license for mac builds..."

  if command -v npm >/dev/null 2>&1; then
    if npm_config_platform=darwin npm install dmg-license@1.0.11 --no-save --no-package-lock --no-audit >/dev/null 2>&1; then
      return
    fi
    if [ -d "$ROOT_DIR/node_modules/dmg-license" ]; then
      return
    fi
    echo "==> npm install failed; falling back to manual download"
  else
    echo "==> npm unavailable; falling back to manual download"
  fi

  local tarball_url="https://registry.npmjs.org/dmg-license/-/dmg-license-1.0.11.tgz"
  local tmpdir
  tmpdir="$(mktemp -d)"
  local tarball="$tmpdir/dmg-license.tgz"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$tarball_url" -o "$tarball"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$tarball" "$tarball_url"
  else
    echo "==> curl/wget unavailable; cannot fetch dmg-license"
    rm -rf "$tmpdir"
    return 1
  fi

  tar -xzf "$tarball" -C "$tmpdir"
  mkdir -p "$ROOT_DIR/node_modules/dmg-license"
  if cp -R "$tmpdir/package/." "$ROOT_DIR/node_modules/dmg-license"; then
    rm -rf "$tmpdir"
    if command -v npm >/dev/null 2>&1; then
      echo "==> Installing dmg-license dependencies"
      (
        cd "$ROOT_DIR/node_modules/dmg-license"
        npm_config_platform=darwin npm install --production --no-save --no-package-lock crc@3.8.0 ajv@6.10.0 iconv-corefoundation@1.1.7 plist@3.0.4 smart-buffer@4.0.2 verror@1.10.0 >/dev/null 2>&1 || true
      )
    fi
  else
    rm -rf "$tmpdir"
    return 1
  fi
}

ensure_dist_dir() {
  mkdir -p "$BUILD_DIR"
}

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log_entry() {
  ensure_dist_dir
  printf "[%s] %s\n" "$(timestamp)" "$*" >> "$BUILD_LOG"
}

run_single_target() {
  local target="$1"
  local args log display_target

  sync_runtime_core

  case "$target" in
    windows|win)
      args=(--win)
      log="build-win.log"
      display_target="Windows"
      ;;
    mac|macos)
      args=(--mac)
      log="build-mac.log"
      display_target="macOS"
      ;;
    linux)
      args=(--linux)
      log="build-linux.log"
      display_target="Linux"
      ;;
    *)
      echo "Unknown target: $target"
      exit 1
      ;;
  esac

  install_dmg_license
  ensure_dist_dir
  log_entry "Starting ${display_target:-$target} build (log: dist/$log)"
  echo "==> Building $target (logs: dist/$log)"
  if (cd "$ROOT_DIR" && npx electron-builder "${args[@]}") > "$BUILD_DIR/$log" 2>&1; then
    log_entry "Finished ${display_target:-$target} build successfully"
    echo "==> $target build finished"
  else
    local exit_code=$?
    log_entry "Failed ${display_target:-$target} build (exit $exit_code)"
    echo "==> $target build failed (exit $exit_code) - see dist/$log"
    exit "$exit_code"
  fi
}

run_all() {
  sync_runtime_core
  install_dmg_license
  ensure_dist_dir

  echo "==> Building all platforms"
  log_entry "Starting full build (Windows, macOS, Linux)"
  (cd "$ROOT_DIR" && npx electron-builder --win) > "$BUILD_DIR/build-win.log" 2>&1 & PID_WIN=$!
  (cd "$ROOT_DIR" && npx electron-builder --mac) > "$BUILD_DIR/build-mac.log" 2>&1 & PID_MAC=$!
  (cd "$ROOT_DIR" && npx electron-builder --linux) > "$BUILD_DIR/build-linux.log" 2>&1 & PID_LINUX=$!

  WIN_OK=0
  MAC_OK=0
  LINUX_OK=0

  wait "$PID_WIN" || WIN_OK=$?
  wait "$PID_MAC" || MAC_OK=$?
  wait "$PID_LINUX" || LINUX_OK=$?

  echo "========================================"
  echo " Build Results"
  echo "========================================"
  if [ $WIN_OK -eq 0 ]; then
    echo "  Windows  : SUCCESS"
  else
    echo "  Windows  : FAILED (exit $WIN_OK) - see dist/build-win.log"
  fi
  if [ $MAC_OK -eq 0 ]; then
    echo "  macOS    : SUCCESS"
  else
    echo "  macOS    : FAILED (exit $MAC_OK) - see dist/build-mac.log"
  fi
  if [ $LINUX_OK -eq 0 ]; then
    echo "  Linux    : SUCCESS"
  else
    echo "  Linux    : FAILED (exit $LINUX_OK) - see dist/build-linux.log"
  fi

  log_entry "Full build completed (win=$WIN_OK, mac=$MAC_OK, linux=$LINUX_OK)"

  if [ $WIN_OK -ne 0 ] || [ $MAC_OK -ne 0 ] || [ $LINUX_OK -ne 0 ]; then
    exit 1
  fi
}

prompt_choice() {
  cat >&2 <<'EOF'
Choose a build target:
 1) Build all platforms (parallel)
 2) Build Windows only
 3) Build macOS only
 4) Build Linux only
 5) Exit
EOF
}

handle_selection() {
  local choice="$1"
  case "$choice" in
    1|all)
      run_all
      ;;
    2|windows|win)
      run_single_target windows
      ;;
    3|mac|macos)
      run_single_target macos
      ;;
    4|linux)
      run_single_target linux
      ;;
    5|exit|quit)
      echo "Exiting without running a build."
      exit 0
      ;;
    *)
      echo "Invalid selection: '$choice'. Defaulting to full build."
      run_all
      ;;
  esac
}

prompt_user_selection() {
  prompt_choice
  printf "Selection [1]: " >&2
  local input
  if read -r input; then
    input="${input:-1}"
    echo "$input"
  else
    echo "1"
  fi
}

main() {
  local selection="${MOCHI_BUILD_TARGET:-}"
  if [ $# -gt 0 ]; then
    selection="$1"
  elif [ -t 0 ]; then
    selection="$(prompt_user_selection)"
  else
    selection="${selection:-1}"
  fi

  log_entry "Menu selection: $selection"
  handle_selection "$selection"
}

main "$@"
