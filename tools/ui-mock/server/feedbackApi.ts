import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SCREEN_CONTEXTS,
  FEEDBACK_STATUSES,
  FeedbackStoreError,
  isFeedbackCategory,
  isFeedbackScreenContext,
  isFeedbackStatus,
  type FeedbackCategory,
  type FeedbackListFilters,
  type FeedbackRecord,
  type FeedbackScreenContext,
  type FeedbackStatus,
  type FeedbackStore,
  type VerifiedFeedbackSubject,
} from "./feedbackStore.js";

export const FEEDBACK_REQUEST_HEADER = "x-crypto-edge-feedback";
export const FEEDBACK_SESSION_COOKIE = "ce_feedback_session";
export const FEEDBACK_MIN_TITLE_LENGTH = 5;
export const FEEDBACK_MAX_TITLE_LENGTH = 120;
export const FEEDBACK_MIN_DETAILS_LENGTH = 20;
export const FEEDBACK_MAX_DETAILS_LENGTH = 3_000;
export const FEEDBACK_MAX_BODY_BYTES = 16 * 1_024;
export const FEEDBACK_MAX_OWNER_PAGE_SIZE = 100;
export const FEEDBACK_MAX_EXPORT_RECORDS = 1_000;

export type FeedbackSubjectRef = {
  type: "candidate" | "follow_up" | "report";
  id: string;
};

export type FeedbackSubmission = {
  submission_key: string;
  category: FeedbackCategory;
  title: string;
  details: string;
  screen_context: FeedbackScreenContext;
  locale: "pl" | "en";
  subject_ref?: FeedbackSubjectRef;
};

export type FeedbackReceipt = {
  submission_status: "RECORDED" | "ALREADY_RECORDED";
  feedback_id: string;
  created_at: string;
  category: FeedbackCategory;
};

export type FeedbackServiceOptions = {
  store: FeedbackStore;
  runtimeMode: string;
  buildSha?: string | null;
  submissionEnabled?: boolean;
  now?: () => Date;
  sessionLimit?: number;
  globalLimit?: number;
  rateWindowMs?: number;
  resolveSubject?: (subjectRef: FeedbackSubjectRef) => Promise<VerifiedFeedbackSubject | null>;
};

export type OwnerFeedbackListQuery = {
  category?: FeedbackCategory;
  status?: FeedbackStatus;
  screen_context?: FeedbackScreenContext;
  limit: number;
  cursor?: string;
};

