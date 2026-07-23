import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ESTABLISHED_ADDRESS_UNIVERSE_CONFIG_PATH,
  ESTABLISHED_ADDRESS_UNIVERSE_MAX_ENTRIES,
  ESTABLISHED_UNIVERSE_SCHEMA_VERSION,
  ESTABLISHED_UNIVERSE_STORE_SCHEMA_VERSION,
  calculateUniverseChecksum,
  getDefaultEstablishedUniverseStorePath,
  loadEstablishedAddressUniverse,
  normalizeEstablishedAddress,
  normalizeEstablishedChain,
  universeIdentityKey,
  validateEstablishedAddressUniverse,
  type EstablishedAddressUniverse,
  type EstablishedAddressUniverseEntry,
} from "./establishedAddressUniverse.js";
import { resolveRepoFile } from "./sourceRegistryValidator.js";

export const ESTABLISHED_UNIVERSE_HISTORY_LIMIT = 20;
export const ESTABLISHED_UNIVERSE_AUDIT_LIMIT = 200;

export type EstablishedUniverseAuditEntry = {
  audit_id: string;
  changed_at: string;
  actor: string;
  operation: UniverseMutation["operation"];
  from_version: string;
  to_version: string;
  entry_id: string;
  identity: string;
  changed_fields: string[];
};

export type EstablishedUniverseStore = {
  schema_version: typeof ESTABLISHED_UNIVERSE_STORE_SCHEMA_VERSION;
  current: EstablishedAddressUniverse;
  history: EstablishedAddressUniverse[];
  audit_log: EstablishedUniverseAuditEntry[];
};

export type UniverseMutation =
  | {
    operation: "add";
    chain: string;
    contract_address: string;
    enabled?: boolean;
    display_name?: string;
    symbol_hint?: string;
    owner_note?: string;
  }
  | {
    operation: "update";
    chain: string;
    contract_address: string;
    changes: {
      display_name?: string | null;
      symbol_hint?: string | null;
      owner_note?: string | null;
    };
  }
  | { operation: "enable" | "disable" | "remove"; chain: string; contract_address: string };

export type UniverseMutationOptions = {
  apply?: boolean;
  storePath?: string;
  actor?: string;
  expectedCurrentVersion?: string;
  expectedCurrentChecksum?: string;
  now?: () => Date;
  atomicWrite?: (path: string, value: EstablishedUniverseStore) => Promise<void>;
};

export type UniverseMutationResult = {
  applied: boolean;
  operation: UniverseMutation["operation"];
  from_version: string;
  to_version: string;
  identity: string;
  entry_id: string;
  changed_fields: string[];
  entries_total: number;
  entries_enabled: number;
  checksum: string;
};

export type UniverseDiff = {
  from_version: string;
  to_version: string;
  added: EstablishedAddressUniverseEntry[];
  removed: EstablishedAddressUniverseEntry[];
  changed: Array<{
    identity: string;
    before: EstablishedAddressUniverseEntry;
    after: EstablishedAddressUniverseEntry;
    changed_fields: string[];
  }>;
};

