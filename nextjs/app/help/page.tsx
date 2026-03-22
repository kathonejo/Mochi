import type { Metadata } from "next";
import { HelpSection } from "@/components/help-section";
import { FAQSection } from "@/components/faq-section";
import { ProjectFeedbackBox } from "@/components/project-feedback-box";
import { Footer } from "@/components/footer";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Setup Guides | Mochi",
  description:
    "Configure OpenRouter, Ollama, or OpenClaw for your Mochi with step-by-step setup guides.",
  path: "/help",
});

export default function HelpPage() {
  return (
    <main className="min-h-screen overflow-x-hidden neural-shell">
      <HelpSection />
      <FAQSection />
      <div id="feedback">
        <ProjectFeedbackBox />
      </div>
      <Footer />
    </main>
  );
}
