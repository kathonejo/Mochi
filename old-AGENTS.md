# AGENTS

## Repo Map

| Directory | Description |
|---|---|
| `chrome-extension/` | Browser runtime |
| `firefox-extension/` | Firefox browser runtime |
| `desktop/` | Electron runtime |
| `runtime-core/` | Canonical shared runtime content (characters, personalities, shared assets) |
| `nextjs/` | Avalanche app frontend |
| `foundry/` | Avalanche contracts |
| `animation-reference/` | Sprite reference for supported animation sets |
| `legacy/` | Local-only archive, ignored by git |

For work inside `nextjs/` or `foundry/`, read local instructions first when present.

## Runtime Core

- The canonical shared runtime source now lives under `runtime-core/`:
  - `runtime-core/characters/`
  - `runtime-core/personalities/`
  - `runtime-core/assets/`
- Do not hand-edit `desktop/renderer/{characters,personalities,assets}` or extension copies unless you are debugging; they are generated mirrors.
- Sync core into all runtimes with `npm run sync-runtime-core` (legacy alias: `npm run sync-personalities`).
- Use `./build.sh` from the repo root to sync and build artifacts: `./build.sh chrome` (Chrome zip), `./build.sh firefox` (Firefox zip), `./build.sh windows|macos|linux` (desktop), or `./build.sh all` (everything).
  The script syncs runtime-core first before building the requested artifacts.

## Avalanche Notes

- `./launch.sh` is the canonical interactive entrypoint for chain + deploy + frontend.
- Core scripts: `scripts/chain.sh`, `scripts/deploy.sh`, `scripts/start.sh`, `scripts/vercel-env-sync.sh`.
- Contracts live under `foundry/` and the frontend under `nextjs/`.
- When changing deploy flow, keep docs aligned: `README.md`, `foundry/README.md`, `nextjs/README.md`.

## Token-Efficient Workflow

1. Use targeted search first.
2. Read only files directly relevant to the task.
3. Avoid broad scans of `node_modules`, build outputs, cached artifacts.
4. Prefer minimal diffs.
5. Validate only the changed scope unless full-repo checks are requested.

## Release-First Push Policy

When pushing changes that include desktop/extension deliverables (`desktop/**`, `chrome-extension/**`):

1. Make sure runtime-core is synced to every runtime (run `npm run sync-runtime-core` or use `./build.sh ...`) before packaging so desktop and browser artifacts share the same characters/personalities/assets.
2. Publish release assets first: `./scripts/publish_release_assets.sh`
2. Required assets: `mochi-desktop-windows-portable.exe`, `mochi-desktop-linux.AppImage`, `mochi-chrome-extension.zip`
3. Never commit desktop binaries to git.
4. If release upload fails, stop and report instead of pushing.

## Guardrails

- Never use destructive git commands unless explicitly requested.
- Preserve unrelated user changes in dirty worktrees.
- Keep docs accurate to the current folder being edited.
- If an AI-driven change modifies project structure, workflow boundaries, or the intended direction of a folder/app, update the relevant `AGENTS.md` (root and/or local) in the same task so it reflects the new structure and project orientation.
