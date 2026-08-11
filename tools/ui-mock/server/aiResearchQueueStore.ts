import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AI_ANALYSIS_QUEUE_SCHEMA_VERSION,
  AI_RESEARCH_PROMPT_VERSION,
  AI_RESEARCH_SCHEMA_VERSION,
  type AIAnalysisRequestOutcome,
  type AIAnalysisStatus,
  type AIResearchBrief,
  type AIResearchLocale,
} from "../src/types/aiResearchTypes.js";
import { resolveTokenIdentity } from "../src/tokenLifecycle.js";
import { sha256, stableJson } from "./aiResearchContext.js";
import { validateStoredAIResearchBrief } from "./aiResearchSchema.js";

type SqliteRunResult = { changes?: number | bigint };
type SqliteStatement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): SqliteRunResult;
};
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
};
type SqliteModule = { DatabaseSync: new (filename: string) => SqliteDatabase };

export const AI_ANALYSIS_ACTIVE_STATUSES = ["QUEUED", "PROCESSING"] as const;

export type AIAnalysisCacheIdentity = {
  cache_key: string;
  chain: string;
  contract_address: string;
  snapshot_fingerprint: string;
  prompt_version: string;
  model_id: string;
  analysis_schema_version: string;
  locale: AIResearchLocale;
};

