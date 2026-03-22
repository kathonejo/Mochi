import type { Metadata } from "next";

const defaultBaseUrl = `http://localhost:${process.env.PORT || 3000}`;
const configuredBaseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : defaultBaseUrl);
const normalizedBaseUrl =
  configuredBaseUrl.startsWith("http://") || configuredBaseUrl.startsWith("https://")
    ? configuredBaseUrl
    : `https://${configuredBaseUrl}`;
const siteUrl = new URL(normalizedBaseUrl);
const socialImagePath = "/bunny-hero.png";
const socialImageUrl = new URL(socialImagePath, siteUrl).toString();

type PageMetadataInput = {
  title: string;
  description: string;
  path?: string;
};

export function createPageMetadata({
  title,
  description,
  path = "/",
}: PageMetadataInput): Metadata {
  const pageUrl = new URL(path, siteUrl).toString();

  return {
    metadataBase: siteUrl,
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "Mochi",
      type: "website",
      images: [
        {
          url: socialImageUrl,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImageUrl],
    },
  };
}
