import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDefaultEstablishedUniverseStorePath,
  normalizeEstablishedAddress,
  normalizeEstablishedChain,
  universeIdentityKey,
  type SupportedEstablishedChain,
} from "./establishedAddressUniverse.js";
import {
  mutateEstablishedUniverse,
  readEstablishedUniverseStore,
} from "./establishedUniverseManager.js";
import {
  FOLLOW_UP_CHECKPOINT_DAYS,
  ingestScannerSnapshot,
  synchronizeFollowUpEstablishedMembership,
  updateFollowUpStore,
  readFollowUpStore,
  type FollowUpEntry,
  type FollowUpStore,
} from "./followUpBasket.js";
import {
  type PersistableCandidate,
  type PersistableScannerOutput,
} from "./persistableScannerModel.js";

export const SYSTEM_LIFECYCLE_POLICY_VERSION = "system_lifecycle_policy_v1";
export const NEW_INBOX_SCHEMA_VERSION = "new_inbox_store_v1";
export const LIFECYCLE_AUDIT_SCHEMA_VERSION = "lifecycle_audit_store_v1";
export const LIFECYCLE_SUMMARY_SCHEMA_VERSION = "lifecycle_summary_v1";

export type SystemLifecycleStatus = "NEW" | "FOLLOW_UP" | "MAIN_RADAR";

export type LifecycleConditions = {
  conditions_met: string[];
  conditions_unmet: string[];
  missing_data: string[];
  risks: string[];
  readiness: "CONDITIONS_MET" | "CONDITIONS_UNMET";
  security_state: string;
  verification_state: string;
};

export type NewInboxEntry = {
  identity: string;
  chain: SupportedEstablishedChain;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  first_seen_at: string;
  last_seen_at: string;
  first_scanner_run_id: string;
  last_scanner_run_id: string;
  system_status: SystemLifecycleStatus;
  last_evaluation: LifecycleConditions;
  policy_version: typeof SYSTEM_LIFECYCLE_POLICY_VERSION;
  archived_at: string | null;
  rejected_at: string | null;
  transition_ids: string[];
};

export type NewInboxStore = {
  schema_version: typeof NEW_INBOX_SCHEMA_VERSION;
  store_version: number;
  generated_at: string;
  entries: NewInboxEntry[];
  checksum: string;
};

export type LifecycleAuditEntry = {
  transition_id: string;
  transition_kind: "SYSTEM" | "USER";
  identity: string;
  previous_status: SystemLifecycleStatus | null;
  new_status: SystemLifecycleStatus;
  changed_at: string;
  central_cycle_id: string | null;
  scanner_run_id: string | null;
  context_run_id: string | null;
  policy_version: typeof SYSTEM_LIFECYCLE_POLICY_VERSION;
  conditions_met: string[];
  conditions_unmet: string[];
  missing_data: string[];
  readiness: LifecycleConditions["readiness"];
  security_state: string;
  verification_state: string;
  dedupe_result: "APPLIED" | "DUPLICATE_NOOP" | "BLOCKED";
  reason: string;
};

export type LifecycleAuditStore = {
  schema_version: typeof LIFECYCLE_AUDIT_SCHEMA_VERSION;
  generated_at: string;
  entries: LifecycleAuditEntry[];
  checksum: string;
};

export type LifecycleSummary = {
  schema_version: typeof LIFECYCLE_SUMMARY_SCHEMA_VERSION;
  system_new_total: number;
  system_follow_up_total: number;
  system_main_radar_total: number;
  follow_up_action_due: number;
  follow_up_candidates_ready: number;
  follow_up_displayed: number;
  follow_up_store_version: string;
  last_lifecycle_change_at: string | null;
  last_central_cycle_id: string | null;
  last_change_summary: {
    added: number;
    updated: number;
    promoted_to_follow_up: number;
    promoted_to_main_radar: number;
    archived: number;
    rejected: number;
    duplicate_noop: number;
  };
};

export type SystemLifecycleRunResult = {
  new_inbox_added: number;
  new_inbox_updated: number;
  promoted_to_follow_up: number;
  promoted_to_main_radar: number;
  duplicate_noop: number;
  follow_up_store: FollowUpStore;
  summary: LifecycleSummary;
};

