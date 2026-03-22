import { headers } from "next/headers";
import { MarketplaceCommissionsManualPageClient } from "@/components/marketplace-commissions-manual-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MarketplaceCommissionsManualPage() {
  const requestHeaders = await headers();
  const initialIsSpanish =
    requestHeaders.get("accept-language")?.toLowerCase().startsWith("es") ?? false;
  return <MarketplaceCommissionsManualPageClient initialIsSpanish={initialIsSpanish} />;
}
