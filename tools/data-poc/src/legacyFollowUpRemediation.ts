import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getDataPocRuntimeRoot } from "./dataPocRuntimeRoot.js";
import {
  followUpIdentity,
  readFollowUpStore,
  updateFollowUpStore,
  type FollowUpEntry,
  type FollowUpStore,
} from "./followUpBasket.js";
import {
  SYSTEM_LIFECYCLE_POLICY_VERSION,
  appendLifecycleAudit,
  finalizeNewInboxStore,
  readNewInboxStore,
  updateNewInboxStore,
  type LifecycleAuditEntry,
  type LifecycleConditions,
  type NewInboxEntry,
} from "./systemLifecycle.js";
import {
  createNewRecheckCheckpointStates,
  createNewRecheckFilterResult,
  finalizeNewRecheckStore,
  getDefaultNewRecheckStorePath,
  readNewRecheckStore,
  updateNewRecheckStore,
  type NewRecheckEntry,
} from "./newRecheckStore.js";
import type { PersistableCandidate } from "./persistableScannerModel.js";

export const LEGACY_FOLLOW_UP_REMEDIATION_SCHEMA_VERSION = "legacy_followup_remediation_v1";
export const LEGACY_FOLLOW_UP_REMEDIATION_REASON = "LEGACY_ADMISSION_REMEDIATION";
export const LEGACY_FOLLOW_UP_BASELINE_REJECT_REASON = "LEGACY_ADMISSION_REMEDIATION_BASELINE_REJECT";
export const LEGACY_FOLLOW_UP_DATA_UNRESOLVED_REASON = "LEGACY_ADMISSION_REMEDIATION_DATA_UNRESOLVED";

type RemediationGroup = "A" | "B" | "C" | "D";
type RemediationArchiveStatus = "PREPARED" | "APPLIED";
type ArchiveAction = "KEEP_FOLLOW_UP" | "MOVE_TO_NEW" | "MERGE_WITH_EXISTING_NEW" | "QUARANTINE_FROM_ACTIVE_FOLLOW_UP" | "PRESERVE_INDEPENDENT_NEW";
type ProviderClass = "VALID_CURRENT_OBSERVATION" | "NO_MATCHING_PAIR" | "UNUSABLE_PAIR_DATA" | "UNSUPPORTED_OR_INVALID";
type BaselineStatus = "PASS" | "REJECT" | null;

type Disc2aManifestEntry = {
  identity: string;
  chain: string;
  contract_address: string;
  first_seen_at: string;
  lifecycle_status: string;
  completed_checkpoints: number[];
  latest_filter_result: { status: string; reasons: string[]; evaluated_at: string } | null;
  latest_security_status: { status: string; source: string | null; checked_at: string | null; missing_data: string[]; risk_flags: string[] };
  last_checked_at: string | null;
  source_run_id: string;
};

type Disc2aManifest = {
  manifest_version: string;
  frozen_at: string;
  follow_up: { record_count: number; unique_identity_count: number };
  entries: Disc2aManifestEntry[];
};

type Disc2aRevalidationResult = {
  identity: string;
  chain: string;
  contract_address: string;
  provider_class: ProviderClass;
  baseline_status: BaselineStatus;
  hard_reasons: string[];
  symbol?: string;
  data_complete?: boolean;
  safe_error_class?: string;
  error_code?: string;
};

type Disc2aRevalidation = {
  report_version: string;
  started_at: string;
  finished_at: string;
  population_count: number;
  batch_count: number;
  provider_request_count: number;
  provider_retry_count: number;
  results: Disc2aRevalidationResult[];
};

export type LegacyFollowUpRemediationArchiveEntry = {
  identity: string;
  original_follow_up_record: FollowUpEntry;
  disc2a_group: RemediationGroup;
  fresh_remediation_result: Disc2aRevalidationResult;
  fresh_observed_at: string;
  current_baseline: { status: BaselineStatus; reasons: string[] };
  original_first_seen_at: string;
  source_lineage: { source_run_id: string; last_checked_at: string | null };
  frozen_source_lineage: { source_run_id: string; last_checked_at: string | null };
  completed_legacy_checkpoints: number[];
  security_history: FollowUpEntry["latest_security_status"];
  manual_verification_references: FollowUpStore["audit_log"];
  migration_action: ArchiveAction;
  migration_reason: string;
  migration_timestamp: string;
  remediation_id: string;
};

