import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;

// Relay polling is disabled. We sleep briefly before returning so that any
// still-running relay agents don't tight-loop and hammer Vercel with requests.
export async function POST() {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  return NextResponse.json({ error: "OPENCLAW_RELAY_POLL_DISABLED" }, { status: 503 });
}
