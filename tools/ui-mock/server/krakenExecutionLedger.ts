import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type KrakenExecutionLedgerStatus =
  | "RESERVED"
  | "PLACED"
  | "PROVIDER_REJECTED"
  | "AUTH_FAILED"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "TRANSPORT_ERROR";

export type KrakenExecutionLedgerRecord = {
  intent_id: string;
  signal_id: string;
  cli_ord_id: string;
  request_fingerprint: string;
  status: KrakenExecutionLedgerStatus;
  provider_order_id: string | null;
  provider_status: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};

type SqliteStatement = { get(...params: unknown[]): unknown; run(...params: unknown[]): unknown };
type SqliteDatabase = { exec(sql: string): void; prepare(sql: string): SqliteStatement; close(): void };
type SqliteModule = { DatabaseSync: new (filename: string) => SqliteDatabase };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PATH = resolve(ROOT, ".local", "kraken-execution-ledger.sqlite");
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export class KrakenExecutionLedgerError extends Error {
  readonly code = "KRAKEN_EXECUTION_LEDGER_UNAVAILABLE";

  constructor() {
    super("KRAKEN_EXECUTION_LEDGER_UNAVAILABLE");
    this.name = "KrakenExecutionLedgerError";
  }
}

export type KrakenExecutionLedger = Awaited<ReturnType<typeof createKrakenExecutionLedger>>;

export function getDefaultKrakenExecutionLedgerPath(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = env.CRYPTO_EDGE_KRAKEN_EXECUTION_SQLITE_PATH?.trim();
  if (!configured) return DEFAULT_PATH;
  return isAbsolute(configured) ? resolve(configured) : resolve(ROOT, configured);
}

export async function createKrakenExecutionLedger(options: {
  databaseFilePath?: string;
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
} = {}) {
  const env = options.env ?? process.env;
  const databaseFilePath = resolve(options.databaseFilePath ?? getDefaultKrakenExecutionLedgerPath(env));
  const now = options.now ?? (() => new Date());

  let database: SqliteDatabase;
  try {
    mkdirSync(dirname(databaseFilePath), { recursive: true });
    const sqlite = await loadSqlite();
    database = new sqlite.DatabaseSync(databaseFilePath);
    migrate(database);
  } catch {
    throw new KrakenExecutionLedgerError();
  }

  const selectSql =
    "SELECT intent_id, signal_id, cli_ord_id, request_fingerprint, status, " +
    "provider_order_id, provider_status, error_code, created_at, updated_at " +
    "FROM kraken_execution_ledger WHERE intent_id = ?";

  return {
    databaseFilePath,

    get(intentId: string): KrakenExecutionLedgerRecord | null {
      assertId(intentId);
      try {
        const row = database.prepare(selectSql).get(intentId);
        return row ? mapRecord(row) : null;
      } catch (error) {
        if (error instanceof KrakenExecutionLedgerError) throw error;
        throw new KrakenExecutionLedgerError();
      }
    },

    reserve(input: {
      intent_id: string;
      signal_id: string;
      cli_ord_id: string;
      request_fingerprint: string;
    }): { reserved: true; record: KrakenExecutionLedgerRecord } | { reserved: false; record: KrakenExecutionLedgerRecord } {
      assertId(input.intent_id);
      assertId(input.signal_id);
      assertId(input.cli_ord_id);
      assertFingerprint(input.request_fingerprint);

      let transactionOpen = false;
      try {
        database.exec("BEGIN IMMEDIATE TRANSACTION");
        transactionOpen = true;

        const existingRow = database.prepare(selectSql).get(input.intent_id);
        if (existingRow) {
          const existing = mapRecord(existingRow);
          database.exec("COMMIT");
          transactionOpen = false;
          return { reserved: false, record: existing };
        }

        const timestamp = validIso(now());
        if (!timestamp) throw new KrakenExecutionLedgerError();

        database.prepare(
          "INSERT INTO kraken_execution_ledger (" +
          "intent_id, signal_id, cli_ord_id, request_fingerprint, status, " +
          "provider_order_id, provider_status, error_code, created_at, updated_at" +
          ") VALUES (?, ?, ?, ?, 'RESERVED', NULL, NULL, NULL, ?, ?)"
        ).run(
          input.intent_id,
          input.signal_id,
          input.cli_ord_id,
          input.request_fingerprint,
          timestamp,
          timestamp,
        );

        const inserted = database.prepare(selectSql).get(input.intent_id);
        const record = mapRecord(inserted);
        database.exec("COMMIT");
        transactionOpen = false;
        return { reserved: true, record };
      } catch (error) {
        if (transactionOpen) {
          try { database.exec("ROLLBACK"); } catch { /* preserve original error */ }
        }
        if (error instanceof KrakenExecutionLedgerError) throw error;
        throw new KrakenExecutionLedgerError();
      }
    },

    complete(intentId: string, result: {
      status: Exclude<KrakenExecutionLedgerStatus, "RESERVED">;
      provider_order_id: string | null;
      provider_status: string | null;
      error_code: string | null;
    }): KrakenExecutionLedgerRecord {
      assertId(intentId);
      const timestamp = validIso(now());
      if (!timestamp) throw new KrakenExecutionLedgerError();

      let transactionOpen = false;
      try {
        database.exec("BEGIN IMMEDIATE TRANSACTION");
        transactionOpen = true;

        const existing = database.prepare(selectSql).get(intentId);
        const record = mapRecord(existing);
        if (record.status !== "RESERVED") {
          database.exec("COMMIT");
          transactionOpen = false;
          return record;
        }

        database.prepare(
          "UPDATE kraken_execution_ledger " +
          "SET status = ?, provider_order_id = ?, provider_status = ?, error_code = ?, updated_at = ? " +
          "WHERE intent_id = ? AND status = 'RESERVED'"
        ).run(
          result.status,
          result.provider_order_id,
          result.provider_status,
          result.error_code,
          timestamp,
          intentId,
        );

        const updated = database.prepare(selectSql).get(intentId);
        const mapped = mapRecord(updated);
        database.exec("COMMIT");
        transactionOpen = false;
        return mapped;
      } catch (error) {
        if (transactionOpen) {
          try { database.exec("ROLLBACK"); } catch { /* preserve original error */ }
        }
        if (error instanceof KrakenExecutionLedgerError) throw error;
        throw new KrakenExecutionLedgerError();
      }
    },

    close(): void {
      database.close();
    },
  };
}

