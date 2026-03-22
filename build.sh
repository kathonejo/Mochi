#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
DIST_DIR="$ROOT_DIR/dist"
DESKTOP_BUILD_SCRIPT="$ROOT_DIR/desktop/scripts/build.sh"
CHROME_DIR="$ROOT_DIR/chrome-extension"
FIREFOX_DIR="$ROOT_DIR/firefox-extension"
CHROME_ZIP="$DIST_DIR/mochi-chrome-extension.zip"
FIREFOX_ZIP="$DIST_DIR/mochi-firefox-extension.zip"
CHROME_RELEASE="$ROOT_DIR/mochi-eth/packages/nextjs/public/mochi-chrome-extension.zip"
FIREFOX_RELEASE="$ROOT_DIR/mochi-eth/packages/nextjs/public/mochi-firefox-extension.zip"
CORE_SYNCED=0

ensure_dist() {
  mkdir -p "$DIST_DIR"
}

sync_runtime_core() {
  if [ $CORE_SYNCED -eq 1 ]; then
    return
  fi
  echo "==> Syncing runtime core assets (characters, personalities, shared sounds)"
  node scripts/sync-runtime-core.js >/dev/null
  echo "==> Runtime core synced"
  CORE_SYNCED=1
}

zip_extension() {
  local src_dir="$1"
  local out_zip="$2"
  local release_zip="$3"
  if [ ! -d "$src_dir" ]; then
    echo "Missing extension directory: $src_dir" >&2
    exit 1
  fi
  ensure_dist
  rm -f "$out_zip"
  (cd "$src_dir" && zip -rq "$out_zip" . -x ".git/*" "node_modules/*")
  mkdir -p "$(dirname "$release_zip")"
  cp -f "$out_zip" "$release_zip"
  echo "==> Packaged $(basename "$src_dir") -> $out_zip (release copy: $release_zip)"
}

build_chrome_extension() {
  sync_runtime_core
  zip_extension "$CHROME_DIR" "$CHROME_ZIP" "$CHROME_RELEASE"
}

build_firefox_extension() {
  sync_runtime_core
  zip_extension "$FIREFOX_DIR" "$FIREFOX_ZIP" "$FIREFOX_RELEASE"
}

build_desktop_target() {
  local target="$1"
  sync_runtime_core
  echo "==> Delegating desktop target '$target' to desktop/scripts/build.sh"
  "$DESKTOP_BUILD_SCRIPT" "$target"
}

run_all_targets() {
  sync_runtime_core
  build_chrome_extension
  build_firefox_extension
  "$DESKTOP_BUILD_SCRIPT" all
}

prompt_menu() {
  cat <<'MENU'
Choose a build target:
 1) All (chrome + firefox + desktop [windows/mac/linux])
 2) Chrome extension only
 3) Firefox extension only
 4) Desktop Windows
 5) Desktop macOS
 6) Desktop Linux
 7) Exit
MENU
}

main() {
  local selection="${1:-}"
  if [ -z "$selection" ]; then
    if [ -t 0 ]; then
      prompt_menu
      printf "Selection [1]: " >&2
      read -r input
      selection="${input:-1}"
    else
      selection=1
    fi
  fi

  case "$selection" in
    1|all)
      run_all_targets
      ;;
    2|chrome)
      build_chrome_extension
      ;;
    3|firefox)
      build_firefox_extension
      ;;
    4|windows|win)
      build_desktop_target windows
      ;;
    5|mac|macos)
      build_desktop_target macos
      ;;
    6|linux)
      build_desktop_target linux
      ;;
    7|exit|quit)
      echo "Exiting without running a build."
      ;;
    *)
      echo "Unknown selection '$selection'. Running full build."
      run_all_targets
      ;;
  esac
}

main "$@"
