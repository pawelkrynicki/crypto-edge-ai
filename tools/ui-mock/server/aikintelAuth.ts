import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Pc1SessionContext } from "./lifecycleSession.js";

export const AIKINTEL_AUTH_MODE = "AIKINTEL" as const;
export const AIKINTEL_AUTH_STATE_SCHEMA_VERSION = "aikintel_auth_state_v1" as const;
export const AIKINTEL_SESSION_COOKIE = "crypto_edge_aikintel_session" as const;
export const AIKINTEL_DEFAULT_ISSUER = "aikintel" as const;
export const AIKINTEL_DEFAULT_AUDIENCE = "crypto-edge" as const;
export const AIKINTEL_LAUNCH_TTL_SECONDS = 60;
export const AIKINTEL_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const JTI_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_SUBJECT_LENGTH = 256;
const MAX_LAUNCH_TTL_SECONDS = 300;

export type ProductAuthMode = "CAMP" | typeof AIKINTEL_AUTH_MODE;

export type AikintelLaunchPayload = {
  version: "aikintel_launch_v1";
  issuer: string;
  audience: string;
  subject: string;
  issued_at: number;
  expires_at: number;
  jti: string;
};

export type AikintelAuthOptions = {
  ssoSecret?: string;
  actorKey?: string;
  statePath?: string;
  issuer?: string;
  audience?: string;
  launchTtlSeconds?: number;
  sessionMaxAgeSeconds?: number;
  cookieSecure?: boolean;
  now?: () => number;
};

export class AikintelAuthError extends Error {
  readonly code:
    | "AIKINTEL_AUTH_CONFIG_INVALID"
    | "AIKINTEL_AUTH_STATE_UNAVAILABLE"
    | "AIKINTEL_CREDENTIAL_INVALID"
    | "AIKINTEL_CREDENTIAL_EXPIRED"
    | "AIKINTEL_CREDENTIAL_FUTURE"
    | "AIKINTEL_CREDENTIAL_REPLAY"
    | "AIKINTEL_SESSION_INVALID";
  readonly httpStatus: number;

  constructor(code: AikintelAuthError["code"], httpStatus: number) {
    super(code);
    this.name = "AikintelAuthError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

type AikintelAuthState = {
  schema_version: typeof AIKINTEL_AUTH_STATE_SCHEMA_VERSION;
  replays: Record<string, { expires_at: number; used_at: number }>;
  sessions: Record<string, { actor_id: string; expires_at: number; created_at: number }>;
};

export function resolveProductAuthMode(value: string | undefined): ProductAuthMode {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || normalized === "CAMP" || normalized === "DEFAULT") return "CAMP";
  if (normalized === AIKINTEL_AUTH_MODE) return AIKINTEL_AUTH_MODE;
  throw new AikintelAuthError("AIKINTEL_AUTH_CONFIG_INVALID", 503);
}

export function createAikintelLaunchCredential(
  input: { subject: string; issuer?: string; audience?: string; issuedAt?: number; expiresAt?: number; jti?: string },
  secret: string,
): string {
  const normalizedSecret = requireSecret(secret);
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1_000);
  const expiresAt = input.expiresAt ?? issuedAt + AIKINTEL_LAUNCH_TTL_SECONDS;
  const payload: AikintelLaunchPayload = {
    version: "aikintel_launch_v1",
    issuer: input.issuer ?? AIKINTEL_DEFAULT_ISSUER,
    audience: input.audience ?? AIKINTEL_DEFAULT_AUDIENCE,
    subject: requireSubject(input.subject),
    issued_at: issuedAt,
    expires_at: expiresAt,
    jti: input.jti ?? randomUUID(),
  };
  const encodedPayload = encodeJson(payload);
  return `${encodedPayload}.${sign(encodedPayload, normalizedSecret)}`;
}

