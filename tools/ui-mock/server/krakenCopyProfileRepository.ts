import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KRAKEN_COPY_PROFILE_SCHEMA_VERSION = "crypto_edge_kraken_copy_profile_v1" as const;

/** Browser-safe profile. The SQLite actor key deliberately never leaves this repository. */
export type KrakenCopyProfile = {
  schema_version: typeof KRAKEN_COPY_PROFILE_SCHEMA_VERSION;
  simulated_equity_usd: number;
  risk_pct_per_trade: number;
  max_leverage: number;
  max_position_notional_usd: number | null;
  updated_at: string;
};

export type KrakenCopyProfileWrite = Pick<
  KrakenCopyProfile,
  "simulated_equity_usd" | "risk_pct_per_trade" | "max_leverage" | "max_position_notional_usd"
>;

type SqliteStatement = { get(...params: unknown[]): unknown; run(...params: unknown[]): unknown };
type SqliteDatabase = { exec(sql: string): void; prepare(sql: string): SqliteStatement; close(): void };
type SqliteModule = { DatabaseSync: new (filename: string) => SqliteDatabase };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PATH = resolve(ROOT, ".local", "kraken-copy-profiles.sqlite");
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export class KrakenCopyProfileRepositoryError extends Error {
  readonly code = "KRAKEN_COPY_PROFILE_UNAVAILABLE";

  constructor() {
    super("KRAKEN_COPY_PROFILE_UNAVAILABLE");
    this.name = "KrakenCopyProfileRepositoryError";
  }
}

export type KrakenCopyProfileRepository = Awaited<ReturnType<typeof createKrakenCopyProfileRepository>>;

export function getDefaultKrakenCopyProfileDatabasePath(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env.CRYPTO_EDGE_KRAKEN_PROFILE_SQLITE_PATH?.trim();
  if (!configured) return DEFAULT_PATH;
  return isAbsolute(configured) ? resolve(configured) : resolve(ROOT, configured);
}

export async function createKrakenCopyProfileRepository(options: {
  databaseFilePath?: string;
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
} = {}) {
  const env = options.env ?? process.env;
  const defaults = resolveProfileDefaults(env);
  const databaseFilePath = resolve(options.databaseFilePath ?? getDefaultKrakenCopyProfileDatabasePath(env));
  const now = options.now ?? (() => new Date());
  let database: SqliteDatabase;
  try {
    mkdirSync(dirname(databaseFilePath), { recursive: true });
    const sqlite = await loadSqlite();
    database = new sqlite.DatabaseSync(databaseFilePath);
    migrate(database);
  } catch {
    throw new KrakenCopyProfileRepositoryError();
  }

  return {
    databaseFilePath,

    get(actorId: string): KrakenCopyProfile {
      assertActorId(actorId);
      try {
        const row = database.prepare(`
SELECT simulated_equity_usd, risk_pct_per_trade, max_leverage, max_position_notional_usd, updated_at
FROM kraken_copy_profiles
WHERE actor_id = ?
`).get(actorId);
        return row ? mapProfile(row) : defaultProfile(defaults, now());
      } catch (error) {
        if (error instanceof KrakenCopyProfileRepositoryError) throw error;
        throw new KrakenCopyProfileRepositoryError();
      }
    },

    save(actorId: string, value: KrakenCopyProfileWrite): KrakenCopyProfile {
      assertActorId(actorId);
      const profile = profileFromWrite(value, now());
      let transactionOpen = false;
      try {
        database.exec("BEGIN IMMEDIATE TRANSACTION");
        transactionOpen = true;
        database.prepare(`
INSERT INTO kraken_copy_profiles (
  actor_id, simulated_equity_usd, risk_pct_per_trade, max_leverage, max_position_notional_usd, updated_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(actor_id) DO UPDATE SET
  simulated_equity_usd = excluded.simulated_equity_usd,
  risk_pct_per_trade = excluded.risk_pct_per_trade,
  max_leverage = excluded.max_leverage,
  max_position_notional_usd = excluded.max_position_notional_usd,
  updated_at = excluded.updated_at
`).run(
          actorId,
          profile.simulated_equity_usd,
          profile.risk_pct_per_trade,
          profile.max_leverage,
          profile.max_position_notional_usd,
          profile.updated_at,
        );
        database.exec("COMMIT");
        transactionOpen = false;
        return profile;
      } catch (error) {
        if (transactionOpen) {
          try { database.exec("ROLLBACK"); } catch { /* preserve the original failure */ }
        }
        if (error instanceof KrakenCopyProfileRepositoryError) throw error;
        throw new KrakenCopyProfileRepositoryError();
      }
    },

    close(): void {
      database.close();
    },
  };
}