export type LegacyFollowUpRemediationArchive = {
  schema_version: typeof LEGACY_FOLLOW_UP_REMEDIATION_SCHEMA_VERSION;
  remediation_id: string;
  reason: typeof LEGACY_FOLLOW_UP_REMEDIATION_REASON;
  status: RemediationArchiveStatus;
  created_at: string;
  applied_at: string | null;
  input: {
    manifest_sha256: string;
    revalidation_sha256: string;
    frozen_population: number;
    groups: Record<RemediationGroup, number>;
    revalidation_finished_at: string;
    provider_calls: 0;
  };
  receipt: {
    group_a_active_follow_up: number;
    group_b_moved_to_new: number;
    group_b_already_new_merged: number;
    group_c_quarantined: number;
    group_c_existing_new_preserved: number;
    duplicate_active_identities: number;
  };
  entries: LegacyFollowUpRemediationArchiveEntry[];
};

export type LegacyFollowUpRemediationResult = {
  status: "APPLIED" | "ALREADY_APPLIED";
  remediation_id: string;
  archive_path: string;
  group_a_active_follow_up: number;
  group_b_moved_to_new: number;
  group_b_already_new_merged: number;
  group_c_quarantined: number;
  group_c_existing_new_preserved: number;
  duplicate_active_identities: number;
  provider_calls: 0;
};

export function getDefaultLegacyFollowUpRemediationArchivePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.CRYPTO_EDGE_LEGACY_FOLLOW_UP_REMEDIATION_PATH?.trim()
    || resolve(getDataPocRuntimeRoot(env), ".local", "remediation", "legacy-followup-remediation-v1.json"));
}

/**
 * One-time deterministic remediation using only safe, frozen DISC.2A artifacts.
 * It deliberately has no provider, browser, AI, or central-cycle dependency.
 */
export async function applyLegacyFollowUpRemediation(options: {
  remediationId: string;
  manifestPath: string;
  revalidationPath: string;
  archivePath?: string;
  followUpStorePath?: string;
  newInboxStorePath?: string;
  newRecheckStorePath?: string;
  auditStorePath?: string;
  now?: Date;
}): Promise<LegacyFollowUpRemediationResult> {
  assertRemediationId(options.remediationId);
  const now = validDate(options.now ?? new Date());
  const archivePath = resolve(options.archivePath ?? getDefaultLegacyFollowUpRemediationArchivePath());
  const manifestPath = resolve(options.manifestPath);
  const revalidationPath = resolve(options.revalidationPath);
  const lockPath = `${archivePath}.lock`;
  return withLock(lockPath, async () => {
    const [manifestRaw, revalidationRaw] = await Promise.all([readFile(manifestPath, "utf8"), readFile(revalidationPath, "utf8")]);
    const manifest = validateManifest(JSON.parse(manifestRaw) as unknown);
    const revalidation = validateRevalidation(JSON.parse(revalidationRaw) as unknown);
    const classified = classifyFrozenInput(manifest, revalidation);
    const input = {
      manifest_sha256: sha256(manifestRaw),
      revalidation_sha256: sha256(revalidationRaw),
      frozen_population: manifest.entries.length,
      groups: classified.counts,
      revalidation_finished_at: classified.revalidation_finished_at,
      provider_calls: 0 as const,
    };
    const existing = await readArchiveIfPresent(archivePath);
    if (existing?.status === "APPLIED") {
      assertSameAppliedInput(existing, options.remediationId, input);
      return archiveResult("ALREADY_APPLIED", existing, archivePath);
    }

    const archive = existing ?? await createPreparedArchive({
      remediationId: options.remediationId,
      input,
      classified,
      archivePath,
      followUpStorePath: options.followUpStorePath,
      newInboxStorePath: options.newInboxStorePath,
      now,
    });
    assertSamePreparedInput(archive, options.remediationId, input);
    const applied = await applyPreparedArchive(archive, {
      archivePath,
      followUpStorePath: options.followUpStorePath,
      newInboxStorePath: options.newInboxStorePath,
      newRecheckStorePath: options.newRecheckStorePath ?? getDefaultNewRecheckStorePath(),
      auditStorePath: options.auditStorePath,
      now,
    });
    await writeArchive(archivePath, applied);
    return archiveResult("APPLIED", applied, archivePath);
  });
}