export function createAikintelAuthService(options: AikintelAuthOptions = {}) {
  const secret = requireSecret(options.ssoSecret ?? process.env.CRYPTO_EDGE_AIKINTEL_SSO_SECRET);
  const actorKey = requireSecret(options.actorKey ?? process.env.CRYPTO_EDGE_AIKINTEL_ACTOR_KEY);
  const statePath = resolveStatePath(options.statePath ?? process.env.CRYPTO_EDGE_AIKINTEL_AUTH_STATE_PATH);
  const issuer = options.issuer ?? process.env.CRYPTO_EDGE_AIKINTEL_ISSUER ?? AIKINTEL_DEFAULT_ISSUER;
  const audience = options.audience ?? process.env.CRYPTO_EDGE_AIKINTEL_AUDIENCE ?? AIKINTEL_DEFAULT_AUDIENCE;
  const launchTtlSeconds = boundedInteger(options.launchTtlSeconds ?? Number(process.env.CRYPTO_EDGE_AIKINTEL_LAUNCH_TTL_SECONDS ?? AIKINTEL_LAUNCH_TTL_SECONDS), 1, MAX_LAUNCH_TTL_SECONDS);
  const sessionMaxAgeSeconds = boundedInteger(options.sessionMaxAgeSeconds ?? AIKINTEL_SESSION_MAX_AGE_SECONDS, 60, 365 * 24 * 60 * 60);
  const cookieSecure = options.cookieSecure ?? process.env.CRYPTO_EDGE_AIKINTEL_COOKIE_SECURE === "1";
  const now = options.now ?? (() => Math.floor(Date.now() / 1_000));

  return {
    statePath,

    resolve(req: IncomingMessage): { context: Pc1SessionContext } | null {
      const token = readCookie(req.headers.cookie, AIKINTEL_SESSION_COOKIE);
      if (!token) return null;
      const state = readState(statePath);
      const session = state.sessions[hash(token)];
      if (!session || session.expires_at <= now()) return null;
      return { context: campUserContext(session.actor_id, sessionId(token)) };
    },

    exchange(req: IncomingMessage, credential: string): { context: Pc1SessionContext; setCookie: string } {
      const current = now();
      const payload = verifyCredential(credential, secret, { issuer, audience, now: current, launchTtlSeconds });
      const actorId = actorIdForSubject(payload.subject, actorKey);
      const sessionToken = randomBytes(32).toString("base64url");
      const state = readState(statePath);
      pruneExpired(state, current);
      if (state.replays[payload.jti]) throw new AikintelAuthError("AIKINTEL_CREDENTIAL_REPLAY", 401);
      state.replays[payload.jti] = { expires_at: payload.expires_at, used_at: current };
      state.sessions[hash(sessionToken)] = {
        actor_id: actorId,
        expires_at: current + sessionMaxAgeSeconds,
        created_at: current,
      };
      writeStateAtomic(statePath, state);
      return {
        context: campUserContext(actorId, sessionId(sessionToken)),
        setCookie: sessionCookie(sessionToken, sessionMaxAgeSeconds, cookieSecure || requestIsSecure(req)),
      };
    },

    actorIdForSubject(subject: string): string {
      return actorIdForSubject(requireSubject(subject), actorKey);
    },
  };
}

function verifyCredential(
  credential: string,
  secret: string,
  options: { issuer: string; audience: string; now: number; launchTtlSeconds: number },
): AikintelLaunchPayload {
  if (typeof credential !== "string" || credential.length > 8_192) throw new AikintelAuthError("AIKINTEL_CREDENTIAL_INVALID", 401);
  const [encodedPayload, encodedSignature, extra] = credential.split(".");
  if (extra !== undefined || !encodedPayload || !encodedSignature) throw new AikintelAuthError("AIKINTEL_CREDENTIAL_INVALID", 401);
  let expectedSignature: Buffer;
  let providedSignature: Buffer;
  let value: unknown;
  try {
    expectedSignature = Buffer.from(sign(encodedPayload, secret), "base64url");
    providedSignature = Buffer.from(encodedSignature, "base64url");
    value = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new AikintelAuthError("AIKINTEL_CREDENTIAL_INVALID", 401);
  }
  if (expectedSignature.length !== providedSignature.length || !timingSafeEqual(expectedSignature, providedSignature)) {
    throw new AikintelAuthError("AIKINTEL_CREDENTIAL_INVALID", 401);
  }
  if (!isRecord(value)
    || value.version !== "aikintel_launch_v1"
    || value.issuer !== options.issuer
    || value.audience !== options.audience
    || value.role !== undefined
    || value.capabilities !== undefined
    || typeof value.subject !== "string"
    || typeof value.issued_at !== "number"
    || typeof value.expires_at !== "number"
    || typeof value.jti !== "string") {
    throw new AikintelAuthError("AIKINTEL_CREDENTIAL_INVALID", 401);
  }
  const payload: AikintelLaunchPayload = {
    version: "aikintel_launch_v1",
    issuer: value.issuer,
    audience: value.audience,
    subject: requireSubject(value.subject),
    issued_at: requireTimestamp(value.issued_at),
    expires_at: requireTimestamp(value.expires_at),
    jti: requireJti(value.jti),
  };
  if (payload.issued_at > options.now) throw new AikintelAuthError("AIKINTEL_CREDENTIAL_FUTURE", 401);
  if (payload.expires_at <= options.now) throw new AikintelAuthError("AIKINTEL_CREDENTIAL_EXPIRED", 401);
  if (payload.expires_at <= payload.issued_at || payload.expires_at - payload.issued_at > options.launchTtlSeconds) {
    throw new AikintelAuthError("AIKINTEL_CREDENTIAL_INVALID", 401);
  }
  return payload;
}

function actorIdForSubject(subject: string, actorKey: string): string {
  return `aikintel-${createHmac("sha256", actorKey).update(subject, "utf8").digest("hex")}`;
}

function campUserContext(actorId: string, sessionIdValue: string): Pc1SessionContext {
  return {
    actor_id: actorId,
    role: "CAMP_USER",
    capabilities: ["CAMP_USER_WORKSPACE_WRITE"],
    session_id: sessionIdValue,
  };
}

