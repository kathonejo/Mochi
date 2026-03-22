import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "NFT Collection | Mochi",
  description:
    "Connect an EVM wallet to view and manage your Mochi NFT collection.",
  path: "/collection",
});

export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
