import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizeOpenClawGatewayUrl,
  sanitizeOpenClawAgentName,
} from "@/lib/site-mochi-openclaw-protocol";

const DEFAULT_PAIRING_TTL_SECONDS = 10 * 60;
const DEFAULT_PAIRING_REQUEST_TTL_SECONDS = 15 * 60;
const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let ensurePairingTablesPromise: Promise<void> | null = null;

type ClaimFailReason = "invalid_code" | "expired_code" | "max_claims_reached";
type ResolveSessionFailReason = "invalid_session" | "expired_session";
type PairingRequestConsumeFailReason = "invalid_request_code" | "expired_request_code";

export type PairingClaimResult =
  | {
      ok: true;
      sessionToken: string;
      sessionExpiresAt: string;
      agentName: string;
    }
  | {
      ok: false;
      reason: ClaimFailReason;
    };

export type PairingIssueFromRequestResult =
  | {
      ok: true;
      code: string;
      expiresAt: string;
      agentName: string;
      maxClaims: number;
      ttlSeconds: number;
    }
  | {
      ok: false;
      reason: PairingRequestConsumeFailReason;
    };

export type ResolveSessionResult =
  | {
      ok: true;
      gatewayUrl: string;
      gatewayToken: string;
      agentName: string;
      sessionExpiresAt: string;
    }
  | {
      ok: false;
      reason: ResolveSessionFailReason;
    };

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

function clampInt(input: unknown, fallback: number, min: number, max: number): number {
  const numeric =
    typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function sanitizeToken(input: unknown, maxLength = 1600): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLength);
}

function sanitizePairingCode(input: unknown, maxLength = 12): string {
  if (typeof input !== "string") return "";
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLength);
}

function getCryptoSecret(): string {
  return (
    process.env.OPENCLAW_PAIRING_SECRET ||
    process.env.SUBSCRIBE_SIGNING_SECRET ||
    "dev-openclaw-pairing-secret"
  );
}

function deriveKey(): string {
  return crypto.createHash("sha256").update(getCryptoSecret()).digest("hex").slice(0, 32);
}

function encryptSensitive(value: string): string {
  const iv = Uint8Array.from(crypto.randomBytes(12));
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = `${cipher.update(value, "utf8", "base64url")}${cipher.final("base64url")}`;
  const tag = cipher.getAuthTag().toString("base64url");
  return `${Buffer.from(iv).toString("base64url")}.${tag}.${encrypted}`;
}