const DATA_POC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_NEW_INBOX_PATH = resolve(DATA_POC_ROOT, ".local", "lifecycle", "new-inbox.json");
const DEFAULT_LIFECYCLE_AUDIT_PATH = resolve(DATA_POC_ROOT, ".local", "lifecycle", "audit.json");
const MAX_AUDIT_ENTRIES = 5_000;

export function getDefaultNewInboxStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.CRYPTO_EDGE_NEW_INBOX_STORE_PATH?.trim() || DEFAULT_NEW_INBOX_PATH);
}

export function getDefaultLifecycleAuditStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.CRYPTO_EDGE_LIFECYCLE_AUDIT_STORE_PATH?.trim() || DEFAULT_LIFECYCLE_AUDIT_PATH);
}

export function createEmptyNewInboxStore(now = new Date(0)): NewInboxStore {
  const base: Omit<NewInboxStore, "checksum"> = {
    schema_version: NEW_INBOX_SCHEMA_VERSION,
    store_version: 0,
    generated_at: iso(now),
    entries: [] as NewInboxEntry[],
  };
  return { ...base, checksum: checksum(base) };
}

export function createEmptyLifecycleAuditStore(now = new Date(0)): LifecycleAuditStore {
  const base: Omit<LifecycleAuditStore, "checksum"> = { schema_version: LIFECYCLE_AUDIT_SCHEMA_VERSION, generated_at: iso(now), entries: [] };
  return { ...base, checksum: checksum(base) };
}

export async function readNewInboxStore(path = getDefaultNewInboxStorePath()): Promise<NewInboxStore> {
  try {
    return validateNewInboxStore(JSON.parse(await readFile(resolve(path), "utf8")) as unknown);
  } catch (error) {
    if (isError(error, "ENOENT")) return createEmptyNewInboxStore();
    throw new Error("NEW_INBOX_STORE_INVALID", { cause: error });
  }
}

export async function readLifecycleAuditStore(path = getDefaultLifecycleAuditStorePath()): Promise<LifecycleAuditStore> {
  try {
    return validateLifecycleAuditStore(JSON.parse(await readFile(resolve(path), "utf8")) as unknown);
  } catch (error) {
    if (isError(error, "ENOENT")) return createEmptyLifecycleAuditStore();
    throw new Error("LIFECYCLE_AUDIT_STORE_INVALID", { cause: error });
  }
}

export function validateNewInboxStore(value: unknown): NewInboxStore {
  if (!record(value) || value.schema_version !== NEW_INBOX_SCHEMA_VERSION || !Number.isSafeInteger(value.store_version) || value.store_version < 0 || !isoText(value.generated_at) || !Array.isArray(value.entries) || typeof value.checksum !== "string") throw new Error("NEW_INBOX_STORE_INVALID");
  const entries = value.entries.map(validateNewInboxEntry).sort((a, b) => a.identity.localeCompare(b.identity));
  if (new Set(entries.map((entry) => entry.identity)).size !== entries.length) throw new Error("NEW_INBOX_STORE_INVALID");
  const base: Omit<NewInboxStore, "checksum"> = { schema_version: NEW_INBOX_SCHEMA_VERSION, store_version: value.store_version, generated_at: value.generated_at, entries };
  if (value.checksum !== checksum(base)) throw new Error("NEW_INBOX_STORE_INVALID");
  return { ...base, checksum: value.checksum };
}

export function validateLifecycleAuditStore(value: unknown): LifecycleAuditStore {
  if (!record(value) || value.schema_version !== LIFECYCLE_AUDIT_SCHEMA_VERSION || !isoText(value.generated_at) || !Array.isArray(value.entries) || typeof value.checksum !== "string") throw new Error("LIFECYCLE_AUDIT_STORE_INVALID");
  const entries = value.entries.map(validateAuditEntry);
  const base: Omit<LifecycleAuditStore, "checksum"> = { schema_version: LIFECYCLE_AUDIT_SCHEMA_VERSION, generated_at: value.generated_at, entries };
  if (value.checksum !== checksum(base)) throw new Error("LIFECYCLE_AUDIT_STORE_INVALID");
  return { ...base, checksum: value.checksum };
}

