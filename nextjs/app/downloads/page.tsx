import type { Metadata } from "next";
import DownloadClient from "../download/DownloadClient";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Downloads | Mochi",
  description:
    "Get the latest Mochi desktop and browser builds for a smooth AVAX experience.",
  path: "/downloads",
});

export default function DownloadsPage() {
  return <DownloadClient />;
}
