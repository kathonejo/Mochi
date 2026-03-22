import { NextRequest, NextResponse } from "next/server";
import { createOpenClawPairingCode } from "@/lib/site-mochi-openclaw-pairing-store";
import { sanitizeOpenClawAgentName } from "@/lib/site-mochi-openclaw-protocol";
import { verifyOpenClawServerGateway } from "@/lib/site-mochi-openclaw-server";

export const runtime = "nodejs";

type PairingCreatePayload = {
  gatewayUrl?: unknown;
  gatewayToken?: unknown;
  agentName?: unknown;
  ttlSeconds?: unknown;
  maxClaims?: unknown;
};

function sanitizeString(input: unknown, max = 1600): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function clampInt(input: unknown, fallback: number, min: number, max: number): number {
  const numeric =
    typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function parseGatewayUrl(input: string): URL | null {
  const withProtocol = /^[a-z]+:\/\//i.test(input) ? input : `ws://${input}`;
  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return true;
  if (
    host === "localhost" ||
    host === "host.docker.internal" ||
    host.endsWith(".local")
  ) {
    return true;
  }
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function safeTokenCompare(input: string, expected: string): boolean {
  const max = Math.max(input.length, expected.length);
  let diff = input.length ^ expected.length;
  for (let i = 0; i < max; i += 1) {
    const a = i < input.length ? input.charCodeAt(i) : 0;
    const b = i < expected.length ? expected.charCodeAt(i) : 0;
    diff |= a ^ b;
  }
  return diff === 0;
}

function isAuthorized(request: NextRequest): boolean {
  const expected = sanitizeString(process.env.OPENCLAW_PAIRING_ADMIN_TOKEN, 300);
  if (!expected) return false;

  const bearer = request.headers.get("authorization") || "";
  const bearerToken = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "";
  const headerToken = sanitizeString(request.headers.get("x-openclaw-pairing-token"), 300);
  const incoming = headerToken || bearerToken;
  if (!incoming) return false;
  return safeTokenCompare(incoming, expected);
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: "OPENCLAW_PAIRING_UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as PairingCreatePayload;
    const defaultGatewayUrl = sanitizeString(process.env.OPENCLAW_PAIRING_DEFAULT_GATEWAY_URL, 500);
    const defaultGatewayToken = sanitizeString(process.env.OPENCLAW_PAIRING_DEFAULT_GATEWAY_TOKEN, 2000);
    const defaultAgentName = sanitizeOpenClawAgentName(
      process.env.OPENCLAW_PAIRING_DEFAULT_AGENT_NAME,
      "web-mochi-1",
    );

    const gatewayUrl = sanitizeString(body.gatewayUrl, 500) || defaultGatewayUrl;
    const gatewayToken = sanitizeString(body.gatewayToken, 2000) || defaultGatewayToken;
    const agentName = sanitizeOpenClawAgentName(body.agentName, defaultAgentName);
    const ttlSeconds = clampInt(body.ttlSeconds, 10 * 60, 60, 24 * 60 * 60);
    const maxClaims = clampInt(body.maxClaims, 1, 1, 25);

    if (!gatewayUrl || !gatewayToken) {
      return NextResponse.json(
        {
          error: "OPENCLAW_PAIRING_GATEWAY_REQUIRED",
          message:
            "Missing gatewayUrl/gatewayToken in body and no OPENCLAW_PAIRING_DEFAULT_* env fallback was found.",
        },
        { status: 400 },
      );
    }
    const parsedGateway = parseGatewayUrl(gatewayUrl);
    if (!parsedGateway) {
      return NextResponse.json({ error: "OPENCLAW_INVALID_URL" }, { status: 400 });
    }
    if (isPrivateHost(parsedGateway.hostname)) {
      return NextResponse.json(
        {
          error: "OPENCLAW_PAIRING_PUBLIC_GATEWAY_REQUIRED",
          message:
            "Gateway URL is local/private. Expose your local OpenClaw via tunnel (for example Cloudflare Tunnel) and use the public URL.",
        },
        { status: 400 },
      );
    }
    await verifyOpenClawServerGateway({
      gatewayUrl,
      gatewayToken,
      timeoutMs: 15_000,
    });

    const created = await createOpenClawPairingCode({
      gatewayUrl,
      gatewayToken,
      agentName,
      ttlSeconds,
      maxClaims,
    });

    return NextResponse.json({
      pairingCode: created.code,
      expiresAt: created.expiresAt,
      agentName: created.agentName,
      maxClaims,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OPENCLAW_PAIRING_CREATE_FAILED";
    if (message.startsWith("OPENCLAW_INVALID_URL:")) {
      return NextResponse.json({ error: "OPENCLAW_INVALID_URL" }, { status: 400 });
    }
    if (message.startsWith("OPENCLAW_MISSING_TOKEN")) {
      return NextResponse.json({ error: "OPENCLAW_MISSING_TOKEN" }, { status: 400 });
    }
    if (message.startsWith("OPENCLAW_AUTH_FAILED:")) {
      return NextResponse.json({ error: "OPENCLAW_AUTH_FAILED" }, { status: 400 });
    }
    if (
      message.startsWith("OPENCLAW_CONNECT:") ||
      message.startsWith("OPENCLAW_TIMEOUT:") ||
      message.startsWith("OPENCLAW_IDLE_TIMEOUT:")
    ) {
      return NextResponse.json(
        { error: "OPENCLAW_CONNECT", errorDetail: message.slice(0, 240) },
        { status: 504 },
      );
    }
    return NextResponse.json({ error: "OPENCLAW_PAIRING_CREATE_FAILED" }, { status: 500 });
  }
}