export async function readEstablishedUniverseStore(storePath = getDefaultEstablishedUniverseStorePath()): Promise<EstablishedUniverseStore> {
  const path = resolve(storePath);
  try {
    return validateEstablishedUniverseStore(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch (error) {
    if (!isErrorCode(error, "ENOENT")) throw normalizeStoreReadError(error);
    const initial = loadEstablishedAddressUniverse(resolveRepoFile(ESTABLISHED_ADDRESS_UNIVERSE_CONFIG_PATH));
    return {
      schema_version: ESTABLISHED_UNIVERSE_STORE_SCHEMA_VERSION,
      current: initial,
      history: [],
      audit_log: [],
    };
  }
}

export function validateEstablishedUniverseStore(value: unknown): EstablishedUniverseStore {
  if (!isRecord(value)) throw new Error("ESTABLISHED_UNIVERSE_STORE_INVALID");
  const allowed = new Set(["schema_version", "current", "history", "audit_log"]);
  if (Object.keys(value).some((field) => !allowed.has(field))) throw new Error("ESTABLISHED_UNIVERSE_STORE_UNKNOWN_FIELD");
  if (value.schema_version !== ESTABLISHED_UNIVERSE_STORE_SCHEMA_VERSION) {
    throw new Error("ESTABLISHED_UNIVERSE_STORE_SCHEMA_UNSUPPORTED");
  }
  if (!Array.isArray(value.history) || value.history.length > ESTABLISHED_UNIVERSE_HISTORY_LIMIT) {
    throw new Error("ESTABLISHED_UNIVERSE_HISTORY_INVALID");
  }
  if (!Array.isArray(value.audit_log) || value.audit_log.length > ESTABLISHED_UNIVERSE_AUDIT_LIMIT) {
    throw new Error("ESTABLISHED_UNIVERSE_AUDIT_INVALID");
  }
  const current = validateEstablishedAddressUniverse(value.current);
  const history = value.history.map(validateEstablishedAddressUniverse);
  const versions = new Set([current.universe_version]);
  for (const universe of history) {
    if (versions.has(universe.universe_version)) throw new Error("ESTABLISHED_UNIVERSE_HISTORY_DUPLICATE_VERSION");
    versions.add(universe.universe_version);
  }
  const auditLog = value.audit_log.map(validateAuditEntry);
  return { schema_version: ESTABLISHED_UNIVERSE_STORE_SCHEMA_VERSION, current, history, audit_log: auditLog };
}

export async function mutateEstablishedUniverse(
  mutation: UniverseMutation,
  options: UniverseMutationOptions = {},
): Promise<UniverseMutationResult> {
  const storePath = resolve(options.storePath ?? getDefaultEstablishedUniverseStorePath());
  if (!options.apply) {
    const store = await readEstablishedUniverseStore(storePath);
    assertExpectedCurrentUniverse(store, options);
    return buildMutation(store, mutation, options).result;
  }

  const lock = await acquireManagementLock(storePath);
  try {
    const store = await readEstablishedUniverseStore(storePath);
    assertExpectedCurrentUniverse(store, options);
    const planned = buildMutation(store, mutation, options);
    await (options.atomicWrite ?? writeStoreAtomically)(storePath, planned.store);
    return { ...planned.result, applied: true };
  } finally {
    await lock.release();
  }
}

function assertExpectedCurrentUniverse(store: EstablishedUniverseStore, options: UniverseMutationOptions): void {
  if (
    (options.expectedCurrentVersion !== undefined && store.current.universe_version !== options.expectedCurrentVersion)
    || (options.expectedCurrentChecksum !== undefined && store.current.checksum !== options.expectedCurrentChecksum)
  ) {
    throw new Error("ESTABLISHED_UNIVERSE_STALE");
  }
}

export function diffEstablishedUniverses(from: EstablishedAddressUniverse, to: EstablishedAddressUniverse): UniverseDiff {
  const fromEntries = new Map(from.entries.map((entry) => [universeIdentityKey(entry.chain, entry.contract_address), entry]));
  const toEntries = new Map(to.entries.map((entry) => [universeIdentityKey(entry.chain, entry.contract_address), entry]));
  const added = [...toEntries.entries()].filter(([identity]) => !fromEntries.has(identity)).map(([, entry]) => entry);
  const removed = [...fromEntries.entries()].filter(([identity]) => !toEntries.has(identity)).map(([, entry]) => entry);
  const changed = [...toEntries.entries()].flatMap(([identity, after]) => {
    const before = fromEntries.get(identity);
    if (!before) return [];
    const changedFields = entryChangedFields(before, after);
    return changedFields.length > 0 ? [{ identity, before, after, changed_fields: changedFields }] : [];
  });
  return {
    from_version: from.universe_version,
    to_version: to.universe_version,
    added,
    removed,
    changed,
  };
}

export function findUniverseVersion(store: EstablishedUniverseStore, version: string): EstablishedAddressUniverse {
  const universe = [store.current, ...store.history].find((candidate) => candidate.universe_version === version);
  if (!universe) throw new Error("ESTABLISHED_UNIVERSE_VERSION_NOT_FOUND");
  return universe;
}

export async function writeStoreAtomically(path: string, value: EstablishedUniverseStore): Promise<void> {
  validateEstablishedUniverseStore(value);
  const target = resolve(path);
  const temporary = resolve(dirname(target), `.${randomUUID()}.tmp`);
  await mkdir(dirname(target), { recursive: true });
  let handle;
  try {
    handle = await open(temporary, "wx");
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new Error("ESTABLISHED_UNIVERSE_ATOMIC_WRITE_FAILED", { cause: error });
  }
}

function buildMutation(
  store: EstablishedUniverseStore,
  mutation: UniverseMutation,
  options: UniverseMutationOptions,
): { store: EstablishedUniverseStore; result: UniverseMutationResult } {
  const now = (options.now ?? (() => new Date()))().toISOString();
  const actor = normalizeActor(options.actor ?? process.env.CRYPTO_EDGE_UNIVERSE_OWNER_ID ?? "owner");
  const chain = normalizeEstablishedChain(mutation.chain);
  const address = normalizeEstablishedAddress(chain, mutation.contract_address);
  const identity = universeIdentityKey(chain, address);
  const existingIndex = store.current.entries.findIndex((entry) => universeIdentityKey(entry.chain, entry.contract_address) === identity);
  let entries = structuredClone(store.current.entries);
  let entryId: string;
  let changedFields: string[];

  if (mutation.operation === "add") {
    if (existingIndex >= 0) throw new Error("ESTABLISHED_UNIVERSE_DUPLICATE_IDENTITY");
    if (entries.length >= ESTABLISHED_ADDRESS_UNIVERSE_MAX_ENTRIES) throw new Error("ESTABLISHED_UNIVERSE_TOO_MANY_ENTRIES");
    validateOptionalInput(mutation.display_name, 120, "DISPLAY_NAME_INVALID");
    validateOptionalInput(mutation.symbol_hint, 120, "SYMBOL_HINT_INVALID");
    validateOptionalInput(mutation.owner_note, 500, "OWNER_NOTE_INVALID");
    entryId = entryIdFor(identity);
    entries.push({
      chain,
      contract_address: address,
      enabled: mutation.enabled ?? true,
      ...(mutation.display_name ? { display_name: mutation.display_name } : {}),
      ...(mutation.symbol_hint ? { symbol_hint: mutation.symbol_hint } : {}),
      ...(mutation.owner_note ? { owner_note: mutation.owner_note } : {}),
      added_at: now,
      updated_at: now,
      added_by: actor,
      entry_id: entryId,
    });
    changedFields = ["entry"];
  } else {
    if (existingIndex < 0) throw new Error("ESTABLISHED_UNIVERSE_ENTRY_NOT_FOUND");
    const existing = entries[existingIndex];
    entryId = existing.entry_id;
    if (mutation.operation === "remove") {
      entries.splice(existingIndex, 1);
      changedFields = ["entry"];
    } else if (mutation.operation === "enable" || mutation.operation === "disable") {
      const enabled = mutation.operation === "enable";
      if (existing.enabled === enabled) throw new Error("ESTABLISHED_UNIVERSE_NO_CHANGES");
      entries[existingIndex] = { ...existing, enabled, updated_at: now };
      changedFields = ["enabled"];
    } else {
      if (mutation.operation !== "update") throw new Error("UNIVERSE_COMMAND_INVALID");
      const next = { ...existing };
      changedFields = [];
      for (const field of ["display_name", "symbol_hint", "owner_note"] as const) {
        if (!(field in mutation.changes)) continue;
        const value = mutation.changes[field];
        validateOptionalInput(value, field === "owner_note" ? 500 : 120, `${field.toUpperCase()}_INVALID`, true);
        if (value === null) delete next[field];
        else if (value !== undefined) next[field] = value;
        if (existing[field] !== next[field]) changedFields.push(field);
      }
      if (changedFields.length === 0) throw new Error("ESTABLISHED_UNIVERSE_NO_CHANGES");
      entries[existingIndex] = { ...next, updated_at: now };
    }
  }

  const nextVersion = incrementVersion(store.current.universe_version);
  const withoutChecksum = {
    schema_version: ESTABLISHED_UNIVERSE_SCHEMA_VERSION,
    universe_version: nextVersion,
    generated_at: now,
    entries,
  } as const;
  const current: EstablishedAddressUniverse = {
    ...withoutChecksum,
    checksum: calculateUniverseChecksum(withoutChecksum),
  };
  validateEstablishedAddressUniverse(current);
  const audit: EstablishedUniverseAuditEntry = {
    audit_id: `audit_${randomUUID()}`,
    changed_at: now,
    actor,
    operation: mutation.operation,
    from_version: store.current.universe_version,
    to_version: nextVersion,
    entry_id: entryId,
    identity,
    changed_fields: changedFields,
  };
  const nextStore: EstablishedUniverseStore = {
    schema_version: ESTABLISHED_UNIVERSE_STORE_SCHEMA_VERSION,
    current,
    history: [store.current, ...store.history].slice(0, ESTABLISHED_UNIVERSE_HISTORY_LIMIT),
    audit_log: [audit, ...store.audit_log].slice(0, ESTABLISHED_UNIVERSE_AUDIT_LIMIT),
  };
  const result: UniverseMutationResult = {
    applied: false,
    operation: mutation.operation,
    from_version: store.current.universe_version,
    to_version: nextVersion,
    identity,
    entry_id: entryId,
    changed_fields: changedFields,
    entries_total: entries.length,
    entries_enabled: entries.filter((entry) => entry.enabled).length,
    checksum: current.checksum,
  };
  return { store: nextStore, result };
}

function validateAuditEntry(value: unknown): EstablishedUniverseAuditEntry {
  if (!isRecord(value)) throw new Error("ESTABLISHED_UNIVERSE_AUDIT_INVALID");
  const fields = new Set([
    "audit_id", "changed_at", "actor", "operation", "from_version", "to_version",
    "entry_id", "identity", "changed_fields",
  ]);
  if (Object.keys(value).some((field) => !fields.has(field))) throw new Error("ESTABLISHED_UNIVERSE_AUDIT_INVALID");
  if (typeof value.audit_id !== "string" || !value.audit_id.startsWith("audit_")) throw new Error("ESTABLISHED_UNIVERSE_AUDIT_INVALID");
  if (typeof value.changed_at !== "string" || new Date(value.changed_at).toISOString() !== value.changed_at) throw new Error("ESTABLISHED_UNIVERSE_AUDIT_INVALID");
  if (typeof value.actor !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.actor)) throw new Error("ESTABLISHED_UNIVERSE_AUDIT_INVALID");
  if (!["add", "update", "enable", "disable", "remove"].includes(String(value.operation))) throw new Error("ESTABLISHED_UNIVERSE_AUDIT_INVALID");
  for (const field of ["from_version", "to_version", "entry_id", "identity"] as const) {
    if (typeof value[field] !== "string" || value[field].length === 0) throw new Error("ESTABLISHED_UNIVERSE_AUDIT_INVALID");
  }
  if (!Array.isArray(value.changed_fields) || value.changed_fields.some((field) => typeof field !== "string")) {
    throw new Error("ESTABLISHED_UNIVERSE_AUDIT_INVALID");
  }
  return value as EstablishedUniverseAuditEntry;
}

function incrementVersion(version: string): string {
  const match = /^established-universe-v(\d{6})$/.exec(version);
  if (!match) throw new Error("ESTABLISHED_UNIVERSE_VERSION_INVALID");
  const next = Number(match[1]) + 1;
  if (!Number.isSafeInteger(next) || next > 999_999) throw new Error("ESTABLISHED_UNIVERSE_VERSION_EXHAUSTED");
  return `established-universe-v${String(next).padStart(6, "0")}`;
}

function entryIdFor(identity: string): string {
  return `est_${createHash("sha256").update(identity, "utf8").digest("hex").slice(0, 16)}`;
}

function entryChangedFields(before: EstablishedAddressUniverseEntry, after: EstablishedAddressUniverseEntry): string[] {
  return (Object.keys({ ...before, ...after }) as Array<keyof EstablishedAddressUniverseEntry>)
    .filter((field) => field !== "updated_at" && before[field] !== after[field]);
}

function normalizeActor(value: string): string {
  const actor = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(actor)) throw new Error("OWNER_ID_INVALID");
  return actor;
}

function validateOptionalInput(
  value: string | null | undefined,
  maxLength: number,
  code: string,
  allowNull = false,
): void {
  if (value === undefined || (allowNull && value === null)) return;
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > maxLength) {
    throw new Error(code);
  }
}

async function acquireManagementLock(storePath: string): Promise<{ release: () => Promise<void> }> {
  const lockPath = `${storePath}.lock`;
  await mkdir(dirname(storePath), { recursive: true });
  let handle;
  try {
    handle = await open(lockPath, "wx");
    await handle.writeFile(`${process.pid}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (isErrorCode(error, "EEXIST")) throw new Error("ESTABLISHED_UNIVERSE_MANAGEMENT_LOCKED");
    throw new Error("ESTABLISHED_UNIVERSE_MANAGEMENT_LOCK_FAILED", { cause: error });
  }
  await handle.close();
  return { release: () => rm(lockPath, { force: true }) };
}

function normalizeStoreReadError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith("ESTABLISHED_UNIVERSE_")) return error;
  return new Error("ESTABLISHED_UNIVERSE_STORE_LOAD_FAILED", { cause: error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
