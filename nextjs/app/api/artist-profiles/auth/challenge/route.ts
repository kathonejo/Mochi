import { NextRequest, NextResponse } from "next/server";
import { createArtistAuthChallenge } from "@/lib/artist-profiles-store";
import type { ArtistProfileChallengeResponse } from "@/lib/marketplace-hub-types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { wallet?: string };
    const wallet = (body.wallet || "").trim();
    const challenge = await createArtistAuthChallenge(wallet);
    const response: ArtistProfileChallengeResponse = challenge;
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create challenge.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