export type AIAnalysisQueueRecord = AIAnalysisCacheIdentity & {
  analysis_id: string;
  status: Exclude<AIAnalysisStatus, "ABSENT">;
  requested_at: string;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  next_retry_at: string | null;
  attempt_count: number;
  result: AIResearchBrief | null;
  validation_status: "PENDING" | "VALID" | "INVALID";
  safe_error_code: string | null;
  token_usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latency_ms: number | null;
  provider_response_id: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AIAnalysisQueueLookup = {
  record: AIAnalysisQueueRecord | null;
  last_known_good: AIResearchBrief | null;
};

export type AIAnalysisEnqueueResult = AIAnalysisQueueLookup & {
  outcome: AIAnalysisRequestOutcome;
  retry_after_seconds: number | null;
};

export type AIAnalysisQueueStoreOptions = {
  databaseFilePath?: string;
  busyTimeoutMs?: number;
};

export type AIAnalysisRateLimits = {
  windowMs: number;
  session: number;
  identity: number;
  global: number;
  cooldownMs: number;
  /** New-analysis initiation limits. Cache reads and deduplicated requests never consume them. */
  actorHourly?: number;
  globalHourly?: number;
  globalDaily?: number;
};

export type AIAnalysisWorkerState = {
  suspended: boolean;
  safe_error_code: string | null;
  suspended_at: string | null;
  updated_at: string;
};

export type AIAnalysisCircuitBreakerState = {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  consecutive_failures: number;
  open_until: string | null;
  half_open_in_flight: boolean;
  updated_at: string;
};

export class AIAnalysisQueueStoreError extends Error {
  readonly code: "STORE_UNAVAILABLE" | "STORE_SCHEMA_INVALID" | "RATE_LIMITED";
  readonly retryAfterSeconds: number | null;

  constructor(code: AIAnalysisQueueStoreError["code"], retryAfterSeconds: number | null = null) {
    super(code);
    this.name = "AIAnalysisQueueStoreError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const RUNTIME_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATABASE_PATH = resolve(RUNTIME_ROOT, ".local", "ai-analysis-queue.sqlite");
const importModule = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export type AIAnalysisQueueStore = Awaited<ReturnType<typeof createAIAnalysisQueueStore>>;

export function getDefaultAIAnalysisQueueStorePath(): string {
  return DEFAULT_DATABASE_PATH;
}

export function resolveAIAnalysisQueueDatabasePath(value?: string): string {
  const configured = value?.trim() || process.env.CRYPTO_EDGE_AI_QUEUE_SQLITE_PATH?.trim();
  if (configured) return isAbsolute(configured) ? resolve(configured) : resolve(RUNTIME_ROOT, configured);
  return process.env.NODE_TEST_CONTEXT
    ? resolve(tmpdir(), `crypto-edge-ai-queue-${process.pid}-${randomUUID()}.sqlite`)
    : DEFAULT_DATABASE_PATH;
}

export function buildAIAnalysisCacheIdentity(input: {
  chain: string;
  contract_address: string;
  snapshot_fingerprint: string;
  prompt_version?: string;
  model_id: string;
  analysis_schema_version?: string;
  locale: AIResearchLocale;
}): AIAnalysisCacheIdentity {
  const identity = resolveTokenIdentity(input.chain, input.contract_address);
  if (identity.status !== "valid"
    || !/^[0-9a-f]{64}$/.test(input.snapshot_fingerprint)
    || !safeVersion(input.prompt_version ?? AI_RESEARCH_PROMPT_VERSION)
    || !safeVersion(input.model_id)
    || !safeVersion(input.analysis_schema_version ?? AI_RESEARCH_SCHEMA_VERSION)) {
    throw new AIAnalysisQueueStoreError("STORE_SCHEMA_INVALID");
  }
  const canonical = {
    analysis_schema_version: input.analysis_schema_version ?? AI_RESEARCH_SCHEMA_VERSION,
    chain: identity.chain,
    contract_address: identity.contract_address,
    model_id: input.model_id,
    prompt_version: input.prompt_version ?? AI_RESEARCH_PROMPT_VERSION,
    snapshot_fingerprint: input.snapshot_fingerprint,
  };
  // The legacy database column is retained for compatibility. Production writes use
  // the canonical "en" value; it is never a request-owned semantic value and is not
  // part of the shared cache key.
  return { cache_key: sha256(stableJson(canonical)), ...canonical, locale: input.locale };
}

export function hashAIAnalysisRateScope(value: string): string {
  return createHash("sha256").update(`ai-analysis-rate-v1:${value}`, "utf8").digest("hex");
}

export async function createAIAnalysisQueueStore(options: AIAnalysisQueueStoreOptions = {}) {
  const databaseFilePath = resolveAIAnalysisQueueDatabasePath(options.databaseFilePath);
  const busyTimeoutMs = boundedInteger(options.busyTimeoutMs, 5_000, 100, 60_000);
  let database: SqliteDatabase | null = null;
  try {
    mkdirSync(dirname(databaseFilePath), { recursive: true });
    const sqlite = await loadNodeSqlite();
    database = new sqlite.DatabaseSync(databaseFilePath);
    migrate(database, busyTimeoutMs);
    assertSchema(database);
  } catch {
    try { database?.close(); } catch { /* preserve safe failure */ }
    throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
  }
  const requireDb = () => {
    if (!database) throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
    return database;
  };

  const lookup = (identity: AIAnalysisCacheIdentity): AIAnalysisQueueLookup => {
    const db = requireDb();
    const record = safeRecord(db.prepare("SELECT * FROM crypto_ai_analysis_queue WHERE cache_key = ? LIMIT 1").get(identity.cache_key));
    return { record, last_known_good: findLastKnownGood(db, identity, record) };
  };

  return {
    databaseFilePath,

    lookup,

    findByAnalysisId(analysisId: string): AIAnalysisQueueRecord | null {
      if (!/^air_[0-9a-f-]{36}$/.test(analysisId)) return null;
      return safeRecord(requireDb().prepare("SELECT * FROM crypto_ai_analysis_queue WHERE analysis_id = ? LIMIT 1").get(analysisId));
    },

    enqueue(input: {
      identity: AIAnalysisCacheIdentity;
      session_scope_hash: string;
      now: Date;
      rate_limits: AIAnalysisRateLimits;
      force?: boolean;
    }): AIAnalysisEnqueueResult {
      const db = requireDb();
      const nowIso = input.now.toISOString();
      const nowMs = input.now.getTime();
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        const existing = safeRecord(db.prepare("SELECT * FROM crypto_ai_analysis_queue WHERE cache_key = ? LIMIT 1").get(input.identity.cache_key));
        const lastKnownGood = findLastKnownGood(db, input.identity, existing);
        if (existing && !input.force) {
          if (existing.status === "READY" || (existing.status === "STALE" && existing.result)) {
            db.exec("COMMIT");
            return { record: existing, last_known_good: existing.result, outcome: "READY", retry_after_seconds: null };
          }
          if (existing.status === "QUEUED" || existing.status === "PROCESSING") {
            db.exec("COMMIT");
            return { record: existing, last_known_good: lastKnownGood, outcome: "ALREADY_EXISTS", retry_after_seconds: null };
          }
          if (existing.status === "SUSPENDED") {
            db.exec("COMMIT");
            return { record: existing, last_known_good: lastKnownGood, outcome: "SUSPENDED", retry_after_seconds: null };
          }
          const cooldownUntil = Math.max(
            Date.parse(existing.updated_at) + input.rate_limits.cooldownMs,
            existing.next_retry_at ? Date.parse(existing.next_retry_at) : 0,
          );
          if (cooldownUntil > nowMs) {
            db.exec("COMMIT");
            return {
              record: existing,
              last_known_good: lastKnownGood,
              outcome: "COOLDOWN",
              retry_after_seconds: Math.max(1, Math.ceil((cooldownUntil - nowMs) / 1_000)),
            };
          }
        }
        enforceRateLimits(db, input.identity, input.session_scope_hash, input.rate_limits, input.now);
        if (existing) {
          db.prepare(`
UPDATE crypto_ai_analysis_queue SET status = 'QUEUED', requested_at = ?, queued_at = ?, started_at = NULL,
  completed_at = NULL, failed_at = NULL, next_retry_at = NULL, validation_status = 'PENDING',
  safe_error_code = NULL, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
WHERE cache_key = ?
`).run(nowIso, nowIso, nowIso, input.identity.cache_key);
        } else {
          db.prepare(`
INSERT INTO crypto_ai_analysis_queue (
  analysis_id, cache_key, chain, contract_address, snapshot_fingerprint, prompt_version, model_id,
  analysis_schema_version, locale, status, requested_at, queued_at, attempt_count, result_json,
  validation_status, safe_error_code, prompt_tokens, completion_tokens, total_tokens, latency_ms,
  provider_response_id, lease_owner, lease_expires_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, 0, NULL, 'PENDING', NULL, 0, 0, 0, NULL, NULL, NULL, NULL, ?, ?)
`).run(
            `air_${randomUUID()}`,
            input.identity.cache_key,
            input.identity.chain,
            input.identity.contract_address,
            input.identity.snapshot_fingerprint,
            input.identity.prompt_version,
            input.identity.model_id,
            input.identity.analysis_schema_version,
            input.identity.locale,
            nowIso,
            nowIso,
            nowIso,
            nowIso,
          );
        }
        recordRateRequest(db, input.identity, input.session_scope_hash, nowIso);
        const record = safeRecord(db.prepare("SELECT * FROM crypto_ai_analysis_queue WHERE cache_key = ? LIMIT 1").get(input.identity.cache_key));
        if (!record) throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
        db.exec("COMMIT");
        return { record, last_known_good: lastKnownGood, outcome: "QUEUED", retry_after_seconds: null };
      } catch (error) {
        try { db.exec("ROLLBACK"); } catch { /* preserve original */ }
        if (error instanceof AIAnalysisQueueStoreError) throw error;
        throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
      }
    },

    claimNext(input: { worker_id: string; now: Date; lease_ms: number }): AIAnalysisQueueRecord | null {
      const db = requireDb();
      const nowIso = input.now.toISOString();
      const leaseExpires = new Date(input.now.getTime() + input.lease_ms).toISOString();
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        const row = db.prepare(`
SELECT * FROM crypto_ai_analysis_queue
WHERE (status IN ('QUEUED','FAILED') AND (next_retry_at IS NULL OR next_retry_at <= ?))
   OR (status = 'PROCESSING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
ORDER BY COALESCE(next_retry_at, queued_at, requested_at) ASC, created_at ASC
LIMIT 1
`).get(nowIso, nowIso);
        const candidate = safeRecord(row);
        if (!candidate) { db.exec("COMMIT"); return null; }
        db.prepare(`
UPDATE crypto_ai_analysis_queue SET status = 'PROCESSING', started_at = ?,
  attempt_count = attempt_count + 1, lease_owner = ?, lease_expires_at = ?, updated_at = ?
WHERE analysis_id = ?
`).run(nowIso, input.worker_id, leaseExpires, nowIso, candidate.analysis_id);
        const claimed = safeRecord(db.prepare("SELECT * FROM crypto_ai_analysis_queue WHERE analysis_id = ?").get(candidate.analysis_id));
        db.exec("COMMIT");
        return claimed;
      } catch {
        try { db.exec("ROLLBACK"); } catch { /* preserve failure */ }
        throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
      }
    },

    renewLease(input: { analysis_id: string; worker_id: string; now: Date; lease_ms: number }): boolean {
      const result = requireDb().prepare(`
UPDATE crypto_ai_analysis_queue SET lease_expires_at = ?, updated_at = ?
WHERE analysis_id = ? AND status = 'PROCESSING' AND lease_owner = ?
`).run(new Date(input.now.getTime() + input.lease_ms).toISOString(), input.now.toISOString(), input.analysis_id, input.worker_id);
      return changes(result) === 1;
    },

    deferClaim(input: { analysis_id: string; worker_id: string; next_retry_at: Date; now: Date; safe_error_code: string }): boolean {
      const result = requireDb().prepare(`
UPDATE crypto_ai_analysis_queue SET status = 'QUEUED', next_retry_at = ?, attempt_count = MAX(0, attempt_count - 1),
  safe_error_code = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
WHERE analysis_id = ? AND status = 'PROCESSING' AND lease_owner = ?
`).run(
        input.next_retry_at.toISOString(),
        safeCode(input.safe_error_code),
        input.now.toISOString(),
        input.analysis_id,
        input.worker_id,
      );
      return changes(result) === 1;
    },

    complete(input: {
      analysis_id: string;
      worker_id: string;
      brief: AIResearchBrief;
      validation_status: "VALID";
      latency_ms: number;
      provider_response_id: string | null;
      now: Date;
    }): AIAnalysisQueueRecord {
      const brief = validateStoredAIResearchBrief(input.brief);
      const db = requireDb();
      const nowIso = input.now.toISOString();
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        const owned = safeRecord(db.prepare(`
SELECT * FROM crypto_ai_analysis_queue WHERE analysis_id = ? AND status = 'PROCESSING' AND lease_owner = ? LIMIT 1
`).get(input.analysis_id, input.worker_id));
        if (!owned || owned.cache_key !== buildAIAnalysisCacheIdentity({
          chain: brief.identity.chain,
          contract_address: brief.identity.contract_address,
          snapshot_fingerprint: brief.snapshot_fingerprint,
          prompt_version: brief.prompt_version,
          model_id: brief.model,
          analysis_schema_version: brief.schema_version,
          locale: brief.analysis_language,
        }).cache_key) throw new AIAnalysisQueueStoreError("STORE_SCHEMA_INVALID");
        db.prepare(`
UPDATE crypto_ai_analysis_queue SET status = 'STALE', updated_at = ?
WHERE chain = ? AND contract_address = ? AND status = 'READY' AND analysis_id <> ?
`).run(nowIso, owned.chain, owned.contract_address, owned.analysis_id);
        db.prepare(`
UPDATE crypto_ai_analysis_queue SET status = 'READY', completed_at = ?, failed_at = NULL, next_retry_at = NULL,
  result_json = ?, validation_status = ?, safe_error_code = NULL, prompt_tokens = ?, completion_tokens = ?,
  total_tokens = ?, latency_ms = ?, provider_response_id = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
WHERE analysis_id = ? AND lease_owner = ?
`).run(
          nowIso,
          JSON.stringify(brief),
          input.validation_status,
          brief.token_usage.prompt_tokens,
          brief.token_usage.completion_tokens,
          brief.token_usage.total_tokens,
          input.latency_ms,
          input.provider_response_id,
          nowIso,
          input.analysis_id,
          input.worker_id,
        );
        const record = safeRecord(db.prepare("SELECT * FROM crypto_ai_analysis_queue WHERE analysis_id = ?").get(input.analysis_id));
        if (!record) throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
        db.exec("COMMIT");
        return record;
      } catch (error) {
        try { db.exec("ROLLBACK"); } catch { /* preserve original */ }
        if (error instanceof AIAnalysisQueueStoreError) throw error;
        throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
      }
    },

    fail(input: {
      analysis_id: string;
      worker_id: string;
      safe_error_code: string;
      transient: boolean;
      max_attempts: number;
      retry_base_ms: number;
      retry_jitter_ratio?: number;
      now: Date;
    }): AIAnalysisQueueRecord {
      const db = requireDb();
      const current = safeRecord(db.prepare(`
SELECT * FROM crypto_ai_analysis_queue WHERE analysis_id = ? AND status = 'PROCESSING' AND lease_owner = ? LIMIT 1
`).get(input.analysis_id, input.worker_id));
      if (!current) throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
      const retryable = input.transient && current.attempt_count < input.max_attempts;
      const status = retryable ? "FAILED" : "SUSPENDED";
      const nextRetry = retryable
        ? new Date(input.now.getTime() + retryDelayMs(
          input.analysis_id,
          current.attempt_count,
          input.retry_base_ms,
          input.retry_jitter_ratio ?? 0.2,
        )).toISOString()
        : null;
      requireDb().prepare(`
UPDATE crypto_ai_analysis_queue SET status = ?, failed_at = ?, next_retry_at = ?, validation_status = ?,
  safe_error_code = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
WHERE analysis_id = ? AND lease_owner = ?
`).run(
        status,
        input.now.toISOString(),
        nextRetry,
        input.transient ? "PENDING" : "INVALID",
        safeCode(input.safe_error_code),
        input.now.toISOString(),
        input.analysis_id,
        input.worker_id,
      );
      const failed = safeRecord(requireDb().prepare("SELECT * FROM crypto_ai_analysis_queue WHERE analysis_id = ?").get(input.analysis_id));
      if (!failed) throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
      return failed;
    },

    workerState(): AIAnalysisWorkerState {
      return parseWorkerState(requireDb().prepare("SELECT * FROM crypto_ai_worker_state WHERE id = 1").get());
    },

    suspendWorker(safeErrorCode: string, now: Date): AIAnalysisWorkerState {
      requireDb().prepare(`
UPDATE crypto_ai_worker_state SET suspended = 1, safe_error_code = ?, suspended_at = ?, updated_at = ? WHERE id = 1
`).run(safeCode(safeErrorCode), now.toISOString(), now.toISOString());
      return this.workerState();
    },

    resumeWorker(now: Date): AIAnalysisWorkerState {
      requireDb().prepare(`
UPDATE crypto_ai_worker_state SET suspended = 0, safe_error_code = NULL, suspended_at = NULL, updated_at = ? WHERE id = 1
`).run(now.toISOString());
      return this.workerState();
    },

    circuitBreaker(now: Date): AIAnalysisCircuitBreakerState {
      return readCircuitBreaker(requireDb(), now);
    },

    acquireCircuitPermit(input: { now: Date }): boolean {
      const db = requireDb();
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        const current = parseCircuitBreaker(db.prepare("SELECT * FROM crypto_ai_circuit_breaker WHERE id = 1").get());
        if (current.state === "CLOSED") { db.exec("COMMIT"); return true; }
        const nowMs = input.now.getTime();
        if (current.state === "OPEN" && current.open_until && Date.parse(current.open_until) > nowMs) {
          db.exec("COMMIT");
          return false;
        }
        if (current.state === "HALF_OPEN" && current.half_open_in_flight) {
          db.exec("COMMIT");
          return false;
        }
        db.prepare(`
UPDATE crypto_ai_circuit_breaker SET state = 'HALF_OPEN', half_open_in_flight = 1, updated_at = ? WHERE id = 1
`).run(input.now.toISOString());
        db.exec("COMMIT");
        return true;
      } catch {
        try { db.exec("ROLLBACK"); } catch { /* preserve failure */ }
        throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
      }
    },

    recordCircuitSuccess(now: Date): AIAnalysisCircuitBreakerState {
      requireDb().prepare(`
UPDATE crypto_ai_circuit_breaker SET state = 'CLOSED', consecutive_failures = 0, open_until = NULL,
  half_open_in_flight = 0, updated_at = ? WHERE id = 1
`).run(now.toISOString());
      return readCircuitBreaker(requireDb(), now);
    },

    recordCircuitFailure(input: { now: Date; threshold: number; open_ms: number }): AIAnalysisCircuitBreakerState {
      const db = requireDb();
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        const current = parseCircuitBreaker(db.prepare("SELECT * FROM crypto_ai_circuit_breaker WHERE id = 1").get());
        const failures = Math.min(1_000_000, current.consecutive_failures + 1);
        const shouldOpen = current.state === "HALF_OPEN" || failures >= input.threshold;
        const openUntil = shouldOpen ? new Date(input.now.getTime() + input.open_ms).toISOString() : null;
        db.prepare(`
UPDATE crypto_ai_circuit_breaker SET state = ?, consecutive_failures = ?, open_until = ?,
  half_open_in_flight = 0, updated_at = ? WHERE id = 1
`).run(shouldOpen ? "OPEN" : "CLOSED", failures, openUntil, input.now.toISOString());
        const updated = readCircuitBreaker(db, input.now);
        db.exec("COMMIT");
        return updated;
      } catch {
        try { db.exec("ROLLBACK"); } catch { /* preserve failure */ }
        throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
      }
    },

    usageSince(since: Date): { analyses: number; prompt_tokens: number; completion_tokens: number; total_tokens: number } {
      const row = requireDb().prepare(`
SELECT COUNT(*) AS analyses, COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
  COALESCE(SUM(completion_tokens), 0) AS completion_tokens, COALESCE(SUM(total_tokens), 0) AS total_tokens
FROM crypto_ai_analysis_queue
WHERE (status IN ('READY','STALE') AND completed_at >= ?)
   OR (status = 'PROCESSING' AND started_at >= ?)
`).get(since.toISOString(), since.toISOString());
      return {
        analyses: integerField(row, "analyses"),
        prompt_tokens: integerField(row, "prompt_tokens"),
        completion_tokens: integerField(row, "completion_tokens"),
        total_tokens: integerField(row, "total_tokens"),
      };
    },

    hasAnalysisBudgetSlot(input: { analysis_id: string; since: Date; maximum: number }): boolean {
      if (input.maximum <= 0) return false;
      const rows = requireDb().prepare(`
SELECT analysis_id FROM crypto_ai_analysis_queue
WHERE (status IN ('READY','STALE') AND completed_at >= ?)
   OR (status = 'PROCESSING' AND started_at >= ?)
ORDER BY CASE WHEN status = 'PROCESSING' THEN started_at ELSE completed_at END ASC, analysis_id ASC
LIMIT ?
`).all(input.since.toISOString(), input.since.toISOString(), input.maximum);
      return rows.some((row) => isRecord(row) && row.analysis_id === input.analysis_id);
    },

    stats(): { records: number; queued: number; processing: number; ready: number; stale: number; failed: number; suspended: number } {
      const row = requireDb().prepare(`
SELECT COUNT(*) AS records,
  SUM(CASE WHEN status = 'QUEUED' THEN 1 ELSE 0 END) AS queued,
  SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) AS processing,
  SUM(CASE WHEN status = 'READY' THEN 1 ELSE 0 END) AS ready,
  SUM(CASE WHEN status = 'STALE' THEN 1 ELSE 0 END) AS stale,
  SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended
FROM crypto_ai_analysis_queue
`).get();
      return {
        records: integerField(row, "records"), queued: integerField(row, "queued"),
        processing: integerField(row, "processing"), ready: integerField(row, "ready"),
        stale: integerField(row, "stale"), failed: integerField(row, "failed"),
        suspended: integerField(row, "suspended"),
      };
    },

    close(): void {
      try { database?.close(); } finally { database = null; }
    },
  };
}

