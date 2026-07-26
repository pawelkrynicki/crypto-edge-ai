import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { AIResearchBrief, AIResearchLocale } from "../src/types/aiResearchTypes.js";
import { AI_RESEARCH_PROMPT_VERSION, AI_RESEARCH_SCHEMA_VERSION } from "../src/types/aiResearchTypes.js";
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

export type AIResearchStoreOptions = {
  databaseFilePath?: string;
  maxRecords?: number;
  busyTimeoutMs?: number;
};

export type AIResearchStoreRecord = {
  brief: AIResearchBrief;
  status: "VALID" | "STALE";
};

const RUNTIME_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATABASE_PATH = resolve(RUNTIME_ROOT, ".local", "ai-research-brief.sqlite");
const DEFAULT_MAX_RECORDS = 5_000;
const importModule = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export class AIResearchStoreError extends Error {
  readonly code: "STORE_UNAVAILABLE" | "STORE_SCHEMA_INVALID" | "STORE_CAPACITY_REACHED";

  constructor(code: AIResearchStoreError["code"]) {
    super(code);
    this.name = "AIResearchStoreError";
    this.code = code;
  }
}

export type AIResearchStore = Awaited<ReturnType<typeof createAIResearchStore>>;

export function getDefaultAIResearchStorePath(): string {
  return DEFAULT_DATABASE_PATH;
}

export function resolveAIResearchDatabasePath(value?: string): string {
  const configured = value?.trim() || process.env.CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH?.trim();
  if (configured) return isAbsolute(configured) ? resolve(configured) : resolve(RUNTIME_ROOT, configured);
  return process.env.NODE_TEST_CONTEXT
    ? resolve(tmpdir(), `crypto-edge-ai-research-${process.pid}-${randomUUID()}.sqlite`)
    : DEFAULT_DATABASE_PATH;
}

