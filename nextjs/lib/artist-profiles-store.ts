import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { getAddress, isAddress, verifyMessage } from "viem";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  ArtistProfile,
  ArtistProfileUpdateInput,
  MarketplaceReportRecord,
} from "@/lib/marketplace-hub-types";

const AUTH_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REPORT_REASON = 120;
const MAX_REPORT_DETAILS = 1000;

function assertArtistProfilesDatabaseConfigured() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "Artist profiles database is not configured. Set DATABASE_URL (Neon Postgres) and run Prisma migrations.",
    );
  }
}

function normalizeWalletAddress(wallet: string): string {
  const value = String(wallet || "").trim();
  if (!value) return "";
  try {
    return getAddress(value);
  } catch {
    return "";
  }
}

export function isValidWalletAddress(wallet: string): boolean {
  return isAddress(String(wallet || "").trim(), { strict: false });
}

function sanitizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function sanitizeStringArray(value: unknown, maxItems: number, maxLengthPerItem: number): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((entry) => sanitizeString(entry, maxLengthPerItem))
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, maxItems);
}

function sanitizeSocialLinks(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => [sanitizeString(key, 40), sanitizeString(raw, 300)] as const)
    .filter(([key, url]) => Boolean(key) && Boolean(url));
  return Object.fromEntries(entries.slice(0, 10));
}

function sanitizeNullableNumber(
  value: unknown,
  opts: { min?: number; max?: number },
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (opts.min !== undefined && rounded < opts.min) return null;
  if (opts.max !== undefined && rounded > opts.max) return null;
  return rounded;
}

function sanitizePriceString(value: unknown): string {
  const raw = sanitizeString(value, 32);
  if (!raw) return "";
  if (!/^\d+(\.\d{1,7})?$/.test(raw)) return "";
  return raw;
}

function createDefaultProfile(walletAddress: string, now: number): ArtistProfile {
  return {
    walletAddress,
    displayName: "",
    avatarUrl: "",
    bannerUrl: "",
    bio: "",
    languages: [],
    styleTags: [],
    socialLinks: {},
    artistEnabled: false,
    commissionEnabled: false,
    acceptingNewClients: true,
    basePriceAvax: "",
    basePriceUsdc: "",
    turnaroundDaysMin: null,
    turnaroundDaysMax: null,
    slotsTotal: null,
    slotsOpen: null,
    preferredAuctionDurationHours: 24,
    reportCount: 0,
    visibilityStatus: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizeProfilePatch(input: ArtistProfileUpdateInput): ArtistProfileUpdateInput {
  const patch: ArtistProfileUpdateInput = {};

  if ("displayName" in input) patch.displayName = sanitizeString(input.displayName, 80);
  if ("avatarUrl" in input) patch.avatarUrl = sanitizeString(input.avatarUrl, 500);
  if ("bannerUrl" in input) patch.bannerUrl = sanitizeString(input.bannerUrl, 500);
  if ("bio" in input) patch.bio = sanitizeString(input.bio, 1000);
  if ("languages" in input) patch.languages = sanitizeStringArray(input.languages, 12, 32);
  if ("styleTags" in input) patch.styleTags = sanitizeStringArray(input.styleTags, 16, 40);
  if ("socialLinks" in input) patch.socialLinks = sanitizeSocialLinks(input.socialLinks);
  if ("artistEnabled" in input) patch.artistEnabled = Boolean(input.artistEnabled);
  if ("commissionEnabled" in input) patch.commissionEnabled = Boolean(input.commissionEnabled);
  if ("acceptingNewClients" in input) {
    patch.acceptingNewClients = Boolean(input.acceptingNewClients);
  }
  if ("basePriceAvax" in input) patch.basePriceAvax = sanitizePriceString(input.basePriceAvax);
  if ("basePriceUsdc" in input) patch.basePriceUsdc = sanitizePriceString(input.basePriceUsdc);
  if ("turnaroundDaysMin" in input) {
    patch.turnaroundDaysMin = sanitizeNullableNumber(input.turnaroundDaysMin, { min: 1, max: 365 });
  }
  if ("turnaroundDaysMax" in input) {
    patch.turnaroundDaysMax = sanitizeNullableNumber(input.turnaroundDaysMax, { min: 1, max: 365 });
  }
  if ("slotsTotal" in input) patch.slotsTotal = sanitizeNullableNumber(input.slotsTotal, { min: 0, max: 999 });
  if ("slotsOpen" in input) patch.slotsOpen = sanitizeNullableNumber(input.slotsOpen, { min: 0, max: 999 });
  if ("preferredAuctionDurationHours" in input) {
    patch.preferredAuctionDurationHours = sanitizeNullableNumber(input.preferredAuctionDurationHours, {
      min: 6,
      max: 14 * 24,
    });
  }

  return patch;
}

async function pruneTransientRecords() {
  assertArtistProfilesDatabaseConfigured();
  const now = new Date();
  await Promise.all([
    prisma.artistAuthChallenge.deleteMany({
      where: {
        OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }],
      },
    }),
    prisma.artistAuthSession.deleteMany({
      where: {
        expiresAt: { lte: now },
      },
    }),
  ]);
}