async function createPreparedArchive(input: {
  remediationId: string;
  input: LegacyFollowUpRemediationArchive["input"];
  classified: ReturnType<typeof classifyFrozenInput>;
  archivePath: string;
  followUpStorePath?: string;
  newInboxStorePath?: string;
  now: Date;
}): Promise<LegacyFollowUpRemediationArchive> {
  const [followUp, inbox] = await Promise.all([
    readFollowUpStore(input.followUpStorePath),
    readNewInboxStore(input.newInboxStorePath),
  ]);
  const followByIdentity = new Map(followUp.entries.map((entry) => [followUpIdentity(entry.chain, entry.contract_address).identity, entry]));
  const activeNew = new Set(inbox.entries
    .filter((entry) => entry.system_status === "NEW" && entry.archived_at === null && entry.rejected_at === null)
    .map((entry) => entry.identity));
  const entries: LegacyFollowUpRemediationArchiveEntry[] = [];
  for (const item of input.classified.items) {
    const original = followByIdentity.get(item.identity);
    if (!original) throw new Error("LEGACY_REMEDIATION_FROZEN_FOLLOW_UP_MISSING");
    if (original.first_seen_at !== item.manifest.first_seen_at) {
      throw new Error("LEGACY_REMEDIATION_FROZEN_FOLLOW_UP_DRIFT");
    }
    const migrationAction = actionFor(item.group, activeNew.has(item.identity));
    entries.push({
      identity: item.identity,
      original_follow_up_record: original,
      disc2a_group: item.group,
      fresh_remediation_result: item.revalidation,
      fresh_observed_at: input.classified.revalidation_finished_at,
      current_baseline: { status: item.revalidation.baseline_status, reasons: [...item.revalidation.hard_reasons] },
      original_first_seen_at: original.first_seen_at,
      source_lineage: { source_run_id: original.source_run_id, last_checked_at: original.last_checked_at },
      frozen_source_lineage: { source_run_id: item.manifest.source_run_id, last_checked_at: item.manifest.last_checked_at },
      completed_legacy_checkpoints: [...original.completed_checkpoints],
      security_history: original.latest_security_status,
      manual_verification_references: followUp.audit_log.filter((audit) => audit.entry_id === original.entry_id && audit.manual_verification !== undefined),
      migration_action: migrationAction,
      migration_reason: migrationReasonFor(item.group),
      migration_timestamp: input.now.toISOString(),
      remediation_id: input.remediationId,
    });
  }
  const archive: LegacyFollowUpRemediationArchive = {
    schema_version: LEGACY_FOLLOW_UP_REMEDIATION_SCHEMA_VERSION,
    remediation_id: input.remediationId,
    reason: LEGACY_FOLLOW_UP_REMEDIATION_REASON,
    status: "PREPARED",
    created_at: input.now.toISOString(),
    applied_at: null,
    input: input.input,
    receipt: {
      group_a_active_follow_up: 0,
      group_b_moved_to_new: 0,
      group_b_already_new_merged: 0,
      group_c_quarantined: 0,
      group_c_existing_new_preserved: 0,
      duplicate_active_identities: 0,
    },
    entries: entries.sort((left, right) => left.identity.localeCompare(right.identity)),
  };
  await writeArchive(input.archivePath, archive);
  return archive;
}

