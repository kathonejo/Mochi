import { NextRequest, NextResponse } from "next/server";
import { createMarketplaceReport } from "@/lib/artist-profiles-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      targetType?: "artist_profile" | "listing";
      targetId?: string;
      reporterWallet?: string;
      reason?: string;
      details?: string;
    };

    if (body.targetType !== "artist_profile" && body.targetType !== "listing") {
      return NextResponse.json({ error: "Invalid targetType." }, { status: 400 });
    }

    const report = await createMarketplaceReport({
      targetType: body.targetType,
      targetId: body.targetId || "",
      reporterWallet: body.reporterWallet || null,
      reason: body.reason || "",
      details: body.details || "",
    });

    return NextResponse.json({ report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
