import type { MetadataRoute } from "next";
import { cookies } from "next/headers";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cookieStore = await cookies();
  const language = cookieStore.get("mochi-language")?.value === "es" ? "es" : "en";

  return {
    name: "Mochi",
    short_name: "Mochi",
    description:
      language === "es"
        ? "Mascotas de IA con capacidades agentic y cuerpos NFT comerciables."
        : "AI pets with agentic capabilities and tradeable NFT bodies.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    icons: [
      {
        src: "/logo.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
