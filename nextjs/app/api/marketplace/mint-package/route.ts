import { NextRequest, NextResponse } from "next/server";
import { findMissingRequiredSprites } from "@/lib/mochi-sprite-spec";

export const runtime = "nodejs";

const MAX_COVER_FILE_SIZE = 10 * 1024 * 1024;
const MAX_SPRITE_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 120 * 1024 * 1024;
const MAX_SPRITE_FILES = 400;
const MAX_ATTRIBUTES = 64;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

type MetadataAttribute = {
  trait_type: string;
  value: string;
};

type SpriteUploadEntry = {
  file: File;
  relativePath: string;
};

function sanitizeFileName(name: string): string {
  return name
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 90) || "file";
}

function sanitizeRelativePath(raw: string, fallbackName: string): string {
  const normalized = raw.replace(/\\/g, "/").trim();
  const segments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment) =>
      segment
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^\.+/, "")
        .slice(0, 80),
    )
    .filter(Boolean);
  if (segments.length === 0) return sanitizeFileName(fallbackName);
  return segments.join("/");
}

function parseAttributes(raw: string | null): MetadataAttribute[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid attributes JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Attributes must be an array.");
  }

  return parsed
    .slice(0, MAX_ATTRIBUTES)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const traitRaw = record.trait_type ?? record.trait ?? record.name ?? "";
      const valueRaw = record.value ?? record.trait_value ?? record.display_value ?? "";
      const trait = String(traitRaw || "").trim().slice(0, 80);
      const value = String(valueRaw || "").trim().slice(0, 160);
      if (!trait || !value) return null;
      return { trait_type: trait, value };
    })
    .filter((entry): entry is MetadataAttribute => Boolean(entry));
}

function jsonBodyOrNull(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function uploadAssetBundleToPinata(
  pinataJwt: string,
  title: string,
  coverFile: File,
  spriteFiles: SpriteUploadEntry[],
): Promise<{ assetsCid: string; coverPath: string; spritePaths: string[] }> {
  const coverName = sanitizeFileName(coverFile.name || "cover.png");
  const coverPath = `cover-${Date.now()}-${coverName}`;
  const spritePaths = spriteFiles.map((entry, index) => {
    const sanitized = sanitizeRelativePath(entry.relativePath, entry.file.name || `sprite-${index}.png`);
    return `sprites/${sanitized}`;
  });

  const pinataFormData = new FormData();
  pinataFormData.append("file", coverFile, coverPath);
  for (let index = 0; index < spriteFiles.length; index += 1) {
    pinataFormData.append("file", spriteFiles[index].file, spritePaths[index]);
  }
  pinataFormData.append(
    "pinataMetadata",
    JSON.stringify({
      name: `Mochi NFT Assets - ${title}`,
      keyvalues: {
        generatedBy: "marketplace-mint-package",
        timestamp: new Date().toISOString(),
      },
    }),
  );
  pinataFormData.append("pinataOptions", JSON.stringify({ cidVersion: 1, wrapWithDirectory: true }));

  const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pinataJwt}`,
    },
    body: pinataFormData,
  });

  if (!pinataResponse.ok) {
    const errorText = await pinataResponse.text();
    throw new Error(`Failed uploading assets to Pinata: ${errorText || pinataResponse.statusText}`);
  }

  const uploadPayload = jsonBodyOrNull(await pinataResponse.text());
  const assetsCid = String(uploadPayload?.IpfsHash || "").trim();
  if (!assetsCid) {
    throw new Error("Pinata did not return an assets CID.");
  }

  return { assetsCid, coverPath, spritePaths };
}

async function uploadMetadataToPinata(pinataJwt: string, title: string, metadata: Record<string, unknown>) {
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pinataJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataMetadata: {
        name: `Mochi NFT Metadata - ${title}`,
      },
      pinataContent: metadata,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed uploading metadata to Pinata: ${errorText || response.statusText}`);
  }

  const payload = jsonBodyOrNull(await response.text());
  const metadataCid = String(payload?.IpfsHash || "").trim();
  if (!metadataCid) {
    throw new Error("Pinata did not return a metadata CID.");
  }
  return metadataCid;
}