function migrate(database: SqliteDatabase, busyTimeoutMs: number): void {
  database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = FULL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
CREATE TABLE IF NOT EXISTS crypto_ai_analysis_queue (
  analysis_id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  chain TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  snapshot_fingerprint TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model_id TEXT NOT NULL,
  analysis_schema_version TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('pl','en')),
  status TEXT NOT NULL CHECK (status IN ('QUEUED','PROCESSING','READY','STALE','FAILED','SUSPENDED')),
  requested_at TEXT NOT NULL,
  queued_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  failed_at TEXT,
  next_retry_at TEXT,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  result_json TEXT,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('PENDING','VALID','INVALID')),
  safe_error_code TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  provider_response_id TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_analysis_cache_key ON crypto_ai_analysis_queue(cache_key);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_identity ON crypto_ai_analysis_queue(chain, contract_address, locale);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_claim ON crypto_ai_analysis_queue(status, next_retry_at, queued_at);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_completed ON crypto_ai_analysis_queue(completed_at);
CREATE TABLE IF NOT EXISTS crypto_ai_analysis_request_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_scope_hash TEXT NOT NULL,
  identity_scope_hash TEXT NOT NULL,
  requested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_rate_session ON crypto_ai_analysis_request_log(session_scope_hash, requested_at);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_rate_identity ON crypto_ai_analysis_request_log(identity_scope_hash, requested_at);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_rate_time ON crypto_ai_analysis_request_log(requested_at);
