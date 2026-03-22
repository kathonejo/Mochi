import { NextRequest, NextResponse } from "next/server";
import { buildIpfsGatewayUrls, getIpfsPath } from "@/lib/ipfs";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rawUri = request.nextUrl.searchParams.get("uri");
  const ipfsPath = getIpfsPath(rawUri);

  if (!ipfsPath) {
    return NextResponse.json({ error: "Expected an IPFS URI or gateway URL." }, { status: 400 });
  }

  for (const target of buildIpfsGatewayUrls(rawUri)) {
    try {
      const upstream = await fetch(target, { cache: "force-cache" });
      if (!upstream.ok || !upstream.body) continue;

      const headers = new Headers();
      const contentType = upstream.headers.get("content-type");
      const contentLength = upstream.headers.get("content-length");
      if (contentType) headers.set("content-type", contentType);
      if (contentLength) headers.set("content-length", contentLength);
      headers.set("cache-control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");

      return new NextResponse(upstream.body, {
        status: 200,
        headers,
      });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "Unable to fetch IPFS asset." }, { status: 502 });
}
