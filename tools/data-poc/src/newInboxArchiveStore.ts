import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { getDataPocRuntimeRoot } from "./dataPocRuntimeRoot.js";

export const NEW_INBOX_ARCHIVE_SCHEMA_VERSION = 1;
export const NEW_INBOX_ARCHIVE_REASON = "NEW_INACTIVE_7D" as const;

export type NewInboxArchiveReason = typeof NEW_INBOX_ARCHIVE_REASON;
export type NewInboxArchiveSystemStatus = "NEW" | "FOLLOW_UP" | "MAIN_RADAR";

export type NewInboxArchiveEvent = {
  archive_event_id: string;
  identity: string;
  chain: string;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  first_seen_at: string;
  last_seen_at: string;
  archived_at: string;
  archive_reason: NewInboxArchiveReason;
  previous_system_status: NewInboxArchiveSystemStatus;
  payload_json: string;
};

export type NewInboxDetectedIdentity = {
  identity: string;
  chain: string;
  contract_address: string;
  first_seen_at: string;
  last_seen_at: string;
  display_name: string | null;
  symbol: string | null;
};

export type NewInboxArchivePersistenceResult = {
  attempted: number;
  inserted: number;
  duplicate_noop: number;
};

export type NewInboxDetectedIdentityPersistenceResult = {
  attempted: number;
  upserted: number;
};

export function getDefaultNewInboxArchiveSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(
    env.CRYPTO_EDGE_NEW_INBOX_ARCHIVE_SQLITE_PATH?.trim()
      || resolve(getDataPocRuntimeRoot(env), ".local", "lifecycle", "new-inbox-archive.sqlite"),
  );
}

export function createNewInboxArchiveEvent(input: {
  identity: string;
  chain: string;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  first_seen_at: string;
  last_seen_at: string;
  archived_at: string;
  previous_system_status: NewInboxArchiveSystemStatus;
  payload_json: string;
  archive_reason?: NewInboxArchiveReason;
}): NewInboxArchiveEvent {
  const archiveReason = input.archive_reason ?? NEW_INBOX_ARCHIVE_REASON;
  return {
    ...input,
    archive_event_id: newInboxArchiveEventId(input.identity, input.last_seen_at, archiveReason),
    archive_reason: archiveReason,
  };
}

export function newInboxArchiveEventId(
  identity: string,
  lastSeenAt: string,
  archiveReason: NewInboxArchiveReason = NEW_INBOX_ARCHIVE_REASON,
): string {
  return `archive_${createHash("sha256")
    .update(`${identity}\n${lastSeenAt}\n${archiveReason}`, "utf8")
    .digest("hex")}`;
}

