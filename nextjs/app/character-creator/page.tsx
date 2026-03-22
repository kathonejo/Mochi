import type { Metadata } from "next";
import { CharacterCreatorPageClient } from "@/components/character-creator-page-client";
import { Footer } from "@/components/footer";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Character Creator | Mochi",
  description:
    "Build a Mochi locally in the browser, upload sprites one by one or as a folder, and mint only when the full set is ready.",
  path: "/character-creator",
});

export default function CharacterCreatorPage() {
  return (
    <main className="min-h-screen overflow-x-hidden neural-shell">
      <CharacterCreatorPageClient />
      <Footer />
    </main>
  );
}