export async function createAIResearchStore(options: AIResearchStoreOptions = {}) {
  const databaseFilePath = resolveAIResearchDatabasePath(options.databaseFilePath);
  const maxRecords = boundedInteger(options.maxRecords, DEFAULT_MAX_RECORDS, 1, 50_000);
  const busyTimeoutMs = boundedInteger(options.busyTimeoutMs, 5_000, 100, 60_000);
  let database: SqliteDatabase | null = null;
  try {
    mkdirSync(dirname(databaseFilePath), { recursive: true });
    const sqlite = await loadNodeSqlite();
    database = new sqlite.DatabaseSync(databaseFilePath);
    migrate(database, busyTimeoutMs);
    assertSchema(database);
  } catch {
    try { database?.close(); } catch { /* preserve safe store failure */ }
    throw new AIResearchStoreError("STORE_UNAVAILABLE");
  }
  const requireDb = () => {
    if (!database) throw new AIResearchStoreError("STORE_UNAVAILABLE");
    return database;
  };

  return {
    databaseFilePath,
    maxRecords,

    findExact(input: {
      chain: string;
      contract_address: string;
      locale: AIResearchLocale;
      snapshot_fingerprint: string;
      prompt_version?: string;
    }): AIResearchStoreRecord | null {
      const row = requireDb().prepare(`
SELECT ai_analysis, status FROM crypto_ai_research_briefs
WHERE chain = ? AND contract_address = ? AND locale = ?
  AND snapshot_fingerprint = ? AND prompt_version = ?
ORDER BY generated_at DESC LIMIT 1
`).get(input.chain, input.contract_address, input.locale, input.snapshot_fingerprint, input.prompt_version ?? AI_RESEARCH_PROMPT_VERSION);
      return safeRecord(row);
    },

    findLatest(chain: string, contractAddress: string, locale: AIResearchLocale): AIResearchStoreRecord | null {
      const rows = requireDb().prepare(`
SELECT ai_analysis, status FROM crypto_ai_research_briefs
WHERE chain = ? AND contract_address = ? AND locale = ?
ORDER BY generated_at DESC LIMIT 10
`).all(chain, contractAddress, locale);
      for (const row of rows) {
        const record = safeRecord(row);
        if (record) return record;
      }
      return null;
    },

    save(brief: AIResearchBrief): { created: boolean; brief: AIResearchBrief } {
      const validated = validateStoredAIResearchBrief(brief);
      if (validated.render_preview) throw new AIResearchStoreError("STORE_SCHEMA_INVALID");
      const db = requireDb();
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        const existing = db.prepare(`
SELECT ai_analysis FROM crypto_ai_research_briefs
WHERE chain = ? AND contract_address = ? AND locale = ?
  AND snapshot_fingerprint = ? AND prompt_version = ? LIMIT 1
`).get(validated.identity.chain, validated.identity.contract_address, validated.analysis_language, validated.snapshot_fingerprint, validated.prompt_version);
        if (existing && isRecord(existing) && typeof existing.ai_analysis === "string") {
          const parsed = parseBrief(existing.ai_analysis);
          if (parsed) {
            db.exec("COMMIT");
            return { created: false, brief: parsed };
          }
          db.prepare(`DELETE FROM crypto_ai_research_briefs
WHERE chain = ? AND contract_address = ? AND locale = ?
  AND snapshot_fingerprint = ? AND prompt_version = ?`).run(
            validated.identity.chain,
            validated.identity.contract_address,
            validated.analysis_language,
            validated.snapshot_fingerprint,
            validated.prompt_version,
          );
        }
        db.prepare(`
UPDATE crypto_ai_research_briefs SET status = 'STALE', updated_at = ?
WHERE chain = ? AND contract_address = ? AND locale = ? AND status = 'VALID'
`).run(validated.generated_at, validated.identity.chain, validated.identity.contract_address, validated.analysis_language);
        const count = readCount(db.prepare("SELECT COUNT(*) AS count FROM crypto_ai_research_briefs").get());
        if (count >= maxRecords) {
          db.prepare(`DELETE FROM crypto_ai_research_briefs WHERE analysis_id IN (
SELECT analysis_id FROM crypto_ai_research_briefs ORDER BY generated_at ASC LIMIT ?
)`).run(Math.max(1, count - maxRecords + 1));
        }
        db.prepare(`
INSERT INTO crypto_ai_research_briefs (
  analysis_id, schema_version, chain, contract_address, locale, snapshot_fingerprint,
  prompt_version, model, ai_analysis, prompt_tokens, completion_tokens, total_tokens,
  input_hash, output_hash, hash, generated_at, data_generated_at, status, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALID', ?, ?)
`).run(
          validated.analysis_id,
          AI_RESEARCH_SCHEMA_VERSION,
          validated.identity.chain,
          validated.identity.contract_address,
          validated.analysis_language,
          validated.snapshot_fingerprint,
          validated.prompt_version,
          validated.model,
          JSON.stringify(validated),
          validated.token_usage.prompt_tokens,
          validated.token_usage.completion_tokens,
          validated.token_usage.total_tokens,
          validated.input_hash,
          validated.output_hash,
          cacheHash(validated),
          validated.generated_at,
          validated.data_generated_at,
          validated.generated_at,
          validated.generated_at,
        );
        db.exec("COMMIT");
        return { created: true, brief: validated };
      } catch (error) {
        try { db.exec("ROLLBACK"); } catch { /* preserve original failure */ }
        if (error instanceof AIResearchStoreError) throw error;
        throw new AIResearchStoreError("STORE_UNAVAILABLE");
      }
    },

    stats(): { available: boolean; records: number; valid: number; stale: number } {
      try {
        const row = requireDb().prepare(`
SELECT COUNT(*) AS records,
SUM(CASE WHEN status = 'VALID' THEN 1 ELSE 0 END) AS valid,
SUM(CASE WHEN status = 'STALE' THEN 1 ELSE 0 END) AS stale
FROM crypto_ai_research_briefs
`).get();
        return { available: true, records: readCount(row, "records"), valid: readCount(row, "valid"), stale: readCount(row, "stale") };
      } catch {
        return { available: false, records: 0, valid: 0, stale: 0 };
      }
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
CREATE TABLE IF NOT EXISTS crypto_ai_research_briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id TEXT NOT NULL UNIQUE,
  schema_version TEXT NOT NULL CHECK (schema_version = 'ai_research_brief_v1'),
  chain TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('pl','en')),
  snapshot_fingerprint TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  ai_analysis TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL CHECK (completion_tokens >= 0),
  total_tokens INTEGER NOT NULL CHECK (total_tokens >= 0),
  input_hash TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  generated_at TEXT NOT NULL,
  data_generated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('VALID','STALE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (chain, contract_address, snapshot_fingerprint, prompt_version, locale)
);
CREATE INDEX IF NOT EXISTS idx_ai_research_identity ON crypto_ai_research_briefs(chain, contract_address);
CREATE INDEX IF NOT EXISTS idx_ai_research_generated_at ON crypto_ai_research_briefs(generated_at);
CREATE INDEX IF NOT EXISTS idx_ai_research_snapshot ON crypto_ai_research_briefs(snapshot_fingerprint);
CREATE INDEX IF NOT EXISTS idx_ai_research_status ON crypto_ai_research_briefs(status);
PRAGMA user_version = 1;
`);
}

function assertSchema(database: SqliteDatabase): void {
  const columns = database.prepare("PRAGMA table_info(crypto_ai_research_briefs)").all();
  const names = new Set(columns.map((row) => isRecord(row) ? row.name : null));
  const required = [
    "analysis_id", "schema_version", "chain", "contract_address", "locale", "snapshot_fingerprint",
    "prompt_version", "model", "ai_analysis", "prompt_tokens", "completion_tokens", "total_tokens",
    "input_hash", "output_hash", "hash", "generated_at", "data_generated_at", "status", "created_at", "updated_at",
  ];
  if (required.some((name) => !names.has(name))) throw new AIResearchStoreError("STORE_SCHEMA_INVALID");
}

function safeRecord(value: unknown): AIResearchStoreRecord | null {
  if (!isRecord(value) || typeof value.ai_analysis !== "string" || (value.status !== "VALID" && value.status !== "STALE")) return null;
  const brief = parseBrief(value.ai_analysis);
  return brief ? { brief, status: value.status } : null;
}

function parseBrief(raw: string): AIResearchBrief | null {
  try {
    return validateStoredAIResearchBrief(JSON.parse(raw));
  } catch {
    return null;
  }
}

function cacheHash(brief: AIResearchBrief): string {
  return brief.input_hash;
}

async function loadNodeSqlite(): Promise<SqliteModule> {
  const value = await importModule("node:sqlite");
  if (!isRecord(value) || typeof value.DatabaseSync !== "function") throw new AIResearchStoreError("STORE_UNAVAILABLE");
  return { DatabaseSync: value.DatabaseSync as SqliteModule["DatabaseSync"] };
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function readCount(value: unknown, key = "count"): number {
  if (!isRecord(value)) return 0;
  const field = value[key];
  const numeric = typeof field === "bigint" ? Number(field) : field;
  return typeof numeric === "number" && Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