export async function POST(request: NextRequest) {
  try {
    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
      return NextResponse.json({ error: "Pinata is not configured." }, { status: 500 });
    }

    const formData = await request.formData();
    const title = String(formData.get("title") || "").trim().slice(0, 120);
    const description = String(formData.get("description") || "").trim().slice(0, 4000);
    const modeRaw = String(formData.get("mode") || "unique").toLowerCase();
    const copiesRaw = String(formData.get("copies") || "1");
    const coverImage = formData.get("coverImage");
    const rawSpriteFiles = formData.getAll("spriteFiles");
    const rawSpritePaths = formData.getAll("spritePaths").map((entry) => String(entry || ""));
    const rawAttributes = String(formData.get("attributes") || "");

    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ error: "Description is required." }, { status: 400 });
    }

    if (!(coverImage instanceof File)) {
      return NextResponse.json({ error: "Cover image is required." }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(coverImage.type)) {
      return NextResponse.json({ error: "Cover image type is not supported." }, { status: 400 });
    }
    if (coverImage.size <= 0 || coverImage.size > MAX_COVER_FILE_SIZE) {
      return NextResponse.json(
        { error: `Cover image must be between 1B and ${MAX_COVER_FILE_SIZE / (1024 * 1024)}MB.` },
        { status: 400 },
      );
    }

    const mode: "unique" | "edition" = modeRaw === "edition" ? "edition" : "unique";
    let copies = Number.parseInt(copiesRaw, 10);
    if (!Number.isFinite(copies) || copies < 1) copies = 1;
    if (mode === "unique") copies = 1;
    copies = Math.min(copies, 50);

    if (rawSpriteFiles.length > MAX_SPRITE_FILES) {
      return NextResponse.json({ error: `Too many sprite files (max ${MAX_SPRITE_FILES}).` }, { status: 400 });
    }
    if (rawSpriteFiles.length === 0) {
      return NextResponse.json(
        { error: "Sprite folder is required for animated Mochi NFTs." },
        { status: 400 },
      );
    }

    const spriteFiles: SpriteUploadEntry[] = [];
    let totalBytes = coverImage.size;
    for (let index = 0; index < rawSpriteFiles.length; index += 1) {
      const entry = rawSpriteFiles[index];
      if (!(entry instanceof File)) {
        continue;
      }
      if (!ALLOWED_IMAGE_TYPES.has(entry.type)) {
        return NextResponse.json({ error: `Unsupported sprite file type: ${entry.type || "unknown"}` }, { status: 400 });
      }
      if (entry.size <= 0 || entry.size > MAX_SPRITE_FILE_SIZE) {
        return NextResponse.json(
          { error: `Sprite ${entry.name} exceeds max size (${MAX_SPRITE_FILE_SIZE / (1024 * 1024)}MB).` },
          { status: 400 },
        );
      }
      totalBytes += entry.size;
      const relativePath = rawSpritePaths[index] || entry.name;
      spriteFiles.push({ file: entry, relativePath });
    }

    const missingRequiredSprites = findMissingRequiredSprites(
      spriteFiles.map((entry) => entry.relativePath || entry.file.name),
    );
    if (missingRequiredSprites.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required sprite files: ${missingRequiredSprites.join(", ")}`,
          missingRequiredSprites,
        },
        { status: 400 },
      );
    }

    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Upload too large (max ${MAX_TOTAL_UPLOAD_BYTES / (1024 * 1024)}MB).` },
        { status: 400 },
      );
    }

    const attributes = parseAttributes(rawAttributes);
    const baseUrl = String(
      process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.mochi.dev",
    ).replace(/\/+$/, "");
    const { assetsCid, coverPath, spritePaths } = await uploadAssetBundleToPinata(
      pinataJwt,
      title,
      coverImage,
      spriteFiles,
    );

    const metadata: Record<string, unknown> = {
      name: title,
      description,
      image: `ipfs://${assetsCid}/${coverPath}`,
      external_url: `${baseUrl}/marketplace`,
      attributes: [
        ...attributes,
        { trait_type: "Edition Mode", value: mode },
        ...(mode === "edition" ? [{ trait_type: "Edition Size", value: String(copies) }] : []),
      ],
      properties: {
        files: [
          {
            uri: `ipfs://${assetsCid}/${coverPath}`,
            type: coverImage.type,
            role: "cover",
          },
          ...spriteFiles.map((entry, index) => ({
            uri: `ipfs://${assetsCid}/${spritePaths[index]}`,
            type: entry.file.type,
            role: "sprite",
            path: spritePaths[index],
          })),
        ],
        mochi: {
          schema: "mochi_nft_v1",
          editionMode: mode,
          copies,
          spritesBaseUri: spriteFiles.length ? `ipfs://${assetsCid}/sprites` : null,
          spriteCount: spriteFiles.length,
        },
      },
    };

    const metadataCid = await uploadMetadataToPinata(pinataJwt, title, metadata);

    return NextResponse.json({
      tokenUri: `ipfs://${metadataCid}`,
      metadataUri: `ipfs://${metadataCid}`,
      assetsBaseUri: `ipfs://${assetsCid}`,
      coverUri: `ipfs://${assetsCid}/${coverPath}`,
      spriteCount: spriteFiles.length,
      edition: {
        mode,
        copies,
      },
    });
  } catch (error) {
    console.error("Mint package upload API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload NFT package." },
      { status: 500 },
    );
  }
}
