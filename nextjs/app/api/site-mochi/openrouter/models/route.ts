import { NextResponse } from "next/server";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

type OpenRouterApiModel = {
  id?: string;
  name?: string;
  created?: number;
};

function modelPriority(id: string): number {
  const lower = id.toLowerCase();
  if (lower.includes("openai/gpt")) return 0;
  if (lower.includes("anthropic/claude")) return 1;
  if (lower.includes("google/gemini")) return 2;
  if (lower.includes("z-ai/glm") || lower.includes("/glm-")) return 3;
  if (lower.includes("minimax")) return 4;
  if (lower.includes("moonshotai/kimi") || lower.includes("/kimi-")) return 5;
  return 6;
}

export async function GET() {
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "OPENROUTER_MODELS_FETCH_FAILED" }, { status: 502 });
    }

    const json = (await response.json().catch(() => null)) as { data?: OpenRouterApiModel[] } | null;
    const models = Array.isArray(json?.data)
      ? json.data
          .map((entry) => ({
            value: typeof entry.id === "string" ? entry.id : "",
            label: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : typeof entry.id === "string" ? entry.id : "",
            created: typeof entry.created === "number" ? entry.created : 0,
          }))
          .filter((entry) => entry.value)
          .sort((a, b) => {
            const priorityDiff = modelPriority(a.value) - modelPriority(b.value);
            if (priorityDiff !== 0) return priorityDiff;
            if (b.created !== a.created) return b.created - a.created;
            return a.label.localeCompare(b.label);
          })
      : [];

    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ error: "OPENROUTER_MODELS_FETCH_FAILED" }, { status: 502 });
  }
}