export async function persistNewInboxArchiveEvents(
  events: readonly NewInboxArchiveEvent[],
  path = getDefaultNewInboxArchiveSqlitePath(),
): Promise<NewInboxArchivePersistenceResult> {
  const uniqueEvents = [...new Map(events.map((event) => [event.archive_event_id, validateArchiveEvent(event)])).values()];
  if (uniqueEvents.length === 0) return { attempted: 0, inserted: 0, duplicate_noop: 0 };
  const target = resolve(path);
  return withArchiveStoreLock(target, async () => {
    await mkdir(dirname(target), { recursive: true });
    const database = new DatabaseSync(target);
    try {
      initializeArchiveDatabase(database);
      database.exec("BEGIN IMMEDIATE");
      try {
        const statement = database.prepare(`
          INSERT OR IGNORE INTO new_inbox_archive_events (
            archive_event_id, identity, chain, contract_address, display_name, symbol,
            first_seen_at, last_seen_at, archived_at, archive_reason,
            previous_system_status, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        let inserted = 0;
        for (const event of uniqueEvents) {
          inserted += Number(statement.run(
            event.archive_event_id,
            event.identity,
            event.chain,
            event.contract_address,
            event.display_name,
            event.symbol,
            event.first_seen_at,
            event.last_seen_at,
            event.archived_at,
            event.archive_reason,
            event.previous_system_status,
            event.payload_json,
          ).changes);
        }
        database.exec("COMMIT");
        return {
          attempted: uniqueEvents.length,
          inserted,
          duplicate_noop: uniqueEvents.length - inserted,
        };
      } catch (error) {
        database.exec("ROLLBACK");
        throw new Error("NEW_INBOX_ARCHIVE_PERSIST_FAILED", { cause: error });
      }
    } finally {
      database.close();
    }
  });
}

export async function upsertNewInboxDetectedIdentities(
  identities: readonly NewInboxDetectedIdentity[],
  path = getDefaultNewInboxArchiveSqlitePath(),
): Promise<NewInboxDetectedIdentityPersistenceResult> {
  const uniqueIdentities = [...new Map(identities.map((identity) => [identity.identity, validateDetectedIdentity(identity)])).values()];
  if (uniqueIdentities.length === 0) return { attempted: 0, upserted: 0 };
  const target = resolve(path);
  return withArchiveStoreLock(target, async () => {
    await mkdir(dirname(target), { recursive: true });
    const database = new DatabaseSync(target);
    try {
      initializeArchiveDatabase(database);
      database.exec("BEGIN IMMEDIATE");
      try {
        const statement = database.prepare(`
          INSERT INTO new_inbox_detected_identities (
            identity, chain, contract_address, first_seen_at, last_seen_at, display_name, symbol
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(identity) DO UPDATE SET
            chain = excluded.chain,
            contract_address = excluded.contract_address,
            first_seen_at = CASE
              WHEN excluded.first_seen_at < new_inbox_detected_identities.first_seen_at THEN excluded.first_seen_at
              ELSE new_inbox_detected_identities.first_seen_at
            END,
            last_seen_at = CASE
              WHEN excluded.last_seen_at > new_inbox_detected_identities.last_seen_at THEN excluded.last_seen_at
              ELSE new_inbox_detected_identities.last_seen_at
            END,
            display_name = COALESCE(excluded.display_name, new_inbox_detected_identities.display_name),
            symbol = COALESCE(excluded.symbol, new_inbox_detected_identities.symbol)
        `);
        let upserted = 0;
        for (const identity of uniqueIdentities) {
          upserted += Number(statement.run(
            identity.identity,
            identity.chain,
            identity.contract_address,
            identity.first_seen_at,
            identity.last_seen_at,
            identity.display_name,
            identity.symbol,
          ).changes);
        }
        database.exec("COMMIT");
        return { attempted: uniqueIdentities.length, upserted };
      } catch (error) {
        database.exec("ROLLBACK");
        throw new Error("NEW_INBOX_DETECTED_IDENTITY_PERSIST_FAILED", { cause: error });
      }
    } finally {
      database.close();
    }
  });
}

export async function countNewInboxArchiveEvents(path = getDefaultNewInboxArchiveSqlitePath()): Promise<number> {
  return withArchiveDatabase(path, 0, (database) => {
    const row = database.prepare("SELECT COUNT(*) AS count FROM new_inbox_archive_events").get() as { count?: unknown } | undefined;
    return integer(row?.count);
  });
}

export async function countNewInboxDetectedIdentities(path = getDefaultNewInboxArchiveSqlitePath()): Promise<number> {
  return withArchiveDatabase(path, 0, (database) => {
    const table = database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'new_inbox_detected_identities'").get() as { present?: unknown } | undefined;
    if (table?.present !== 1) return 0;
    const row = database.prepare("SELECT COUNT(*) AS count FROM new_inbox_detected_identities").get() as { count?: unknown } | undefined;
    return integer(row?.count);
  });
}

export async function countNewInboxArchiveIdentities(path = getDefaultNewInboxArchiveSqlitePath()): Promise<number> {
  return withArchiveDatabase(path, 0, (database) => {
    const row = database.prepare("SELECT COUNT(DISTINCT identity) AS count FROM new_inbox_archive_events").get() as { count?: unknown } | undefined;
    return integer(row?.count);
  });
}

export async function findNewInboxArchiveEventsByIdentity(
  identity: string,
  path = getDefaultNewInboxArchiveSqlitePath(),
): Promise<NewInboxArchiveEvent[]> {
  return withArchiveDatabase(path, [], (database) => {
    const rows = database.prepare(`
      SELECT archive_event_id, identity, chain, contract_address, display_name, symbol,
             first_seen_at, last_seen_at, archived_at, archive_reason,
             previous_system_status, payload_json
      FROM new_inbox_archive_events
      WHERE identity = ?
      ORDER BY archived_at DESC, archive_event_id DESC
    `).all(identity) as unknown[];
    return rows.map((row) => validateArchiveEvent(row));
  });
}

export async function findRecentNewInboxArchiveEvents(
  limit = 24,
  path = getDefaultNewInboxArchiveSqlitePath(),
): Promise<NewInboxArchiveEvent[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) throw new Error("NEW_INBOX_ARCHIVE_LIMIT_INVALID");
  return withArchiveDatabase(path, [], (database) => {
    const rows = database.prepare(`
      SELECT archive_event_id, identity, chain, contract_address, display_name, symbol,
             first_seen_at, last_seen_at, archived_at, archive_reason,
             previous_system_status, payload_json
      FROM new_inbox_archive_events
      ORDER BY archived_at DESC, archive_event_id DESC
      LIMIT ?
    `).all(limit) as unknown[];
    return rows.map((row) => validateArchiveEvent(row));
  });
}

function initializeArchiveDatabase(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA user_version = ${NEW_INBOX_ARCHIVE_SCHEMA_VERSION};
    CREATE TABLE IF NOT EXISTS new_inbox_detected_identities (
      identity TEXT PRIMARY KEY NOT NULL,
      chain TEXT NOT NULL,
      contract_address TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      display_name TEXT,
      symbol TEXT
    );
    CREATE INDEX IF NOT EXISTS new_inbox_detected_identities_last_seen_at_idx
      ON new_inbox_detected_identities(last_seen_at);
    CREATE TABLE IF NOT EXISTS new_inbox_archive_events (
      archive_event_id TEXT PRIMARY KEY NOT NULL,
      identity TEXT NOT NULL,
      chain TEXT NOT NULL,
      contract_address TEXT NOT NULL,
      display_name TEXT,
      symbol TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      archive_reason TEXT NOT NULL,
      previous_system_status TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS new_inbox_archive_events_identity_idx
      ON new_inbox_archive_events(identity);
    CREATE INDEX IF NOT EXISTS new_inbox_archive_events_archived_at_idx
      ON new_inbox_archive_events(archived_at);
  `);
}

async function withArchiveDatabase<T>(path: string, missing: T, read: (database: DatabaseSync) => T): Promise<T> {
  const target = resolve(path);
  if (!existsSync(target)) return missing;
  const database = new DatabaseSync(target, { readOnly: true });
  try {
    return read(database);
  } finally {
    database.close();
  }
}

async function withArchiveStoreLock<T>(path: string, run: () => Promise<T>): Promise<T> {
  const lockPath = `${resolve(path)}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  for (let attempt = 0; attempt < 40 && !handle; attempt += 1) {
    try {
      handle = await open(lockPath, "wx");
    } catch (error) {
      if (!isError(error, "EEXIST")) throw error;
      await new Promise((done) => setTimeout(done, 10));
    }
  }
  if (!handle) throw new Error("NEW_INBOX_ARCHIVE_LOCK_UNAVAILABLE");
  try {
    return await run();
  } finally {
    await handle.close().catch(() => undefined);
    await rm(lockPath, { force: true }).catch(() => undefined);
  }
}

function validateArchiveEvent(value: unknown): NewInboxArchiveEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("NEW_INBOX_ARCHIVE_EVENT_INVALID");
  const event = value as Partial<NewInboxArchiveEvent>;
  if (
    typeof event.archive_event_id !== "string"
    || typeof event.identity !== "string"
    || typeof event.chain !== "string"
    || typeof event.contract_address !== "string"
    || (event.display_name !== null && typeof event.display_name !== "string")
    || (event.symbol !== null && typeof event.symbol !== "string")
    || typeof event.first_seen_at !== "string"
    || typeof event.last_seen_at !== "string"
    || typeof event.archived_at !== "string"
    || event.archive_reason !== NEW_INBOX_ARCHIVE_REASON
    || !["NEW", "FOLLOW_UP", "MAIN_RADAR"].includes(event.previous_system_status as string)
    || typeof event.payload_json !== "string"
    || event.archive_event_id !== newInboxArchiveEventId(event.identity, event.last_seen_at, event.archive_reason)
  ) throw new Error("NEW_INBOX_ARCHIVE_EVENT_INVALID");
  return { ...event } as NewInboxArchiveEvent;
}

function validateDetectedIdentity(value: unknown): NewInboxDetectedIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("NEW_INBOX_DETECTED_IDENTITY_INVALID");
  const identity = value as Partial<NewInboxDetectedIdentity>;
  if (
    typeof identity.identity !== "string"
    || typeof identity.chain !== "string"
    || typeof identity.contract_address !== "string"
    || typeof identity.first_seen_at !== "string"
    || typeof identity.last_seen_at !== "string"
    || (identity.display_name !== null && typeof identity.display_name !== "string")
    || (identity.symbol !== null && typeof identity.symbol !== "string")
  ) throw new Error("NEW_INBOX_DETECTED_IDENTITY_INVALID");
  return { ...identity } as NewInboxDetectedIdentity;
}

function integer(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("NEW_INBOX_ARCHIVE_QUERY_INVALID");
  return number;
}

function isError(value: unknown, code: string): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value && (value as NodeJS.ErrnoException).code === code;
}
