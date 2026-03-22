import { NextRequest, NextResponse } from "next/server";
import { claimOpenClawPairingCode } from "@/lib/site-mochi-openclaw-pairing-store";
import {
  claimRelayCode,
  createRelayJob,
  pollRelayJobResponse,
} from "@/lib/site-mochi-openclaw-relay-store";

export const runtime = "nodejs";

type PairingClaimPayload = {
  code?: unknown;
  sessionTtlSeconds?: unknown;
};

function sanitizeCode(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function clampInt(input: unknown, fallback: number, min: number, max: number): number {
  const numeric =
    typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorCode)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function extractRelayProbeError(reply: string): string | null {
  const trimmed = String(reply || "").trim();
  if (!trimmed) return "EMPTY_RESPONSE";
  if (trimmed.startsWith("__OPENCLAW_ERROR__:")) {
    return trimmed.slice("__OPENCLAW_ERROR__:".length).trim() || "RELAY_AGENT_ERROR";
  }
  const lowered = trimmed.toLowerCase();
  if (
    lowered === "(request failed)" ||
    lowered === "(auth failed)" ||
    lowered === "(ws error)" ||
    lowered === "(ws closed)" ||
    lowered === "(agent error)" ||
    lowered === "(no response)"
  ) {
    return trimmed;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as PairingClaimPayload;
    const code = sanitizeCode(body.code);
    if (!code) {
      return NextResponse.json({ error: "OPENCLAW_PAIRING_INVALID_CODE" }, { status: 400 });
    }

    const sessionTtlSeconds = clampInt(
      body.sessionTtlSeconds,
      7 * 24 * 60 * 60,
      300,
      60 * 24 * 60 * 60,
    );

    const result = await claimOpenClawPairingCode({ code, sessionTtlSeconds });
    if (!result.ok) {
      if (result.reason === "expired_code") {
        return NextResponse.json({ error: "OPENCLAW_PAIRING_CODE_EXPIRED" }, { status: 410 });
      }
      if (result.reason === "max_claims_reached") {
        return NextResponse.json({ error: "OPENCLAW_PAIRING_CODE_USED" }, { status: 409 });
      }

      // Not found in direct pairing codes — try relay codes
      const relayResult = await claimRelayCode({ code, sessionTtlSeconds });
      if (relayResult.ok) {
        const probeJob = await createRelayJob({
          relayTokenHash: relayResult.relayTokenHash,
          agentName: relayResult.agentName,
          messages: [{ role: "user", content: "[pairing healthcheck]" }],
        });

        const probeReply = await withTimeout(
          pollRelayJobResponse({ jobId: probeJob.jobId, pollMs: 12_000 }),
          14_000,
          "OPENCLAW_RELAY_HEALTH_TIMEOUT",
        );
        if (!probeReply) {
          return NextResponse.json({ error: "OPENCLAW_RELAY_UNAVAILABLE" }, { status: 504 });
        }
        const probeError = extractRelayProbeError(probeReply);
        if (probeError) {
          const normalized = probeError.toLowerCase();
          if (normalized.includes("missing scope") && normalized.includes("operator.write")) {
            return NextResponse.json(
              { error: "OPENCLAW_RELAY_SCOPE_REQUIRED" },
              { status: 400 },
            );
          }
          return NextResponse.json(
            { error: "OPENCLAW_RELAY_UNAVAILABLE" },
            { status: 502 },
          );
        }

        return NextResponse.json({
          sessionToken: relayResult.sessionToken,
          sessionExpiresAt: relayResult.sessionExpiresAt,
          agentName: relayResult.agentName,
        });
      }
      if (relayResult.reason === "expired_code") {
        return NextResponse.json({ error: "OPENCLAW_PAIRING_CODE_EXPIRED" }, { status: 410 });
      }
      if (relayResult.reason === "max_claims_reached") {
        return NextResponse.json({ error: "OPENCLAW_PAIRING_CODE_USED" }, { status: 409 });
      }
      return NextResponse.json({ error: "OPENCLAW_PAIRING_INVALID_CODE" }, { status: 404 });
    }

    return NextResponse.json({
      sessionToken: result.sessionToken,
      sessionExpiresAt: result.sessionExpiresAt,
      agentName: result.agentName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OPENCLAW_PAIRING_CLAIM_FAILED";
    if (message.startsWith("OPENCLAW_RELAY_HEALTH_TIMEOUT")) {
      return NextResponse.json({ error: "OPENCLAW_RELAY_UNAVAILABLE" }, { status: 504 });
    }
    return NextResponse.json({ error: "OPENCLAW_PAIRING_CLAIM_FAILED" }, { status: 500 });
  }
}
