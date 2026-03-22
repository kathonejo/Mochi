import "server-only";

import {
  buildIpfsGatewayUrls,
  buildIpfsProxyUrl,
  normalizeKnownAssetUrl,
  resolveIpfsHttpUrl,
} from "@/lib/ipfs";

export type TokenMetadataPreview = {
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  metadataUrl: string | null;
};

export function buildMediaProxyUrl(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  return buildIpfsProxyUrl(value) || resolveMediaUrl(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractImageRaw(data: Record<string, unknown>): string | null {
  const direct =
    readString(data.image) ||
    readString(data.image_url) ||
    readString(data.imageUrl) ||
    readString(data.cover) ||
    readString(data.coverUri) ||
    readString(data.animation_url) ||
    readString(data.animationUrl);
  if (direct) return direct;

  const properties =
    data.properties && typeof data.properties === "object" && !Array.isArray(data.properties)
      ? (data.properties as Record<string, unknown>)
      : null;
  const files = Array.isArray(properties?.files) ? properties?.files : null;
  if (!files) return null;

  const coverFile = files.find((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    return readString(record.role)?.toLowerCase() === "cover";
  });
  if (coverFile && typeof coverFile === "object" && !Array.isArray(coverFile)) {
    const record = coverFile as Record<string, unknown>;
    return readString(record.uri) || readString(record.url) || readString(record.href);
  }

  const firstImageLike = files.find((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    const type = readString(record.type)?.toLowerCase() || "";
    return type.startsWith("image/");
  });
  if (firstImageLike && typeof firstImageLike === "object" && !Array.isArray(firstImageLike)) {
    const record = firstImageLike as Record<string, unknown>;
    return readString(record.uri) || readString(record.url) || readString(record.href);
  }

  return null;
}

export function resolveMediaUrl(raw: string | null | undefined): string | null {
  const value = normalizeKnownAssetUrl(raw);
  if (!value) return null;

  const ipfsHttpUrl = resolveIpfsHttpUrl(value);
  if (ipfsHttpUrl) {
    return ipfsHttpUrl;
  }

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:image/") ||
    value.startsWith("/")
  ) {
    return value;
  }
  return value;
}

export function isLikelyImageUrl(value: string | null | undefined) {
  if (!value) return false;
  return (
    value.startsWith("data:image/") ||
    /\.(png|jpe?g|gif|webp|avif|svg)(?:[?#].*)?$/i.test(value)
  );
}

export async function fetchTokenMetadataPreview(tokenUri: string): Promise<TokenMetadataPreview> {
  const resolvedTokenUri = resolveMediaUrl(tokenUri);
  if (!resolvedTokenUri) {
    return { name: null, description: null, imageUrl: null, metadataUrl: null };
  }

  if (isLikelyImageUrl(resolvedTokenUri)) {
    return {
      name: null,
      description: null,
      imageUrl: resolvedTokenUri,
      metadataUrl: resolvedTokenUri,
    };
  }

  try {
    let data: Record<string, unknown> | null = null;
    for (const candidateUrl of buildIpfsGatewayUrls(tokenUri)) {
      const response = await fetch(candidateUrl, { cache: "force-cache" });
      if (!response.ok) continue;
      data = (await response.json()) as Record<string, unknown>;
      break;
    }
    if (!data) {
      return {
        name: null,
        description: null,
        imageUrl: null,
        metadataUrl: buildMediaProxyUrl(resolvedTokenUri),
      };
    }
    const imageRaw = extractImageRaw(data);

    return {
      name: typeof data.name === "string" ? data.name : null,
      description: typeof data.description === "string" ? data.description : null,
      imageUrl: buildMediaProxyUrl(imageRaw),
      metadataUrl: buildMediaProxyUrl(resolvedTokenUri),
    };
  } catch {
    return { name: null, description: null, imageUrl: null, metadataUrl: buildMediaProxyUrl(resolvedTokenUri) };
  }
}
