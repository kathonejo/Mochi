# OpenClaw -> Mochi Web Pairing

Goal: connect any OpenClaw agent to `https://www.mochi.dev/` using a one-time pairing code.

## User flow
1. Open `https://www.mochi.dev/`.
2. Settings -> Chat -> Provider -> OpenClaw.
3. Click `Copy agent instructions`.
4. Send the copied text to your agent.
5. Agent returns `pairingCode`.
6. Paste it and click `Pair`.

## Important
- Pairing uses relay mode: no public gateway URL or tunnel is required.
- The agent runs a local relay daemon that connects outward to the website.
- Gateway token must include `operator.write` scope.

## Security model
- `requestCode`: one-time + short-lived.
- `pairingCode`: one-time + short-lived.
- Browser stores only a temporary session token.
- Website uses only a remote relay session for chat.