export class FeedbackApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryAfterSeconds?: number;

  constructor(code: string, httpStatus: number, retryAfterSeconds?: number) {
    super(code);
    this.name = "FeedbackApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function createFeedbackService(options: FeedbackServiceOptions) {
  const now = options.now ?? (() => new Date());
  const submissionEnabled = options.submissionEnabled ?? true;
  const rateWindowMs = positiveInteger(options.rateWindowMs, 10 * 60_000, 24 * 60 * 60_000);
  const sessionLimit = positiveInteger(options.sessionLimit, 5, 100_000);
  const globalLimit = positiveInteger(options.globalLimit, 100, 1_000_000);
  const sessionAttempts = new Map<string, number[]>();
  let globalAttempts: number[] = [];

  return {
    publicStatus() {
      const health = options.store.health(submissionEnabled);
      return {
        capture_available: health.storage_available,
        feedback_status: health.feedback_status,
        submission_enabled: submissionEnabled && health.storage_available,
        max_title_length: FEEDBACK_MAX_TITLE_LENGTH,
        max_details_length: FEEDBACK_MAX_DETAILS_LENGTH,
        supported_categories: [...FEEDBACK_CATEGORIES],
      };
    },

    ownerStatus() {
      return options.store.health(submissionEnabled);
    },

    async submit(value: unknown, pseudonymousSessionId: string): Promise<FeedbackReceipt> {
      const submission = validateFeedbackSubmission(value);
      if (!submissionEnabled) throw new FeedbackApiError("SUBMISSION_DISABLED", 503);
      if (!options.store.health(true).storage_available) throw new FeedbackApiError("STORAGE_UNAVAILABLE", 503);

      const existing = safeFindBySubmissionKey(options.store, submission.submission_key);
      if (existing) return duplicateReceipt(existing, pseudonymousSessionId);

      assertWithinRateLimit(
        pseudonymousSessionId,
        now().getTime(),
        sessionAttempts,
        globalAttempts,
        sessionLimit,
        globalLimit,
        rateWindowMs,
      );

      const verifiedSubject = submission.subject_ref && options.resolveSubject
        ? await options.resolveSubject(submission.subject_ref).catch(() => null)
        : null;
      const createdAt = now().toISOString();
      let captured;
      try {
        captured = options.store.capture({
          created_at: createdAt,
          category: submission.category,
          title: submission.title,
          details: submission.details,
          screen_context: submission.screen_context,
          locale: submission.locale,
          build_sha: safeBuildSha(options.buildSha),
          runtime_mode: options.runtimeMode,
          pseudonymous_session_id: pseudonymousSessionId,
          submission_key: submission.submission_key,
          candidate_identity: verifiedSubject?.candidate_identity ?? null,
          follow_up_entry_id: verifiedSubject?.follow_up_entry_id ?? null,
          report_id: verifiedSubject?.report_id ?? null,
          scanner_run_id: verifiedSubject?.scanner_run_id ?? null,
          route_context: submission.screen_context,
          viewport_class: null,
        });
      } catch (error) {
        if (error instanceof FeedbackStoreError && error.code === "CAPACITY_REACHED") {
          throw new FeedbackApiError("CAPACITY_REACHED", 503);
        }
        throw new FeedbackApiError("STORAGE_UNAVAILABLE", 503);
      }

      if (captured.created) {
        recordRateLimitAttempt(pseudonymousSessionId, now().getTime(), sessionAttempts, rateWindowMs);
        globalAttempts = pruneTimes(globalAttempts, now().getTime(), rateWindowMs);
        globalAttempts.push(now().getTime());
      }
      return receipt(captured.record, captured.created ? "RECORDED" : "ALREADY_RECORDED");
    },

    list(query: OwnerFeedbackListQuery) {
      const offset = decodeCursor(query.cursor);
      const filters: FeedbackListFilters = {
        category: query.category,
        status: query.status,
        screen_context: query.screen_context,
        limit: query.limit,
        offset,
      };
      const result = options.store.list(filters);
      return {
        feedback: result.records.map(ownerListItem),
        next_cursor: result.nextOffset === null ? null : encodeCursor(result.nextOffset),
      };
    },

    detail(feedbackId: string) {
      const record = options.store.get(feedbackId);
      return record ? ownerDetail(record) : null;
    },

    exportRecords(limit = FEEDBACK_MAX_EXPORT_RECORDS) {
      return options.store.exportRecords(Math.min(limit, FEEDBACK_MAX_EXPORT_RECORDS)).map(ownerExportItem);
    },
  };
}

export function validateFeedbackSubmission(value: unknown): FeedbackSubmission {
  if (!isRecord(value)) throw new FeedbackApiError("INVALID_BODY", 400);
  const allowed = new Set([
    "submission_key", "category", "title", "details", "screen_context", "locale", "subject_ref",
  ]);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.has(key)) || keys.length < 6 || keys.length > 7) {
    throw new FeedbackApiError("INVALID_BODY", 400);
  }
  const required = ["submission_key", "category", "title", "details", "screen_context", "locale"];
  if (required.some((key) => !Object.hasOwn(value, key))) throw new FeedbackApiError("INVALID_BODY", 400);
  if (typeof value.submission_key !== "string" || !isUuid(value.submission_key)) {
    throw new FeedbackApiError("INVALID_SUBMISSION_KEY", 400);
  }
  if (!isFeedbackCategory(value.category)) throw new FeedbackApiError("INVALID_CATEGORY", 400);
  if (!isFeedbackScreenContext(value.screen_context)) throw new FeedbackApiError("INVALID_SCREEN_CONTEXT", 400);
  if (value.locale !== "pl" && value.locale !== "en") throw new FeedbackApiError("INVALID_LOCALE", 400);

  const title = normalizeText(value.title, "TITLE", false);
  const details = normalizeText(value.details, "DETAILS", true);
  assertLength(title, FEEDBACK_MIN_TITLE_LENGTH, FEEDBACK_MAX_TITLE_LENGTH, "TITLE");
  assertLength(details, FEEDBACK_MIN_DETAILS_LENGTH, FEEDBACK_MAX_DETAILS_LENGTH, "DETAILS");
  const subjectRef = value.subject_ref === undefined ? undefined : validateSubjectRef(value.subject_ref);
  return {
    submission_key: value.submission_key.toLowerCase(),
    category: value.category,
    title,
    details,
    screen_context: value.screen_context,
    locale: value.locale,
    ...(subjectRef ? { subject_ref: subjectRef } : {}),
  };
}

