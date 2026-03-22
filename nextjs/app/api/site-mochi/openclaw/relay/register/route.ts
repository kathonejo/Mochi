import { NextRequest, NextResponse } from "next/server";
import { registerRelaySession } from "@/lib/site-mochi-openclaw-relay-store";

export const runtime = "nodejs";
export const maxDuration = 30;

type RegisterPayload = {
  requestCode?: unknown;
  agentName?: unknown;
};

function sanitizeString(input: unknown, max = 64): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RegisterPayload;
    const requestCode = sanitizeString(body.requestCode, 32);
    if (!requestCode) {
      return NextResponse.json({ error: "OPENCLAW_RELAY_REQUEST_CODE_REQUIRED" }, { status: 400 });
    }

    const agentName = sanitizeString(body.agentName, 64) || "main";

    const result = await registerRelaySession({ requestCode, agentName });
    if (!result.ok) {
      if (result.reason === "expired_request_code") {
        return NextResponse.json({ error: "OPENCLAW_PAIRING_REQUEST_EXPIRED" }, { status: 410 });
      }
      return NextResponse.json({ error: "OPENCLAW_PAIRING_REQUEST_INVALID" }, { status: 404 });
    }

    return NextResponse.json({
      pairingCode: result.pairingCode,
      relayToken: result.relayToken,
    });
  } catch {
    return NextResponse.json({ error: "OPENCLAW_RELAY_REGISTER_FAILED" }, { status: 500 });
  }
}
