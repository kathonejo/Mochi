# Mochi Desktop
The Electron runtime for Mochi. It powers the native window, settings UI, chat overlay, and local providers (OpenRouter/Ollama/OpenClaw).

## Build
1. `cd desktop`
2. `npm install`
3. `bash scripts/build.sh` to open the platform menu (defaults to building all targets in parallel). The script writes `dist/build.log` plus a dedicated `dist/build-<target>.log` for Windows/macOS/Linux.
4. If you only need one platform, choose the corresponding option (`Windows`, `macOS`, `Linux`) when the menu appears.
5. Manual alternatives are still available (`npx electron-builder --win`, `--mac`, or `--linux`) if a scripted build is preferred.

### Linux/WSL prerequisites
- `wine64`/`wine32` (and their 32-bit libc dependencies) so `rcedit.exe` can run when building Windows binaries. Example for Ubuntu/WSL:
  ```sh
  sudo dpkg --add-architecture i386
  sudo apt update
  sudo apt install wine64 wine32 p7zip-full libwine libwine:i386 winbind
  ```
- `curl` or `wget` (needed when the dmg-license fallback downloads pre-built assets).
- `npm` (already required) so the build script can install `dmg-license` and its dependencies before running `electron-builder`.
These packages make the Windows and macOS pipelines work reliably on Linux hosts. Without them the console/logs will show missing executables (`rcedit`, `wine`, `crc`, etc.).

When the run finishes, confirm the artifacts and log files under `desktop/dist/` before continuing.

Set `MOCHI_BUILD_TARGET` (`all`, `windows`, `macos`, or `linux`) or pass the desired key (`./scripts/build.sh linux`) to run a specific workflow without the prompt.

## Release
Use `./scripts/publish_release_assets.sh` from the repository root to upload the Windows portable exe, Linux AppImage, and extension zips to GitHub Releases. Make sure `gh` is authenticated first.

## Testing
- Run `npm start` locally to preview the app in development mode.
- Copy the portable exe to a Windows machine (or run via Wine) to confirm the mascots appear, settings open, and chat works.

## Notes
- Canonical shared assets now live in `../runtime-core/`; run `npm run sync-runtime-core` (or use `./build.sh ...`) to refresh `renderer/{characters,personalities,assets}` before building.
- Desktop binaries should never be committed to git; the release script handles uploads.
- Use the new **Start Mochi on system login** toggle in settings to keep the desktop client running automatically across Windows, macOS, and Linux logins.