export function requireFeedbackPostRequest(req: IncomingMessage): void {
  const contentType = req.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType.trim())) {
    throw new FeedbackApiError("JSON_CONTENT_TYPE_REQUIRED", 415);
  }
  if (req.headers[FEEDBACK_REQUEST_HEADER] !== "1") {
    throw new FeedbackApiError("FEEDBACK_HEADER_REQUIRED", 403);
  }
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (typeof host !== "string" || typeof origin !== "string" || !isSameOrigin(origin, host)) {
    throw new FeedbackApiError("SAME_ORIGIN_REQUIRED", 403);
  }
}

export async function readFeedbackJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > FEEDBACK_MAX_BODY_BYTES) throw new FeedbackApiError("BODY_TOO_LARGE", 413);
    chunks.push(buffer);
  }
  if (bytes === 0) throw new FeedbackApiError("INVALID_BODY", 400);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new FeedbackApiError("INVALID_BODY", 400);
  }
}

export function createFeedbackSessionManager(secret?: string) {
  const sessionSecret = typeof secret === "string" && secret.length >= 32 && secret.length <= 256
    ? secret
    : randomBytes(32).toString("base64url");
  return {
    resolve(req: IncomingMessage): { sessionId: string; setCookie?: string } {
      const signed = parseCookies(req.headers.cookie)[FEEDBACK_SESSION_COOKIE];
      const existing = signed ? verifySignedSession(signed, sessionSecret) : null;
      if (existing) return { sessionId: existing };
      const sessionId = randomUUID();
      const value = signSession(sessionId, sessionSecret);
      const secure = Boolean((req.socket as IncomingMessage["socket"] & { encrypted?: boolean }).encrypted);
      return {
        sessionId,
        setCookie: `${FEEDBACK_SESSION_COOKIE}=${value}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`,
      };
    },
  };
}

export function parseOwnerFeedbackListQuery(url: string | undefined): OwnerFeedbackListQuery {
  const parsed = parseUrl(url);
  const allowed = new Set(["category", "status", "screen_context", "limit", "cursor"]);
  if ([...parsed.searchParams.keys()].some((key) => !allowed.has(key))) {
    throw new FeedbackApiError("INVALID_QUERY", 400);
  }
  for (const key of allowed) {
    if (parsed.searchParams.getAll(key).length > 1) throw new FeedbackApiError("INVALID_QUERY", 400);
  }
  const categoryValue = parsed.searchParams.get("category");
  const statusValue = parsed.searchParams.get("status");
  const screenValue = parsed.searchParams.get("screen_context");
  const limitValue = parsed.searchParams.get("limit");
  const category = categoryValue === null ? undefined : categoryValue;
  const status = statusValue === null ? undefined : statusValue;
  const screenContext = screenValue === null ? undefined : screenValue;
  if (category !== undefined && !isFeedbackCategory(category)) throw new FeedbackApiError("INVALID_QUERY", 400);
  if (status !== undefined && !isFeedbackStatus(status)) throw new FeedbackApiError("INVALID_QUERY", 400);
  if (screenContext !== undefined && !isFeedbackScreenContext(screenContext)) throw new FeedbackApiError("INVALID_QUERY", 400);
  const limit = limitValue === null ? 50 : Number(limitValue);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > FEEDBACK_MAX_OWNER_PAGE_SIZE) {
    throw new FeedbackApiError("INVALID_QUERY", 400);
  }
  const cursor = parsed.searchParams.get("cursor") ?? undefined;
  if (cursor !== undefined) decodeCursor(cursor);
  return {
    ...(category ? { category } : {}),
    ...(status ? { status } : {}),
    ...(screenContext ? { screen_context: screenContext } : {}),
    limit,
    ...(cursor ? { cursor } : {}),
  };
}

