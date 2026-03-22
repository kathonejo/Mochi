import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  ensureRelayTables,
  respondToRelayJob,
} from "@/lib/site-mochi-openclaw-relay-store";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 10;

type RespondPayload = {
  relayToken?: unknown;
  jobId?: unknown;
  response?: unknown;
};

function sanitizeString(input: unknown, max = 2048): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RespondPayload;
    const relayToken = sanitizeString(body.relayToken);
    const jobId = sanitizeString(body.jobId, 64);
    const response = sanitizeString(body.response, 32_000);

    if (!relayToken) {
      return NextResponse.json({ error: "OPENCLAW_RELAY_TOKEN_REQUIRED" }, { status: 400 });
    }
    if (!jobId) {
      return NextResponse.json({ error: "OPENCLAW_RELAY_JOB_ID_REQUIRED" }, { status: 400 });
    }

    await ensureRelayTables();
    const relayTokenHash = hashToken(relayToken);
    const now = Date.now();

    const sessions = await prisma.$queryRawUnsafe<
      Array<{ relayTokenHash: string; expiresAt: Date }>
    >(
      `SELECT "relayTokenHash", "expiresAt" FROM "openclaw_relay_sessions" WHERE "relayTokenHash" = $1`,
      relayTokenHash,
    );
    if (!sessions.length) {
      return NextResponse.json({ error: "OPENCLAW_RELAY_SESSION_INVALID" }, { status: 401 });
    }
    if (new Date(sessions[0].expiresAt).getTime() <= now) {
      return NextResponse.json({ error: "OPENCLAW_RELAY_SESSION_EXPIRED" }, { status: 410 });
    }

    await respondToRelayJob({ relayTokenHash, jobId, response: response || "(no response)" });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "OPENCLAW_RELAY_RESPOND_FAILED" }, { status: 500 });
  }
}
