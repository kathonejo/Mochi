import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Subscription Confirmed | Mochi",
  description:
    "Your Mochi subscription was confirmed and you'll receive updates about new features and drops.",
  path: "/subscription/success",
});

export default function SubscriptionSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
