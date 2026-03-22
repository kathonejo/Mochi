import { PublicWalletProfilePage } from "@/components/public-wallet-profile-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ wallet: string }>;
};

export default async function MarketplaceArtistPage({ params }: Params) {
  const { wallet } = await params;
  return <PublicWalletProfilePage wallet={wallet} />;
}
