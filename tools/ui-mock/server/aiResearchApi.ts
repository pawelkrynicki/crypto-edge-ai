import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { AIResearchGenerateRequest, AIResearchLocale } from "../src/types/aiResearchTypes.js";
import { resolveTokenIdentity } from "../src/tokenLifecycle.js";
import { AIResearchContextError } from "./aiResearchContext.js";
import { AIResearchServiceError, createAIResearchService, type AIResearchServiceOptions } from "./aiResearchService.js";

export const AI_RESEARCH_SESSION_COOKIE = "crypto_edge_ai_research_session";
const MAX_BODY_BYTES = 4_096;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type AIResearchService = ReturnType<typeof createAIResearchService>;

export type AIResearchApiOptions = AIResearchServiceOptions & {
  service?: AIResearchService;
  sessionSecret?: string;
};

export class AIResearchApiError extends Error {
  readonly code:
    | "JSON_CONTENT_TYPE_REQUIRED"
    | "SAME_ORIGIN_REQUIRED"
    | "BODY_TOO_LARGE"
    | "BODY_INVALID"
    | "QUERY_INVALID";
  readonly httpStatus: number;

  constructor(code: AIResearchApiError["code"], httpStatus: number) {
    super(code);
    this.name = "AIResearchApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function createAIResearchSessionManager(secretInput?: string) {
  const secret = secretInput?.trim() || process.env.CRYPTO_EDGE_AI_RESEARCH_SESSION_SECRET?.trim() || randomBytes(32).toString("hex");
  return {
    resolve(req: IncomingMessage): { sessionId: string; setCookie?: string } {
      const cookies = parseCookies(req.headers.cookie);
      const existing = verifySessionCookie(cookies[AI_RESEARCH_SESSION_COOKIE], secret);
      if (existing) return { sessionId: existing };
      const sessionId = randomUUID();
      const value = `${sessionId}.${sign(sessionId, secret)}`;
      return {
        sessionId,
        setCookie: `${AI_RESEARCH_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`,
      };
    },
  };
}

export function parseAIResearchQuery(urlValue: string | undefined): {
  chain: string;
  contract_address: string;
  locale: AIResearchLocale;
} {
  let url: URL;
  try { url = new URL(urlValue ?? "/", "http://local.invalid"); } catch { throw new AIResearchApiError("QUERY_INVALID", 400); }
  const keys = [...url.searchParams.keys()].sort();
  if (!sameKeys(keys, ["chain", "contract_address", "locale"])) throw new AIResearchApiError("QUERY_INVALID", 400);
  const chain = url.searchParams.get("chain") ?? "";
  const contractAddress = url.searchParams.get("contract_address") ?? "";
  const locale = parseLocale(url.searchParams.get("locale"));
  const identity = resolveTokenIdentity(chain, contractAddress);
  if (identity.status !== "valid") throw new AIResearchApiError("QUERY_INVALID", 400);
  return { chain: identity.chain, contract_address: identity.contract_address, locale };
}

export function parseAIResearchReviewMetricsQuery(urlValue: string | undefined): string {
  let url: URL;
  try { url = new URL(urlValue ?? "/", "http://local.invalid"); } catch { throw new AIResearchApiError("QUERY_INVALID", 400); }
  const keys = [...url.searchParams.keys()].sort();
  if (!sameKeys(keys, ["analysis_id"])) throw new AIResearchApiError("QUERY_INVALID", 400);
  const analysisId = url.searchParams.get("analysis_id");
  if (!analysisId || !/^air_[0-9a-f-]{36}$/.test(analysisId)) throw new AIResearchApiError("QUERY_INVALID", 400);
  return analysisId;
}

export async function readAIResearchGenerateRequest(req: IncomingMessage): Promise<AIResearchGenerateRequest> {
  requireAIResearchPostRequest(req);
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY_BYTES) throw new AIResearchApiError("BODY_TOO_LARGE", 413);
    chunks.push(buffer);
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AIResearchApiError("BODY_INVALID", 400); }
  if (!isRecord(value) || !sameKeys(Object.keys(value).sort(), ["chain", "contract_address", "idempotency_key", "locale"])) {
    throw new AIResearchApiError("BODY_INVALID", 400);
  }
  if (typeof value.chain !== "string" || typeof value.contract_address !== "string") throw new AIResearchApiError("BODY_INVALID", 400);
  const identity = resolveTokenIdentity(value.chain, value.contract_address);
  if (identity.status !== "valid") throw new AIResearchApiError("BODY_INVALID", 400);
  const locale = parseLocale(value.locale);
  if (typeof value.idempotency_key !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(value.idempotency_key)) {
    throw new AIResearchApiError("BODY_INVALID", 400);
  }
  return { chain: identity.chain, contract_address: identity.contract_address, locale, idempotency_key: value.idempotency_key };
}

export function requireAIResearchPostRequest(req: IncomingMessage): void {
  const contentType = req.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType.trim())) {
    throw new AIResearchApiError("JSON_CONTENT_TYPE_REQUIRED", 415);
  }
  const contentLength = req.headers["content-length"];
  if (typeof contentLength === "string" && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES) {
    throw new AIResearchApiError("BODY_TOO_LARGE", 413);
  }
  const origin = req.headers.origin;
  const host = forwardedHost(req) ?? req.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") throw new AIResearchApiError("SAME_ORIGIN_REQUIRED", 403);
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") throw new Error("protocol");
    if (originUrl.host.toLowerCase() !== host.toLowerCase()) throw new Error("host");
  } catch {
    throw new AIResearchApiError("SAME_ORIGIN_REQUIRED", 403);
  }
}

export function publicAIResearchError(error: unknown): {
  status: number;
  code: string;
  retryAfterSeconds?: number;
  cachedBrief?: unknown;
} {
  if (error instanceof AIResearchApiError || error instanceof AIResearchContextError) {
    return { status: error.httpStatus, code: error.code };
  }
  if (error instanceof AIResearchServiceError) {
    return {
      status: error.httpStatus,
      code: error.code,
      retryAfterSeconds: error.retryAfterSeconds,
      cachedBrief: error.cachedBrief,
    };
  }
  return { status: 503, code: "AI_RESEARCH_UNAVAILABLE" };
}

function parseLocale(value: unknown): AIResearchLocale {
  if (value !== "pl" && value !== "en") throw new AIResearchApiError("QUERY_INVALID", 400);
  return value;
}

function forwardedHost(req: IncomingMessage): string | null {
  const value = req.headers["x-forwarded-host"];
  return typeof value === "string" && /^[A-Za-z0-9.:[\]-]+$/.test(value) ? value : null;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    result[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return result;
}

function verifySessionCookie(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const [sessionId, signature, extra] = value.split(".");
  if (extra !== undefined || !sessionId || !signature || !/^[0-9a-f-]{36}$/.test(sessionId)) return null;
  const expected = sign(sessionId, secret);
  const left = Buffer.from(signature, "base64url");
  const right = Buffer.from(expected, "base64url");
  return left.length === right.length && timingSafeEqual(left, right) ? sessionId : null;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function sameKeys(left: string[], right: string[]): boolean {
  const sortedRight = [...right].sort();
  return left.length === sortedRight.length && left.every((value, index) => value === sortedRight[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
