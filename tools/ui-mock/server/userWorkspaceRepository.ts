import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LifecycleConditions, SystemLifecycleStatus } from "../../data-poc/src/systemLifecycle.js";

export const USER_WORKSPACE_SCHEMA_VERSION = "user_workspace_sqlite_v1";

export type UserWorkspaceEntry = {
  actor_id: string;
  identity: string;
  private_status: SystemLifecycleStatus;
  system_status_at_decision: SystemLifecycleStatus;
  note: string | null;
  updated_at: string;
};

export type UserWorkspaceAuditEntry = {
  transition_id: string;
  actor_id: string;
  identity: string;
  previous_private_status: SystemLifecycleStatus;
  new_private_status: SystemLifecycleStatus;
  system_status_at_decision: SystemLifecycleStatus;
  conditions: LifecycleConditions;
  override_reason: string | null;
  changed_at: string;
  session_reference: string;
};

export type UserWorkspaceRepository = Awaited<ReturnType<typeof createUserWorkspaceRepository>>;

type SqliteStatement = { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown; run(...params: unknown[]): unknown };
type SqliteDatabase = { exec(sql: string): void; prepare(sql: string): SqliteStatement; close(): void };
type SqliteModule = { DatabaseSync: new (filename: string) => SqliteDatabase };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PATH = resolve(ROOT, ".local", "user-workspace.sqlite");
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export class UserWorkspaceError extends Error {
  readonly code: "WORKSPACE_UNAVAILABLE" | "WORKSPACE_INPUT_INVALID" | "WORKSPACE_OVERRIDE_REASON_REQUIRED" | "WORKSPACE_DUPLICATE" | "WORKSPACE_TRANSITION_INVALID";
  constructor(code: "WORKSPACE_UNAVAILABLE" | "WORKSPACE_INPUT_INVALID" | "WORKSPACE_OVERRIDE_REASON_REQUIRED" | "WORKSPACE_DUPLICATE" | "WORKSPACE_TRANSITION_INVALID") {
    super(code);
    this.name = "UserWorkspaceError";
    this.code = code;
  }
}

export function getDefaultUserWorkspaceDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CRYPTO_EDGE_USER_WORKSPACE_SQLITE_PATH?.trim();
  if (!configured) return DEFAULT_PATH;
  return isAbsolute(configured) ? resolve(configured) : resolve(ROOT, configured);
}

