import { NextRequest, NextResponse } from "next/server";
import { fetchBraveWebSearchContext } from "@/lib/site-mochi-web-search";

function sanitizeQuery(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\s+/g, " ").slice(0, 300);
}

function sanitizeApiKey(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, 600);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = sanitizeQuery((body as { query?: unknown })?.query);
    const apiKey = sanitizeApiKey((body as { apiKey?: unknown })?.apiKey);

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Missing Brave API key" }, { status: 400 });
    }

    const context = await fetchBraveWebSearchContext({ query, apiKey });
    return NextResponse.json({ context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "BRAVE_SEARCH_FAILED";

    if (
      message === "BRAVE_MISSING_API_KEY" ||
      message === "BRAVE_INVALID_API_KEY" ||
      message === "BRAVE_RATE_LIMITED"
    ) {
      return NextResponse.json({ error: message }, { status: message === "BRAVE_RATE_LIMITED" ? 429 : 400 });
    }

    return NextResponse.json({ error: "BRAVE_SEARCH_FAILED" }, { status: 502 });
  }
}
