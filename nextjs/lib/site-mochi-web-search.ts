const BRAVE_LLM_CONTEXT_URL = "https://api.search.brave.com/res/v1/llm/context";

function sanitizeQuery(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\s+/g, " ").slice(0, 300);
}

function sanitizeApiKey(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, 600);
}

export async function fetchBraveWebSearchContext(args: {
  query: string;
  apiKey: string;
}): Promise<string> {
  const query = sanitizeQuery(args.query);
  const apiKey = sanitizeApiKey(args.apiKey);
  if (!query) return "";
  if (!apiKey) throw new Error("BRAVE_MISSING_API_KEY");

  const url = new URL(BRAVE_LLM_CONTEXT_URL);
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    cache: "no-store",
  }).catch(() => {
    throw new Error("BRAVE_REQUEST_FAILED");
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("BRAVE_INVALID_API_KEY");
    }
    if (response.status === 429) {
      throw new Error("BRAVE_RATE_LIMITED");
    }
    throw new Error(`BRAVE_HTTP_${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return "";

  const contextCandidates = [
    typeof payload.context === "string" ? payload.context : "",
    typeof payload.summary === "string" ? payload.summary : "",
    typeof payload.answer === "string" ? payload.answer : "",
    typeof payload.text === "string" ? payload.text : "",
  ]
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (contextCandidates.length > 0) {
    return contextCandidates.join("\n\n").slice(0, 4000);
  }

  return JSON.stringify(payload).slice(0, 4000);
}