function resolveProfileDefaults(env: Readonly<Record<string, string | undefined>>): KrakenCopyProfileWrite {
  return {
    simulated_equity_usd: configuredPositiveFinite(env.CRYPTO_EDGE_KRAKEN_SIMULATED_EQUITY_USD, 10_000),
    risk_pct_per_trade: configuredPositiveFinite(env.CRYPTO_EDGE_KRAKEN_DEFAULT_RISK_PCT, 0.5),
    max_leverage: configuredAtLeastOne(env.CRYPTO_EDGE_KRAKEN_DEFAULT_MAX_LEVERAGE, 1),
    max_position_notional_usd: null,
  };
}

function defaultProfile(defaults: KrakenCopyProfileWrite, now: Date): KrakenCopyProfile {
  return profileFromWrite(defaults, now);
}

function profileFromWrite(value: KrakenCopyProfileWrite, now: Date): KrakenCopyProfile {
  if (!isPositiveFinite(value.simulated_equity_usd)
    || !isPositiveFinite(value.risk_pct_per_trade)
    || !isFiniteNumber(value.max_leverage) || value.max_leverage < 1
    || (value.max_position_notional_usd !== null && !isPositiveFinite(value.max_position_notional_usd))) {
    throw new KrakenCopyProfileRepositoryError();
  }
  const updatedAt = validIso(now);
  if (!updatedAt) throw new KrakenCopyProfileRepositoryError();
  return {
    schema_version: KRAKEN_COPY_PROFILE_SCHEMA_VERSION,
    simulated_equity_usd: value.simulated_equity_usd,
    risk_pct_per_trade: value.risk_pct_per_trade,
    max_leverage: value.max_leverage,
    max_position_notional_usd: value.max_position_notional_usd,
    updated_at: updatedAt,
  };
}

function mapProfile(value: unknown): KrakenCopyProfile {
  const updatedAt = isRecord(value) ? validIso(value.updated_at) : null;
  if (!isRecord(value)
    || !isPositiveFinite(value.simulated_equity_usd)
    || !isPositiveFinite(value.risk_pct_per_trade)
    || !isFiniteNumber(value.max_leverage) || value.max_leverage < 1
    || (value.max_position_notional_usd !== null && !isPositiveFinite(value.max_position_notional_usd))
    || !updatedAt) {
    throw new KrakenCopyProfileRepositoryError();
  }
  return {
    schema_version: KRAKEN_COPY_PROFILE_SCHEMA_VERSION,
    simulated_equity_usd: value.simulated_equity_usd,
    risk_pct_per_trade: value.risk_pct_per_trade,
    max_leverage: value.max_leverage,
    max_position_notional_usd: value.max_position_notional_usd,
    updated_at: updatedAt,
  };
}

function configuredPositiveFinite(value: string | undefined, fallback: number): number {
  const parsed = parseFiniteConfig(value);
  return parsed !== null && parsed > 0 ? parsed : fallback;
}

function configuredAtLeastOne(value: string | undefined, fallback: number): number {
  const parsed = parseFiniteConfig(value);
  return parsed !== null && parsed >= 1 ? parsed : fallback;
}

function parseFiniteConfig(value: string | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertActorId(actorId: string): void {
  if (typeof actorId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(actorId)) {
    throw new KrakenCopyProfileRepositoryError();
  }
}

function validIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return null;
  return value;
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
CREATE TABLE IF NOT EXISTS kraken_copy_profile_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kraken_copy_profiles (
  actor_id TEXT NOT NULL PRIMARY KEY,
  simulated_equity_usd REAL NOT NULL,
  risk_pct_per_trade REAL NOT NULL,
  max_leverage REAL NOT NULL,
  max_position_notional_usd REAL,
  updated_at TEXT NOT NULL
);
`);
  database.prepare("INSERT INTO kraken_copy_profile_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run("schema_version", KRAKEN_COPY_PROFILE_SCHEMA_VERSION);
}

function isPositiveFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
