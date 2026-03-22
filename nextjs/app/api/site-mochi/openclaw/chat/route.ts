import { NextRequest, NextResponse } from "next/server";
import {
  resolveOpenClawPairingSession,
} from "@/lib/site-mochi-openclaw-pairing-store";
import {
  resolveOpenClawRelayWebSession,
  createRelayJob,
  pollRelayJobResponse,
} from "@/lib/site-mochi-openclaw-relay-store";
import {
  coerceOpenClawChatMessages,
  type OpenClawChatRequestMessage,
} from "@/lib/site-mochi-openclaw-protocol";
import { sendOpenClawServerChat } from "@/lib/site-mochi-openclaw-server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatPayload = {
  sessionToken?: unknown;
  messages?: unknown;
};

function extractRelayAgentError(reply: string): string | null {
  const trimmed = String(reply || "").trim();
  if (!trimmed) return "EMPTY_RESPONSE";

  if (trimmed.startsWith("__OPENCLAW_ERROR__:")) {
    const detail = trimmed.slice("__OPENCLAW_ERROR__:".length).trim();
    return detail || "RELAY_AGENT_ERROR";
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

function sanitizeSessionToken(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, 2048);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as ChatPayload;
    const sessionToken = sanitizeSessionToken(body.sessionToken);
    if (!sessionToken) {
      return NextResponse.json({ error: "OPENCLAW_PAIRING_REQUIRED" }, { status: 400 });
    }

    const messages = coerceOpenClawChatMessages(body.messages);
    if (!messages.length) {
      return NextResponse.json({ error: "OPENCLAW_EMPTY_MESSAGE" }, { status: 400 });
    }

    const hasUserMessage = messages.some((entry: OpenClawChatRequestMessage) => entry.role === "user");
    if (!hasUserMessage) {
      return NextResponse.json({ error: "OPENCLAW_EMPTY_MESSAGE" }, { status: 400 });
    }

    const session = await withTimeout(
      resolveOpenClawPairingSession(sessionToken),
      3_500,
      "OPENCLAW_SESSION_TIMEOUT",
    );

    if (session.ok) {
      const reply = await withTimeout(
        sendOpenClawServerChat({
          messages,
          gatewayUrl: session.gatewayUrl,
          gatewayToken: session.gatewayToken,
          agentName: session.agentName,
          timeoutMs: 28_000,
        }),
        34_000,
        "OPENCLAW_ROUTE_TIMEOUT",
      );

      return NextResponse.json(
        {
          reply,
          agentName: session.agentName,
          sessionExpiresAt: session.sessionExpiresAt,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (session.reason === "expired_session") {
      return NextResponse.json({ error: "OPENCLAW_PAIRING_EXPIRED" }, { status: 410 });
    }

    // Direct session not found — try relay session
    const relaySession = await withTimeout(
      resolveOpenClawRelayWebSession(sessionToken),
      3_500,
      "OPENCLAW_SESSION_TIMEOUT",
    );
    if (!relaySession.ok) {
      if (relaySession.reason === "expired_session") {
        return NextResponse.json({ error: "OPENCLAW_PAIRING_EXPIRED" }, { status: 410 });
      }
      return NextResponse.json({ error: "OPENCLAW_PAIRING_INVALID" }, { status: 401 });
    }

    const { jobId } = await createRelayJob({
      relayTokenHash: relaySession.relayTokenHash,
      messages,
      agentName: relaySession.agentName,
    });

    const relayReply = await withTimeout(
      pollRelayJobResponse({ jobId, pollMs: 28_000 }),
      34_000,
      "OPENCLAW_RELAY_TIMEOUT",
    );
    if (!relayReply) {
      return NextResponse.json({ error: "OPENCLAW_RELAY_TIMEOUT" }, { status: 504 });
    }
    const relayAgentError = extractRelayAgentError(relayReply);
    if (relayAgentError) {
      return NextResponse.json(
        {
          error: "OPENCLAW_ERROR",
          errorDetail: `RELAY_AGENT:${relayAgentError}`.slice(0, 240),
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        reply: relayReply,
        agentName: relaySession.agentName,
        sessionExpiresAt: relaySession.sessionExpiresAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "OPENCLAW_RELAY_FAILED";

    if (message.startsWith("OPENCLAW_INVALID_URL:")) {
      return NextResponse.json({ error: "OPENCLAW_INVALID_URL" }, { status: 400 });
    }
    if (message.startsWith("OPENCLAW_MISSING_TOKEN")) {
      return NextResponse.json({ error: "OPENCLAW_MISSING_TOKEN" }, { status: 400 });
    }
    if (message.startsWith("OPENCLAW_WEBSOCKET_UNAVAILABLE")) {
      return NextResponse.json({ error: "OPENCLAW_WEBSOCKET_UNAVAILABLE" }, { status: 500 });
    }
    if (message.startsWith("OPENCLAW_EMPTY_MESSAGE")) {
      return NextResponse.json({ error: "OPENCLAW_EMPTY_MESSAGE" }, { status: 400 });
    }
    if (message.startsWith("OPENCLAW_AUTH_FAILED:")) {
      return NextResponse.json({ error: "OPENCLAW_AUTH_FAILED" }, { status: 502 });
    }
    if (
      message.startsWith("OPENCLAW_CONNECT:") ||
      message.startsWith("OPENCLAW_TIMEOUT:") ||
      message.startsWith("OPENCLAW_IDLE_TIMEOUT:") ||
      message.startsWith("OPENCLAW_ROUTE_TIMEOUT") ||
      message.startsWith("OPENCLAW_SESSION_TIMEOUT")
    ) {
      return NextResponse.json(
        { error: "OPENCLAW_CONNECT", errorDetail: message.slice(0, 240) },
        { status: 504 },
      );
    }
    if (message.startsWith("OPENCLAW_RELAY_TIMEOUT")) {
      return NextResponse.json({ error: "OPENCLAW_RELAY_TIMEOUT" }, { status: 504 });
    }
    if (message.startsWith("OPENCLAW_ERROR:")) {
      return NextResponse.json(
        {
          error: "OPENCLAW_ERROR",
          errorDetail: message.slice("OPENCLAW_ERROR:".length).slice(0, 220),
        },
        { status: 502 },
      );
    }
    if (message.startsWith("OPENCLAW_CLOSED:")) {
      return NextResponse.json({ error: "OPENCLAW_CLOSED" }, { status: 502 });
    }
    if (message.startsWith("OPENCLAW_INCOMPLETE_CLOSE:")) {
      return NextResponse.json({ error: "OPENCLAW_INCOMPLETE_CLOSE" }, { status: 502 });
    }
    if (message.startsWith("OPENCLAW_EMPTY_RESPONSE")) {
      return NextResponse.json({ error: "OPENCLAW_EMPTY_RESPONSE" }, { status: 502 });
    }

    return NextResponse.json(
      { error: "OPENCLAW_RELAY_FAILED", errorDetail: message.slice(0, 240) },
      { status: 500 },
    );
  }
}