async function applyPreparedArchive(
  archive: LegacyFollowUpRemediationArchive,
  options: {
    archivePath: string;
    followUpStorePath?: string;
    newInboxStorePath?: string;
    newRecheckStorePath: string;
    auditStorePath?: string;
    now: Date;
  },
): Promise<LegacyFollowUpRemediationArchive> {
  const b = archive.entries.filter((entry) => entry.disc2a_group === "B");
  const c = archive.entries.filter((entry) => entry.disc2a_group === "C");
  const a = archive.entries.filter((entry) => entry.disc2a_group === "A");
  if (a.length !== 3 || b.length !== 325 || c.length !== 355 || archive.entries.some((entry) => entry.disc2a_group === "D")) {
    throw new Error("LEGACY_REMEDIATION_ARCHIVE_CLASSIFICATION_INVALID");
  }
  const timestamp = archive.created_at;
  const activeBefore = await readNewInboxStore(options.newInboxStorePath);
  const activeNewBefore = new Set(activeBefore.entries
    .filter((entry) => entry.system_status === "NEW" && entry.archived_at === null && entry.rejected_at === null)
    .map((entry) => entry.identity));
  const bExisting = b.filter((entry) => activeNewBefore.has(entry.identity));
  const cExisting = c.filter((entry) => activeNewBefore.has(entry.identity));

  await updateNewInboxStore((current) => {
    const byIdentity = new Map(current.entries.map((entry) => [entry.identity, entry]));
    for (const item of b) {
      if (byIdentity.has(item.identity)) continue;
      byIdentity.set(item.identity, remediationNewInboxEntry(item, archive.remediation_id));
    }
    const entries = [...byIdentity.values()];
    const changed = entries.length !== current.entries.length;
    return changed
      ? finalizeNewInboxStore({ ...current, store_version: current.store_version + 1, entries }, options.now)
      : current;
  }, options.newInboxStorePath);

  await updateNewRecheckStore((current) => {
    const byIdentity = new Map(current.entries.map((entry) => [entry.identity, entry]));
    for (const item of b) {
      if (byIdentity.has(item.identity)) continue;
      byIdentity.set(item.identity, remediationNewRecheckEntry(item, archive.remediation_id, timestamp));
    }
    const changed = byIdentity.size !== current.entries.length;
    return changed ? finalizeNewRecheckStore({ ...current, entries: [...byIdentity.values()] }, options.now) : current;
  }, options.newRecheckStorePath);

  const remove = new Set([...b, ...c].map((entry) => entry.identity));
  await updateFollowUpStore((current) => ({
    ...current,
    entries: current.entries
      .filter((entry) => !remove.has(followUpIdentity(entry.chain, entry.contract_address).identity))
      .map((entry) => {
        const currentResult = a.find((item) => item.identity === followUpIdentity(entry.chain, entry.contract_address).identity);
        return currentResult ? {
          ...entry,
          last_seen_at: latestIso(entry.last_seen_at, currentResult.fresh_observed_at),
          latest_filter_result: {
            status: "passed_basic_filter",
            reasons: [...currentResult.fresh_remediation_result.hard_reasons],
            evaluated_at: currentResult.fresh_observed_at,
          },
        } : entry;
      }),
  }), { storePath: options.followUpStorePath, now: options.now });

  await appendLifecycleAudit(b.map((entry) => remediationAuditEntry(entry, archive.remediation_id, timestamp)), options.auditStorePath, options.now);

  const [inbox, followUp] = await Promise.all([readNewInboxStore(options.newInboxStorePath), readFollowUpStore(options.followUpStorePath)]);
  const activeNew = new Set(inbox.entries
    .filter((entry) => entry.system_status === "NEW" && entry.archived_at === null && entry.rejected_at === null)
    .map((entry) => entry.identity));
  const activeFollow = new Set(followUp.entries
    .filter((entry) => entry.lifecycle_status !== "ARCHIVED" && entry.lifecycle_status !== "ESTABLISHED")
    .map((entry) => followUpIdentity(entry.chain, entry.contract_address).identity));
  const duplicates = [...activeNew].filter((identity) => activeFollow.has(identity));
  if (duplicates.length > 0) throw new Error("LEGACY_REMEDIATION_ACTIVE_DUPLICATE");
  if (b.some((entry) => activeFollow.has(entry.identity)) || c.some((entry) => activeFollow.has(entry.identity)) || a.some((entry) => !activeFollow.has(entry.identity))) {
    throw new Error("LEGACY_REMEDIATION_ACTIVE_STATE_INVALID");
  }
  return {
    ...archive,
    status: "APPLIED",
    applied_at: options.now.toISOString(),
    receipt: {
      group_a_active_follow_up: a.length,
      group_b_moved_to_new: b.length - bExisting.length,
      group_b_already_new_merged: bExisting.length,
      group_c_quarantined: c.length - cExisting.length,
      group_c_existing_new_preserved: cExisting.length,
      duplicate_active_identities: duplicates.length,
    },
  };
}

