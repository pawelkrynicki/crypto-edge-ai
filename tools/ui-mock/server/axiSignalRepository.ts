import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AXI_CRYPTO_SIGNAL_SCHEMA_VERSION,
  AxiCryptoSignalValidationError,
  canonicalAxiCryptoSignalPayload,
  validateAxiCryptoSignal,
  validateAxiSignalId,
  type AxiCryptoSignal,
} from "./axiCryptoSignalContract.js";

export const AXI_SIGNAL_REPOSITORY_SCHEMA_VERSION = "axi_signal_repository_sqlite_v1" as const;

export type AxiStoredSignal = {
  signal: AxiCryptoSignal;
  received_at: string;
};

export type AxiSignalIngestResult =
  | { status: "CREATED"; record: AxiStoredSignal }
  | { status: "DUPLICATE"; record: AxiStoredSignal }
  | { status: "CONFLICT" };

export type AxiSignalRepository = Awaited<ReturnType<typeof createAxiSignalRepository>>;

type SqliteStatement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
};
type SqliteDatabase = { exec(sql: string): void; prepare(sql: string): SqliteStatement; close(): void };
type SqliteModule = { DatabaseSync: new (filename: string) => SqliteDatabase };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PATH = resolve(ROOT, ".local", "axi-signals.sqlite");
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export class AxiSignalRepositoryError extends Error {
  readonly code: "AXI_SIGNAL_REPOSITORY_UNAVAILABLE";

  constructor() {
    super("AXI_SIGNAL_REPOSITORY_UNAVAILABLE");
    this.name = "AxiSignalRepositoryError";
    this.code = "AXI_SIGNAL_REPOSITORY_UNAVAILABLE";
  }
}

export function getDefaultAxiSignalDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CRYPTO_EDGE_AXI_SIGNAL_SQLITE_PATH?.trim();
  if (!configured) return DEFAULT_PATH;
  return isAbsolute(configured) ? resolve(configured) : resolve(ROOT, configured);
}

export async function createAxiSignalRepository(options: { databaseFilePath?: string } = {}) {
  const databaseFilePath = resolve(options.databaseFilePath ?? getDefaultAxiSignalDatabasePath());
  let database: SqliteDatabase;
  try {
    mkdirSync(dirname(databaseFilePath), { recursive: true });
    const sqlite = await loadSqlite();
    database = new sqlite.DatabaseSync(databaseFilePath);
    migrate(database);
  } catch {
    throw new AxiSignalRepositoryError();
  }

  const getById = (signalId: string): AxiStoredSignal | null => {
    try {
      const row = database.prepare(`
SELECT signal_id, canonical_payload, received_at
FROM axi_crypto_signals
WHERE signal_id = ?
`).get(signalId);
      return row ? mapStoredSignal(row) : null;
    } catch {
      throw new AxiSignalRepositoryError();
    }
  };

  return {
    databaseFilePath,

    ingest(input: { signal: AxiCryptoSignal; now?: Date }): AxiSignalIngestResult {
      const signal = validateAxiCryptoSignal(input.signal);
      const receivedAt = receivedAtFrom(input.now ?? new Date());
      const canonicalPayload = canonicalAxiCryptoSignalPayload(signal);
      let transactionOpen = false;
      try {
        database.exec("BEGIN IMMEDIATE TRANSACTION");
        transactionOpen = true;
        const existing = database.prepare(`
SELECT signal_id, canonical_payload, received_at
FROM axi_crypto_signals
WHERE signal_id = ?
`).get(signal.signal_id);
        if (existing) {
          const record = mapStoredSignal(existing);
          database.exec("COMMIT");
          transactionOpen = false;
          return canonicalAxiCryptoSignalPayload(record.signal) === canonicalPayload
            ? { status: "DUPLICATE", record }
            : { status: "CONFLICT" };
        }
        database.prepare(`
INSERT INTO axi_crypto_signals (
  signal_id, schema_version, canonical_payload, received_at,
  source_signal_time, symbol, side, order_type
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
          signal.signal_id,
          AXI_CRYPTO_SIGNAL_SCHEMA_VERSION,
          canonicalPayload,
          receivedAt,
          signal.trade.source_signal_time,
          signal.trade.symbol,
          signal.trade.side,
          signal.trade.order_type,
        );
        database.exec("COMMIT");
        transactionOpen = false;
        return { status: "CREATED", record: { signal, received_at: receivedAt } };
      } catch (error) {
        if (transactionOpen) {
          try { database.exec("ROLLBACK"); } catch { /* preserve the original error */ }
        }
        if (error instanceof AxiCryptoSignalValidationError) throw error;
        throw new AxiSignalRepositoryError();
      }
    },

    get(signalId: string): AxiStoredSignal | null {
      return getById(validateAxiSignalId(signalId));
    },

    list(limit: number): AxiStoredSignal[] {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new AxiSignalRepositoryError();
      try {
        return database.prepare(`
SELECT signal_id, canonical_payload, received_at
FROM axi_crypto_signals
ORDER BY received_at DESC, signal_id ASC
LIMIT ?
`).all(limit).map(mapStoredSignal);
      } catch {
        throw new AxiSignalRepositoryError();
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
  database.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS axi_signal_repository_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS axi_crypto_signals (
  signal_id TEXT NOT NULL PRIMARY KEY,
  schema_version TEXT NOT NULL,
  canonical_payload TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source_signal_time TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  order_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS axi_crypto_signals_received_at_idx
  ON axi_crypto_signals(received_at DESC, signal_id ASC);
`);
  database.prepare("INSERT INTO axi_signal_repository_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run("schema_version", AXI_SIGNAL_REPOSITORY_SCHEMA_VERSION);
}

function mapStoredSignal(value: unknown): AxiStoredSignal {
  if (!isRecord(value) || typeof value.signal_id !== "string" || typeof value.canonical_payload !== "string") {
    throw new AxiSignalRepositoryError();
  }
  const receivedAt = receivedAtFrom(value.received_at);
  try {
    const signal = validateAxiCryptoSignal(JSON.parse(value.canonical_payload) as unknown);
    if (signal.signal_id !== value.signal_id) throw new Error("signal id mismatch");
    return { signal, received_at: receivedAt };
  } catch {
    throw new AxiSignalRepositoryError();
  }
}

function receivedAtFrom(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new AxiSignalRepositoryError();
    return value.toISOString();
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new AxiSignalRepositoryError();
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
