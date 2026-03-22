import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Mochi Settings | Mochi",
  description: "Configure website mochi settings in a dedicated page.",
  path: "/settings/mochi",
});

export default function MochiSettingsPage() {
  redirect("/settings");
}
