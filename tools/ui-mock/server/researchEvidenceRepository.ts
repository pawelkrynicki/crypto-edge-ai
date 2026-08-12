import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTokenIdentity } from "../src/tokenLifecycle.js";
import {
  isPersistedManualResearchState,
  isResearchChecklistItemKey,
  type PersistedManualResearchState,
  type PublicResearchEvidence,
  type ResearchChecklistItemKey,
  type ResearchStepNumber,
} from "../src/researchChecklistTypes.js";

export const RESEARCH_EVIDENCE_SCHEMA_VERSION = "research_evidence_sqlite_v1";

type SqliteStatement = { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown; run(...params: unknown[]): unknown };
type SqliteDatabase = { exec(sql: string): void; prepare(sql: string): SqliteStatement; close(): void };
type SqliteModule = { DatabaseSync: new (filename: string) => SqliteDatabase };

type Identity = { chain: string; contract_address: string };
export type ResearchEvidenceRepository = Awaited<ReturnType<typeof createResearchEvidenceRepository>>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PATH = resolve(ROOT, ".local", "research-evidence.sqlite");
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export class ResearchEvidenceError extends Error {
  readonly code: "RESEARCH_EVIDENCE_UNAVAILABLE" | "RESEARCH_EVIDENCE_INPUT_INVALID" | "RESEARCH_EVIDENCE_NOT_FOUND";
  constructor(code: ResearchEvidenceError["code"]) {
    super(code);
    this.name = "ResearchEvidenceError";
    this.code = code;
  }
}

export function getDefaultResearchEvidenceDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CRYPTO_EDGE_RESEARCH_EVIDENCE_SQLITE_PATH?.trim();
  if (!configured) return DEFAULT_PATH;
  return isAbsolute(configured) ? resolve(configured) : resolve(ROOT, configured);
}