function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  return [
    `${AIKINTEL_SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const value of header.split(";")) {
    const [key, raw] = value.trim().split("=", 2);
    if (key === name && raw && SESSION_TOKEN_PATTERN.test(raw)) return raw;
  }
  return null;
}

function requestIsSecure(req: IncomingMessage): boolean {
  return Boolean((req.socket as (IncomingMessage["socket"] & { encrypted?: boolean }) | null | undefined)?.encrypted)
    || req.headers["x-forwarded-proto"] === "https";
}

function resolveStatePath(value: string | undefined): string {
  if (!value?.trim() || !isAbsolute(value.trim())) throw new AikintelAuthError("AIKINTEL_AUTH_CONFIG_INVALID", 503);
  return resolve(value.trim());
}

function readState(path: string): AikintelAuthState {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return emptyState();
    throw new AikintelAuthError("AIKINTEL_AUTH_STATE_UNAVAILABLE", 503);
  }
  try {
    const value = JSON.parse(source) as unknown;
    if (!isRecord(value) || value.schema_version !== AIKINTEL_AUTH_STATE_SCHEMA_VERSION || !isRecord(value.replays) || !isRecord(value.sessions)) throw new Error("invalid");
    return { schema_version: AIKINTEL_AUTH_STATE_SCHEMA_VERSION, replays: normalizeReplays(value.replays), sessions: normalizeSessions(value.sessions) };
  } catch (error) {
    if (error instanceof AikintelAuthError) throw error;
    throw new AikintelAuthError("AIKINTEL_AUTH_STATE_UNAVAILABLE", 503);
  }
}

function writeStateAtomic(path: string, state: AikintelAuthState): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, path);
  } catch {
    try { rmSync(temporary, { force: true }); } catch { /* preserve storage error */ }
    throw new AikintelAuthError("AIKINTEL_AUTH_STATE_UNAVAILABLE", 503);
  }
}

function pruneExpired(state: AikintelAuthState, now: number): void {
  for (const [jti, replay] of Object.entries(state.replays)) if (replay.expires_at <= now) delete state.replays[jti];
  for (const [sessionHash, session] of Object.entries(state.sessions)) if (session.expires_at <= now) delete state.sessions[sessionHash];
}

function normalizeReplays(value: Record<string, unknown>): AikintelAuthState["replays"] {
  const result: AikintelAuthState["replays"] = {};
  for (const [jti, raw] of Object.entries(value)) {
    if (!JTI_PATTERN.test(jti) || !isRecord(raw) || !Number.isSafeInteger(raw.expires_at) || !Number.isSafeInteger(raw.used_at)) throw new AikintelAuthError("AIKINTEL_AUTH_STATE_UNAVAILABLE", 503);
    result[jti] = { expires_at: Number(raw.expires_at), used_at: Number(raw.used_at) };
  }
  return result;
}

function normalizeSessions(value: Record<string, unknown>): AikintelAuthState["sessions"] {
  const result: AikintelAuthState["sessions"] = {};
  for (const [sessionHash, raw] of Object.entries(value)) {
    if (!/^sha256:[a-f0-9]{64}$/.test(sessionHash) || !isRecord(raw) || typeof raw.actor_id !== "string" || !/^aikintel-[a-f0-9]{64}$/.test(raw.actor_id) || !Number.isSafeInteger(raw.expires_at) || !Number.isSafeInteger(raw.created_at)) throw new AikintelAuthError("AIKINTEL_AUTH_STATE_UNAVAILABLE", 503);
    result[sessionHash] = { actor_id: raw.actor_id, expires_at: Number(raw.expires_at), created_at: Number(raw.created_at) };
  }
  return result;
}

function emptyState(): AikintelAuthState {
  return { schema_version: AIKINTEL_AUTH_STATE_SCHEMA_VERSION, replays: {}, sessions: {} };
}

function requireSecret(value: string | undefined): string {
  if (typeof value !== "string" || value.trim().length < 32 || value.trim().length > 512) throw new AikintelAuthError("AIKINTEL_AUTH_CONFIG_INVALID", 503);
  return value.trim();
}

function requireSubject(value: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_SUBJECT_LENGTH || value.trim() !== value || [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  })) throw new AikintelAuthError("AIKINTEL_CREDENTIAL_INVALID", 401);
  return value;
}

function requireTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new AikintelAuthError("AIKINTEL_CREDENTIAL_INVALID", 401);
  return value;
}

function requireJti(value: string): string {
  if (!JTI_PATTERN.test(value)) throw new AikintelAuthError("AIKINTEL_CREDENTIAL_INVALID", 401);
  return value;
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new AikintelAuthError("AIKINTEL_AUTH_CONFIG_INVALID", 503);
  return value;
}

function encodeJson(value: unknown): string { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); }
function sign(value: string, secret: string): string { return createHmac("sha256", secret).update(value, "utf8").digest("base64url"); }
function hash(value: string): string { return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`; }
function sessionId(value: string): string { return `aikintel-session-${hash(value).slice("sha256:".length, "sha256:".length + 32)}`; }
function isMissing(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
