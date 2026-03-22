# Plan: Browser-Based Web Agent Mode

## Context

Mochi already has a pluggable multi-provider architecture (OpenRouter, Ollama, OpenClaw, Bitte AI) and a full pairing/relay system for external agents. The user wants to add a **self-contained browser agent mode** — no external gateway needed, just an API key or local Ollama — that can run autonomous task loops, call APIs, and schedule recurring jobs, all powered by the user's own browser tab.

This is the natural next step: instead of pairing with an *external* agent (OpenClaw), the browser itself *becomes* the agent runtime.

---

## Feasibility Summary

**Short answer: Medium complexity. A lot of the pieces already exist.**

| Piece | Status |
|---|---|
| OpenRouter + Ollama as LLM backends | ✅ Already done |
| Provider selection UI in settings | ✅ Already done |
| Browser fetch-based API calls | ✅ Trivial |
| Agent loop (plan → act → observe) | 🔨 New |
| Tool registry (fetch URL, call API, etc.) | 🔨 New |
| Cron-style scheduler | 🔨 New |
| Persistent task storage | 🔨 New (IndexedDB or DB) |
| Agent mode UI in settings | 🔨 New tab/section |

---

## Key Architecture Decisions

### 1. LLM Backend
Reuse existing `site-mochi-browser-providers.ts` infrastructure. The agent calls OpenRouter or Ollama the same way chat already does — just with a tool-use system prompt and structured output instead of conversational responses.

### 2. Agent Loop (in-browser)
A `WebWorker` runs the agent loop off the main thread:
```
Receive goal → LLM plans next action → Execute tool → Feed result back → Repeat until done
```
Tools available to the agent:
- `fetch_url` — GET/POST any URL (CORS-permitting)
- `call_api` — Structured API call with headers/body
- `search_web` — Via a search API (SerpAPI, Brave, etc., user-provided key)
- `wait` — Pause N seconds
- `log` — Emit output to the Mochi chat/log panel

### 3. Cron Scheduler
Two tiers:
- **While-tab-open**: `setInterval`-based scheduler in the WebWorker, cron expressions parsed with a small lib (e.g. `cronstrue` + `cron-parser`, both tiny)
- **Persistent (across sessions)**: Tasks stored in IndexedDB locally. When the tab opens, it checks for pending/overdue tasks and runs them. For users who want server-backed persistence, tasks can optionally sync to the existing Postgres DB (new table, reuses the existing SIWE auth pattern)

### 4. Resource Usage
Everything runs in the user's browser tab:
- CPU: JS execution in WebWorker (off main thread, no UI jank)
- Network: User's connection for LLM API calls and tool fetches
- Memory: Browser tab memory (~50-200MB typical for an agent loop)
- No server compute consumed

**Limitation to communicate clearly in the UI**: Cron jobs only run while the tab is open, unless the server-persistence tier is used.

### 5. New Provider Mode
Add `"browser-agent"` as a provider type in `site-mochi-browser-providers.ts`, alongside `openrouter`, `ollama`, `openclaw`, `bitte`. When selected, instead of a simple chat completion, it launches the agent loop with tool calling.

---

## Components to Build

### A. `lib/browser-agent-runner.ts`
- `AgentRunner` class with `start(goal, tools, llmProvider)`, `stop()`, `on('log', cb)`
- Agent loop: send goal + conversation history + tool definitions → parse LLM response → dispatch tool → append result → repeat
- Supports OpenRouter tool-use format (already standard) and Ollama function-calling models
- Runs inside a SharedWorker for tab persistence

### B. `lib/browser-agent-tools.ts`
- Tool registry: `fetchUrl`, `callApi`, `searchWeb`, `wait`, `emitLog`
- Each tool: `{ name, description, parameters (JSON Schema), execute(args) → string }`
- User can enable/disable tools in settings
- CORS note surfaced in UI for `fetchUrl`

### C. `lib/browser-agent-scheduler.ts`
- Parses cron expressions (`cron-parser` package, ~15KB)
- Stores jobs in IndexedDB: `{ id, cronExpr, goal, tools, lastRun, nextRun, enabled }`
- On tab load: checks overdue jobs and triggers them
- Fires scheduled jobs via `setInterval` polling (every 60s)

### D. `components/agent-mode-panel.tsx` (new settings tab)
- New tab in `site-mochi-config-panel.tsx` (the existing 1935-line settings panel)
- Sections:
  1. **LLM for agent**: select OpenRouter model or Ollama (reuse existing key inputs)
  2. **Tools**: toggle each available tool on/off, add API key for search
  3. **Scheduled tasks**: list of cron jobs with `+ Add job` (goal text + cron expression)
  4. **Run now**: one-shot agent task with goal input + live log output
  5. **Status**: show running/idle, last run time, error count

### E. Prisma schema addition (optional tier)
```prisma
model BrowserAgentJob {
  id          String   @id @default(cuid())
  walletKey   String?  // null = anonymous/local-only
  cronExpr    String
  goal        String
  tools       String[] // enabled tool names
  lastRunAt   DateTime?
  nextRunAt   DateTime?
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
}
```
Sync endpoint: `POST /api/agent/jobs` — requires SIWE session (existing auth pattern).

---

## Files to Modify / Create

| File | Action |
|---|---|
| `nextjs/lib/browser-agent-runner.ts` | Create |
| `nextjs/lib/browser-agent-tools.ts` | Create |
| `nextjs/lib/browser-agent-scheduler.ts` | Create |
| `nextjs/components/agent-mode-panel.tsx` | Create |
| `nextjs/lib/site-mochi-browser-providers.ts` | Add `browser-agent` provider type |
| `nextjs/components/site-mochi-config-panel.tsx` | Add Agent tab, import panel |
| `nextjs/prisma/schema.prisma` | Add `BrowserAgentJob` (optional) |
| `nextjs/app/api/agent/jobs/route.ts` | Create (optional, server persistence) |

---

## Complexity & Effort Estimate

- **Core agent loop + tools**: ~1-2 days of focused work
- **Scheduler + IndexedDB persistence**: ~1 day
- **Settings UI panel**: ~1 day
- **Server persistence tier**: ~half day (optional)
- **Testing + polish**: ~1 day

**Total: ~4-5 days for the full feature, ~2-3 days for a working MVP (run now + local cron)**

---

## Verification

1. Set provider to `browser-agent`, enter OpenRouter key, give a goal like "fetch https://api.github.com/repos/torvalds/linux and summarize the repo stats" — agent should call `fetchUrl`, get JSON, summarize
2. Create a cron job `*/5 * * * *` with goal "check if mochi.lol is up" — should fire every 5 min while tab is open, log results
3. Reload tab — verify IndexedDB-persisted jobs reappear and overdue ones trigger
4. Switch LLM to Ollama with a function-calling model — verify tool calls still work
5. Disable a tool in settings — verify agent errors gracefully when it tries to use it
