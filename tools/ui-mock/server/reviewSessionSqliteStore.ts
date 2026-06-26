import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEmptyReviewSession,
  validateReviewSessionState,
} from "../src/services/reviewSessionValidation.js";
import type { ReviewSessionState } from "../src/types/reviewSessionTypes.js";
import {
  ReviewSessionStorageProviderError,
  type ReviewSessionStorageDiagnostics,
  type ReviewSessionStorageProvider,
  type ReviewSessionStorageResult,
  type ReviewSessionStorageSourceMeta,
} from "./reviewSessionStorageProvider.js";

export type ReviewSessionSqliteStoreOptions = {
  databaseFilePath?: string;
};

export type ReviewSessionSqliteStoreResult = ReviewSessionStorageResult;

export type ReviewSessionSqliteDiagnostics = ReviewSessionStorageDiagnostics;

export class ReviewSessionSqliteStoreError extends ReviewSessionStorageProviderError {
  constructor(code: ReviewSessionStorageProviderError["code"], message: string) {
    super(code, message);
    this.name = "ReviewSessionSqliteStoreError";
  }
}

type SqliteStatement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
};

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
};

type SqliteModule = {
  DatabaseSync: new (filename: string) => SqliteDatabase;
};

const defaultDatabaseFilePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".local",
  "review-session.sqlite",
);

const importModule = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<unknown>;

export function getDefaultReviewSessionSqliteFilePath(): string {
  return defaultDatabaseFilePath;
}

export function createSqliteReviewSessionStorageProvider(
  options: ReviewSessionSqliteStoreOptions = {},
): ReviewSessionStorageProvider {
  return {
    read: () => readReviewSessionSqlite(options),
    write: (state: unknown) => writeReviewSessionSqlite(state, options),
    diagnostics: () => readReviewSessionSqliteDiagnostics(options),
  };
}

export async function readReviewSessionSqliteDiagnostics(
  options: ReviewSessionSqliteStoreOptions = {},
): Promise<ReviewSessionSqliteDiagnostics> {
  const storageFile = resolveDatabaseFile(options);
  const checkedAt = new Date().toISOString();
  const fileStats = await getDatabaseFileStats(storageFile);

  if (!fileStats.exists) {
    return buildDiagnostics({
      storageFile,
      checkedAt,
      fileExists: false,
      fileSizeBytes: null,
      entriesCount: 0,
      valid: true,
    });
  }

  let database: SqliteDatabase | null = null;

  try {
    database = await openDatabase(storageFile);
    ensureSchema(database);

    const state = readStateFromDatabase(database);
    const validation = validateReviewSessionState(state, "Review session storage");
    const currentFileStats = await getDatabaseFileStats(storageFile);

    if (!validation.ok) {
      return buildDiagnostics({
        storageFile,
        checkedAt,
        fileExists: true,
        fileSizeBytes: currentFileStats.exists ? currentFileStats.size : fileStats.size,
        entriesCount: 0,
        valid: false,
        warning: validation.error,
      });
    }

    return buildDiagnostics({
      storageFile,
      checkedAt,
      fileExists: true,
      fileSizeBytes: currentFileStats.exists ? currentFileStats.size : fileStats.size,
      entriesCount: validation.entries_count,
      valid: true,
    });
  } catch (error) {
    return buildDiagnostics({
      storageFile,
      checkedAt,
      fileExists: true,
      fileSizeBytes: fileStats.size,
      entriesCount: 0,
      valid: false,
      warning: `Review session SQLite storage could not be read or parsed: ${getErrorMessage(error)}`,
    });
  } finally {
    database?.close();
  }
}

export async function readReviewSessionSqlite(
  options: ReviewSessionSqliteStoreOptions = {},
): Promise<ReviewSessionSqliteStoreResult> {
  const storageFile = resolveDatabaseFile(options);
  const fileStats = await getDatabaseFileStats(storageFile);

  if (!fileStats.exists) {
    return {
      state: createEmptyReviewSession(),
      _source_meta: buildSourceMeta(storageFile),
    };
  }

  let database: SqliteDatabase | null = null;

  try {
    database = await openDatabase(storageFile);
    ensureSchema(database);

    const state = readStateFromDatabase(database);
    const validation = validateReviewSessionState(state, "Review session storage");

    if (!validation.ok) {
      return emptyResult(storageFile, validation.error);
    }

    return {
      state: validation.state,
      _source_meta: buildSourceMeta(storageFile),
    };
  } catch (error) {
    return emptyResult(
      storageFile,
      `Review session SQLite storage could not be read or parsed: ${getErrorMessage(error)}`,
    );
  } finally {
    database?.close();
  }
}

