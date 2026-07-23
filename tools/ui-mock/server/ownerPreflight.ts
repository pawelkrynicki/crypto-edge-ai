import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const OWNER_SESSION_HEADER = "x-crypto-edge-owner-session";
export const DEFAULT_OWNER_PREFLIGHT_TTL_MS = 60_000;

const PREFLIGHT_VERSION = 1;

export type OwnerPreflightPayload<T> = {
  v: typeof PREFLIGHT_VERSION;
  nonce: string;
  created_at: string;
  expires_at: string;
  fingerprint: string;
  context: T;
};

export class OwnerPreflightError extends Error {
  readonly code: "PREFLIGHT_INVALID";

  constructor() {
    super("PREFLIGHT_INVALID");
    this.name = "OwnerPreflightError";
    this.code = "PREFLIGHT_INVALID";
  }
}

export function createSignedOwnerPreflight<T>(options: {
  secret: string;
  fingerprint: string;
  context: T;
  now: Date;
  ttlMs?: number;
}): { preflightId: string; payload: OwnerPreflightPayload<T> } {
  const expiresAt = new Date(options.now.getTime() + normalizeOwnerPreflightTtl(options.ttlMs));
  const payload: OwnerPreflightPayload<T> = {
    v: PREFLIGHT_VERSION,
    nonce: randomUUID(),
    created_at: options.now.toISOString(),
    expires_at: expiresAt.toISOString(),
    fingerprint: options.fingerprint,
    context: options.context,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", options.secret).update(encoded).digest("base64url");
  return { preflightId: `${encoded}.${signature}`, payload };
}

export function verifySignedOwnerPreflight<T>(
  value: string,
  secret: string,
  validateContext: (value: unknown) => value is T,
): OwnerPreflightPayload<T> {
  if (typeof value !== "string" || value.length > 8_192) throw new OwnerPreflightError();
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra !== undefined) throw new OwnerPreflightError();
  const expected = createHmac("sha256", secret).update(encoded).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    throw new OwnerPreflightError();
  }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new OwnerPreflightError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new OwnerPreflightError();
  }
  if (!isOwnerPreflightPayload(parsed, validateContext)) throw new OwnerPreflightError();
  return parsed;
}

export function normalizeOwnerPreflightTtl(value: number | undefined): number {
  const ttl = value ?? DEFAULT_OWNER_PREFLIGHT_TTL_MS;
  return Number.isSafeInteger(ttl) && ttl >= 1_000 && ttl <= 5 * 60_000
    ? ttl
    : DEFAULT_OWNER_PREFLIGHT_TTL_MS;
}

export function createOwnerSessionSecret(value: string | undefined): string {
  return value !== undefined && value.length >= 32 && value.length <= 256
    ? value
    : randomBytes(32).toString("base64url");
}

export function pruneConsumedOwnerPreflights(entries: Map<string, number>, nowMs: number): void {
  for (const [id, expiresAt] of entries) {
    if (expiresAt <= nowMs) entries.delete(id);
  }
}

function isOwnerPreflightPayload<T>(
  value: unknown,
  validateContext: (value: unknown) => value is T,
): value is OwnerPreflightPayload<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 6
    && record.v === PREFLIGHT_VERSION
    && typeof record.nonce === "string"
    && /^[0-9a-f-]{36}$/.test(record.nonce)
    && isIso(record.created_at)
    && isIso(record.expires_at)
    && typeof record.fingerprint === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(record.fingerprint)
    && validateContext(record.context);
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
