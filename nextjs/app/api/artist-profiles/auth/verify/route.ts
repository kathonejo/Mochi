import { NextRequest, NextResponse } from "next/server";
import { verifyArtistAuthChallenge } from "@/lib/artist-profiles-store";
import type { ArtistProfileVerifyResponse } from "@/lib/marketplace-hub-types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      wallet?: string;
      challengeId?: string;
      signedMessage?: string;
      signerAddress?: string;
    };

    const result = await verifyArtistAuthChallenge({
      wallet: (body.wallet || "").trim(),
      challengeId: body.challengeId || "",
      signedMessage: body.signedMessage || "",
      signerAddress: body.signerAddress || undefined,
    });

    const response: ArtistProfileVerifyResponse = result;
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