function remediationNewInboxEntry(item: LegacyFollowUpRemediationArchiveEntry, remediationId: string): NewInboxEntry {
  const original = item.original_follow_up_record;
  return {
    identity: item.identity,
    chain: original.chain,
    contract_address: original.contract_address,
    display_name: original.display_name,
    symbol: item.fresh_remediation_result.symbol ?? original.symbol_hint,
    first_seen_at: original.first_seen_at,
    last_seen_at: latestIso(original.last_seen_at, item.fresh_observed_at),
    first_scanner_run_id: original.source_run_id,
    last_scanner_run_id: remediationId,
    system_status: "NEW",
    last_evaluation: remediationConditions(item.fresh_remediation_result.hard_reasons),
    policy_version: SYSTEM_LIFECYCLE_POLICY_VERSION,
    archived_at: null,
    rejected_at: null,
    transition_ids: [transitionId(item.identity, remediationId)],
  };
}

function remediationNewRecheckEntry(item: LegacyFollowUpRemediationArchiveEntry, remediationId: string, timestamp: string): NewRecheckEntry {
  const original = item.original_follow_up_record;
  const candidate = remediationCandidate(item, remediationId, item.fresh_observed_at);
  return {
    identity: item.identity,
    chain: original.chain,
    contract_address: original.contract_address,
    first_seen_at: original.first_seen_at,
    schedule_origin_at: timestamp,
    completed_checkpoints: [],
    checkpoint_states: createNewRecheckCheckpointStates(),
    last_attempt_at: null,
    last_success_at: null,
    last_checkpoint: null,
    next_checkpoint: 1,
    latest_source_timestamp: item.fresh_observed_at,
    latest_normalized_candidate: candidate,
    latest_filter_result: createNewRecheckFilterResult("rejected_basic_filter", item.fresh_remediation_result.hard_reasons, item.fresh_observed_at),
    last_error_code: null,
  };
}

function remediationCandidate(item: LegacyFollowUpRemediationArchiveEntry, remediationId: string, timestamp: string): PersistableCandidate {
  const original = item.original_follow_up_record;
  return {
    run_id: remediationId,
    candidate_id: `remediation_${createHash("sha256").update(item.identity, "utf8").digest("hex").slice(0, 40)}`,
    symbol: item.fresh_remediation_result.symbol ?? original.symbol_hint ?? "UNKNOWN",
    name: original.display_name,
    chain: original.chain,
    contract_address: original.contract_address,
    pair_address: null,
    dex: null,
    source: "disc2a-remediation",
    source_url: null,
    price_usd: null,
    market_cap_usd: null,
    fdv_usd: null,
    liquidity_usd: null,
    volume_24h_usd: null,
    volume_market_cap_ratio: null,
    pair_created_at: null,
    pair_age_days: null,
    basic_filter_status: "rejected_basic_filter",
    filter_reasons: [...item.fresh_remediation_result.hard_reasons],
    final_label: "REJECT",
    final_reasons: [...item.fresh_remediation_result.hard_reasons],
    created_at: timestamp,
    discovery_basket: "new_emerging",
    discovery_method: "dexscreener_latest_token_profiles",
    observation_only: true,
    established_eligible: false,
    universe_version: null,
    universe_entry_index: null,
    address_identity_verified: true,
  };
}

function remediationAuditEntry(item: LegacyFollowUpRemediationArchiveEntry, remediationId: string, timestamp: string): LifecycleAuditEntry {
  return {
    transition_id: transitionId(item.identity, remediationId),
    transition_kind: "SYSTEM",
    identity: item.identity,
    previous_status: "FOLLOW_UP",
    new_status: "NEW",
    changed_at: timestamp,
    central_cycle_id: null,
    scanner_run_id: remediationId,
    context_run_id: null,
    policy_version: SYSTEM_LIFECYCLE_POLICY_VERSION,
    conditions_met: ["IDENTITY_VALID", "LEGACY_HISTORY_PRESERVED"],
    conditions_unmet: ["FOLLOW_UP_BASIC_FILTERS_PASSED"],
    missing_data: [],
    readiness: "CONDITIONS_UNMET",
    security_state: item.original_follow_up_record.latest_security_status.status,
    verification_state: "NOT_REQUIRED",
    dedupe_result: "APPLIED",
    reason: LEGACY_FOLLOW_UP_BASELINE_REJECT_REASON,
  };
}

function remediationConditions(reasons: string[]): LifecycleConditions {
  return {
    conditions_met: ["IDENTITY_VALID", "LEGACY_HISTORY_PRESERVED"],
    conditions_unmet: ["FOLLOW_UP_BASIC_FILTERS_PASSED"],
    missing_data: [],
    risks: [],
    readiness: "CONDITIONS_UNMET",
    security_state: "NOT_CHECKED",
    verification_state: "NOT_REQUIRED",
  };
}

