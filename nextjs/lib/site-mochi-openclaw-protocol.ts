export type OpenClawChatRequestMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function getLastUserMessageText(messages: OpenClawChatRequestMessage[]): string {
  const lastUser = [...messages].reverse().find((entry) => entry.role === "user");
  return String(lastUser?.content || "").trim();
}

export function normalizeOpenClawGatewayUrl(rawUrl: string): string {
  const fallback = "ws://127.0.0.1:18789";
  const input = String(rawUrl || fallback).trim();
  const withProtocol = /^[a-z]+:\/\//i.test(input) ? input : `ws://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error(`OPENCLAW_INVALID_URL:${input || fallback}`);
  }

  if (parsed.protocol === "http:") parsed.protocol = "ws:";
  if (parsed.protocol === "https:") parsed.protocol = "wss:";
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error(`OPENCLAW_INVALID_URL:${input || fallback}`);
  }

  return parsed.toString();
}

export function extractOpenClawText(payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return "";
  const value = payload as any;
  if (typeof value.content === "string") return value.content;
  if (typeof value.text === "string") return value.text;
  if (value.delta) {
    if (typeof value.delta.content === "string") return value.delta.content;
    if (typeof value.delta.text === "string") return value.delta.text;
  }
  if (value.message) {
    const msg = value.message;
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content.map((c: any) => c?.text || c?.content || c?.value || "").join("");
    }
  }
  if (Array.isArray(value.content)) {
    return value.content.map((c: any) => c?.text || c?.content || c?.value || "").join("");
  }
  // agent stream events: {stream:"assistant", data:{text:"...", delta:"..."}}
  if (value.data && typeof value.data.text === "string") return value.data.text;
  return "";
}

export function mergeOpenClawStreamText(current: string, next: string): string {
  if (!next) return current;
  if (!current) return next;
  if (next === current) return current;
  if (next.startsWith(current)) return next;
  if (current.startsWith(next)) return current;
  if (next.includes(current)) return next;
  if (current.includes(next)) return current;
  const maxOverlap = Math.min(current.length, next.length);
  for (let i = maxOverlap; i > 0; i -= 1) {
    if (current.slice(-i) === next.slice(0, i)) {
      return current + next.slice(i);
    }
  }
  return current + next;
}

let openClawReqCounter = 0;

export function nextOpenClawId(prefix = "mochi") {
  openClawReqCounter = (openClawReqCounter + 1) % 1_000_000_000;
  return `${prefix}-${Date.now()}-${openClawReqCounter}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function buildOpenClawSessionKey(agentName: string) {
  const raw = String(agentName || "web-mochi-1").toLowerCase();
  const safe = raw.replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 48) || "main";
  return `agent:${safe}:main`;
}

export function sanitizeOpenClawAgentName(input: unknown, fallback = "web-mochi-1"): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return fallback;
  return raw.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 32) || fallback;
}

export function coerceOpenClawChatMessages(input: unknown): OpenClawChatRequestMessage[] {
  if (!Array.isArray(input)) return [];
  const out: OpenClawChatRequestMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const role = (item as any).role;
    if (role !== "system" && role !== "user" && role !== "assistant") continue;
    const content = typeof (item as any).content === "string" ? (item as any).content.trim().slice(0, 4000) : "";
    if (!content) continue;
    out.push({ role, content });
  }
  return out.slice(-16);
}