function decryptSensitive(payload: string): string {
  const [ivRaw, tagRaw, cipherRaw] = String(payload || "").split(".");
  if (!ivRaw || !tagRaw || !cipherRaw) {
    throw new Error("OPENCLAW_PAIRING_DECRYPT_INVALID_PAYLOAD");
  }
  const iv = Uint8Array.from(Buffer.from(ivRaw, "base64url"));
  const tag = Uint8Array.from(Buffer.from(tagRaw, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(tag);
  return `${decipher.update(cipherRaw, "base64url", "utf8")}${decipher.final("utf8")}`;
}

function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

function randomSessionToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

type PairingStoreDelegates = {
  openClawPairingRequest: any;
  openClawPairingCode: any;
  openClawPairingSession: any;
};

function pairingStore(client: Prisma.TransactionClient | typeof prisma): PairingStoreDelegates {
  return client as unknown as PairingStoreDelegates;
}

async function ensurePairingTables(): Promise<void> {
  if (ensurePairingTablesPromise) return ensurePairingTablesPromise;

  ensurePairingTablesPromise = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "openclaw_pairing_requests" (
        "code" TEXT PRIMARY KEY,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "openclaw_pairing_codes" (
        "code" TEXT PRIMARY KEY,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "gatewayUrl" TEXT NOT NULL,
        "gatewayTokenEnc" TEXT NOT NULL,
        "agentName" TEXT NOT NULL,
        "maxClaims" INTEGER NOT NULL DEFAULT 1,
        "claimsUsed" INTEGER NOT NULL DEFAULT 0
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "openclaw_pairing_sessions" (
        "tokenHash" TEXT PRIMARY KEY,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "gatewayUrl" TEXT NOT NULL,
        "gatewayTokenEnc" TEXT NOT NULL,
        "agentName" TEXT NOT NULL
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "openclaw_pairing_requests_expiresAt_idx"
      ON "openclaw_pairing_requests" ("expiresAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "openclaw_pairing_codes_expiresAt_idx"
      ON "openclaw_pairing_codes" ("expiresAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "openclaw_pairing_sessions_expiresAt_idx"
      ON "openclaw_pairing_sessions" ("expiresAt");
    `);
  })().catch((error) => {
    ensurePairingTablesPromise = null;
    throw error;
  });

  return ensurePairingTablesPromise;
}

async function pruneExpiredRecords(tx: Prisma.TransactionClient, now: Date): Promise<void> {
  const db = pairingStore(tx);
  await Promise.all([
    db.openClawPairingRequest.deleteMany({
      where: { expiresAt: { lte: now } },
    }),
    db.openClawPairingCode.deleteMany({
      where: {
        OR: [{ expiresAt: { lte: now } }, { claimsUsed: { gte: 1 }, maxClaims: 1 }],
      },
    }),
    db.openClawPairingSession.deleteMany({
      where: { expiresAt: { lte: now } },
    }),
  ]);
}

async function generateUniqueCode(tx: Prisma.TransactionClient): Promise<string> {
  const db = pairingStore(tx);
  for (let i = 0; i < 40; i += 1) {
    const code = randomCode(8);
    const [request, pairing] = await Promise.all([
      db.openClawPairingRequest.findUnique({ where: { code }, select: { code: true } }),
      db.openClawPairingCode.findUnique({ where: { code }, select: { code: true } }),
    ]);
    if (!request && !pairing) return code;
  }
  throw new Error("OPENCLAW_PAIRING_CODE_COLLISION");
}

async function createPairingRecord(args: {
  tx: Prisma.TransactionClient;
  nowMs: number;
  gatewayUrl: string;
  gatewayToken: string;
  agentName: string;
  ttlSeconds: number;
  maxClaims: number;
}): Promise<{ code: string; expiresAt: string; agentName: string }> {
  const db = pairingStore(args.tx);
  const code = await generateUniqueCode(args.tx);
  const expiresAtMs = args.nowMs + args.ttlSeconds * 1000;
  await db.openClawPairingCode.create({
    data: {
      code,
      createdAt: new Date(args.nowMs),
      expiresAt: new Date(expiresAtMs),
      gatewayUrl: args.gatewayUrl,
      gatewayTokenEnc: encryptSensitive(args.gatewayToken),
      agentName: args.agentName,
      maxClaims: args.maxClaims,
      claimsUsed: 0,
    },
  });
  return { code, expiresAt: toIso(expiresAtMs), agentName: args.agentName };
}

export async function createOpenClawPairingRequest(args?: {
  ttlSeconds?: number;
}): Promise<{ requestCode: string; expiresAt: string; ttlSeconds: number }> {
  await ensurePairingTables();
  const ttlSeconds = clampInt(
    args?.ttlSeconds,
    DEFAULT_PAIRING_REQUEST_TTL_SECONDS,
    60,
    30 * 60,
  );

  return prisma.$transaction(async (tx) => {
    const db = pairingStore(tx);
    const now = Date.now();
    await pruneExpiredRecords(tx, new Date(now));
    const requestCode = await generateUniqueCode(tx);
    const expiresAtMs = now + ttlSeconds * 1000;
    await db.openClawPairingRequest.create({
      data: {
        code: requestCode,
        createdAt: new Date(now),
        expiresAt: new Date(expiresAtMs),
      },
    });
    return {
      requestCode,
      expiresAt: toIso(expiresAtMs),
      ttlSeconds,
    };
  });
}

export async function createOpenClawPairingCode(args: {
  gatewayUrl: string;
  gatewayToken: string;
  agentName?: string;
  ttlSeconds?: number;
  maxClaims?: number;
}): Promise<{ code: string; expiresAt: string; agentName: string }> {
  await ensurePairingTables();
  const gatewayUrl = normalizeOpenClawGatewayUrl(args.gatewayUrl);
  const gatewayToken = sanitizeToken(args.gatewayToken);
  if (!gatewayToken) {
    throw new Error("OPENCLAW_MISSING_TOKEN");
  }
  const agentName = sanitizeOpenClawAgentName(args.agentName, "web-mochi-1");
  const ttlSeconds = clampInt(args.ttlSeconds, DEFAULT_PAIRING_TTL_SECONDS, 60, 24 * 60 * 60);
  const maxClaims = clampInt(args.maxClaims, 1, 1, 25);

  return prisma.$transaction(async (tx) => {
    const now = Date.now();
    await pruneExpiredRecords(tx, new Date(now));
    return createPairingRecord({
      tx,
      nowMs: now,
      gatewayUrl,
      gatewayToken,
      agentName,
      ttlSeconds,
      maxClaims,
    });
  });
}

export async function createOpenClawPairingCodeFromRequest(args: {
  requestCode: string;
  gatewayUrl: string;
  gatewayToken: string;
  agentName?: string;
  ttlSeconds?: number;
  maxClaims?: number;
}): Promise<PairingIssueFromRequestResult> {
  await ensurePairingTables();
  const requestCode = sanitizePairingCode(args.requestCode);
  if (!requestCode) {
    return { ok: false, reason: "invalid_request_code" };
  }

  const gatewayUrl = normalizeOpenClawGatewayUrl(args.gatewayUrl);
  const gatewayToken = sanitizeToken(args.gatewayToken);
  if (!gatewayToken) {
    throw new Error("OPENCLAW_MISSING_TOKEN");
  }
  const agentName = sanitizeOpenClawAgentName(args.agentName, "web-mochi-1");
  const ttlSeconds = clampInt(args.ttlSeconds, DEFAULT_PAIRING_TTL_SECONDS, 60, 24 * 60 * 60);
  const maxClaims = clampInt(args.maxClaims, 1, 1, 25);

  return prisma.$transaction(async (tx) => {
    const db = pairingStore(tx);
    const now = Date.now();
    await pruneExpiredRecords(tx, new Date(now));

    const request = await db.openClawPairingRequest.findUnique({
      where: { code: requestCode },
    });
    if (!request) {
      return { ok: false, reason: "invalid_request_code" as const };
    }
    if (request.expiresAt.getTime() <= now) {
      await db.openClawPairingRequest.delete({ where: { code: requestCode } }).catch(() => undefined);
      return { ok: false, reason: "expired_request_code" as const };
    }

    try {
      await db.openClawPairingRequest.delete({ where: { code: requestCode } });
    } catch (error) {
      if (isNotFoundError(error)) {
        return { ok: false, reason: "invalid_request_code" as const };
      }
      throw error;
    }

    const created = await createPairingRecord({
      tx,
      nowMs: now,
      gatewayUrl,
      gatewayToken,
      agentName,
      ttlSeconds,
      maxClaims,
    });

    return {
      ok: true,
      ...created,
      maxClaims,
      ttlSeconds,
    };
  });
}

export async function claimOpenClawPairingCode(args: {
  code: string;
  sessionTtlSeconds?: number;
}): Promise<PairingClaimResult> {
  await ensurePairingTables();
  const rawCode = sanitizePairingCode(args.code);
  if (!rawCode) {
    return { ok: false, reason: "invalid_code" };
  }

  const sessionTtlSeconds = clampInt(
    args.sessionTtlSeconds,
    DEFAULT_SESSION_TTL_SECONDS,
    300,
    60 * 24 * 60 * 60,
  );

  return prisma.$transaction(async (tx) => {
    const db = pairingStore(tx);
    const now = Date.now();
    await pruneExpiredRecords(tx, new Date(now));

    const pairing = await db.openClawPairingCode.findUnique({ where: { code: rawCode } });
    if (!pairing) {
      return { ok: false, reason: "invalid_code" as const };
    }

    if (pairing.expiresAt.getTime() <= now) {
      await db.openClawPairingCode.delete({ where: { code: rawCode } }).catch(() => undefined);
      return { ok: false, reason: "expired_code" as const };
    }

    if (pairing.claimsUsed >= pairing.maxClaims) {
      await db.openClawPairingCode.delete({ where: { code: rawCode } }).catch(() => undefined);
      return { ok: false, reason: "max_claims_reached" as const };
    }

    const incrementResult = await db.openClawPairingCode.updateMany({
      where: {
        code: rawCode,
        claimsUsed: pairing.claimsUsed,
      },
      data: {
        claimsUsed: {
          increment: 1,
        },
      },
    });
    if (incrementResult.count !== 1) {
      const latest = await db.openClawPairingCode.findUnique({ where: { code: rawCode } });
      if (!latest) return { ok: false, reason: "invalid_code" as const };
      if (latest.expiresAt.getTime() <= now) return { ok: false, reason: "expired_code" as const };
      return { ok: false, reason: "max_claims_reached" as const };
    }

    const claimsUsed = pairing.claimsUsed + 1;
    if (claimsUsed >= pairing.maxClaims) {
      await db.openClawPairingCode.delete({ where: { code: rawCode } }).catch(() => undefined);
    }

    const expiresAtMs = now + sessionTtlSeconds * 1000;
    let sessionToken = "";
    for (let i = 0; i < 6; i += 1) {
      const candidate = randomSessionToken();
      const tokenHash = hashSessionToken(candidate);
      try {
        await db.openClawPairingSession.create({
          data: {
            tokenHash,
            createdAt: new Date(now),
            expiresAt: new Date(expiresAtMs),
            gatewayUrl: pairing.gatewayUrl,
            gatewayTokenEnc: pairing.gatewayTokenEnc,
            agentName: pairing.agentName,
          },
        });
        sessionToken = candidate;
        break;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          continue;
        }
        throw error;
      }
    }
    if (!sessionToken) {
      throw new Error("OPENCLAW_PAIRING_SESSION_CREATE_FAILED");
    }

    return {
      ok: true,
      sessionToken,
      sessionExpiresAt: toIso(expiresAtMs),
      agentName: pairing.agentName,
    };
  });
}

export async function resolveOpenClawPairingSession(sessionToken: string): Promise<ResolveSessionResult> {
  await ensurePairingTables();
  const token = sanitizeToken(sessionToken, 2048);
  if (!token) {
    return { ok: false, reason: "invalid_session" };
  }

  const tokenHash = hashSessionToken(token);
  const now = Date.now();

  const db = pairingStore(prisma);
  const session = await db.openClawPairingSession.findUnique({
    where: { tokenHash },
  });
  if (!session) {
    return { ok: false, reason: "invalid_session" };
  }
  if (session.expiresAt.getTime() <= now) {
    await db.openClawPairingSession.delete({ where: { tokenHash } }).catch(() => undefined);
    return { ok: false, reason: "expired_session" };
  }

  let gatewayToken = "";
  try {
    gatewayToken = decryptSensitive(session.gatewayTokenEnc);
  } catch {
    await db.openClawPairingSession.delete({ where: { tokenHash } }).catch(() => undefined);
    return { ok: false, reason: "invalid_session" };
  }

  return {
    ok: true,
    gatewayUrl: session.gatewayUrl,
    gatewayToken,
    agentName: session.agentName,
    sessionExpiresAt: session.expiresAt.toISOString(),
  };
}
