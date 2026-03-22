# Task: Generate OpenClaw pairing code for web user (relay mode)

Return ONLY the pairing code (example: `Q7M4K9P2`).
Do not ask questions. Do not add explanations.

## How it works
Your local OpenClaw gateway connects **outward** to the relay server — no public URL needed.
No tunnel required. The script reads your local config automatically.

## Input from user
- `REQUEST_CODE` (one-time code shown in web config, e.g. `AB3X7K2M`)
- Optional `OPENCLAW_AGENT_NAME` (default: `main`)

## What the script does
1. Reads token from `OPENCLAW_GATEWAY_TOKEN` env or `~/.openclaw/openclaw.json`
2. Registers with the relay server using the request code → gets a pairing code + relay token
3. Prints the pairing code to stdout
4. Starts a background daemon that long-polls the relay server for chat jobs and forwards them to your local gateway

## Requirements
- Node.js 21+ (uses built-in `WebSocket` global)
- Local OpenClaw gateway running (`gateway.url` from config is used; defaults to `ws://127.0.0.1:18789`)
- Gateway token with `operator.write` scope (required for `chat.send`)

## Script (copy from the web UI "Copy agent instructions" button)
The web UI generates a personalized script with the request code and relay URLs embedded.
Use the **Copy agent instructions** button in the OpenClaw section of the settings panel.

## Security
- `requestCode` is one-time, short-lived (15 min).
- `pairingCode` is one-time, short-lived (10 min).
- `relayToken` authenticates the daemon to the relay server; never printed to stdout.
- Gateway token never leaves your machine.
