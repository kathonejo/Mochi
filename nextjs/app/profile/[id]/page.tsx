import type { Metadata } from "next";
import { PublicWalletProfilePage } from "@/components/public-wallet-profile-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Profile | Mochi",
  description: "Public wallet profile for Mochi.",
  path: "/profile",
});

type Params = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: Params) {
  const { id } = await params;
  return <PublicWalletProfilePage wallet={id} />;
}