function actionFor(group: RemediationGroup, alreadyNew: boolean): ArchiveAction {
  if (group === "A") return "KEEP_FOLLOW_UP";
  if (group === "B") return alreadyNew ? "MERGE_WITH_EXISTING_NEW" : "MOVE_TO_NEW";
  if (group === "C") return alreadyNew ? "PRESERVE_INDEPENDENT_NEW" : "QUARANTINE_FROM_ACTIVE_FOLLOW_UP";
  throw new Error("LEGACY_REMEDIATION_UNSUPPORTED_GROUP");
}

function migrationReasonFor(group: RemediationGroup): string {
  if (group === "B") return LEGACY_FOLLOW_UP_BASELINE_REJECT_REASON;
  if (group === "C") return LEGACY_FOLLOW_UP_DATA_UNRESOLVED_REASON;
  return LEGACY_FOLLOW_UP_REMEDIATION_REASON;
}

function classifyFrozenInput(manifest: Disc2aManifest, revalidation: Disc2aRevalidation): {
  counts: Record<RemediationGroup, number>;
  revalidation_finished_at: string;
  items: Array<{ identity: string; manifest: Disc2aManifestEntry; revalidation: Disc2aRevalidationResult; group: RemediationGroup }>;
} {
  if (manifest.entries.length !== 683 || manifest.follow_up.record_count !== 683 || manifest.follow_up.unique_identity_count !== 683 || revalidation.population_count !== 683 || revalidation.results.length !== 683) {
    throw new Error("LEGACY_REMEDIATION_FROZEN_POPULATION_INVALID");
  }
  const manifestByIdentity = new Map(manifest.entries.map((entry) => [entry.identity, entry]));
  if (manifestByIdentity.size !== 683) throw new Error("LEGACY_REMEDIATION_FROZEN_DUPLICATE_IDENTITY");
  const items = revalidation.results.map((result) => {
    const entry = manifestByIdentity.get(result.identity);
    if (!entry || entry.chain !== result.chain || entry.contract_address !== result.contract_address) throw new Error("LEGACY_REMEDIATION_FROZEN_IDENTITY_MISMATCH");
    const group = groupFor(result);
    return { identity: result.identity, manifest: entry, revalidation: result, group };
  }).sort((left, right) => left.identity.localeCompare(right.identity));
  if (new Set(items.map((item) => item.identity)).size !== 683) throw new Error("LEGACY_REMEDIATION_FROZEN_DUPLICATE_RESULT");
  const counts: Record<RemediationGroup, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const item of items) counts[item.group] += 1;
  if (counts.A !== 3 || counts.B !== 325 || counts.C !== 355 || counts.D !== 0) throw new Error("LEGACY_REMEDIATION_FROZEN_CLASSIFICATION_INVALID");
  return { counts, revalidation_finished_at: revalidation.finished_at, items };
}

function groupFor(result: Disc2aRevalidationResult): RemediationGroup {
  if (result.provider_class === "VALID_CURRENT_OBSERVATION") return result.baseline_status === "PASS" ? "A" : "B";
  if (result.provider_class === "NO_MATCHING_PAIR" || result.provider_class === "UNUSABLE_PAIR_DATA") return "C";
  return "D";
}

function validateManifest(value: unknown): Disc2aManifest {
  if (!record(value) || value.manifest_version !== "disc2a_legacy_followup_population_v1" || !iso(value.frozen_at) || !record(value.follow_up) || !integer(value.follow_up.record_count) || !integer(value.follow_up.unique_identity_count) || !Array.isArray(value.entries)) throw new Error("LEGACY_REMEDIATION_MANIFEST_INVALID");
  const entries = value.entries.map((entry) => validateManifestEntry(entry));
  return { manifest_version: value.manifest_version, frozen_at: value.frozen_at, follow_up: { record_count: value.follow_up.record_count, unique_identity_count: value.follow_up.unique_identity_count }, entries };
}