export function parseOwnerFeedbackExportFormat(url: string | undefined): "json" | "csv" {
  const parsed = parseUrl(url);
  if ([...parsed.searchParams.keys()].some((key) => key !== "format") || parsed.searchParams.getAll("format").length !== 1) {
    throw new FeedbackApiError("INVALID_QUERY", 400);
  }
  const format = parsed.searchParams.get("format");
  if (format !== "json" && format !== "csv") throw new FeedbackApiError("INVALID_QUERY", 400);
  return format;
}

export function feedbackRecordsToCsv(records: ReturnType<ReturnType<typeof createFeedbackService>["exportRecords"]>): string {
  const headers = [
    "feedback_id", "created_at", "updated_at", "category", "status", "title", "details",
    "screen_context", "locale", "build_sha", "runtime_mode", "candidate_chain",
    "candidate_contract_address", "follow_up_entry_id", "report_id", "scanner_run_id", "route_context",
  ] as const;
  const rows = records.map((record) => headers.map((header) => csvCell(record[header])).join(","));
  return `${headers.join(",")}\r\n${rows.join("\r\n")}${rows.length > 0 ? "\r\n" : ""}`;
}

export function isFeedbackId(value: string): boolean {
  return /^fb_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function ownerListItem(record: FeedbackRecord) {
  return {
    feedback_id: record.feedback_id,
    created_at: record.created_at,
    category: record.category,
    status: record.status,
    title: record.title,
    screen_context: record.screen_context,
    locale: record.locale,
    subject_summary: subjectSummary(record),
    build_sha: record.build_sha,
    viewport_class: record.viewport_class,
  };
}

function ownerDetail(record: FeedbackRecord) {
  return {
    ...ownerListItem(record),
    updated_at: record.updated_at,
    details: record.details,
    candidate_identity: record.candidate_identity,
    follow_up_entry_id: record.follow_up_entry_id,
    report_id: record.report_id,
    scanner_run_id: record.scanner_run_id,
    route_context: record.route_context,
    session_group: sessionGroup(record.pseudonymous_session_id),
    product_version: record.build_sha,
    runtime_mode: record.runtime_mode,
  };
}

function ownerExportItem(record: FeedbackRecord) {
  return {
    feedback_id: record.feedback_id,
    created_at: record.created_at,
    updated_at: record.updated_at,
    category: record.category,
    status: record.status,
    title: record.title,
    details: record.details,
    screen_context: record.screen_context,
    locale: record.locale,
    build_sha: record.build_sha,
    runtime_mode: record.runtime_mode,
    candidate_chain: record.candidate_identity?.chain ?? null,
    candidate_contract_address: record.candidate_identity?.contract_address ?? null,
    follow_up_entry_id: record.follow_up_entry_id,
    report_id: record.report_id,
    scanner_run_id: record.scanner_run_id,
    route_context: record.route_context,
  };
}

function subjectSummary(record: FeedbackRecord): string | null {
  if (record.candidate_identity) return `${record.candidate_identity.chain}:${record.candidate_identity.contract_address}`;
  return record.follow_up_entry_id ?? record.report_id;
}

function duplicateReceipt(record: FeedbackRecord, sessionId: string): FeedbackReceipt {
  if (record.pseudonymous_session_id !== sessionId) throw new FeedbackApiError("ALREADY_RECORDED", 409);
  return receipt(record, "ALREADY_RECORDED");
}

function receipt(record: FeedbackRecord, status: FeedbackReceipt["submission_status"]): FeedbackReceipt {
  return {
    submission_status: status,
    feedback_id: record.feedback_id,
    created_at: record.created_at,
    category: record.category,
  };
}

function safeFindBySubmissionKey(store: FeedbackStore, submissionKey: string): FeedbackRecord | null {
  try { return store.findBySubmissionKey(submissionKey); } catch { throw new FeedbackApiError("STORAGE_UNAVAILABLE", 503); }
}

function validateSubjectRef(value: unknown): FeedbackSubjectRef {
  if (!isRecord(value) || Object.keys(value).length !== 2 || typeof value.id !== "string") {
    throw new FeedbackApiError("INVALID_SUBJECT_REF", 400);
  }
  if (value.type !== "candidate" && value.type !== "follow_up" && value.type !== "report") {
    throw new FeedbackApiError("INVALID_SUBJECT_REF", 400);
  }
  const id = normalizeText(value.id, "SUBJECT_REF", false);
  if (id.length < 1 || id.length > 160) throw new FeedbackApiError("INVALID_SUBJECT_REF", 400);
  return { type: value.type, id };
}

function normalizeText(value: unknown, field: string, multiline: boolean): string {
  if (typeof value !== "string") throw new FeedbackApiError(`INVALID_${field}`, 400);
  const normalized = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  const forbidden = multiline
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u
    : /[\u0000-\u001F\u007F-\u009F]/u;
  if (forbidden.test(normalized)) throw new FeedbackApiError(`INVALID_${field}`, 400);
  return normalized;
}

function assertLength(value: string, minimum: number, maximum: number, field: string): void {
  const length = [...value].length;
  if (length < minimum || length > maximum) throw new FeedbackApiError(`INVALID_${field}_LENGTH`, 400);
}

function assertWithinRateLimit(
  sessionId: string,
  nowMs: number,
  sessions: Map<string, number[]>,
  global: number[],
  sessionLimit: number,
  globalLimit: number,
  windowMs: number,
): void {
  const session = pruneTimes(sessions.get(sessionId) ?? [], nowMs, windowMs);
  sessions.set(sessionId, session);
  const globalRecent = pruneTimes(global, nowMs, windowMs);
  global.splice(0, global.length, ...globalRecent);
  if (session.length >= sessionLimit || globalRecent.length >= globalLimit) {
    const oldest = Math.min(session[0] ?? nowMs, globalRecent[0] ?? nowMs);
    throw new FeedbackApiError("RATE_LIMITED", 429, Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1_000)));
  }
}