function coerceJsonStringArray(value: Prisma.JsonValue, maxItems: number, maxLengthPerItem: number): string[] {
  return sanitizeStringArray(value, maxItems, maxLengthPerItem);
}

function coerceJsonSocialLinks(value: Prisma.JsonValue): Record<string, string> {
  return sanitizeSocialLinks(value);
}

function coerceVisibilityStatus(value: string): ArtistProfile["visibilityStatus"] {
  if (value === "hidden" || value === "under_review") return value;
  return "active";
}

type ArtistProfileRow = {
  walletAddress: string;
  displayName: string;
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  languages: Prisma.JsonValue;
  styleTags: Prisma.JsonValue;
  socialLinks: Prisma.JsonValue;
  artistEnabled: boolean;
  commissionEnabled: boolean;
  acceptingNewClients: boolean;
  basePriceAvax: string;
  basePriceUsdc: string;
  turnaroundDaysMin: number | null;
  turnaroundDaysMax: number | null;
  slotsTotal: number | null;
  slotsOpen: number | null;
  preferredAuctionDurationHours: number | null;
  reportCount: number;
  visibilityStatus: string;
  createdAt: Date;
  updatedAt: Date;
};

function profileRowToDomain(row: ArtistProfileRow): ArtistProfile {
  return {
    walletAddress: row.walletAddress,
    displayName: row.displayName || "",
    avatarUrl: row.avatarUrl || "",
    bannerUrl: row.bannerUrl || "",
    bio: row.bio || "",
    languages: coerceJsonStringArray(row.languages, 12, 32),
    styleTags: coerceJsonStringArray(row.styleTags, 16, 40),
    socialLinks: coerceJsonSocialLinks(row.socialLinks),
    artistEnabled: Boolean(row.artistEnabled),
    commissionEnabled: Boolean(row.commissionEnabled),
    acceptingNewClients: Boolean(row.acceptingNewClients),
    basePriceAvax: row.basePriceAvax || "",
    basePriceUsdc: row.basePriceUsdc || "",
    turnaroundDaysMin: row.turnaroundDaysMin ?? null,
    turnaroundDaysMax: row.turnaroundDaysMax ?? null,
    slotsTotal: row.slotsTotal ?? null,
    slotsOpen: row.slotsOpen ?? null,
    preferredAuctionDurationHours: row.preferredAuctionDurationHours ?? null,
    reportCount: row.reportCount ?? 0,
    visibilityStatus: coerceVisibilityStatus(row.visibilityStatus),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function profileToCreateData(profile: ArtistProfile) {
  return {
    walletAddress: profile.walletAddress,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bannerUrl: profile.bannerUrl,
    bio: profile.bio,
    languages: profile.languages as Prisma.InputJsonValue,
    styleTags: profile.styleTags as Prisma.InputJsonValue,
    socialLinks: profile.socialLinks as Prisma.InputJsonValue,
    artistEnabled: profile.artistEnabled,
    commissionEnabled: profile.commissionEnabled,
    acceptingNewClients: profile.acceptingNewClients,
    basePriceAvax: profile.basePriceAvax,
    basePriceUsdc: profile.basePriceUsdc,
    turnaroundDaysMin: profile.turnaroundDaysMin,
    turnaroundDaysMax: profile.turnaroundDaysMax,
    slotsTotal: profile.slotsTotal,
    slotsOpen: profile.slotsOpen,
    preferredAuctionDurationHours: profile.preferredAuctionDurationHours,
    reportCount: profile.reportCount,
    visibilityStatus: profile.visibilityStatus,
  };
}

function profileToUpdateData(profile: ArtistProfile) {
  return {
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bannerUrl: profile.bannerUrl,
    bio: profile.bio,
    languages: profile.languages as Prisma.InputJsonValue,
    styleTags: profile.styleTags as Prisma.InputJsonValue,
    socialLinks: profile.socialLinks as Prisma.InputJsonValue,
    artistEnabled: profile.artistEnabled,
    commissionEnabled: profile.commissionEnabled,
    acceptingNewClients: profile.acceptingNewClients,
    basePriceAvax: profile.basePriceAvax,
    basePriceUsdc: profile.basePriceUsdc,
    turnaroundDaysMin: profile.turnaroundDaysMin,
    turnaroundDaysMax: profile.turnaroundDaysMax,
    slotsTotal: profile.slotsTotal,
    slotsOpen: profile.slotsOpen,
    preferredAuctionDurationHours: profile.preferredAuctionDurationHours,
    reportCount: profile.reportCount,
    visibilityStatus: profile.visibilityStatus,
  };
}

function sortProfiles(a: ArtistProfile, b: ArtistProfile) {
  if (a.commissionEnabled !== b.commissionEnabled) {
    return a.commissionEnabled ? -1 : 1;
  }
  return b.updatedAt - a.updatedAt;
}

function buildNextProfile(
  previous: ArtistProfile,
  input: ArtistProfileUpdateInput,
  now: number,
): ArtistProfile {
  const patch = sanitizeProfilePatch(input);
  const next: ArtistProfile = {
    ...previous,
    ...patch,
    walletAddress: previous.walletAddress,
    updatedAt: now,
  };

  if (next.turnaroundDaysMin && next.turnaroundDaysMax && next.turnaroundDaysMin > next.turnaroundDaysMax) {
    const temp = next.turnaroundDaysMin;
    next.turnaroundDaysMin = next.turnaroundDaysMax;
    next.turnaroundDaysMax = temp;
  }
  if (next.slotsTotal !== null && next.slotsOpen !== null && next.slotsOpen > next.slotsTotal) {
    next.slotsOpen = next.slotsTotal;
  }
  if (!next.artistEnabled) {
    next.commissionEnabled = false;
  }

  return next;
}

export async function listArtistProfiles(filters?: {
  commissionEnabled?: boolean;
  search?: string;
  style?: string;
  language?: string;
}): Promise<ArtistProfile[]> {
  assertArtistProfilesDatabaseConfigured();
  await pruneTransientRecords();

  const search = sanitizeString(filters?.search, 120).toLowerCase();
  const style = sanitizeString(filters?.style, 40).toLowerCase();
  const language = sanitizeString(filters?.language, 40).toLowerCase();

  const rows = await prisma.artistProfile.findMany();
  return rows
    .map((row) => profileRowToDomain(row as unknown as ArtistProfileRow))
    .filter((profile) => profile.visibilityStatus === "active")
    .filter((profile) =>
      filters?.commissionEnabled === undefined
        ? true
        : profile.commissionEnabled === filters.commissionEnabled,
    )
    .filter((profile) => {
      if (!search) return true;
      const haystack = [
        profile.walletAddress,
        profile.displayName,
        profile.bio,
        ...profile.languages,
        ...profile.styleTags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    })
    .filter((profile) => (style ? profile.styleTags.some((tag) => tag.toLowerCase() === style) : true))
    .filter((profile) =>
      language ? profile.languages.some((lang) => lang.toLowerCase() === language) : true,
    )
    .sort(sortProfiles);
}

export async function getArtistProfile(wallet: string): Promise<ArtistProfile | null> {
  const normalizedWallet = normalizeWalletAddress(wallet);
  if (!isValidWalletAddress(normalizedWallet)) return null;
  assertArtistProfilesDatabaseConfigured();
  await pruneTransientRecords();
  const row = await prisma.artistProfile.findUnique({ where: { walletAddress: normalizedWallet } });
  return row ? profileRowToDomain(row as unknown as ArtistProfileRow) : null;
}

export async function getArtistProfilesByWallets(wallets: string[]): Promise<Record<string, ArtistProfile>> {
  const normalized = Array.from(
    new Set(wallets.map(normalizeWalletAddress).filter((wallet) => isValidWalletAddress(wallet))),
  );
  if (normalized.length === 0) return {};
  assertArtistProfilesDatabaseConfigured();
  await pruneTransientRecords();
  const rows = await prisma.artistProfile.findMany({
    where: { walletAddress: { in: normalized } },
  });
  const result: Record<string, ArtistProfile> = {};
  for (const row of rows) {
    const profile = profileRowToDomain(row as unknown as ArtistProfileRow);
    result[profile.walletAddress] = profile;
  }
  return result;
}

export async function upsertArtistProfile(
  wallet: string,
  input: ArtistProfileUpdateInput,
): Promise<ArtistProfile> {
  const normalizedWallet = normalizeWalletAddress(wallet);
  if (!isValidWalletAddress(normalizedWallet)) {
    throw new Error("Invalid wallet address");
  }

  assertArtistProfilesDatabaseConfigured();
  await pruneTransientRecords();

  const now = Date.now();
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.artistProfile.findUnique({
      where: { walletAddress: normalizedWallet },
    });
    const previous = existing
      ? profileRowToDomain(existing as unknown as ArtistProfileRow)
      : createDefaultProfile(normalizedWallet, now);
    const next = buildNextProfile(previous, input, now);

    if (existing) {
      return tx.artistProfile.update({
        where: { walletAddress: normalizedWallet },
        data: profileToUpdateData(next),
      });
    }
    return tx.artistProfile.create({
      data: profileToCreateData(next),
    });
  });

  return profileRowToDomain(row as unknown as ArtistProfileRow);
}

export async function createArtistAuthChallenge(wallet: string): Promise<{
  wallet: string;
  challengeId: string;
  message: string;
  expiresAt: number;
}> {
  const normalizedWallet = normalizeWalletAddress(wallet);
  if (!isValidWalletAddress(normalizedWallet)) {
    throw new Error("Invalid wallet address");
  }

  assertArtistProfilesDatabaseConfigured();
  await pruneTransientRecords();

  const now = Date.now();
  const challengeId = randomUUID();
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = now + AUTH_CHALLENGE_TTL_MS;
  const message = [
    "Mochi AVAX Artist Profile Login",
    `Wallet: ${normalizedWallet}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(now).toISOString()}`,
    `Expires At: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");

  await prisma.artistAuthChallenge.create({
    data: {
      id: challengeId,
      wallet: normalizedWallet,
      message,
      createdAt: new Date(now),
      expiresAt: new Date(expiresAt),
      usedAt: null,
    },
  });

  return { wallet: normalizedWallet, challengeId, message, expiresAt };
}

export async function verifyArtistAuthChallenge(input: {
  wallet: string;
  challengeId: string;
  signedMessage: string;
  signerAddress?: string | null;
}): Promise<{
  wallet: string;
  sessionToken: string;
  expiresAt: number;
  verificationMode: "evm_message";
}> {
  const wallet = normalizeWalletAddress(input.wallet);
  if (!isValidWalletAddress(wallet)) {
    throw new Error("Invalid wallet address");
  }
  const challengeId = sanitizeString(input.challengeId, 120);
  const signedMessage = sanitizeString(input.signedMessage, 5000);
  const signerAddress = input.signerAddress ? normalizeWalletAddress(input.signerAddress) : null;

  if (!challengeId || !signedMessage) {
    throw new Error("Missing signature payload");
  }
  if (signerAddress && signerAddress !== wallet) {
    throw new Error("Signer wallet does not match requested wallet");
  }

  assertArtistProfilesDatabaseConfigured();
  await pruneTransientRecords();

  const nowMs = Date.now();
  const now = new Date(nowMs);
  const expiresAt = new Date(nowMs + AUTH_SESSION_TTL_MS);
  const sessionToken = randomBytes(32).toString("hex");

  const result = await prisma.$transaction(async (tx) => {
    const challenge = await tx.artistAuthChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge || challenge.wallet !== wallet) {
      throw new Error("Challenge not found");
    }
    if (challenge.usedAt) {
      throw new Error("Challenge already used");
    }
    if (challenge.expiresAt.getTime() <= nowMs) {
      throw new Error("Challenge expired");
    }
    const recoveredAddress = await verifyMessage({
      address: getAddress(wallet),
      message: challenge.message,
      signature: signedMessage as `0x${string}`,
    });
    if (!recoveredAddress) {
      throw new Error("Invalid wallet signature");
    }
    await tx.artistAuthChallenge.update({
      where: { id: challengeId },
      data: { usedAt: now },
    });

    await tx.artistAuthSession.create({
      data: {
        token: sessionToken,
        wallet,
        createdAt: now,
        expiresAt,
        verificationMode: "evm_message",
      },
    });

    const existingProfile = await tx.artistProfile.findUnique({
      where: { walletAddress: wallet },
      select: { walletAddress: true },
    });
    if (!existingProfile) {
      await tx.artistProfile.create({
        data: profileToCreateData(createDefaultProfile(wallet, nowMs)),
      });
    }

    return {
      wallet,
      sessionToken,
      expiresAt: expiresAt.getTime(),
      verificationMode: "evm_message" as const,
    };
  });

  return result;
}

export async function validateArtistSession(wallet: string, sessionToken: string): Promise<boolean> {
  const normalizedWallet = normalizeWalletAddress(wallet);
  const token = sanitizeString(sessionToken, 256);
  if (!isValidWalletAddress(normalizedWallet) || !token) return false;

  assertArtistProfilesDatabaseConfigured();
  await pruneTransientRecords();

  const session = await prisma.artistAuthSession.findUnique({ where: { token } });
  if (!session) return false;
  if (session.wallet !== normalizedWallet) return false;
  if (session.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

export async function createMarketplaceReport(input: {
  targetType: "artist_profile" | "listing";
  targetId: string;
  reporterWallet?: string | null;
  reason: string;
  details?: string;
}): Promise<MarketplaceReportRecord> {
  const targetId = sanitizeString(input.targetId, 120);
  const reason = sanitizeString(input.reason, MAX_REPORT_REASON);
  const details = sanitizeString(input.details, MAX_REPORT_DETAILS);
  const reporterWallet = input.reporterWallet ? normalizeWalletAddress(input.reporterWallet) : null;

  if (!targetId) throw new Error("Missing targetId");
  if (!reason) throw new Error("Missing reason");
  if (reporterWallet && !isValidWalletAddress(reporterWallet)) {
    throw new Error("Invalid reporter wallet");
  }

  assertArtistProfilesDatabaseConfigured();
  await pruneTransientRecords();

  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    const record = await tx.marketplaceReport.create({
      data: {
        id: randomUUID(),
        targetType: input.targetType,
        targetId,
        reporterWallet,
        reason,
        details,
        createdAt: now,
      },
    });

    if (input.targetType === "artist_profile" && isValidWalletAddress(targetId)) {
      const wallet = normalizeWalletAddress(targetId);
      await tx.artistProfile.updateMany({
        where: { walletAddress: wallet },
        data: { reportCount: { increment: 1 } },
      });
    }

    return record;
  });

  return {
    id: created.id,
    targetType: created.targetType as MarketplaceReportRecord["targetType"],
    targetId: created.targetId,
    reporterWallet: created.reporterWallet,
    reason: created.reason,
    details: created.details,
    createdAt: created.createdAt.getTime(),
  };
}