function validateManifestEntry(value: unknown): Disc2aManifestEntry {
  if (!record(value) || !text(value.identity, 240) || !text(value.chain, 64) || !text(value.contract_address, 180) || !iso(value.first_seen_at) || !text(value.lifecycle_status, 64) || !Array.isArray(value.completed_checkpoints) || !value.completed_checkpoints.every(integer) || !(value.latest_filter_result === null || record(value.latest_filter_result)) || !record(value.latest_security_status) || !(value.last_checked_at === null || iso(value.last_checked_at)) || !text(value.source_run_id, 128)) throw new Error("LEGACY_REMEDIATION_MANIFEST_INVALID");
  const filter = value.latest_filter_result === null ? null : validateFilter(value.latest_filter_result);
  const security = value.latest_security_status;
  if (!text(security.status, 80) || !(security.source === null || text(security.source, 80)) || !(security.checked_at === null || iso(security.checked_at)) || !strings(security.missing_data) || !strings(security.risk_flags)) throw new Error("LEGACY_REMEDIATION_MANIFEST_INVALID");
  return { identity: value.identity, chain: value.chain, contract_address: value.contract_address, first_seen_at: value.first_seen_at, lifecycle_status: value.lifecycle_status, completed_checkpoints: [...value.completed_checkpoints], latest_filter_result: filter, latest_security_status: { status: security.status, source: security.source, checked_at: security.checked_at, missing_data: [...security.missing_data], risk_flags: [...security.risk_flags] }, last_checked_at: value.last_checked_at, source_run_id: value.source_run_id };
}

function validateRevalidation(value: unknown): Disc2aRevalidation {
  if (!record(value) || value.report_version !== "disc2a_legacy_followup_revalidation_v1" || !iso(value.started_at) || !iso(value.finished_at) || !integer(value.population_count) || !integer(value.batch_count) || !integer(value.provider_request_count) || !integer(value.provider_retry_count) || !Array.isArray(value.results)) throw new Error("LEGACY_REMEDIATION_REVALIDATION_INVALID");
  return { report_version: value.report_version, started_at: value.started_at, finished_at: value.finished_at, population_count: value.population_count, batch_count: value.batch_count, provider_request_count: value.provider_request_count, provider_retry_count: value.provider_retry_count, results: value.results.map(validateRevalidationResult) };
}

function validateRevalidationResult(value: unknown): Disc2aRevalidationResult {
  if (!record(value) || !text(value.identity, 240) || !text(value.chain, 64) || !text(value.contract_address, 180) || !["VALID_CURRENT_OBSERVATION", "NO_MATCHING_PAIR", "UNUSABLE_PAIR_DATA", "UNSUPPORTED_OR_INVALID"].includes(String(value.provider_class)) || !(value.symbol === undefined || text(value.symbol, 80)) || !(value.data_complete === undefined || typeof value.data_complete === "boolean") || !(value.safe_error_class === undefined || text(value.safe_error_class, 160)) || !(value.error_code === undefined || text(value.error_code, 160))) throw new Error("LEGACY_REMEDIATION_REVALIDATION_INVALID");
  const currentObservation = value.provider_class === "VALID_CURRENT_OBSERVATION";
  if (currentObservation && !(value.baseline_status === "PASS" || value.baseline_status === "REJECT") || !currentObservation && !(value.baseline_status === undefined || value.baseline_status === null) || currentObservation && !strings(value.hard_reasons) || !currentObservation && !(value.hard_reasons === undefined || value.hard_reasons === null || strings(value.hard_reasons))) throw new Error("LEGACY_REMEDIATION_REVALIDATION_INVALID");
  return {
    identity: value.identity,
    chain: value.chain,
    contract_address: value.contract_address,
    provider_class: value.provider_class as ProviderClass,
    baseline_status: currentObservation ? value.baseline_status as BaselineStatus : null,
    hard_reasons: Array.isArray(value.hard_reasons) ? [...value.hard_reasons] : [],
    ...(value.symbol === undefined ? {} : { symbol: value.symbol }),
    ...(value.data_complete === undefined ? {} : { data_complete: value.data_complete }),
    ...(value.safe_error_class === undefined ? {} : { safe_error_class: value.safe_error_class }),
    ...(value.error_code === undefined ? {} : { error_code: value.error_code }),
  };
}

function validateFilter(value: Record<string, unknown>): Disc2aManifestEntry["latest_filter_result"] {
  if (!(value.status === "passed_basic_filter" || value.status === "rejected_basic_filter") || !strings(value.reasons) || !iso(value.evaluated_at)) throw new Error("LEGACY_REMEDIATION_MANIFEST_INVALID");
  return { status: value.status, reasons: [...value.reasons], evaluated_at: value.evaluated_at };
}