export function evaluateNewToFollowUp(candidate: PersistableCandidate, snapshot: Pick<PersistableScannerOutput, "scan_run" | "provenance">, existing: { inFollowUp: boolean; inMainRadar: boolean }): LifecycleConditions {
  const met: string[] = [];
  const unmet: string[] = [];
  const missing: string[] = [];
  const risks: string[] = [];
  const valid = safeIdentity(candidate.chain, candidate.contract_address);
  valid ? met.push("IDENTITY_VALID") : unmet.push("IDENTITY_VALID");
  const validated = snapshot.provenance?.contract_version != null && snapshot.provenance.fixture_used === false;
  validated ? met.push("VALIDATED_SNAPSHOT") : unmet.push("VALIDATED_SNAPSHOT");
  if (candidate.name || candidate.symbol) met.push("BASIC_DATA_AVAILABLE"); else { unmet.push("BASIC_DATA_AVAILABLE"); missing.push("DISPLAY_NAME_OR_SYMBOL"); }
  if (candidate.basic_filter_status === "passed_basic_filter") met.push("FOLLOW_UP_BASIC_FILTERS_PASSED"); else unmet.push("FOLLOW_UP_BASIC_FILTERS_PASSED");
  const critical = candidate.final_label === "CRITICAL_RISK" || candidate.final_reasons.some((reason) => /CRITICAL|IDENTITY/i.test(reason));
  if (critical) { unmet.push("NO_CRITICAL_IDENTITY_OR_CONTRACT_RISK"); risks.push(...candidate.final_reasons.filter((reason) => /CRITICAL|IDENTITY/i.test(reason))); } else met.push("NO_CRITICAL_IDENTITY_OR_CONTRACT_RISK");
  if (existing.inFollowUp || existing.inMainRadar) unmet.push("NO_EXISTING_SYSTEM_DUPLICATE"); else met.push("NO_EXISTING_SYSTEM_DUPLICATE");
  return conditions(met, unmet, missing, risks, "NOT_CHECKED", "NOT_REQUIRED");
}

