import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

export const FEEDBACK_SCHEMA_VERSION = 1;
export const FEEDBACK_CATEGORIES = ["BLOCKER", "IMPROVEMENT", "CLARIFICATION", "LATER"] as const;
export const FEEDBACK_STATUSES = ["NEW", "TRIAGED", "PLANNED", "RESOLVED", "CLOSED"] as const;
export const FEEDBACK_SCREEN_CONTEXTS = [
  "candidate-results",
  "candidate-detail",
  "external-checks",
  "reports",
  "methodology",
  "control-center",
  "trusted-preview",
  "feedback",
] as const;

export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];
export type FeedbackStatus = typeof FEEDBACK_STATUSES[number];
export type FeedbackScreenContext = typeof FEEDBACK_SCREEN_CONTEXTS[number];
export type FeedbackViewportClass = "desktop" | "tablet" | "mobile";
export type FeedbackReadinessStatus = "READY" | "PARTIAL" | "NOT_READY";

export type VerifiedFeedbackSubject = {
  candidate_identity?: { chain: string; contract_address: string };
  follow_up_entry_id?: string;
  report_id?: string;
  scanner_run_id?: string;
};

export type FeedbackRecord = {
  feedback_id: string;
  schema_version: typeof FEEDBACK_SCHEMA_VERSION;
  created_at: string;
  updated_at: string;
  category: FeedbackCategory;
  title: string;
  details: string;
  screen_context: FeedbackScreenContext;
  locale: "pl" | "en";
  build_sha: string | null;
  runtime_mode: string;
  pseudonymous_session_id: string;
  submission_key: string;
  status: FeedbackStatus;
  candidate_identity: { chain: string; contract_address: string } | null;
  follow_up_entry_id: string | null;
  report_id: string | null;
  scanner_run_id: string | null;
  route_context: FeedbackScreenContext | null;
  viewport_class: FeedbackViewportClass | null;
};

export type FeedbackCaptureInput = Omit<FeedbackRecord,
  "feedback_id" | "schema_version" | "created_at" | "updated_at" | "status"
> & { created_at: string };

export type FeedbackStoreSummary = {
  storage_available: boolean;
  feedback_status: FeedbackReadinessStatus;
  total_count: number;
  new_count: number;
  blocker_count: number;
  improvement_count: number;
  clarification_count: number;
  later_count: number;
  latest_feedback_at: string | null;
  oldest_new_feedback_at: string | null;
};

export type FeedbackListFilters = {
  category?: FeedbackCategory;
  status?: FeedbackStatus;
  screen_context?: FeedbackScreenContext;
  limit: number;
  offset: number;
};

export type FeedbackStoreOptions = {
  databaseFilePath?: string;
  maxRecords?: number;
  busyTimeoutMs?: number;
};

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

const DEFAULT_DATABASE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".local",
  "tester-feedback.sqlite",
);
const DEFAULT_MAX_RECORDS = 10_000;
const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
const importModule = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<unknown>;

export class FeedbackStoreError extends Error {
  readonly code: "STORAGE_UNAVAILABLE" | "CAPACITY_REACHED" | "SCHEMA_INVALID";

  constructor(code: FeedbackStoreError["code"]) {
    super(code);
    this.name = "FeedbackStoreError";
    this.code = code;
  }
}

export type FeedbackStore = Awaited<ReturnType<typeof createFeedbackStore>>;

export function getDefaultFeedbackStorePath(): string {
  return DEFAULT_DATABASE_PATH;
}