async function readArchiveIfPresent(path: string): Promise<LegacyFollowUpRemediationArchive | null> {
  try { return validateArchive(JSON.parse(await readFile(path, "utf8")) as unknown); }
  catch (error) { if (isError(error, "ENOENT")) return null; throw error; }
}

function validateArchive(value: unknown): LegacyFollowUpRemediationArchive {
  if (!record(value) || value.schema_version !== LEGACY_FOLLOW_UP_REMEDIATION_SCHEMA_VERSION || !text(value.remediation_id, 160) || value.reason !== LEGACY_FOLLOW_UP_REMEDIATION_REASON || !(value.status === "PREPARED" || value.status === "APPLIED") || !iso(value.created_at) || !(value.applied_at === null || iso(value.applied_at)) || !record(value.input) || !record(value.receipt) || !Array.isArray(value.entries)) throw new Error("LEGACY_REMEDIATION_ARCHIVE_INVALID");
  if (value.entries.length !== 683 || new Set(value.entries.map((entry) => record(entry) ? entry.identity : null)).size !== 683) throw new Error("LEGACY_REMEDIATION_ARCHIVE_INVALID");
  return value as unknown as LegacyFollowUpRemediationArchive;
}

async function writeArchive(path: string, archive: LegacyFollowUpRemediationArchive): Promise<void> {
  await writeJsonAtomic(path, archive);
}

function archiveResult(status: LegacyFollowUpRemediationResult["status"], archive: LegacyFollowUpRemediationArchive, archivePath: string): LegacyFollowUpRemediationResult {
  return { status, remediation_id: archive.remediation_id, archive_path: archivePath, ...archive.receipt, provider_calls: 0 };
}

function assertSameAppliedInput(archive: LegacyFollowUpRemediationArchive, remediationId: string, input: LegacyFollowUpRemediationArchive["input"]): void {
  if (archive.remediation_id !== remediationId || JSON.stringify(archive.input) !== JSON.stringify(input)) throw new Error("LEGACY_REMEDIATION_ID_OR_INPUT_CONFLICT");
}

function assertSamePreparedInput(archive: LegacyFollowUpRemediationArchive, remediationId: string, input: LegacyFollowUpRemediationArchive["input"]): void {
  if (archive.remediation_id !== remediationId || JSON.stringify(archive.input) !== JSON.stringify(input)) throw new Error("LEGACY_REMEDIATION_ID_OR_INPUT_CONFLICT");
}

function transitionId(identity: string, remediationId: string): string {
  return `tr_${createHash("sha256").update(`${remediationId}:${identity}`, "utf8").digest("hex").slice(0, 40)}`;
}

function latestIso(left: string, right: string): string { return Date.parse(left) >= Date.parse(right) ? left : right; }
function sha256(value: string): string { return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`; }
function assertRemediationId(value: string): void { if (!/^legacy_followup_remediation_[A-Za-z0-9_-]{8,100}$/.test(value)) throw new Error("LEGACY_REMEDIATION_ID_INVALID"); }
function validDate(value: Date): Date { if (!Number.isFinite(value.getTime())) throw new Error("LEGACY_REMEDIATION_DATE_INVALID"); return value; }
function record(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown, length: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= length; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => text(item, 160)); }
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function iso(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function isError(value: unknown, code: string): value is NodeJS.ErrnoException { return value instanceof Error && "code" in value && (value as NodeJS.ErrnoException).code === code; }

async function withLock<T>(path: string, run: () => Promise<T>): Promise<T> {
  const resolved = resolve(path);
  await mkdir(dirname(resolved), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  for (let attempt = 0; attempt < 40 && !handle; attempt += 1) {
    try { handle = await open(resolved, "wx"); }
    catch (error) { if (!isError(error, "EEXIST")) throw error; await new Promise((done) => setTimeout(done, 10)); }
  }
  if (!handle) throw new Error("LEGACY_REMEDIATION_LOCK_UNAVAILABLE");
  try { return await run(); }
  finally { await handle.close().catch(() => undefined); await rm(resolved, { force: true }).catch(() => undefined); }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const target = resolve(path);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporary, "wx");
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}