export async function createResearchEvidenceRepository(options: { databaseFilePath?: string } = {}) {
  const databaseFilePath = resolve(options.databaseFilePath ?? getDefaultResearchEvidenceDatabasePath());
  let database: SqliteDatabase;
  try {
    mkdirSync(dirname(databaseFilePath), { recursive: true });
    const sqlite = await loadSqlite();
    database = new sqlite.DatabaseSync(databaseFilePath);
    migrate(database);
  } catch {
    throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE");
  }

  return {
    databaseFilePath,

    list(actorId: string, chain: string, contractAddress: string): PublicResearchEvidence[] {
      const actor = safeActor(actorId);
      const identity = normalizeIdentity(chain, contractAddress);
      try {
        return database.prepare(`
SELECT schema_version, chain, contract_address, step_number, item_key, manual_state,
       value_text, value_number, note, source_tool, evidence_url, observed_at, created_at, updated_at
FROM research_evidence
WHERE actor_id = ? AND chain = ? AND contract_address = ?
ORDER BY step_number ASC, item_key ASC
`).all(actor, identity.chain, identity.contract_address).map(mapEvidence);
      } catch {
        throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE");
      }
    },

    upsert(input: {
      actorId: string;
      chain: string;
      contractAddress: string;
      stepNumber: ResearchStepNumber;
      itemKey: ResearchChecklistItemKey;
      manualState: PersistedManualResearchState;
      valueText?: string | null;
      valueNumber?: number | null;
      note?: string | null;
      sourceTool?: string | null;
      evidenceUrl?: string | null;
      observedAt?: string | null;
      now?: Date;
    }): PublicResearchEvidence {
      const actor = safeActor(input.actorId);
      const identity = normalizeIdentity(input.chain, input.contractAddress);
      const step = safeStep(input.stepNumber);
      const itemKey = safeItemKey(input.itemKey);
      const manualState = safeManualState(input.manualState);
      const valueText = optionalText(input.valueText, 1_000);
      const valueNumber = optionalNumber(input.valueNumber);
      const note = optionalText(input.note, 1_000);
      const sourceTool = optionalText(input.sourceTool, 120);
      const evidenceUrl = optionalUrl(input.evidenceUrl);
      const observedAt = optionalTimestamp(input.observedAt);
      const now = input.now ?? new Date();
      if (!Number.isFinite(now.getTime())) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
      const timestamp = now.toISOString();
      try {
        database.prepare(`
INSERT INTO research_evidence (
  actor_id, schema_version, chain, contract_address, step_number, item_key, manual_state,
  value_text, value_number, note, source_tool, evidence_url, observed_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(actor_id, chain, contract_address, step_number, item_key) DO UPDATE SET
  schema_version = excluded.schema_version,
  manual_state = excluded.manual_state,
  value_text = excluded.value_text,
  value_number = excluded.value_number,
  note = excluded.note,
  source_tool = excluded.source_tool,
  evidence_url = excluded.evidence_url,
  observed_at = excluded.observed_at,
  updated_at = excluded.updated_at
`).run(
          actor,
          RESEARCH_EVIDENCE_SCHEMA_VERSION,
          identity.chain,
          identity.contract_address,
          step,
          itemKey,
          manualState,
          valueText,
          valueNumber,
          note,
          sourceTool,
          evidenceUrl,
          observedAt,
          timestamp,
          timestamp,
        );
        const result = database.prepare(`
SELECT schema_version, chain, contract_address, step_number, item_key, manual_state,
       value_text, value_number, note, source_tool, evidence_url, observed_at, created_at, updated_at
FROM research_evidence
WHERE actor_id = ? AND chain = ? AND contract_address = ? AND step_number = ? AND item_key = ?
`).get(actor, identity.chain, identity.contract_address, step, itemKey);
        return mapEvidence(result);
      } catch (error) {
        if (error instanceof ResearchEvidenceError) throw error;
        throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE");
      }
    },

    delete(input: {
      actorId: string;
      chain: string;
      contractAddress: string;
      stepNumber: ResearchStepNumber;
      itemKey: ResearchChecklistItemKey;
    }): boolean {
      const actor = safeActor(input.actorId);
      const identity = normalizeIdentity(input.chain, input.contractAddress);
      const step = safeStep(input.stepNumber);
      const itemKey = safeItemKey(input.itemKey);
      try {
        const result = database.prepare(`
DELETE FROM research_evidence
WHERE actor_id = ? AND chain = ? AND contract_address = ? AND step_number = ? AND item_key = ?
`).run(actor, identity.chain, identity.contract_address, step, itemKey);
        return changes(result) > 0;
      } catch {
        throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE");
      }
    },

    integrity(): { ok: true; schema_version: typeof RESEARCH_EVIDENCE_SCHEMA_VERSION; entries: number } {
      try {
        const integrity = database.prepare("PRAGMA integrity_check").get();
        if (!isRecord(integrity) || Object.values(integrity)[0] !== "ok") throw new Error("integrity");
        const entries = count(database.prepare("SELECT COUNT(*) AS count FROM research_evidence").get());
        return { ok: true, schema_version: RESEARCH_EVIDENCE_SCHEMA_VERSION, entries };
      } catch {
        throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE");
      }
    },

    close(): void { database.close(); },
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
CREATE TABLE IF NOT EXISTS research_evidence_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research_evidence (
  actor_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  chain TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  manual_state TEXT NOT NULL,
  value_text TEXT NULL,
  value_number REAL NULL,
  note TEXT NULL,
  source_tool TEXT NULL,
  evidence_url TEXT NULL,
  observed_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (actor_id, chain, contract_address, step_number, item_key)
);
CREATE INDEX IF NOT EXISTS research_evidence_actor_identity_idx
  ON research_evidence(actor_id, chain, contract_address, updated_at DESC);
`);
  database.prepare("INSERT INTO research_evidence_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run("schema_version", RESEARCH_EVIDENCE_SCHEMA_VERSION);
}

function mapEvidence(value: unknown): PublicResearchEvidence {
  if (!isRecord(value)) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE");
  const identity = normalizeIdentity(value.chain, value.contract_address);
  const step = safeStep(value.step_number);
  const itemKey = safeItemKey(value.item_key);
  const manualState = safeManualState(value.manual_state);
  const schemaVersion = value.schema_version === RESEARCH_EVIDENCE_SCHEMA_VERSION
    ? RESEARCH_EVIDENCE_SCHEMA_VERSION
    : null;
  const createdAt = strictTimestamp(value.created_at);
  const updatedAt = strictTimestamp(value.updated_at);
  if (!schemaVersion) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE");
  return {
    schema_version: schemaVersion,
    chain: identity.chain,
    contract_address: identity.contract_address,
    step_number: step,
    item_key: itemKey,
    manual_state: manualState,
    value_text: nullableText(value.value_text, 1_000),
    value_number: nullableNumber(value.value_number),
    note: nullableText(value.note, 1_000),
    source_tool: nullableText(value.source_tool, 120),
    evidence_url: value.evidence_url === null ? null : optionalUrl(value.evidence_url),
    observed_at: value.observed_at === null ? null : optionalTimestamp(value.observed_at),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function normalizeIdentity(chain: unknown, contractAddress: unknown): Identity {
  if (typeof chain !== "string" || typeof contractAddress !== "string") throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  const resolved = resolveTokenIdentity(chain, contractAddress);
  if (resolved.status !== "valid") throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  return { chain: resolved.chain, contract_address: resolved.contract_address };
}

function safeActor(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(value)) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  return value;
}

function safeStep(value: unknown): ResearchStepNumber {
  if (value !== 1 && value !== 2 && value !== 3 && value !== 4 && value !== 5 && value !== 6 && value !== 7) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  return value;
}

function safeItemKey(value: unknown): ResearchChecklistItemKey {
  if (!isResearchChecklistItemKey(value)) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  return value;
}

function safeManualState(value: unknown): PersistedManualResearchState {
  if (!isPersistedManualResearchState(value)) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  return value;
}

function optionalText(value: unknown, limit: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > limit) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  return normalized;
}

function nullableText(value: unknown, limit: number): string | null {
  if (value === null) return null;
  return optionalText(value, limit);
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  return value;
}

function nullableNumber(value: unknown): number | null {
  if (value === null) return null;
  return optionalNumber(value);
}

function optionalTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  return new Date(value).toISOString();
}

function strictTimestamp(value: unknown): string {
  const normalized = optionalTimestamp(value);
  if (!normalized) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE");
  return normalized;
}

function optionalUrl(value: unknown): string | null {
  const raw = optionalText(value, 2_048);
  if (!raw) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID"); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  if (parsed.username || parsed.password || isPrivateHost(parsed.hostname)) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INPUT_INVALID");
  return parsed.toString();
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" || host === "::" || /^fc|^fd|^fe80/i.test(host)) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  return octets[0] === 10 || octets[0] === 127 || octets[0] === 0
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 169 && octets[1] === 254);
}

function changes(value: unknown): number {
  if (!isRecord(value) || !Number.isSafeInteger(value.changes)) throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE");
  return Number(value.changes);
}

function count(value: unknown): number {
  if (!isRecord(value) || !Number.isSafeInteger(value.count) || Number(value.count) < 0) throw new Error("count");
  return Number(value.count);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