export async function createUserWorkspaceRepository(options: { databaseFilePath?: string } = {}) {
  const databaseFilePath = resolve(options.databaseFilePath ?? getDefaultUserWorkspaceDatabasePath());
  let database: SqliteDatabase;
  try {
    mkdirSync(dirname(databaseFilePath), { recursive: true });
    const module = await loadSqlite();
    database = new module.DatabaseSync(databaseFilePath);
    migrate(database);
  } catch {
    throw new UserWorkspaceError("WORKSPACE_UNAVAILABLE");
  }
  const requireActor = (value: unknown): string => safeActor(value);
  const requireIdentity = (value: unknown): string => safeIdentity(value);

  return {
    databaseFilePath,

    get(actorId: string, identity: string): UserWorkspaceEntry | null {
      const row = database.prepare(`SELECT actor_id, identity, private_status, system_status_at_decision, note, updated_at FROM user_workspace_status WHERE actor_id = ? AND identity = ?`).get(requireActor(actorId), requireIdentity(identity));
      return row ? mapEntry(row) : null;
    },

    list(actorId: string): UserWorkspaceEntry[] {
      return database.prepare(`SELECT actor_id, identity, private_status, system_status_at_decision, note, updated_at FROM user_workspace_status WHERE actor_id = ? ORDER BY updated_at DESC, identity ASC`).all(requireActor(actorId)).map(mapEntry);
    },

    transition(input: {
      actorId: string;
      identity: string;
      previousPrivateStatus: SystemLifecycleStatus;
      newPrivateStatus: SystemLifecycleStatus;
      systemStatus: SystemLifecycleStatus;
      conditions: LifecycleConditions;
      overrideReason: string | null;
      sessionReference: string;
      now?: Date;
    }): UserWorkspaceAuditEntry {
      const actorId = requireActor(input.actorId);
      const identity = requireIdentity(input.identity);
      assertStatus(input.previousPrivateStatus);
      assertStatus(input.newPrivateStatus);
      assertStatus(input.systemStatus);
      if (!isForwardTransition(input.previousPrivateStatus, input.newPrivateStatus)) throw new UserWorkspaceError("WORKSPACE_TRANSITION_INVALID");
      const needsReason = input.conditions.readiness !== "CONDITIONS_MET";
      const overrideReason = cleanText(input.overrideReason, 500);
      if (needsReason && !overrideReason) throw new UserWorkspaceError("WORKSPACE_OVERRIDE_REASON_REQUIRED");
      if (!needsReason && input.overrideReason !== null && input.overrideReason !== undefined) throw new UserWorkspaceError("WORKSPACE_INPUT_INVALID");
      const sessionReference = cleanText(input.sessionReference, 128);
      if (!sessionReference) throw new UserWorkspaceError("WORKSPACE_INPUT_INVALID");
      const now = input.now ?? new Date();
      if (!Number.isFinite(now.getTime())) throw new UserWorkspaceError("WORKSPACE_INPUT_INVALID");
      const changedAt = now.toISOString();
      const existing = this.get(actorId, identity);
      const effectivePrevious = existing?.private_status ?? input.previousPrivateStatus;
      if (existing && existing.private_status === input.newPrivateStatus) throw new UserWorkspaceError("WORKSPACE_DUPLICATE");
      if (!isForwardTransition(effectivePrevious, input.newPrivateStatus)) throw new UserWorkspaceError("WORKSPACE_TRANSITION_INVALID");
      const audit: UserWorkspaceAuditEntry = {
        transition_id: `uws_${randomUUID()}`,
        actor_id: actorId,
        identity,
        previous_private_status: effectivePrevious,
        new_private_status: input.newPrivateStatus,
        system_status_at_decision: input.systemStatus,
        conditions: normalizeConditions(input.conditions),
        override_reason: overrideReason,
        changed_at: changedAt,
        session_reference: hashSessionReference(sessionReference),
      };
      database.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        database.prepare(`
INSERT INTO user_workspace_status (actor_id, identity, private_status, system_status_at_decision, note, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(actor_id, identity) DO UPDATE SET private_status = excluded.private_status, system_status_at_decision = excluded.system_status_at_decision, note = excluded.note, updated_at = excluded.updated_at
`).run(actorId, identity, audit.new_private_status, audit.system_status_at_decision, audit.override_reason, changedAt);
        database.prepare(`
INSERT INTO user_workspace_audit (transition_id, actor_id, identity, previous_private_status, new_private_status, system_status_at_decision, conditions_json, override_reason, changed_at, session_reference)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(audit.transition_id, audit.actor_id, audit.identity, audit.previous_private_status, audit.new_private_status, audit.system_status_at_decision, JSON.stringify(audit.conditions), audit.override_reason, audit.changed_at, audit.session_reference);
        database.exec("COMMIT");
        return audit;
      } catch {
        try { database.exec("ROLLBACK"); } catch { /* preserve original failure */ }
        throw new UserWorkspaceError("WORKSPACE_UNAVAILABLE");
      }
    },

    integrity(): { ok: true; schema_version: typeof USER_WORKSPACE_SCHEMA_VERSION; entries: number; audits: number } {
      try {
        const integrity = database.prepare("PRAGMA integrity_check").get();
        if (!isRecord(integrity) || integrity.integrity_check !== "ok") throw new Error("integrity");
        const entries = integer(database.prepare("SELECT COUNT(*) AS count FROM user_workspace_status").get(), "count");
        const audits = integer(database.prepare("SELECT COUNT(*) AS count FROM user_workspace_audit").get(), "count");
        return { ok: true, schema_version: USER_WORKSPACE_SCHEMA_VERSION, entries, audits };
      } catch {
        throw new UserWorkspaceError("WORKSPACE_UNAVAILABLE");
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
CREATE TABLE IF NOT EXISTS user_workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS user_workspace_status (
  actor_id TEXT NOT NULL,
  identity TEXT NOT NULL,
  private_status TEXT NOT NULL,
  system_status_at_decision TEXT NOT NULL,
  note TEXT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (actor_id, identity)
);
CREATE TABLE IF NOT EXISTS user_workspace_audit (
  transition_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  identity TEXT NOT NULL,
  previous_private_status TEXT NOT NULL,
  new_private_status TEXT NOT NULL,
  system_status_at_decision TEXT NOT NULL,
  conditions_json TEXT NOT NULL,
  override_reason TEXT NULL,
  changed_at TEXT NOT NULL,
  session_reference TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS user_workspace_audit_actor_identity_idx ON user_workspace_audit(actor_id, identity, changed_at DESC);
`);
  database.prepare(`INSERT INTO user_workspace_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run("schema_version", USER_WORKSPACE_SCHEMA_VERSION);
}

function mapEntry(value: unknown): UserWorkspaceEntry {
  if (!isRecord(value)) throw new UserWorkspaceError("WORKSPACE_UNAVAILABLE");
  const actor_id = safeActor(value.actor_id);
  const identity = safeIdentity(value.identity);
  assertStatus(value.private_status);
  assertStatus(value.system_status_at_decision);
  if (typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at))) throw new UserWorkspaceError("WORKSPACE_UNAVAILABLE");
  return { actor_id, identity, private_status: value.private_status, system_status_at_decision: value.system_status_at_decision, note: value.note === null ? null : cleanText(value.note, 500), updated_at: value.updated_at };
}

function normalizeConditions(value: LifecycleConditions): LifecycleConditions {
  return {
    conditions_met: [...new Set(value.conditions_met)].sort(),
    conditions_unmet: [...new Set(value.conditions_unmet)].sort(),
    missing_data: [...new Set(value.missing_data)].sort(),
    risks: [...new Set(value.risks)].sort(),
    readiness: value.readiness,
    security_state: value.security_state,
    verification_state: value.verification_state,
  };
}

function isForwardTransition(from: SystemLifecycleStatus, to: SystemLifecycleStatus): boolean {
  return (from === "NEW" && to === "FOLLOW_UP") || (from === "FOLLOW_UP" && to === "MAIN_RADAR");
}
function assertStatus(value: unknown): asserts value is SystemLifecycleStatus { if (!["NEW", "FOLLOW_UP", "MAIN_RADAR"].includes(String(value))) throw new UserWorkspaceError("WORKSPACE_INPUT_INVALID"); }
function safeActor(value: unknown): string { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(value)) throw new UserWorkspaceError("WORKSPACE_INPUT_INVALID"); return value; }
function safeIdentity(value: unknown): string { if (typeof value !== "string" || !/^[a-z0-9_-]{2,32}:[A-Za-z0-9]{20,128}$/.test(value)) throw new UserWorkspaceError("WORKSPACE_INPUT_INVALID"); return value; }
function cleanText(value: unknown, limit: number): string | null { if (value === null || value === undefined) return null; if (typeof value !== "string") throw new UserWorkspaceError("WORKSPACE_INPUT_INVALID"); const normalized = value.trim(); if (!normalized || normalized.length > limit) throw new UserWorkspaceError("WORKSPACE_INPUT_INVALID"); return normalized; }
function hashSessionReference(value: string): string { return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`; }
function integer(value: unknown, key: string): number { if (!isRecord(value) || !Number.isSafeInteger(value[key]) || Number(value[key]) < 0) throw new Error("count"); return Number(value[key]); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
