import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Subscription Error | Mochi",
  description:
    "There was a problem confirming your Mochi subscription. Open this page to retry or recover.",
  path: "/subscription/error",
});

export default function SubscriptionErrorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
