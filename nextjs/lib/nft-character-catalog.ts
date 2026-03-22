import "server-only";

import { fetchOwnedEditionsByWallet, fetchOwnedNftsByWallet } from "@/lib/nft-read";
import {
  buildIpfsGatewayUrls,
  normalizeKnownAssetUrl,
  resolveIpfsHttpUrl,
} from "@/lib/ipfs";

export type NftCharacterCatalogEntry = {
  id: string;
  name: string;
  tokenCount: number;
  tokenIds: number[];
  imageUrl: string | null;
  spritesBaseUri: string | null;
  tokenUri: string | null;
  isCommissionEgg: boolean;
  tokenStandard: "ERC721" | "ERC1155";
};

type MetadataAttribute = {
  trait_type?: unknown;
  trait?: unknown;
  name?: unknown;
  value?: unknown;
};

function resolveMediaUrl(raw: string | null | undefined): string | null {
  const value = normalizeKnownAssetUrl(raw);
  if (!value) return null;

  const ipfsHttpUrl = resolveIpfsHttpUrl(value);
  if (ipfsHttpUrl) {
    return ipfsHttpUrl;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return null;
}

function cleanExplicitName(raw: string): string {
  return raw
    .replace(/^Mochi\s+Placeholder\s*[-–]\s*/i, "")
    .trim();
}

function titleCaseCharacterId(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeCharacterId(raw: string): string {
  const cleaned = raw
    .replace(/^mochi[-_\s]+placeholder[-_\s]+/i, "")
    .trim();
  return cleaned || raw;
}

function parseCharacterIdFromMetadata(metadata: Record<string, unknown>, isCommissionEgg: boolean) {
  const attributes = Array.isArray(metadata.attributes) ? metadata.attributes : [];
  for (const attribute of attributes) {
    if (!attribute || typeof attribute !== "object") continue;
    const item = attribute as MetadataAttribute;
    const traitKey = String(item.trait_type ?? item.trait ?? item.name ?? "").trim().toLowerCase();
    if (traitKey !== "character") continue;
    const value = String(item.value ?? "").trim().toLowerCase();
    if (value) return normalizeCharacterId(value);
  }
  return isCommissionEgg ? "egg" : "";
}

async function fetchJsonObject(rawUrl: string): Promise<Record<string, unknown> | null> {
  for (const candidateUrl of buildIpfsGatewayUrls(rawUrl)) {
    try {
      const response = await fetch(candidateUrl, {
        cache: "no-store",
        next: { revalidate: 0 },
      });
      if (!response.ok) continue;
      const json = await response.json();
      if (!json || typeof json !== "object" || Array.isArray(json)) continue;
      return json as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return null;
}

export async function buildOwnedNftCharacterCatalog(walletAddress: string): Promise<NftCharacterCatalogEntry[]> {
  const [owned, ownedEditions] = await Promise.all([
    fetchOwnedNftsByWallet(walletAddress, { totalCap: 1000 }),
    fetchOwnedEditionsByWallet(walletAddress, { totalCap: 250 }),
  ]);
  const metadataByTokenId = new Map<number, Record<string, unknown> | null>();
  const metadataByEditionId = new Map<number, Record<string, unknown> | null>();

  await Promise.all(
    owned.map(async (token) => {
      if (!resolveMediaUrl(token.tokenUri)) {
        metadataByTokenId.set(token.tokenId, null);
        return;
      }
      metadataByTokenId.set(token.tokenId, await fetchJsonObject(token.tokenUri));
    }),
  );

  await Promise.all(
    ownedEditions.map(async (edition) => {
      if (!resolveMediaUrl(edition.tokenUri)) {
        metadataByEditionId.set(edition.editionId, null);
        return;
      }
      metadataByEditionId.set(edition.editionId, await fetchJsonObject(edition.tokenUri));
    }),
  );

  const byCharacter = new Map<string, NftCharacterCatalogEntry>();
  for (const token of owned) {
    const metadata = metadataByTokenId.get(token.tokenId) ?? null;
    const characterId = parseCharacterIdFromMetadata(metadata || {}, token.isCommissionEgg);
    if (!characterId) continue;

    const imageUrl = resolveMediaUrl(typeof metadata?.image === "string" ? metadata.image : null);
    const mochiProps =
      metadata?.properties && typeof metadata.properties === "object" && !Array.isArray(metadata.properties)
        ? (metadata.properties as Record<string, unknown>).mochi
        : null;
    const spritesBaseUri =
      mochiProps && typeof mochiProps === "object" && !Array.isArray(mochiProps)
        ? resolveMediaUrl(String((mochiProps as Record<string, unknown>).spritesBaseUri || ""))
        : null;
    const explicitName = cleanExplicitName(String(metadata?.name || "").trim());

    const existing = byCharacter.get(characterId);
    if (existing) {
      existing.tokenCount += 1;
      existing.tokenIds.push(token.tokenId);
      if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
      if (!existing.spritesBaseUri && spritesBaseUri) existing.spritesBaseUri = spritesBaseUri;
      if (!existing.tokenUri) existing.tokenUri = token.tokenUri;
      existing.isCommissionEgg = existing.isCommissionEgg || token.isCommissionEgg;
      continue;
    }

    byCharacter.set(characterId, {
      id: characterId,
      name: (explicitName && explicitName.toLowerCase() !== characterId) ? explicitName : titleCaseCharacterId(characterId),
      tokenCount: 1,
      tokenIds: [token.tokenId],
      imageUrl,
      spritesBaseUri,
      tokenUri: token.tokenUri,
      isCommissionEgg: token.isCommissionEgg,
      tokenStandard: "ERC721",
    });
  }

  for (const edition of ownedEditions) {
    const metadata = metadataByEditionId.get(edition.editionId) ?? null;
    const characterId = parseCharacterIdFromMetadata(metadata || {}, false);
    if (!characterId) continue;

    const imageUrl = resolveMediaUrl(typeof metadata?.image === "string" ? metadata.image : null);
    const mochiProps =
      metadata?.properties && typeof metadata.properties === "object" && !Array.isArray(metadata.properties)
        ? (metadata.properties as Record<string, unknown>).mochi
        : null;
    const spritesBaseUri =
      mochiProps && typeof mochiProps === "object" && !Array.isArray(mochiProps)
        ? resolveMediaUrl(String((mochiProps as Record<string, unknown>).spritesBaseUri || ""))
        : null;
    const explicitName = cleanExplicitName(String(metadata?.name || "").trim());

    const existing = byCharacter.get(characterId);
    if (existing) {
      existing.tokenCount += edition.balance;
      if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
      if (!existing.spritesBaseUri && spritesBaseUri) existing.spritesBaseUri = spritesBaseUri;
      if (!existing.tokenUri) existing.tokenUri = edition.tokenUri;
      if (existing.tokenStandard !== "ERC721") existing.tokenStandard = "ERC1155";
      continue;
    }

    byCharacter.set(characterId, {
      id: characterId,
      name: (explicitName && explicitName.toLowerCase() !== characterId) ? explicitName : titleCaseCharacterId(characterId),
      tokenCount: edition.balance,
      tokenIds: [],
      imageUrl,
      spritesBaseUri,
      tokenUri: edition.tokenUri,
      isCommissionEgg: false,
      tokenStandard: "ERC1155",
    });
  }

  return Array.from(byCharacter.values()).sort((a, b) => a.id.localeCompare(b.id));
}