function recordRateLimitAttempt(
  sessionId: string,
  nowMs: number,
  sessions: Map<string, number[]>,
  windowMs: number,
): void {
  const recent = pruneTimes(sessions.get(sessionId) ?? [], nowMs, windowMs);
  recent.push(nowMs);
  sessions.set(sessionId, recent);
}

function pruneTimes(values: number[], nowMs: number, windowMs: number): number[] {
  return values.filter((value) => value > nowMs - windowMs && value <= nowMs);
}

function isSameOrigin(origin: string, host: string): boolean {
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && parsed.host.toLowerCase() === host.toLowerCase()
      && parsed.pathname === "/"
      && parsed.search === ""
      && parsed.hash === "";
  } catch {
    return false;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header || header.length > 8_192) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (/^[A-Za-z0-9_-]+$/.test(key) && value.length <= 512) cookies[key] = value;
  }
  return cookies;
}

function signSession(sessionId: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(sessionId).digest("base64url");
  return `${sessionId}.${signature}`;
}

function verifySignedSession(value: string, secret: string): string | null {
  const [sessionId, signature, extra] = value.split(".");
  if (!sessionId || !signature || extra !== undefined || !isUuid(sessionId)) return null;
  const expected = createHmac("sha256", secret).update(sessionId).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, "base64url"); } catch { return null; }
  return expected.length === supplied.length && timingSafeEqual(expected, supplied) ? sessionId : null;
}

function sessionGroup(sessionId: string): string {
  return `session_${createHmac("sha256", "feedback-owner-group-v1").update(sessionId).digest("hex").slice(0, 12)}`;
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ v: 1, offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  if (cursor.length > 128 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new FeedbackApiError("INVALID_CURSOR", 400);
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!isRecord(value) || Object.keys(value).length !== 2 || value.v !== 1
      || !Number.isSafeInteger(value.offset) || (value.offset as number) < 0 || (value.offset as number) > 1_000_000) {
      throw new Error("invalid");
    }
    return value.offset as number;
  } catch {
    throw new FeedbackApiError("INVALID_CURSOR", 400);
  }
}

function parseUrl(value: string | undefined): URL {
  try { return new URL(value ?? "/", "http://feedback.local"); } catch { throw new FeedbackApiError("INVALID_QUERY", 400); }
}

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

function safeBuildSha(value: string | null | undefined): string | null {
  return typeof value === "string" && /^[0-9a-f]{7,64}$/i.test(value) ? value : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function positiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export { FEEDBACK_CATEGORIES, FEEDBACK_SCREEN_CONTEXTS, FEEDBACK_STATUSES };
