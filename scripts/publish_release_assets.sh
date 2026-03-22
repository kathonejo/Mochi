#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${GITHUB_REPOSITORY:-shimeji-ai/Mochi}"
TAG="${1:-desktop-assets-$(date +%Y%m%d-%H%M%S)}"
TITLE="${2:-Desktop assets ${TAG}}"

DESKTOP_DIST_DIR="${ROOT_DIR}/desktop/dist"
EXT_SOURCE_DIR="${ROOT_DIR}/chrome-extension"
FF_EXT_SOURCE_DIR="${ROOT_DIR}/firefox-extension"
TEMP_DIR="$(mktemp -d)"
WIN_CANONICAL="${TEMP_DIR}/mochi-desktop-windows.exe"
LINUX_CANONICAL="${TEMP_DIR}/mochi-desktop-linux.AppImage"
MAC_CANONICAL="${TEMP_DIR}/mochi-desktop-macos.zip"
EXT_ZIP="${TEMP_DIR}/mochi-chrome-extension.zip"
FF_EXT_ZIP="${TEMP_DIR}/mochi-firefox-extension.zip"
EXT_CANONICAL="${TEMP_DIR}/mochi-chrome-extension.zip"
FF_EXT_CANONICAL="${TEMP_DIR}/mochi-firefox-extension.zip"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

find_first_match() {
  local pattern="$1"
  find "$DESKTOP_DIST_DIR" -maxdepth 1 -type f -iname "$pattern" | sort | head -n 1
}

WIN_ASSET="$(find_first_match 'Mochi-Desktop-Portable-*.exe')"
WIN_UNPACKED_DIR="${DESKTOP_DIST_DIR}/win-unpacked"
LINUX_ASSET="$(find_first_match 'Mochi-Desktop-*.AppImage')"
MAC_ASSET="$(find_first_match 'Mochi-Desktop-*-universal.zip')"

if [[ -z "$MAC_ASSET" ]]; then
  MAC_ASSET="$(find_first_match 'Mochi-Desktop-*-arm64.zip')"
fi

if [[ -z "$MAC_ASSET" ]]; then
  MAC_ASSET="$(find_first_match 'Mochi-Desktop-*-x64.zip')"
fi

for required_name in LINUX_ASSET; do
  if [[ -z "${!required_name}" ]] || [[ ! -f "${!required_name}" ]]; then
    echo "Missing required asset in ${DESKTOP_DIST_DIR}: ${required_name}" >&2
    exit 1
  fi
done

if [[ ! -f "$WIN_ASSET" ]]; then
  echo "Missing required Windows asset in ${DESKTOP_DIST_DIR}: portable exe" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it and run 'gh auth login' first." >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "'zip' is required to package the Chrome extension." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

if [[ ! -d "$EXT_SOURCE_DIR" ]]; then
  echo "Missing extension directory: $EXT_SOURCE_DIR" >&2
  exit 1
fi

if [[ ! -d "$FF_EXT_SOURCE_DIR" ]]; then
  echo "Missing extension directory: $FF_EXT_SOURCE_DIR" >&2
  exit 1
fi

# Always sync runtime-core before packaging extension zips for release.
node "$ROOT_DIR/scripts/sync-runtime-core.js" >/dev/null

# Always regenerate extension zips from the current extension folders.
rm -f "$EXT_ZIP"
(
  cd "$EXT_SOURCE_DIR"
  zip -rq "$EXT_ZIP" . -x ".git/*" "node_modules/*"
)

rm -f "$FF_EXT_ZIP"
(
  cd "$FF_EXT_SOURCE_DIR"
  zip -rq "$FF_EXT_ZIP" . -x ".git/*" "node_modules/*"
)

cp -f "$WIN_ASSET" "$WIN_CANONICAL"

cp -f "$LINUX_ASSET" "$LINUX_CANONICAL"
if [[ -n "$MAC_ASSET" ]]; then
  cp -f "$MAC_ASSET" "$MAC_CANONICAL"
fi
if [[ "$EXT_ZIP" != "$EXT_CANONICAL" ]]; then
  cp -f "$EXT_ZIP" "$EXT_CANONICAL"
fi

if [[ "$FF_EXT_ZIP" != "$FF_EXT_CANONICAL" ]]; then
  cp -f "$FF_EXT_ZIP" "$FF_EXT_CANONICAL"
fi

if ! gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  gh release create "$TAG" -R "$REPO" --title "$TITLE" --notes "Automated desktop asset upload."
fi

UPLOAD_ARGS=(
  "$TAG"
  "$WIN_CANONICAL"
  "$LINUX_CANONICAL"
  "$EXT_CANONICAL"
  "$FF_EXT_CANONICAL"
  --clobber
  -R "$REPO"
)

if [[ -n "$MAC_ASSET" ]]; then
  UPLOAD_ARGS+=("$MAC_CANONICAL")
fi

gh release upload "${UPLOAD_ARGS[@]}"

echo "Uploaded assets to release ${TAG}"
echo "Windows: https://github.com/${REPO}/releases/download/${TAG}/mochi-desktop-windows.exe"
echo "Linux:   https://github.com/${REPO}/releases/download/${TAG}/mochi-desktop-linux.AppImage"
if [[ -n "$MAC_ASSET" ]]; then
  echo "macOS:   https://github.com/${REPO}/releases/download/${TAG}/mochi-desktop-macos.zip"
fi
echo "Chrome:  https://github.com/${REPO}/releases/download/${TAG}/mochi-chrome-extension.zip"
echo "Firefox: https://github.com/${REPO}/releases/download/${TAG}/mochi-firefox-extension.zip"