export async function writeReviewSessionSqlite(
  state: unknown,
  options: ReviewSessionSqliteStoreOptions = {},
): Promise<ReviewSessionSqliteStoreResult> {
  const validation = validateReviewSessionState(state, "Review session");

  if (!validation.ok) {
    throw new ReviewSessionSqliteStoreError("invalid_review_session", validation.error);
  }

  const storageFile = resolveDatabaseFile(options);
  let database: SqliteDatabase | null = null;

  try {
    await mkdir(dirname(storageFile), { recursive: true });
    database = await openDatabase(storageFile);
    ensureSchema(database);
    replaceState(database, validation.state);

    return {
      state: validation.state,
      _source_meta: buildSourceMeta(storageFile),
    };
  } catch (error) {
    throw new ReviewSessionSqliteStoreError(
      "write_failed",
      `Review session SQLite storage write failed: ${getErrorMessage(error)}`,
    );
  } finally {
    database?.close();
  }
}

function resolveDatabaseFile(options: ReviewSessionSqliteStoreOptions): string {
  return resolve(options.databaseFilePath ?? defaultDatabaseFilePath);
}

async function openDatabase(storageFile: string): Promise<SqliteDatabase> {
  const { DatabaseSync } = await loadNodeSqlite();
  return new DatabaseSync(storageFile);
}

async function loadNodeSqlite(): Promise<SqliteModule> {
  const sqliteModule = await importModule("node:sqlite");

  if (!isRecord(sqliteModule) || typeof sqliteModule.DatabaseSync !== "function") {
    throw new Error("node:sqlite DatabaseSync is unavailable.");
  }

  return {
    DatabaseSync: sqliteModule.DatabaseSync as SqliteModule["DatabaseSync"],
  };
}

function ensureSchema(database: SqliteDatabase): void {
  database.exec(`
CREATE TABLE IF NOT EXISTS review_session_entries (
  candidate_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  note TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_session_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

  database
    .prepare(`
INSERT INTO review_session_meta (key, value)
VALUES (?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value
`)
    .run("schema_version", "1");
}

function readStateFromDatabase(database: SqliteDatabase): unknown {
  const rows = database
    .prepare(`
SELECT candidate_id, status, note, updated_at
FROM review_session_entries
ORDER BY candidate_id
`)
    .all();

  const entries: Record<string, unknown> = {};

  for (const row of rows) {
    if (!isRecord(row) || typeof row.candidate_id !== "string") {
      return {
        version: 1,
        entries: {
          invalid_sqlite_row: row,
        },
      };
    }

    entries[row.candidate_id] = {
      candidate_id: row.candidate_id,
      status: row.status,
      note: row.note,
      updated_at: row.updated_at,
    };
  }

  return {
    version: 1,
    entries,
  };
}

function replaceState(database: SqliteDatabase, state: ReviewSessionState): void {
  database.exec("BEGIN IMMEDIATE TRANSACTION");

  try {
    database.prepare("DELETE FROM review_session_entries").run();

    const insertEntry = database.prepare(`
INSERT INTO review_session_entries (candidate_id, status, note, updated_at)
VALUES (?, ?, ?, ?)
`);

    for (const record of Object.values(state.entries)) {
      insertEntry.run(record.candidate_id, record.status, record.note, record.updated_at);
    }

    database
      .prepare(`
INSERT INTO review_session_meta (key, value)
VALUES (?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value
`)
      .run("schema_version", "1");

    database.exec("COMMIT");
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // The original SQLite error is more useful than a failed rollback.
    }

    throw error;
  }
}

async function getDatabaseFileStats(
  storageFile: string,
): Promise<{ exists: true; size: number } | { exists: false }> {
  try {
    const fileStats = await stat(storageFile);
    return {
      exists: true,
      size: fileStats.size,
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        exists: false,
      };
    }

    throw error;
  }
}

function emptyResult(storageFile: string, warning: string): ReviewSessionSqliteStoreResult {
  return {
    state: createEmptyReviewSession(),
    _source_meta: buildSourceMeta(storageFile, warning),
  };
}

function buildSourceMeta(storageFile: string, warning?: string): ReviewSessionStorageSourceMeta {
  return {
    source_kind: "sqlite-review-session",
    storage_file: storageFile,
    loaded_at: new Date().toISOString(),
    ...(warning ? { warning } : {}),
  };
}

function buildDiagnostics(input: {
  storageFile: string;
  checkedAt: string;
  fileExists: boolean;
  fileSizeBytes: number | null;
  entriesCount: number;
  valid: boolean;
  warning?: string;
}): ReviewSessionSqliteDiagnostics {
  return {
    source_kind: "sqlite-review-session-diagnostics",
    storage_file: input.storageFile,
    checked_at: input.checkedAt,
    file_exists: input.fileExists,
    file_size_bytes: input.fileSizeBytes,
    entries_count: input.entriesCount,
    valid: input.valid,
    ...(input.warning ? { warning: input.warning } : {}),
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
