import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sanitizeOpenClawAgentName } from "@/lib/site-mochi-openclaw-protocol";
import type { OpenClawChatRequestMessage } from "@/lib/site-mochi-openclaw-protocol";

const DEFAULT_RELAY_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_RELAY_CODE_TTL_SECONDS = 10 * 60;
const DEFAULT_JOB_TTL_SECONDS = 5 * 60;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let ensureRelayTablesPromise: Promise<void> | null = null;

export type RelayClaimResult =
  | {
      ok: true;
      sessionToken: string;
      sessionExpiresAt: string;
      agentName: string;
      relayTokenHash: string;
    }
  | { ok: false; reason: "invalid_code" | "expired_code" | "max_claims_reached" };

export type ResolveRelaySessionResult =
  | { ok: true; relayTokenHash: string; agentName: string; sessionExpiresAt: string }
  | { ok: false; reason: "invalid_session" | "expired_session" };

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function randomCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

function randomJobId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function ensureRelayTables(): Promise<void> {
  if (ensureRelayTablesPromise) return ensureRelayTablesPromise;

  ensureRelayTablesPromise = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "openclaw_relay_sessions" (
        "relayTokenHash" TEXT PRIMARY KEY,
        "agentName" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "openclaw_relay_codes" (
        "code" TEXT PRIMARY KEY,
        "relayTokenHash" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "claimsUsed" INTEGER NOT NULL DEFAULT 0
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "openclaw_relay_web_sessions" (
        "tokenHash" TEXT PRIMARY KEY,
        "relayTokenHash" TEXT NOT NULL,
        "agentName" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "openclaw_relay_jobs" (
        "jobId" TEXT PRIMARY KEY,
        "relayTokenHash" TEXT NOT NULL,
        "agentName" TEXT NOT NULL DEFAULT '',
        "messages" TEXT NOT NULL,
        "response" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "openclaw_relay_sessions_expiresAt_idx"
      ON "openclaw_relay_sessions" ("expiresAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "openclaw_relay_codes_expiresAt_idx"
      ON "openclaw_relay_codes" ("expiresAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "openclaw_relay_web_sessions_expiresAt_idx"
      ON "openclaw_relay_web_sessions" ("expiresAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "openclaw_relay_jobs_expiresAt_idx"
      ON "openclaw_relay_jobs" ("expiresAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "openclaw_relay_jobs_relay_response_idx"
      ON "openclaw_relay_jobs" ("relayTokenHash", "response");
    `);
  })().catch((error) => {
    ensureRelayTablesPromise = null;
    throw error;
  });

  return ensureRelayTablesPromise;
}

async function generateUniqueRelayCode(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const code = randomCode(8);
    const existing = await prisma.$queryRawUnsafe<Array<{ code: string }>>(
      `SELECT "code" FROM "openclaw_relay_codes" WHERE "code" = $1`,
      code,
    );
    if (!existing.length) return code;
  }
  throw new Error("OPENCLAW_RELAY_CODE_COLLISION");
}

export async function registerRelaySession(args: {
  requestCode: string;
  agentName?: string;
}): Promise<
  | { ok: true; relayToken: string; pairingCode: string }
  | { ok: false; reason: "invalid_request_code" | "expired_request_code" }
> {
  await ensureRelayTables();

  const requestCode = String(args.requestCode || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  if (!requestCode) {
    return { ok: false, reason: "invalid_request_code" };
  }

  const agentName = sanitizeOpenClawAgentName(args.agentName, "main");
  const now = Date.now();

  const requests = await prisma.$queryRawUnsafe<Array<{ code: string; expiresAt: Date }>>(
    `SELECT "code", "expiresAt" FROM "openclaw_pairing_requests" WHERE "code" = $1`,
    requestCode,
  );
  if (!requests.length) {
    return { ok: false, reason: "invalid_request_code" };
  }

  if (new Date(requests[0].expiresAt).getTime() <= now) {
    await prisma
      .$executeRawUnsafe(`DELETE FROM "openclaw_pairing_requests" WHERE "code" = $1`, requestCode)
      .catch(() => undefined);
    return { ok: false, reason: "expired_request_code" };
  }

  const deletedCount = await prisma.$executeRawUnsafe(
    `DELETE FROM "openclaw_pairing_requests" WHERE "code" = $1`,
    requestCode,
  );
  if (!deletedCount) {
    return { ok: false, reason: "invalid_request_code" };
  }

  const relayToken = randomToken();
  const relayTokenHash = hashToken(relayToken);
  const pairingCode = await generateUniqueRelayCode();
  const relaySessionExpiresAt = new Date(now + DEFAULT_RELAY_SESSION_TTL_SECONDS * 1000);
  const relayCodeExpiresAt = new Date(now + DEFAULT_RELAY_CODE_TTL_SECONDS * 1000);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "openclaw_relay_sessions" ("relayTokenHash", "agentName", "createdAt", "expiresAt") VALUES ($1, $2, $3, $4)`,
    relayTokenHash,
    agentName,
    new Date(now),
    relaySessionExpiresAt,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO "openclaw_relay_codes" ("code", "relayTokenHash", "createdAt", "expiresAt", "claimsUsed") VALUES ($1, $2, $3, $4, 0)`,
    pairingCode,
    relayTokenHash,
    new Date(now),
    relayCodeExpiresAt,
  );

  return { ok: true, relayToken, pairingCode };
}

export async function claimRelayCode(args: {
  code: string;
  sessionTtlSeconds?: number;
}): Promise<RelayClaimResult> {
  await ensureRelayTables();

  const code = String(args.code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  if (!code) {
    return { ok: false, reason: "invalid_code" };
  }

  const sessionTtlSeconds = Math.max(
    300,
    Math.min(60 * 24 * 60 * 60, Math.round(Number(args.sessionTtlSeconds) || 7 * 24 * 60 * 60)),
  );
  const now = Date.now();

  const codes = await prisma.$queryRawUnsafe<
    Array<{ code: string; relayTokenHash: string; expiresAt: Date; claimsUsed: number }>
  >(
    `SELECT "code", "relayTokenHash", "expiresAt", "claimsUsed" FROM "openclaw_relay_codes" WHERE "code" = $1`,
    code,
  );
  if (!codes.length) {
    return { ok: false, reason: "invalid_code" };
  }

  const relayCode = codes[0];
  if (new Date(relayCode.expiresAt).getTime() <= now) {
    await prisma
      .$executeRawUnsafe(`DELETE FROM "openclaw_relay_codes" WHERE "code" = $1`, code)
      .catch(() => undefined);
    return { ok: false, reason: "expired_code" };
  }

  if (relayCode.claimsUsed >= 1) {
    return { ok: false, reason: "max_claims_reached" };
  }

  const sessions = await prisma.$queryRawUnsafe<Array<{ agentName: string }>>(
    `SELECT "agentName" FROM "openclaw_relay_sessions" WHERE "relayTokenHash" = $1`,
    relayCode.relayTokenHash,
  );
  if (!sessions.length) {
    await prisma
      .$executeRawUnsafe(`DELETE FROM "openclaw_relay_codes" WHERE "code" = $1`, code)
      .catch(() => undefined);
    return { ok: false, reason: "invalid_code" };
  }

  const agentName = sessions[0].agentName;

  await prisma
    .$executeRawUnsafe(`DELETE FROM "openclaw_relay_codes" WHERE "code" = $1`, code)
    .catch(() => undefined);

  const sessionToken = randomToken();
  const tokenHash = hashToken(sessionToken);
  const expiresAtMs = now + sessionTtlSeconds * 1000;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "openclaw_relay_web_sessions" ("tokenHash", "relayTokenHash", "agentName", "createdAt", "expiresAt") VALUES ($1, $2, $3, $4, $5)`,
    tokenHash,
    relayCode.relayTokenHash,
    agentName,
    new Date(now),
    new Date(expiresAtMs),
  );

  return {
    ok: true,
    sessionToken,
    sessionExpiresAt: toIso(expiresAtMs),
    agentName,
    relayTokenHash: relayCode.relayTokenHash,
  };
}

export async function resolveOpenClawRelayWebSession(
  sessionToken: string,
): Promise<ResolveRelaySessionResult> {
  await ensureRelayTables();

  const token = String(sessionToken || "").trim().slice(0, 2048);
  if (!token) {
    return { ok: false, reason: "invalid_session" };
  }

  const tokenHash = hashToken(token);
  const now = Date.now();

  const sessions = await prisma.$queryRawUnsafe<
    Array<{ relayTokenHash: string; agentName: string; expiresAt: Date }>
  >(
    `SELECT "relayTokenHash", "agentName", "expiresAt" FROM "openclaw_relay_web_sessions" WHERE "tokenHash" = $1`,
    tokenHash,
  );
  if (!sessions.length) {
    return { ok: false, reason: "invalid_session" };
  }

  const session = sessions[0];
  if (new Date(session.expiresAt).getTime() <= now) {
    await prisma
      .$executeRawUnsafe(
        `DELETE FROM "openclaw_relay_web_sessions" WHERE "tokenHash" = $1`,
        tokenHash,
      )
      .catch(() => undefined);
    return { ok: false, reason: "expired_session" };
  }

  return {
    ok: true,
    relayTokenHash: session.relayTokenHash,
    agentName: session.agentName,
    sessionExpiresAt: new Date(session.expiresAt).toISOString(),
  };
}

export async function createRelayJob(args: {
  relayTokenHash: string;
  messages: OpenClawChatRequestMessage[];
  agentName: string;
}): Promise<{ jobId: string }> {
  await ensureRelayTables();

  const jobId = randomJobId();
  const now = Date.now();
  const expiresAt = new Date(now + DEFAULT_JOB_TTL_SECONDS * 1000);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "openclaw_relay_jobs" ("jobId", "relayTokenHash", "agentName", "messages", "response", "createdAt", "expiresAt") VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
    jobId,
    args.relayTokenHash,
    args.agentName,
    JSON.stringify(args.messages),
    new Date(now),
    expiresAt,
  );

  return { jobId };
}

export async function pollRelayJob(args: {
  relayTokenHash: string;
  pollMs?: number;
}): Promise<{ jobId: string; messages: OpenClawChatRequestMessage[]; agentName: string } | null> {
  await ensureRelayTables();

  const pollMs = args.pollMs ?? 25_000;
  const deadline = Date.now() + pollMs;

  while (Date.now() < deadline) {
    const now = new Date();
    const jobs = await prisma.$queryRawUnsafe<
      Array<{ jobId: string; messages: string; agentName: string }>
    >(
      `SELECT "jobId", "messages", "agentName" FROM "openclaw_relay_jobs"
       WHERE "relayTokenHash" = $1 AND "response" IS NULL AND "expiresAt" > $2
       ORDER BY "createdAt" ASC LIMIT 1`,
      args.relayTokenHash,
      now,
    );

    if (jobs.length) {
      const job = jobs[0];
      const messages = JSON.parse(job.messages) as OpenClawChatRequestMessage[];
      return { jobId: job.jobId, messages, agentName: job.agentName };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return null;
}

export async function respondToRelayJob(args: {
  relayTokenHash: string;
  jobId: string;
  response: string;
}): Promise<void> {
  await ensureRelayTables();

  await prisma.$executeRawUnsafe(
    `UPDATE "openclaw_relay_jobs" SET "response" = $1 WHERE "jobId" = $2 AND "relayTokenHash" = $3`,
    args.response,
    args.jobId,
    args.relayTokenHash,
  );
}

export async function getRelayJobResponse(jobId: string): Promise<string | null> {
  await ensureRelayTables();

  const jobs = await prisma.$queryRawUnsafe<Array<{ response: string | null }>>(
    `SELECT "response" FROM "openclaw_relay_jobs" WHERE "jobId" = $1`,
    jobId,
  );

  if (!jobs.length) return null;
  return jobs[0].response;
}

export async function pollRelayJobResponse(args: {
  jobId: string;
  pollMs?: number;
}): Promise<string | null> {
  const pollMs = args.pollMs ?? 25_000;
  const deadline = Date.now() + pollMs;

  while (Date.now() < deadline) {
    const response = await getRelayJobResponse(args.jobId);
    if (response !== null) return response;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return null;
}
