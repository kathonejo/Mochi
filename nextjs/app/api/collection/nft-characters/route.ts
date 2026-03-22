import { NextRequest, NextResponse } from "next/server";
import { buildOwnedNftCharacterCatalog } from "@/lib/nft-character-catalog";
import { isValidWalletAddress } from "@/lib/artist-profiles-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const wallet = String(request.nextUrl.searchParams.get("wallet") || "").trim();
  if (!isValidWalletAddress(wallet)) {
    return NextResponse.json({ error: "A valid EVM wallet address is required." }, { status: 400 });
  }

  try {
    const characters = await buildOwnedNftCharacterCatalog(wallet);
    return NextResponse.json(
      {
        wallet,
        characters,
        generatedAt: Date.now(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("NFT character catalog API error:", error);
    return NextResponse.json({ error: "Failed to build NFT character catalog." }, { status: 500 });
  }
}