CREATE TABLE IF NOT EXISTS crypto_ai_worker_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version TEXT NOT NULL CHECK (schema_version = 'ai_analysis_queue_v1'),
  suspended INTEGER NOT NULL CHECK (suspended IN (0,1)),
  safe_error_code TEXT,
  suspended_at TEXT,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO crypto_ai_worker_state (id, schema_version, suspended, safe_error_code, suspended_at, updated_at)
VALUES (1, 'ai_analysis_queue_v1', 0, NULL, NULL, '1970-01-01T00:00:00.000Z');
CREATE TABLE IF NOT EXISTS crypto_ai_circuit_breaker (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL CHECK (state IN ('CLOSED','OPEN','HALF_OPEN')),
  consecutive_failures INTEGER NOT NULL CHECK (consecutive_failures >= 0),
  open_until TEXT,
  half_open_in_flight INTEGER NOT NULL CHECK (half_open_in_flight IN (0,1)),
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO crypto_ai_circuit_breaker (id, state, consecutive_failures, open_until, half_open_in_flight, updated_at)
VALUES (1, 'CLOSED', 0, NULL, 0, '1970-01-01T00:00:00.000Z');
PRAGMA user_version = 1;
`);
}

function assertSchema(database: SqliteDatabase): void {
  const columns = database.prepare("PRAGMA table_info(crypto_ai_analysis_queue)").all();
  const names = new Set(columns.map((row) => isRecord(row) ? row.name : null));
  const required = [
    "analysis_id", "cache_key", "chain", "contract_address", "snapshot_fingerprint", "prompt_version",
    "model_id", "analysis_schema_version", "status", "requested_at", "queued_at", "started_at", "completed_at",
    "failed_at", "next_retry_at", "attempt_count", "result_json", "validation_status", "safe_error_code",
    "prompt_tokens", "completion_tokens", "total_tokens", "latency_ms", "provider_response_id", "created_at", "updated_at",
  ];
  if (required.some((name) => !names.has(name))) throw new AIAnalysisQueueStoreError("STORE_SCHEMA_INVALID");
}

function safeRecord(value: unknown): AIAnalysisQueueRecord | null {
  if (!isRecord(value)
    || typeof value.analysis_id !== "string"
    || typeof value.cache_key !== "string"
    || typeof value.chain !== "string"
    || typeof value.contract_address !== "string"
    || typeof value.snapshot_fingerprint !== "string"
    || typeof value.prompt_version !== "string"
    || typeof value.model_id !== "string"
    || typeof value.analysis_schema_version !== "string"
    || (value.locale !== "pl" && value.locale !== "en")
    || !["QUEUED", "PROCESSING", "READY", "STALE", "FAILED", "SUSPENDED"].includes(String(value.status))) return null;
  const result = typeof value.result_json === "string" ? parseBrief(value.result_json) : null;
  if (typeof value.result_json === "string" && !result) return null;
  return {
    analysis_id: value.analysis_id,
    cache_key: value.cache_key,
    chain: value.chain,
    contract_address: value.contract_address,
    snapshot_fingerprint: value.snapshot_fingerprint,
    prompt_version: value.prompt_version,
    model_id: value.model_id,
    analysis_schema_version: value.analysis_schema_version,
    locale: value.locale,
    status: value.status as AIAnalysisQueueRecord["status"],
    requested_at: stringField(value.requested_at) ?? new Date(0).toISOString(),
    queued_at: stringField(value.queued_at),
    started_at: stringField(value.started_at),
    completed_at: stringField(value.completed_at),
    failed_at: stringField(value.failed_at),
    next_retry_at: stringField(value.next_retry_at),
    attempt_count: integer(value.attempt_count),
    result,
    validation_status: value.validation_status === "VALID" || value.validation_status === "INVALID" ? value.validation_status : "PENDING",
    safe_error_code: stringField(value.safe_error_code),
    token_usage: {
      prompt_tokens: integer(value.prompt_tokens),
      completion_tokens: integer(value.completion_tokens),
      total_tokens: integer(value.total_tokens),
    },
    latency_ms: value.latency_ms === null ? null : integer(value.latency_ms),
    provider_response_id: stringField(value.provider_response_id),
    lease_owner: stringField(value.lease_owner),
    lease_expires_at: stringField(value.lease_expires_at),
    created_at: stringField(value.created_at) ?? new Date(0).toISOString(),
    updated_at: stringField(value.updated_at) ?? new Date(0).toISOString(),
  };
}

function findLastKnownGood(
  database: SqliteDatabase,
  identity: AIAnalysisCacheIdentity,
  current: AIAnalysisQueueRecord | null,
): AIResearchBrief | null {
  if (current?.result) return current.result;
  const rows = database.prepare(`
SELECT * FROM crypto_ai_analysis_queue
WHERE chain = ? AND contract_address = ? AND prompt_version = ?
  AND model_id = ? AND analysis_schema_version = ? AND result_json IS NOT NULL AND validation_status = 'VALID'
ORDER BY completed_at DESC LIMIT 20
`).all(
    identity.chain,
    identity.contract_address,
    identity.prompt_version,
    identity.model_id,
    identity.analysis_schema_version,
  );
  for (const row of rows) {
    const record = safeRecord(row);
    if (record?.result) return record.result;
  }
  return null;
}

function enforceRateLimits(
  database: SqliteDatabase,
  identity: AIAnalysisCacheIdentity,
  sessionScopeHash: string,
  limits: AIAnalysisRateLimits,
  now: Date,
): void {
  if (!/^[0-9a-f]{64}$/.test(sessionScopeHash)) throw new AIAnalysisQueueStoreError("STORE_SCHEMA_INVALID");
  const since = new Date(now.getTime() - limits.windowMs).toISOString();
  const hourSince = new Date(now.getTime() - 60 * 60_000).toISOString();
  const daySince = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const identityHash = identityScopeHash(identity);
  const checks: Array<[string, string, number]> = [
    ["session_scope_hash", sessionScopeHash, limits.session],
    ["identity_scope_hash", identityHash, limits.identity],
  ];
  for (const [column, value, limit] of checks) {
    const rows = database.prepare(`SELECT requested_at FROM crypto_ai_analysis_request_log WHERE ${column} = ? AND requested_at > ? ORDER BY requested_at ASC`).all(value, since);
    if (rows.length >= limit) {
      const first = rows[0];
      const firstAt = isRecord(first) && typeof first.requested_at === "string" ? Date.parse(first.requested_at) : now.getTime();
      throw new AIAnalysisQueueStoreError("RATE_LIMITED", Math.max(1, Math.ceil((firstAt + limits.windowMs - now.getTime()) / 1_000)));
    }
  }
  const globalRows = database.prepare("SELECT requested_at FROM crypto_ai_analysis_request_log WHERE requested_at > ? ORDER BY requested_at ASC").all(since);
  if (globalRows.length >= limits.global) {
    const first = globalRows[0];
    const firstAt = isRecord(first) && typeof first.requested_at === "string" ? Date.parse(first.requested_at) : now.getTime();
    throw new AIAnalysisQueueStoreError("RATE_LIMITED", Math.max(1, Math.ceil((firstAt + limits.windowMs - now.getTime()) / 1_000)));
  }
  const actorHourly = limits.actorHourly ?? limits.session;
  const globalHourly = limits.globalHourly ?? limits.global;
  const globalDaily = limits.globalDaily ?? Math.max(limits.global, globalHourly);
  enforceWindowLimit(database, "session_scope_hash", sessionScopeHash, hourSince, actorHourly, now, 60 * 60_000);
  enforceWindowLimit(database, null, null, hourSince, globalHourly, now, 60 * 60_000);
  enforceWindowLimit(database, null, null, daySince, globalDaily, now, 24 * 60 * 60_000);
  database.prepare("DELETE FROM crypto_ai_analysis_request_log WHERE requested_at <= ?").run(daySince);
}

function enforceWindowLimit(
  database: SqliteDatabase,
  column: "session_scope_hash" | null,
  value: string | null,
  since: string,
  limit: number,
  now: Date,
  windowMs: number,
): void {
  if (limit <= 0) throw new AIAnalysisQueueStoreError("RATE_LIMITED", Math.max(1, Math.ceil(windowMs / 1_000)));
  const rows = column
    ? database.prepare(`SELECT requested_at FROM crypto_ai_analysis_request_log WHERE ${column} = ? AND requested_at > ? ORDER BY requested_at ASC`).all(value, since)
    : database.prepare("SELECT requested_at FROM crypto_ai_analysis_request_log WHERE requested_at > ? ORDER BY requested_at ASC").all(since);
  if (rows.length < limit) return;
  const first = rows[0];
  const firstAt = isRecord(first) && typeof first.requested_at === "string" ? Date.parse(first.requested_at) : now.getTime();
  throw new AIAnalysisQueueStoreError("RATE_LIMITED", Math.max(1, Math.ceil((firstAt + windowMs - now.getTime()) / 1_000)));
}

function recordRateRequest(database: SqliteDatabase, identity: AIAnalysisCacheIdentity, sessionScopeHash: string, nowIso: string): void {
  database.prepare(`
INSERT INTO crypto_ai_analysis_request_log (session_scope_hash, identity_scope_hash, requested_at) VALUES (?, ?, ?)
`).run(sessionScopeHash, identityScopeHash(identity), nowIso);
}

function identityScopeHash(identity: AIAnalysisCacheIdentity): string {
  return sha256(`${identity.chain}:${identity.contract_address}`);
}

function parseWorkerState(value: unknown): AIAnalysisWorkerState {
  if (!isRecord(value)) throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
  return {
    suspended: value.suspended === 1,
    safe_error_code: stringField(value.safe_error_code),
    suspended_at: stringField(value.suspended_at),
    updated_at: stringField(value.updated_at) ?? new Date(0).toISOString(),
  };
}

function readCircuitBreaker(database: SqliteDatabase, now: Date): AIAnalysisCircuitBreakerState {
  const state = parseCircuitBreaker(database.prepare("SELECT * FROM crypto_ai_circuit_breaker WHERE id = 1").get());
  if (state.state === "OPEN" && state.open_until && Date.parse(state.open_until) <= now.getTime()) {
    return { ...state, state: "HALF_OPEN" };
  }
  return state;
}

function parseCircuitBreaker(value: unknown): AIAnalysisCircuitBreakerState {
  if (!isRecord(value) || !["CLOSED", "OPEN", "HALF_OPEN"].includes(String(value.state))) {
    throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
  }
  return {
    state: value.state as AIAnalysisCircuitBreakerState["state"],
    consecutive_failures: integer(value.consecutive_failures),
    open_until: stringField(value.open_until),
    half_open_in_flight: value.half_open_in_flight === 1,
    updated_at: stringField(value.updated_at) ?? new Date(0).toISOString(),
  };
}

function parseBrief(raw: string): AIResearchBrief | null {
  try { return validateStoredAIResearchBrief(JSON.parse(raw)); } catch { return null; }
}

function safeCode(value: string): string {
  return /^[A-Z0-9_]{1,80}$/.test(value) ? value : "AI_WORKER_FAILURE";
}

function safeVersion(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(value);
}

function stringField(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function integerField(value: unknown, key: string): number {
  return isRecord(value) ? integer(value[key]) : 0;
}

function changes(result: SqliteRunResult): number {
  return typeof result.changes === "bigint" ? Number(result.changes) : result.changes ?? 0;
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function retryDelayMs(analysisId: string, attempt: number, baseMs: number, jitterRatio: number): number {
  const exponential = baseMs * (2 ** Math.max(0, attempt - 1));
  const ratio = Number.isFinite(jitterRatio) ? Math.max(0, Math.min(0.5, jitterRatio)) : 0.2;
  if (ratio === 0) return exponential;
  const digest = createHash("sha256").update(`${analysisId}:${attempt}`, "utf8").digest();
  const unit = digest.readUInt32BE(0) / 0xffff_ffff;
  return Math.max(1, Math.round(exponential * (1 - ratio + unit * ratio * 2)));
}

async function loadNodeSqlite(): Promise<SqliteModule> {
  const loaded = await importModule("node:sqlite") as Partial<SqliteModule>;
  if (typeof loaded.DatabaseSync !== "function") throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE");
  return loaded as SqliteModule;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export { AI_ANALYSIS_QUEUE_SCHEMA_VERSION };
