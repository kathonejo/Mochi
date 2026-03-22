# Runtime Core

This directory is the canonical shared source for desktop + browser runtimes.

## Canonical folders

- `characters/`: sprite sets used by desktop, Chrome, and Firefox.
- `personalities/`: Markdown personality prompts and generated `index.json`.
- `assets/`: shared runtime audio assets.
- `mochi-shared.js`: shared runtime logic (constants, pure functions, animation data).
  Exposed as `window.MochiShared` / `globalThis.MochiShared`.
  Loaded before the main script in each target (see overlay.html and manifests).

## Sync workflow

After editing anything here, run:

```bash
npm run sync-runtime-core
```

That command regenerates mirrors in:

- `desktop/renderer/{characters,personalities,assets}`
- `chrome-extension/{characters,personalities,assets}`
- `firefox-extension/{characters,personalities,assets}`

The root `./build.sh` and release scripts run this sync automatically.
