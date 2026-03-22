import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { AnimationGuideView } from "@/components/animation-guide-view";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Animation Guide | Mochi",
  description:
    "Required Mochi sprite files, visual animation references, and the local-first NFT creator flow.",
  path: "/animation-guide",
});

export default function AnimationGuidePage() {
  return (
    <main className="min-h-screen overflow-x-hidden neural-shell">
      <section className="px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <AnimationGuideView />
      </section>
      <Footer />
    </main>
  );
}
