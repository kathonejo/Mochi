import { NextRequest, NextResponse } from "next/server";
import {
  buildSiteMochiChatMessages,
  coerceSiteMochiHistory,
  sanitizeSiteMochiMessage,
} from "@/lib/site-mochi-chat";
import { getRuntimeCoreSiteMochiCatalog } from "@/lib/site-mochi-runtime-core";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const encoder = new TextEncoder();

type SupportedServerProvider = "site" | "openrouter";

function sanitizeShortKey(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}

function sanitizeModel(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_MODEL;
  const cleaned = input.trim().slice(0, 120);
  if (!cleaned || cleaned === "random") return DEFAULT_MODEL;
  return cleaned || DEFAULT_MODEL;
}

function parseServerProvider(input: unknown): SupportedServerProvider {
  return input === "openrouter" ? "openrouter" : "site";
}

async function resolvePromptContext(characterKey: string) {
  try {
    const catalog = await getRuntimeCoreSiteMochiCatalog();
    const characterLabel = catalog.characters.find((entry) => entry.key === characterKey)?.label;
    return {
      characterLabel,
    };
  } catch {
    return {
      characterLabel: undefined,
    };
  }
}

function serializeSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function enqueueSseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown,
) {
  controller.enqueue(encoder.encode(serializeSseEvent(event, data)));
}

function extractOpenRouterChunkText(payload: any): string {
  const text = payload?.choices?.[0]?.delta?.content;
  return typeof text === "string" ? text : "";
}

async function readOpenRouterStream(args: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  request: NextRequest;
  onDelta: (delta: string) => void;
}) {
  const referer =
    process.env.NEXT_PUBLIC_BASE_URL ||
    args.request.headers.get("origin") ||
    args.request.headers.get("referer") ||
    "https://mochi.dev";

  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": "Mochi Site Mochi",
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.7,
      max_tokens: 250,
      messages: args.messages,
      stream: true,
    }),
    cache: "no-store",
  });

  if (!upstream.ok) {
    const rawBody = await upstream.text().catch(() => "");
    let payload: any = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = null;
    }
    if (upstream.status === 402) {
      throw new Error("NO_CREDITS");
    }
    if (upstream.status === 429) {
      const errorCode = payload?.error?.code || payload?.error?.type;
      if (errorCode === "insufficient_quota") {
        throw new Error("NO_CREDITS");
      }
    }
    const details = payload
      ? JSON.stringify(payload).slice(0, 500)
      : rawBody.trim().replace(/\s+/g, " ").slice(0, 500) || `${upstream.status} ${upstream.statusText}`;
    const err = new Error("OPENROUTER_REQUEST_FAILED");
    (err as any).status = upstream.status;
    (err as any).details = details;
    throw err;
  }

  if (!upstream.body) {
    throw new Error("INVALID_OPENROUTER_RESPONSE");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";

  const flushBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let eventName = "message";
    const dataParts: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim() || "message";
        continue;
      }
      if (line.startsWith("data:")) {
        dataParts.push(line.slice(5).replace(/^\s/, ""));
      }
    }

    const rawData = dataParts.join("\n").trim();
    if (!rawData) return false;

    if (rawData === "[DONE]") {
      return true;
    }

    let payload: any = null;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return false;
    }

    if (eventName === "message" || eventName === "output_text.delta") {
      const delta = extractOpenRouterChunkText(payload);
      if (delta) {
        reply += delta;
        args.onDelta(delta);
      }
    }

    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let splitIndex = buffer.indexOf("\n\n");
    while (splitIndex !== -1) {
      const block = buffer.slice(0, splitIndex);
      buffer = buffer.slice(splitIndex + 2);
      const sawDone = flushBlock(block);
      if (sawDone) {
        return reply.trim();
      }
      splitIndex = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    flushBlock(buffer);
  }

  if (!reply.trim()) {
    throw new Error("INVALID_OPENROUTER_RESPONSE");
  }

  return reply.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = sanitizeSiteMochiMessage((body as any)?.message);
    const history = coerceSiteMochiHistory((body as any)?.history);

    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    const provider = parseServerProvider((body as any)?.provider);
    if (provider !== "site" && provider !== "openrouter") {
      return NextResponse.json({ error: "Unsupported provider for this endpoint" }, { status: 400 });
    }

    const providerConfig = ((body as any)?.providerConfig || {}) as Record<string, unknown>;
    const customOpenRouterKey =
      typeof providerConfig.openrouterApiKey === "string"
        ? providerConfig.openrouterApiKey.trim().slice(0, 600)
        : "";
    const customOpenRouterModel = sanitizeModel(providerConfig.openrouterModel);

    const apiKey =
      provider === "openrouter" ? customOpenRouterKey : process.env.OPENROUTER_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            provider === "openrouter"
              ? "Missing OpenRouter API key"
              : "Site credits are not configured right now",
        },
        { status: provider === "openrouter" ? 400 : 500 },
      );
    }

    const characterKey = sanitizeShortKey((body as any)?.character);
    const soulMd =
      typeof (body as any)?.soulMd === "string"
        ? (body as any).soulMd.slice(0, 4000)
        : "";
    const toolContext =
      typeof (body as any)?.toolContext === "string"
        ? (body as any).toolContext.trim().slice(0, 4000)
        : "";
    const promptContext = await resolvePromptContext(characterKey);

    const messages = buildSiteMochiChatMessages({
      message,
      history,
      language: typeof (body as any)?.lang === "string" ? (body as any).lang : undefined,
      characterLabel: promptContext.characterLabel,
      soulMd,
      toolContext,
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const reply = await readOpenRouterStream({
            apiKey,
            model: provider === "openrouter" ? customOpenRouterModel : DEFAULT_MODEL,
            messages,
            request,
            onDelta(delta) {
              enqueueSseEvent(controller, "token", { text: delta });
            },
          });
          enqueueSseEvent(controller, "done", { reply, providerUsed: provider });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Server error";
          const status =
            message === "NO_CREDITS"
              ? 402
              : message === "INVALID_OPENROUTER_RESPONSE"
                ? 502
                : message === "OPENROUTER_REQUEST_FAILED"
                  ? 502
                  : 500;
          const details =
            message === "OPENROUTER_REQUEST_FAILED" ? String((error as any)?.details ?? "") : "";
          const errorCode = message === "OPENROUTER_REQUEST_FAILED" ? "OpenRouter request failed" : message;
          enqueueSseEvent(controller, "error", {
            error: errorCode,
            status,
            details: details.slice(0, 500),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";

    if (message === "NO_CREDITS") {
      return NextResponse.json({ error: "NO_CREDITS" }, { status: 402 });
    }

    if (message === "INVALID_OPENROUTER_RESPONSE") {
      return NextResponse.json({ error: "Invalid OpenRouter response" }, { status: 502 });
    }

    if (message === "OPENROUTER_REQUEST_FAILED") {
      return NextResponse.json(
        {
          error: "OpenRouter request failed",
          status: (error as any)?.status ?? 502,
          details: (error as any)?.details ?? "",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
