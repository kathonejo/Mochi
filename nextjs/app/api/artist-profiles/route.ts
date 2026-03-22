import { NextRequest, NextResponse } from "next/server";
import { listArtistProfiles } from "@/lib/artist-profiles-store";
import type { ArtistProfilesListResponse } from "@/lib/marketplace-hub-types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const commissionEnabledParam = searchParams.get("commissionEnabled");
    const commissionEnabled =
      commissionEnabledParam === null
        ? undefined
        : commissionEnabledParam === "true" || commissionEnabledParam === "1";

    const profiles = await listArtistProfiles({
      commissionEnabled,
      search: searchParams.get("search") || undefined,
      style: searchParams.get("style") || undefined,
      language: searchParams.get("language") || undefined,
    });

    const response: ArtistProfilesListResponse = { profiles };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Artist profiles list API error:", error);
    return NextResponse.json(
      { error: "Failed to load artist profiles." },
      { status: 500 },
    );
  }
}