export async function createFeedbackStore(options: FeedbackStoreOptions = {}) {
  const databasePath = resolve(options.databaseFilePath ?? (
    process.env.NODE_TEST_CONTEXT
      ? resolve(tmpdir(), `crypto-edge-feedback-test-${process.pid}-${randomUUID()}.sqlite`)
      : DEFAULT_DATABASE_PATH
  ));
  const maxRecords = normalizePositiveInteger(options.maxRecords, DEFAULT_MAX_RECORDS, 100_000);
  const busyTimeoutMs = normalizePositiveInteger(options.busyTimeoutMs, DEFAULT_BUSY_TIMEOUT_MS, 60_000);
  let database: SqliteDatabase | null = null;
  let initializationError: FeedbackStoreError | null = null;

  try {
    mkdirSync(dirname(databasePath), { recursive: true });
    const { DatabaseSync } = await loadNodeSqlite();
    database = new DatabaseSync(databasePath);
    migrate(database, busyTimeoutMs);
    assertSchema(database);
  } catch {
    initializationError = new FeedbackStoreError("STORAGE_UNAVAILABLE");
    try { database?.close(); } catch { /* preserve the storage error */ }
    database = null;
  }

  const requireDatabase = (): SqliteDatabase => {
    if (!database || initializationError) throw initializationError ?? new FeedbackStoreError("STORAGE_UNAVAILABLE");
    return database;
  };

  return {
    maxRecords,

    health(submissionEnabled = true): FeedbackStoreSummary {
      if (!database || initializationError) return unavailableSummary();
      try {
        const summary = readSummary(database);
        return {
          ...summary,
          storage_available: true,
          feedback_status: submissionEnabled ? "READY" : "PARTIAL",
        };
      } catch {
        return unavailableSummary();
      }
    },

    findBySubmissionKey(submissionKey: string): FeedbackRecord | null {
      const row = requireDatabase().prepare(`
SELECT * FROM tester_feedback WHERE submission_key = ? LIMIT 1
`).get(submissionKey);
      return row ? mapRow(row) : null;
    },

    capture(input: FeedbackCaptureInput): { created: boolean; record: FeedbackRecord } {
      const db = requireDatabase();
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        const existing = db.prepare(`
SELECT * FROM tester_feedback WHERE submission_key = ? LIMIT 1
`).get(input.submission_key);
        if (existing) {
          db.exec("COMMIT");
          return { created: false, record: mapRow(existing) };
        }

        const countRow = db.prepare("SELECT COUNT(*) AS count FROM tester_feedback").get();
        if (readIntegerField(countRow, "count") >= maxRecords) {
          throw new FeedbackStoreError("CAPACITY_REACHED");
        }

        const feedbackId = `fb_${randomUUID()}`;
        db.prepare(`
INSERT INTO tester_feedback (
  feedback_id, schema_version, created_at, updated_at, category, title, details,
  screen_context, locale, build_sha, runtime_mode, pseudonymous_session_id,
  submission_key, status, candidate_chain, candidate_contract_address,
  follow_up_entry_id, report_id, scanner_run_id, route_context, viewport_class
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
          feedbackId,
          FEEDBACK_SCHEMA_VERSION,
          input.created_at,
          input.created_at,
          input.category,
          input.title,
          input.details,
          input.screen_context,
          input.locale,
          input.build_sha,
          input.runtime_mode,
          input.pseudonymous_session_id,
          input.submission_key,
          "NEW",
          input.candidate_identity?.chain ?? null,
          input.candidate_identity?.contract_address ?? null,
          input.follow_up_entry_id,
          input.report_id,
          input.scanner_run_id,
          input.route_context,
          input.viewport_class,
        );
        const inserted = db.prepare("SELECT * FROM tester_feedback WHERE feedback_id = ?").get(feedbackId);
        if (!inserted) throw new FeedbackStoreError("STORAGE_UNAVAILABLE");
        db.exec("COMMIT");
        return { created: true, record: mapRow(inserted) };
      } catch (error) {
        try { db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
        if (error instanceof FeedbackStoreError) throw error;
        throw new FeedbackStoreError("STORAGE_UNAVAILABLE");
      }
    },

    list(filters: FeedbackListFilters): { records: FeedbackRecord[]; nextOffset: number | null } {
      const db = requireDatabase();
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (filters.category) { clauses.push("category = ?"); params.push(filters.category); }
      if (filters.status) { clauses.push("status = ?"); params.push(filters.status); }
      if (filters.screen_context) { clauses.push("screen_context = ?"); params.push(filters.screen_context); }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = db.prepare(`
SELECT * FROM tester_feedback
${where}
ORDER BY
  CASE WHEN status = 'NEW' AND category = 'BLOCKER' THEN 0
       WHEN status = 'NEW' THEN 1 ELSE 2 END,
  created_at DESC,
  feedback_id DESC
LIMIT ? OFFSET ?
`).all(...params, filters.limit + 1, filters.offset);
      const visible = rows.slice(0, filters.limit).map(mapRow);
      return {
        records: visible,
        nextOffset: rows.length > filters.limit ? filters.offset + filters.limit : null,
      };
    },

    get(feedbackId: string): FeedbackRecord | null {
      const row = requireDatabase().prepare(
        "SELECT * FROM tester_feedback WHERE feedback_id = ? LIMIT 1",
      ).get(feedbackId);
      return row ? mapRow(row) : null;
    },

    exportRecords(limit: number): FeedbackRecord[] {
      return requireDatabase().prepare(`
SELECT * FROM tester_feedback
ORDER BY created_at DESC, feedback_id DESC
LIMIT ?
`).all(limit).map(mapRow);
    },

    close(): void {
      try { database?.close(); } finally { database = null; }
    },
  };
}

async function loadNodeSqlite(): Promise<SqliteModule> {
  const moduleValue = await importModule("node:sqlite");
  if (!isRecord(moduleValue) || typeof moduleValue.DatabaseSync !== "function") {
    throw new FeedbackStoreError("STORAGE_UNAVAILABLE");
  }
  return { DatabaseSync: moduleValue.DatabaseSync as SqliteModule["DatabaseSync"] };
}

function migrate(database: SqliteDatabase, busyTimeoutMs: number): void {
  database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = FULL");
  database.exec("PRAGMA foreign_keys = ON");
  const userVersion = readIntegerField(database.prepare("PRAGMA user_version").get(), "user_version");
  if (userVersion > FEEDBACK_SCHEMA_VERSION) throw new FeedbackStoreError("SCHEMA_INVALID");

  database.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    database.exec(`
CREATE TABLE IF NOT EXISTS tester_feedback (
  feedback_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('BLOCKER','IMPROVEMENT','CLARIFICATION','LATER')),
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  screen_context TEXT NOT NULL CHECK (screen_context IN (
    'candidate-results','candidate-detail','external-checks','reports',
    'methodology','control-center','trusted-preview','feedback'
  )),
  locale TEXT NOT NULL CHECK (locale IN ('pl','en')),
  build_sha TEXT,
  runtime_mode TEXT NOT NULL,
  pseudonymous_session_id TEXT NOT NULL,
  submission_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('NEW','TRIAGED','PLANNED','RESOLVED','CLOSED')),
  candidate_chain TEXT,
  candidate_contract_address TEXT,
  follow_up_entry_id TEXT,
  report_id TEXT,
  scanner_run_id TEXT,
  route_context TEXT CHECK (route_context IS NULL OR route_context IN (
    'candidate-results','candidate-detail','external-checks','reports',
    'methodology','control-center','trusted-preview','feedback'
  )),
  viewport_class TEXT CHECK (viewport_class IS NULL OR viewport_class IN ('desktop','tablet','mobile')),
  CHECK ((candidate_chain IS NULL AND candidate_contract_address IS NULL)
      OR (candidate_chain IS NOT NULL AND candidate_contract_address IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_tester_feedback_created_at ON tester_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_tester_feedback_category ON tester_feedback(category);
CREATE INDEX IF NOT EXISTS idx_tester_feedback_status ON tester_feedback(status);
CREATE INDEX IF NOT EXISTS idx_tester_feedback_screen_context ON tester_feedback(screen_context);
PRAGMA user_version = 1;
`);
    database.exec("COMMIT");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* preserve the migration error */ }
    throw error;
  }
}

function assertSchema(database: SqliteDatabase): void {
  const version = readIntegerField(database.prepare("PRAGMA user_version").get(), "user_version");
  const columns = database.prepare("PRAGMA table_info(tester_feedback)").all();
  const columnNames = new Set(columns.map((row) => isRecord(row) ? row.name : null));
  const required = [
    "feedback_id", "schema_version", "created_at", "updated_at", "category", "title",
    "details", "screen_context", "locale", "runtime_mode", "pseudonymous_session_id",
    "submission_key", "status",
  ];
  const indexes = database.prepare("PRAGMA index_list(tester_feedback)").all();
  const namedIndexes = new Set(indexes.map((row) => isRecord(row) ? row.name : null));
  const requiredIndexes = [
    "idx_tester_feedback_created_at",
    "idx_tester_feedback_category",
    "idx_tester_feedback_status",
    "idx_tester_feedback_screen_context",
  ];
  const hasUniqueSubmissionKey = indexes.some((row) => {
    if (!isRecord(row) || Number(row.unique) !== 1 || typeof row.name !== "string" || !/^[A-Za-z0-9_]+$/.test(row.name)) {
      return false;
    }
    const indexedColumns = database.prepare(`PRAGMA index_info(${row.name})`).all();
    return indexedColumns.length === 1
      && isRecord(indexedColumns[0])
      && indexedColumns[0].name === "submission_key";
  });
  if (
    version !== FEEDBACK_SCHEMA_VERSION
    || required.some((name) => !columnNames.has(name))
    || requiredIndexes.some((name) => !namedIndexes.has(name))
    || !hasUniqueSubmissionKey
  ) {
    throw new FeedbackStoreError("SCHEMA_INVALID");
  }
}

function readSummary(database: SqliteDatabase): Omit<FeedbackStoreSummary, "storage_available" | "feedback_status"> {
  const row = database.prepare(`
SELECT
  COUNT(*) AS total_count,
  SUM(CASE WHEN status = 'NEW' THEN 1 ELSE 0 END) AS new_count,
  SUM(CASE WHEN category = 'BLOCKER' THEN 1 ELSE 0 END) AS blocker_count,
  SUM(CASE WHEN category = 'IMPROVEMENT' THEN 1 ELSE 0 END) AS improvement_count,
  SUM(CASE WHEN category = 'CLARIFICATION' THEN 1 ELSE 0 END) AS clarification_count,
  SUM(CASE WHEN category = 'LATER' THEN 1 ELSE 0 END) AS later_count,
  MAX(created_at) AS latest_feedback_at,
  MIN(CASE WHEN status = 'NEW' THEN created_at ELSE NULL END) AS oldest_new_feedback_at
FROM tester_feedback
`).get();
  if (!isRecord(row)) throw new FeedbackStoreError("STORAGE_UNAVAILABLE");
  return {
    total_count: readIntegerField(row, "total_count"),
    new_count: readIntegerField(row, "new_count"),
    blocker_count: readIntegerField(row, "blocker_count"),
    improvement_count: readIntegerField(row, "improvement_count"),
    clarification_count: readIntegerField(row, "clarification_count"),
    later_count: readIntegerField(row, "later_count"),
    latest_feedback_at: readNullableString(row, "latest_feedback_at"),
    oldest_new_feedback_at: readNullableString(row, "oldest_new_feedback_at"),
  };
}

function unavailableSummary(): FeedbackStoreSummary {
  return {
    storage_available: false,
    feedback_status: "NOT_READY",
    total_count: 0,
    new_count: 0,
    blocker_count: 0,
    improvement_count: 0,
    clarification_count: 0,
    later_count: 0,
    latest_feedback_at: null,
    oldest_new_feedback_at: null,
  };
}

function mapRow(value: unknown): FeedbackRecord {
  if (!isRecord(value)) throw new FeedbackStoreError("SCHEMA_INVALID");
  const category = value.category;
  const status = value.status;
  const screenContext = value.screen_context;
  const locale = value.locale;
  if (!isFeedbackCategory(category) || !isFeedbackStatus(status) || !isFeedbackScreenContext(screenContext)) {
    throw new FeedbackStoreError("SCHEMA_INVALID");
  }
  if (locale !== "pl" && locale !== "en") throw new FeedbackStoreError("SCHEMA_INVALID");
  const chain = readNullableString(value, "candidate_chain");
  const contract = readNullableString(value, "candidate_contract_address");
  return {
    feedback_id: readRequiredString(value, "feedback_id"),
    schema_version: FEEDBACK_SCHEMA_VERSION,
    created_at: readRequiredString(value, "created_at"),
    updated_at: readRequiredString(value, "updated_at"),
    category,
    title: readRequiredString(value, "title"),
    details: readRequiredString(value, "details"),
    screen_context: screenContext,
    locale,
    build_sha: readNullableString(value, "build_sha"),
    runtime_mode: readRequiredString(value, "runtime_mode"),
    pseudonymous_session_id: readRequiredString(value, "pseudonymous_session_id"),
    submission_key: readRequiredString(value, "submission_key"),
    status,
    candidate_identity: chain && contract ? { chain, contract_address: contract } : null,
    follow_up_entry_id: readNullableString(value, "follow_up_entry_id"),
    report_id: readNullableString(value, "report_id"),
    scanner_run_id: readNullableString(value, "scanner_run_id"),
    route_context: isFeedbackScreenContext(value.route_context) ? value.route_context : null,
    viewport_class: isViewportClass(value.viewport_class) ? value.viewport_class : null,
  };
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string") throw new FeedbackStoreError("SCHEMA_INVALID");
  return field;
}

function readNullableString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  if (field === null || field === undefined) return null;
  if (typeof field !== "string") throw new FeedbackStoreError("SCHEMA_INVALID");
  return field;
}

function readIntegerField(value: unknown, key: string): number {
  if (!isRecord(value)) return 0;
  const field = value[key];
  const numeric = typeof field === "bigint" ? Number(field) : field;
  return typeof numeric === "number" && Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function normalizePositiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0 && value <= maximum ? value : fallback;
}

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return typeof value === "string" && (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

export function isFeedbackScreenContext(value: unknown): value is FeedbackScreenContext {
  return typeof value === "string" && (FEEDBACK_SCREEN_CONTEXTS as readonly string[]).includes(value);
}

function isViewportClass(value: unknown): value is FeedbackViewportClass {
  return value === "desktop" || value === "tablet" || value === "mobile";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
