import { NextRequest, NextResponse } from "next/server";
import {
  getArtistProfile,
  isValidWalletAddress,
  upsertArtistProfile,
  validateArtistSession,
} from "@/lib/artist-profiles-store";
import type { ArtistProfileUpdateInput } from "@/lib/marketplace-hub-types";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ wallet: string }>;
};

function readSessionToken(request: NextRequest): string {
  const bearer = request.headers.get("authorization") || "";
  if (bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }
  return (request.headers.get("x-artist-session") || "").trim();
}

export async function GET(_request: NextRequest, context: Params) {
  try {
    const { wallet } = await context.params;
    const normalizedWallet = wallet.trim();
    if (!isValidWalletAddress(normalizedWallet)) {
      return NextResponse.json({ error: "Invalid wallet." }, { status: 400 });
    }

    const profile = await getArtistProfile(normalizedWallet);
    if (!profile) {
      return NextResponse.json({ profile: null }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json(
      { profile },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Artist profile GET API error:", error);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: Params) {
  try {
    const { wallet } = await context.params;
    const normalizedWallet = wallet.trim();
    if (!isValidWalletAddress(normalizedWallet)) {
      return NextResponse.json({ error: "Invalid wallet." }, { status: 400 });
    }

    const sessionToken = readSessionToken(request);
    const isAuthorized = await validateArtistSession(normalizedWallet, sessionToken);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as { profile?: ArtistProfileUpdateInput };
    const nextProfile = await upsertArtistProfile(normalizedWallet, body.profile || {});
    return NextResponse.json({ profile: nextProfile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Artist profile PUT API error:", error);
    return NextResponse.json({ error: "Failed to save profile." }, { status: 500 });
  }
}
