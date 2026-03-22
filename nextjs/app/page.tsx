import type { Metadata } from "next";
import { SiteMochiLandingSection } from "@/components/site-mochi-landing-section";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Mochi | Home",
  description:
    "Pick a browser creature, arm its personality, and let Mochi loose.",
  path: "/",
});

export default function Home() {
  return (
    <main className="h-[100dvh] max-h-[100dvh] overflow-hidden">
      <SiteMochiLandingSection />
    </main>
  );
}
