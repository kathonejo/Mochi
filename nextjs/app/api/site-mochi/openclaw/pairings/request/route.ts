import { NextRequest, NextResponse } from "next/server";
import { createOpenClawPairingRequest } from "@/lib/site-mochi-openclaw-pairing-store";

export const runtime = "nodejs";

type RequestPayload = {
  ttlSeconds?: unknown;
};

function clampInt(input: unknown, fallback: number, min: number, max: number): number {
  const numeric =
    typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestPayload;
    const ttlSeconds = clampInt(body.ttlSeconds, 15 * 60, 60, 30 * 60);
    const created = await createOpenClawPairingRequest({ ttlSeconds });

    return NextResponse.json({
      requestCode: created.requestCode,
      expiresAt: created.expiresAt,
      ttlSeconds: created.ttlSeconds,
      maxClaims: 1,
    });
  } catch {
    return NextResponse.json({ error: "OPENCLAW_PAIRING_REQUEST_CREATE_FAILED" }, { status: 500 });
  }
}
