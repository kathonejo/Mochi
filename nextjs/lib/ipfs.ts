export const IPFS_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://ipfs.io/ipfs/",
] as const;

const LEGACY_RAW_URL_REWRITES = [
  {
    from: "https://raw.githubusercontent.com/shimeji-ai/Shimeji-AI-Pets-avax/main/shimeji-avax/nextjs/public/",
    to: "https://raw.githubusercontent.com/shimeji-ai/Mochi/main/nextjs/public/",
  },
  {
    from: "https://raw.githubusercontent.com/shimeji-ai/Shimeji-AI-Pets-avax/main/nextjs/public/",
    to: "https://raw.githubusercontent.com/shimeji-ai/Mochi/main/nextjs/public/",
  },
] as const;

export function normalizeKnownAssetUrl(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value) return "";

  for (const rewrite of LEGACY_RAW_URL_REWRITES) {
    if (value.startsWith(rewrite.from)) {
      return `${rewrite.to}${value.slice(rewrite.from.length)}`;
    }
  }

  return value;
}

function normalizeIpfsPath(rawPath: string): string | null {
  const value = rawPath.trim().replace(/^ipfs\//i, "").replace(/^\/+/, "");
  return value || null;
}

export function getIpfsPath(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;

  if (value.startsWith("ipfs://")) {
    return normalizeIpfsPath(value.slice("ipfs://".length));
  }

  if (value.startsWith("/ipfs/")) {
    return normalizeIpfsPath(value.slice("/ipfs/".length));
  }

  try {
    const url = new URL(value);
    const pathMatch = url.pathname.match(/^\/ipfs\/(.+)$/i);
    if (pathMatch) {
      return normalizeIpfsPath(pathMatch[1]);
    }

    const hostMatch = url.hostname.match(/^([^.]+)\.ipfs\./i);
    if (hostMatch) {
      const cid = hostMatch[1];
      const suffix = url.pathname.replace(/^\/+/, "");
      return normalizeIpfsPath(suffix ? `${cid}/${suffix}` : cid);
    }
  } catch {
    return null;
  }

  return null;
}

export function buildCanonicalIpfsUri(raw: string | null | undefined): string | null {
  const ipfsPath = getIpfsPath(raw);
  return ipfsPath ? `ipfs://${ipfsPath}` : null;
}

export function buildIpfsGatewayUrls(raw: string | null | undefined): string[] {
  const value = normalizeKnownAssetUrl(raw);
  if (!value) return [];

  const ipfsPath = getIpfsPath(value);
  if (!ipfsPath) {
    return [value];
  }

  return IPFS_GATEWAYS.map((gateway) => `${gateway}${ipfsPath}`);
}

export function resolveIpfsHttpUrl(raw: string | null | undefined): string | null {
  const ipfsPath = getIpfsPath(raw);
  return ipfsPath ? `https://ipfs.io/ipfs/${ipfsPath}` : null;
}

export function buildIpfsProxyUrl(raw: string | null | undefined): string | null {
  const canonicalUri = buildCanonicalIpfsUri(raw);
  return canonicalUri ? `/api/ipfs?uri=${encodeURIComponent(canonicalUri)}` : null;
}