export function evaluateFollowUpToMainRadar(entry: FollowUpEntry, inMainRadar: boolean, universeValid = true): LifecycleConditions {
  const met: string[] = [];
  const unmet: string[] = [];
  const missing = [...entry.latest_security_status.missing_data];
  const risks = [...entry.latest_security_status.risk_flags];
  try { normalizeIdentity(entry.chain, entry.contract_address); met.push("IDENTITY_VALID"); } catch { unmet.push("IDENTITY_VALID"); }
  if (entry.last_checked_at) met.push("FRESH_FOLLOW_UP_DATA"); else { unmet.push("FRESH_FOLLOW_UP_DATA"); missing.push("FOLLOW_UP_CHECK"); }
  if (entry.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" && FOLLOW_UP_CHECKPOINT_DAYS.every((day) => entry.completed_checkpoints.includes(day))) met.push("PROMOTION_RESOLVER_READY"); else unmet.push("PROMOTION_RESOLVER_READY");
  if (entry.latest_filter_result?.status === "passed_basic_filter") met.push("BASIC_FILTERS_PASSED"); else unmet.push("BASIC_FILTERS_PASSED");
  const security = entry.latest_security_status.status;
  if (security === "CRITICAL_RISK") { unmet.push("NO_CRITICAL_RISK"); risks.push("CRITICAL_RISK"); } else met.push("NO_CRITICAL_RISK");
  if (security === "CHECKED") met.push("SECURITY_AND_VERIFICATION_ALLOW_AUTOMATIC_PROMOTION"); else unmet.push("SECURITY_AND_VERIFICATION_ALLOW_AUTOMATIC_PROMOTION");
  if (universeValid) met.push("ESTABLISHED_UNIVERSE_VALID"); else unmet.push("ESTABLISHED_UNIVERSE_VALID");
  if (inMainRadar) unmet.push("NO_MAIN_RADAR_DUPLICATE"); else met.push("NO_MAIN_RADAR_DUPLICATE");
  return conditions(met, unmet, missing, risks, security, security === "CHECKED" ? "VERIFIED" : "VERIFICATION_REQUIRED");
}

export async function applySystemLifecycle(snapshot: PersistableScannerOutput, options: {
  newInboxStorePath?: string;
  auditStorePath?: string;
  followUpStorePath?: string;
  establishedStorePath?: string;
  centralCycleId?: string;
  contextRunId?: string | null;
  now?: Date;
} = {}): Promise<SystemLifecycleRunResult> {
  const lifecycleLockPath = `${options.newInboxStorePath ?? getDefaultNewInboxStorePath()}.system-lifecycle`;
  return withStoreLock(lifecycleLockPath, () => applySystemLifecycleLocked(snapshot, options));
}

async function applySystemLifecycleLocked(snapshot: PersistableScannerOutput, options: {
  newInboxStorePath?: string;
  auditStorePath?: string;
  followUpStorePath?: string;
  establishedStorePath?: string;
  centralCycleId?: string;
  contextRunId?: string | null;
  now?: Date;
}): Promise<SystemLifecycleRunResult> {
  const now = options.now ?? new Date();
  const newInboxPath = options.newInboxStorePath ?? getDefaultNewInboxStorePath();
  const auditPath = options.auditStorePath ?? getDefaultLifecycleAuditStorePath();
  const establishedPath = options.establishedStorePath ?? getDefaultEstablishedUniverseStorePath();
  const scannerRunId = snapshot.scan_run.run_id;
  const cycleId = options.centralCycleId ?? scannerRunId;
  const observedAt = snapshot.provenance?.generated_at ?? snapshot.scan_run.finished_at;
  if (!isoText(observedAt)) throw new Error("LIFECYCLE_SNAPSHOT_INVALID");
  const [beforeFollowUp, universeStore] = await Promise.all([
    readFollowUpStore(options.followUpStorePath),
    readEstablishedUniverseStore(establishedPath),
  ]);
  const mainIdentities = new Set(universeStore.current.entries.filter((entry) => entry.enabled).map((entry) => universeIdentityKey(entry.chain, entry.contract_address)));
  const followUpIdentities = new Set(beforeFollowUp.entries.map((entry) => universeIdentityKey(entry.chain, entry.contract_address)));
  const events: LifecycleAuditEntry[] = [];
  let added = 0;
  let updated = 0;
  let promotedFollowUp = 0;
  let duplicateNoop = 0;
  const eligibleCandidates = new Map<string, PersistableCandidate>();
  await updateNewInboxStore((current) => {
    const entries = new Map(current.entries.map((entry) => [entry.identity, entry]));
    for (const candidate of snapshot.candidates.filter((item) => item.discovery_basket === "new_emerging")) {
      const normalized = safeIdentity(candidate.chain, candidate.contract_address);
      if (!normalized) continue;
      const existing = entries.get(normalized.identity);
      const evaluation = evaluateNewToFollowUp(candidate, snapshot, { inFollowUp: followUpIdentities.has(normalized.identity), inMainRadar: mainIdentities.has(normalized.identity) });
      const canPromote = evaluation.readiness === "CONDITIONS_MET";
      if (canPromote && !followUpIdentities.has(normalized.identity) && !mainIdentities.has(normalized.identity)) {
        eligibleCandidates.set(normalized.identity, candidate);
      }
      const nextStatus: SystemLifecycleStatus = mainIdentities.has(normalized.identity) ? "MAIN_RADAR" : (followUpIdentities.has(normalized.identity) || canPromote) ? "FOLLOW_UP" : "NEW";
      const transition = existing?.system_status !== nextStatus
        ? newTransition({
          identity: normalized.identity,
          previous: existing?.system_status ?? null,
          next: nextStatus,
          now,
          cycleId,
          scannerRunId,
          contextRunId: options.contextRunId ?? null,
          evaluation,
          reason: nextStatus === "FOLLOW_UP" && !followUpIdentities.has(normalized.identity)
            ? "NEW_TO_FOLLOW_UP_POLICY"
            : nextStatus === "FOLLOW_UP" ? "EXISTING_FOLLOW_UP_OBSERVED" : "NEW_INBOX_ADDED",
          dedupe: "APPLIED",
        })
        : existing
          ? newTransition({
            identity: normalized.identity,
            previous: existing.system_status,
            next: existing.system_status,
            now,
            cycleId,
            scannerRunId,
            contextRunId: options.contextRunId ?? null,
            evaluation,
            reason: "NEW_INBOX_UPDATED",
            dedupe: "APPLIED",
          })
          : null;
      if (!existing) added += 1; else updated += 1;
      if (transition) events.push(transition);
      entries.set(normalized.identity, {
        identity: normalized.identity,
        chain: normalized.chain,
        contract_address: normalized.contract_address,
        display_name: cleanText(candidate.name, 120),
        symbol: cleanText(candidate.symbol, 64),
        first_seen_at: existing?.first_seen_at ?? observedAt,
        last_seen_at: observedAt,
        first_scanner_run_id: existing?.first_scanner_run_id ?? scannerRunId,
        last_scanner_run_id: scannerRunId,
        system_status: nextStatus,
        last_evaluation: evaluation,
        policy_version: SYSTEM_LIFECYCLE_POLICY_VERSION,
        archived_at: existing?.archived_at ?? null,
        rejected_at: existing?.rejected_at ?? null,
        transition_ids: transition ? [transition.transition_id, ...(existing?.transition_ids ?? [])].slice(0, 64) : existing?.transition_ids ?? [],
      });
    }
    return finalizeInbox({ ...current, store_version: current.store_version + (added + updated > 0 ? 1 : 0), entries: [...entries.values()] }, now);
  }, newInboxPath);

  const filteredSnapshot = { ...snapshot, candidates: [...eligibleCandidates.values()] };
  let followUpStore = eligibleCandidates.size > 0
    ? await updateFollowUpStore((current) => ingestScannerSnapshot(current, filteredSnapshot, universeStore.current), { storePath: options.followUpStorePath, now })
    : beforeFollowUp;
  promotedFollowUp = eligibleCandidates.size;
  duplicateNoop += snapshot.candidates.filter((candidate) => {
    const identity = safeIdentity(candidate.chain, candidate.contract_address)?.identity;
    return identity !== undefined && (followUpIdentities.has(identity) || mainIdentities.has(identity));
  }).length;

  let promotedMain = 0;
  for (const entry of followUpStore.entries) {
    const identity = universeIdentityKey(entry.chain, entry.contract_address);
    const evaluation = evaluateFollowUpToMainRadar(entry, mainIdentities.has(identity), true);
    if (evaluation.readiness !== "CONDITIONS_MET") continue;
    try {
      const result = await mutateEstablishedUniverse({ operation: "add", chain: entry.chain, contract_address: entry.contract_address, display_name: entry.display_name ?? undefined, symbol_hint: entry.symbol_hint ?? undefined, owner_note: "system_lifecycle_policy_v1 automatic promotion" }, { apply: true, storePath: establishedPath, actor: "system-lifecycle", now: () => now });
      const refreshedUniverse = await readEstablishedUniverseStore(establishedPath);
      followUpStore = await updateFollowUpStore((current) => synchronizeFollowUpEstablishedMembership(current, refreshedUniverse.current, now.toISOString(), `system_lifecycle_${result.to_version}`), { storePath: options.followUpStorePath, now });
      mainIdentities.add(identity);
      promotedMain += 1;
      events.push(newTransition({ identity, previous: "FOLLOW_UP", next: "MAIN_RADAR", now, cycleId, scannerRunId, contextRunId: options.contextRunId ?? null, evaluation, reason: "FOLLOW_UP_TO_MAIN_RADAR_POLICY", dedupe: "APPLIED" }));
    } catch (error) {
      if (error instanceof Error && error.message === "ESTABLISHED_UNIVERSE_DUPLICATE_IDENTITY") {
        events.push(newTransition({ identity, previous: "FOLLOW_UP", next: "MAIN_RADAR", now, cycleId, scannerRunId, contextRunId: options.contextRunId ?? null, evaluation, reason: "MAIN_RADAR_DUPLICATE_NOOP", dedupe: "DUPLICATE_NOOP" }));
        duplicateNoop += 1;
        continue;
      }
      throw error;
    }
  }
  const mainTransitions = new Map(
    events
      .filter((event) => event.new_status === "MAIN_RADAR" && event.dedupe_result === "APPLIED")
      .map((event) => [event.identity, event]),
  );
  const updatedInbox = await updateNewInboxStore((current) => {
    const entries = current.entries.map((entry) => {
      const transition = mainTransitions.get(entry.identity);
      if (!transition || entry.system_status === "MAIN_RADAR") return entry;
      return {
        ...entry,
        system_status: "MAIN_RADAR" as const,
        last_evaluation: {
          conditions_met: transition.conditions_met,
          conditions_unmet: transition.conditions_unmet,
          missing_data: transition.missing_data,
          risks: [],
          readiness: transition.readiness,
          security_state: transition.security_state,
          verification_state: transition.verification_state,
        },
        transition_ids: [transition.transition_id, ...entry.transition_ids].slice(0, 64),
      };
    });
    return finalizeInbox({ ...current, entries }, now);
  }, newInboxPath);
  if (events.length > 0) await appendLifecycleAudit(events, auditPath, now);
  return {
    new_inbox_added: added,
    new_inbox_updated: updated,
    promoted_to_follow_up: promotedFollowUp,
    promoted_to_main_radar: promotedMain,
    duplicate_noop: duplicateNoop,
    follow_up_store: followUpStore,
    summary: buildLifecycleSummary(updatedInbox, followUpStore, await readLifecycleAuditStore(auditPath), cycleId),
  };
}

export function buildLifecycleSummary(inbox: NewInboxStore, followUp: FollowUpStore, audit: LifecycleAuditStore, cycleId: string | null = null): LifecycleSummary {
  const systemNew = inbox.entries.filter((entry) => entry.system_status === "NEW" && entry.archived_at === null && entry.rejected_at === null).length;
  const systemMain = inbox.entries.filter((entry) => entry.system_status === "MAIN_RADAR").length;
  const followUpEntries = followUp.entries.filter((entry) => entry.lifecycle_status !== "ESTABLISHED" && entry.lifecycle_status !== "ARCHIVED");
  const latest = audit.entries[0] ?? null;
  const inCycle = cycleId ? audit.entries.filter((entry) => entry.central_cycle_id === cycleId) : audit.entries;
  return {
    schema_version: LIFECYCLE_SUMMARY_SCHEMA_VERSION,
    system_new_total: systemNew,
    system_follow_up_total: followUpEntries.length,
    system_main_radar_total: systemMain,
    follow_up_action_due: followUpEntries.filter((entry) => entry.next_check_at !== null && Date.parse(entry.next_check_at) <= Date.now()).length,
    follow_up_candidates_ready: followUpEntries.filter((entry) => entry.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED").length,
    follow_up_displayed: followUpEntries.length,
    follow_up_store_version: followUp.checksum,
    last_lifecycle_change_at: latest?.changed_at ?? null,
    last_central_cycle_id: latest?.central_cycle_id ?? null,
    last_change_summary: {
      added: inCycle.filter((entry) => entry.previous_status === null).length,
      updated: inCycle.filter((entry) => entry.reason === "NEW_INBOX_UPDATED" && entry.dedupe_result === "APPLIED").length,
      promoted_to_follow_up: inCycle.filter((entry) => entry.new_status === "FOLLOW_UP" && entry.dedupe_result === "APPLIED").length,
      promoted_to_main_radar: inCycle.filter((entry) => entry.new_status === "MAIN_RADAR" && entry.dedupe_result === "APPLIED").length,
      archived: 0,
      rejected: 0,
      duplicate_noop: inCycle.filter((entry) => entry.dedupe_result === "DUPLICATE_NOOP").length,
    },
  };
}

export async function updateNewInboxStore(mutation: (store: NewInboxStore) => NewInboxStore, path = getDefaultNewInboxStorePath()): Promise<NewInboxStore> {
  return withStoreLock(path, async () => {
    const next = validateNewInboxStore(mutation(await readNewInboxStore(path)));
    await writeJsonAtomic(path, next);
    return next;
  });
}

export async function appendLifecycleAudit(entries: LifecycleAuditEntry[], path = getDefaultLifecycleAuditStorePath(), now = new Date()): Promise<LifecycleAuditStore> {
  return withStoreLock(path, async () => {
    const current = await readLifecycleAuditStore(path);
    const nextEntries = [...entries, ...current.entries].slice(0, MAX_AUDIT_ENTRIES);
    const base: Omit<LifecycleAuditStore, "checksum"> = { schema_version: LIFECYCLE_AUDIT_SCHEMA_VERSION, generated_at: iso(now), entries: nextEntries };
    const next = { ...base, checksum: checksum(base) };
    await writeJsonAtomic(path, next);
    return next;
  });
}

function validateNewInboxEntry(value: unknown): NewInboxEntry {
  if (!record(value) || typeof value.identity !== "string" || !isoText(value.first_seen_at) || !isoText(value.last_seen_at) || !safeRun(value.first_scanner_run_id) || !safeRun(value.last_scanner_run_id) || !["NEW", "FOLLOW_UP", "MAIN_RADAR"].includes(String(value.system_status)) || value.policy_version !== SYSTEM_LIFECYCLE_POLICY_VERSION || !Array.isArray(value.transition_ids) || !value.transition_ids.every((id) => typeof id === "string" && /^tr_[A-Za-z0-9_-]{8,80}$/.test(id))) throw new Error("NEW_INBOX_STORE_INVALID");
  const identity = normalizeIdentity(value.chain, value.contract_address);
  if (!identity || identity.identity !== value.identity) throw new Error("NEW_INBOX_STORE_INVALID");
  return {
    identity: identity.identity,
    chain: identity.chain,
    contract_address: identity.contract_address,
    display_name: nullableText(value.display_name, 120),
    symbol: nullableText(value.symbol, 64),
    first_seen_at: value.first_seen_at,
    last_seen_at: value.last_seen_at,
    first_scanner_run_id: value.first_scanner_run_id,
    last_scanner_run_id: value.last_scanner_run_id,
    system_status: value.system_status as SystemLifecycleStatus,
    last_evaluation: validateConditions(value.last_evaluation),
    policy_version: SYSTEM_LIFECYCLE_POLICY_VERSION,
    archived_at: nullableIso(value.archived_at),
    rejected_at: nullableIso(value.rejected_at),
    transition_ids: [...value.transition_ids],
  };
}

function validateAuditEntry(value: unknown): LifecycleAuditEntry {
  if (!record(value) || typeof value.transition_id !== "string" || !/^tr_[A-Za-z0-9_-]{8,80}$/.test(value.transition_id) || !["SYSTEM", "USER"].includes(String(value.transition_kind)) || typeof value.identity !== "string" || !(value.previous_status === null || ["NEW", "FOLLOW_UP", "MAIN_RADAR"].includes(String(value.previous_status))) || !["NEW", "FOLLOW_UP", "MAIN_RADAR"].includes(String(value.new_status)) || !isoText(value.changed_at) || !(value.central_cycle_id === null || safeRun(value.central_cycle_id)) || !(value.scanner_run_id === null || safeRun(value.scanner_run_id)) || !(value.context_run_id === null || safeRun(value.context_run_id)) || value.policy_version !== SYSTEM_LIFECYCLE_POLICY_VERSION || !["APPLIED", "DUPLICATE_NOOP", "BLOCKED"].includes(String(value.dedupe_result)) || typeof value.reason !== "string") throw new Error("LIFECYCLE_AUDIT_STORE_INVALID");
  return {
    transition_id: value.transition_id,
    transition_kind: value.transition_kind as "SYSTEM" | "USER",
    identity: value.identity,
    previous_status: value.previous_status as SystemLifecycleStatus | null,
    new_status: value.new_status as SystemLifecycleStatus,
    changed_at: value.changed_at,
    central_cycle_id: value.central_cycle_id,
    scanner_run_id: value.scanner_run_id,
    context_run_id: value.context_run_id,
    policy_version: SYSTEM_LIFECYCLE_POLICY_VERSION,
    conditions_met: strings(value.conditions_met),
    conditions_unmet: strings(value.conditions_unmet),
    missing_data: strings(value.missing_data),
    readiness: value.readiness === "CONDITIONS_MET" ? "CONDITIONS_MET" : "CONDITIONS_UNMET",
    security_state: cleanText(value.security_state, 80) ?? "UNKNOWN",
    verification_state: cleanText(value.verification_state, 80) ?? "UNKNOWN",
    dedupe_result: value.dedupe_result as LifecycleAuditEntry["dedupe_result"],
    reason: value.reason,
  };
}

function validateConditions(value: unknown): LifecycleConditions {
  if (!record(value)) throw new Error("LIFECYCLE_CONDITIONS_INVALID");
  return conditions(strings(value.conditions_met), strings(value.conditions_unmet), strings(value.missing_data), strings(value.risks), cleanText(value.security_state, 80) ?? "UNKNOWN", cleanText(value.verification_state, 80) ?? "UNKNOWN");
}

function conditions(met: string[], unmet: string[], missing: string[], risks: string[], security: string, verification: string): LifecycleConditions {
  return { conditions_met: unique(met), conditions_unmet: unique(unmet), missing_data: unique(missing), risks: unique(risks), readiness: unmet.length === 0 ? "CONDITIONS_MET" : "CONDITIONS_UNMET", security_state: security, verification_state: verification };
}

function newTransition(input: { identity: string; previous: SystemLifecycleStatus | null; next: SystemLifecycleStatus; now: Date; cycleId: string; scannerRunId: string; contextRunId: string | null; evaluation: LifecycleConditions; reason: string; dedupe: LifecycleAuditEntry["dedupe_result"] }): LifecycleAuditEntry {
  return { transition_id: `tr_${randomUUID().replace(/-/g, "")}`, transition_kind: "SYSTEM", identity: input.identity, previous_status: input.previous, new_status: input.next, changed_at: iso(input.now), central_cycle_id: input.cycleId, scanner_run_id: input.scannerRunId, context_run_id: input.contextRunId, policy_version: SYSTEM_LIFECYCLE_POLICY_VERSION, conditions_met: input.evaluation.conditions_met, conditions_unmet: input.evaluation.conditions_unmet, missing_data: input.evaluation.missing_data, readiness: input.evaluation.readiness, security_state: input.evaluation.security_state, verification_state: input.evaluation.verification_state, dedupe_result: input.dedupe, reason: input.reason };
}

function finalizeInbox(store: Omit<NewInboxStore, "checksum"> | NewInboxStore, now: Date): NewInboxStore {
  const base: Omit<NewInboxStore, "checksum"> = { schema_version: NEW_INBOX_SCHEMA_VERSION, store_version: store.store_version, generated_at: iso(now), entries: [...store.entries].sort((a, b) => a.identity.localeCompare(b.identity)) };
  return { ...base, checksum: checksum(base) };
}

function safeIdentity(chain: unknown, address: unknown): { chain: SupportedEstablishedChain; contract_address: string; identity: string } | null {
  try { return normalizeIdentity(chain, address); } catch { return null; }
}

function normalizeIdentity(chain: unknown, address: unknown): { chain: SupportedEstablishedChain; contract_address: string; identity: string } {
  if (typeof chain !== "string" || typeof address !== "string" || address.trim().length === 0) throw new Error("IDENTITY_INVALID");
  const normalizedChain = normalizeEstablishedChain(chain);
  const normalizedAddress = normalizeEstablishedAddress(normalizedChain, address);
  return { chain: normalizedChain, contract_address: normalizedAddress, identity: universeIdentityKey(normalizedChain, normalizedAddress) };
}

async function withStoreLock<T>(path: string, run: () => Promise<T>): Promise<T> {
  const lockPath = `${resolve(path)}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  for (let attempt = 0; attempt < 40 && !handle; attempt += 1) {
    try { handle = await open(lockPath, "wx"); } catch (error) { if (!isError(error, "EEXIST")) throw error; await new Promise((done) => setTimeout(done, 10)); }
  }
  if (!handle) throw new Error("LIFECYCLE_STORE_LOCK_UNAVAILABLE");
  try { return await run(); } finally { await handle.close().catch(() => undefined); await rm(lockPath, { force: true }).catch(() => undefined); }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const target = resolve(path);
  const temp = `${target}.${randomUUID()}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try { handle = await open(temp, "wx"); await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); await handle.close(); handle = null; await rename(temp, target); } catch (error) { await handle?.close().catch(() => undefined); await rm(temp, { force: true }).catch(() => undefined); throw new Error("LIFECYCLE_ATOMIC_WRITE_FAILED", { cause: error }); }
}

function checksum(value: unknown): string { return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`; }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function iso(value: Date): string { if (!Number.isFinite(value.getTime())) throw new Error("LIFECYCLE_DATE_INVALID"); return value.toISOString(); }
function isoText(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function nullableIso(value: unknown): string | null { if (value === null) return null; if (!isoText(value)) throw new Error("LIFECYCLE_STORE_INVALID"); return value; }
function cleanText(value: unknown, limit: number): string | null { if (typeof value !== "string") return null; const text = value.trim(); return text.length > 0 && text.length <= limit ? text : null; }
function nullableText(value: unknown, limit: number): string | null { if (value === null) return null; const text = cleanText(value, limit); if (text === null) throw new Error("LIFECYCLE_STORE_INVALID"); return text; }
function strings(value: unknown): string[] { if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 160)) throw new Error("LIFECYCLE_STORE_INVALID"); return unique(value); }
function unique(values: string[]): string[] { return [...new Set(values)].sort(); }
function safeRun(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value); }
function record(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isError(value: unknown, code: string): value is NodeJS.ErrnoException { return value instanceof Error && "code" in value && (value as NodeJS.ErrnoException).code === code; }
