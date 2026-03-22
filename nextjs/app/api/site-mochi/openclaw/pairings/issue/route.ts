import { NextRequest, NextResponse } from "next/server";
import { createOpenClawPairingCodeFromRequest } from "@/lib/site-mochi-openclaw-pairing-store";
import { sanitizeOpenClawAgentName } from "@/lib/site-mochi-openclaw-protocol";
import { verifyOpenClawServerGateway } from "@/lib/site-mochi-openclaw-server";

export const runtime = "nodejs";

type IssuePayload = {
  requestCode?: unknown;
  gatewayUrl?: unknown;
  gatewayToken?: unknown;
  agentName?: unknown;
};

function sanitizeString(input: unknown, max = 1600): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as IssuePayload;
    const requestCode = sanitizeString(body.requestCode, 32);
    const gatewayUrl = sanitizeString(body.gatewayUrl, 500);
    const gatewayToken = sanitizeString(body.gatewayToken, 2000);
    const agentName = sanitizeOpenClawAgentName(body.agentName, "web-mochi-1");

    if (!requestCode) {
      return NextResponse.json({ error: "OPENCLAW_PAIRING_REQUEST_REQUIRED" }, { status: 400 });
    }
    if (!gatewayUrl || !gatewayToken) {
      return NextResponse.json({ error: "OPENCLAW_PAIRING_GATEWAY_REQUIRED" }, { status: 400 });
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

    const created = await createOpenClawPairingCodeFromRequest({
      requestCode,
      gatewayUrl,
      gatewayToken,
      agentName,
      ttlSeconds: 5 * 60,
      maxClaims: 1,
    });

    if (!created.ok) {
      if (created.reason === "expired_request_code") {
        return NextResponse.json({ error: "OPENCLAW_PAIRING_REQUEST_EXPIRED" }, { status: 410 });
      }
      return NextResponse.json({ error: "OPENCLAW_PAIRING_REQUEST_INVALID" }, { status: 404 });
    }

    return NextResponse.json({
      pairingCode: created.code,
      expiresAt: created.expiresAt,
      agentName: created.agentName,
      maxClaims: 1,
      ttlSeconds: 5 * 60,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OPENCLAW_PAIRING_ISSUE_FAILED";
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
    return NextResponse.json({ error: "OPENCLAW_PAIRING_ISSUE_FAILED" }, { status: 500 });
  }
}