async function loadSqlite(): Promise<SqliteModule> {
  const module = await dynamicImport("node:sqlite");
  if (!isRecord(module) || typeof module.DatabaseSync !== "function") throw new Error("sqlite unavailable");
  return { DatabaseSync: module.DatabaseSync as SqliteModule["DatabaseSync"] };
}

function migrate(database: SqliteDatabase): void {
  database.exec(
    "PRAGMA journal_mode = WAL;" +
    "PRAGMA synchronous = FULL;" +
    "PRAGMA busy_timeout = 5000;" +
    "CREATE TABLE IF NOT EXISTS kraken_execution_ledger (" +
      "intent_id TEXT PRIMARY KEY NOT NULL," +
      "signal_id TEXT NOT NULL," +
      "cli_ord_id TEXT NOT NULL UNIQUE," +
      "request_fingerprint TEXT NOT NULL," +
      "status TEXT NOT NULL CHECK (status IN (" +
        "'RESERVED','PLACED','PROVIDER_REJECTED','AUTH_FAILED','HTTP_ERROR','INVALID_RESPONSE','TRANSPORT_ERROR'" +
      "))," +
      "provider_order_id TEXT," +
      "provider_status TEXT," +
      "error_code TEXT," +
      "created_at TEXT NOT NULL," +
      "updated_at TEXT NOT NULL" +
    ");" +
    "CREATE INDEX IF NOT EXISTS idx_kraken_execution_ledger_signal ON kraken_execution_ledger(signal_id);"
  );
}

function mapRecord(value: unknown): KrakenExecutionLedgerRecord {
  if (!isRecord(value)) throw new KrakenExecutionLedgerError();
  const status = value.status;
  if (!isStatus(status)) throw new KrakenExecutionLedgerError();

  const createdAt = validIso(value.created_at);
  const updatedAt = validIso(value.updated_at);
  if (
    typeof value.intent_id !== "string"
    || typeof value.signal_id !== "string"
    || typeof value.cli_ord_id !== "string"
    || typeof value.request_fingerprint !== "string"
    || !createdAt
    || !updatedAt
  ) throw new KrakenExecutionLedgerError();

  return {
    intent_id: value.intent_id,
    signal_id: value.signal_id,
    cli_ord_id: value.cli_ord_id,
    request_fingerprint: value.request_fingerprint,
    status,
    provider_order_id: nullableString(value.provider_order_id),
    provider_status: nullableString(value.provider_status),
    error_code: nullableString(value.error_code),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function isStatus(value: unknown): value is KrakenExecutionLedgerStatus {
  return typeof value === "string" && [
    "RESERVED",
    "PLACED",
    "PROVIDER_REJECTED",
    "AUTH_FAILED",
    "HTTP_ERROR",
    "INVALID_RESPONSE",
    "TRANSPORT_ERROR",
  ].includes(value);
}

function assertId(value: string): void {
  if (typeof value !== "string" || value.length < 1 || value.length > 255) {
    throw new KrakenExecutionLedgerError();
  }
}

function assertFingerprint(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new KrakenExecutionLedgerError();
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function validIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
