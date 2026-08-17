import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createEmptyFollowUpStore, followUpIdentity, ingestFollowUpObservations, readFollowUpStore, updateFollowUpStore, type FollowUpObservationCandidate } from "../src/followUpBasket.js";
import { applyLegacyFollowUpRemediation, LEGACY_FOLLOW_UP_DATA_UNRESOLVED_REASON } from "../src/legacyFollowUpRemediation.js";
import { createNewRecheckCheckpointStates, finalizeNewRecheckStore, readNewRecheckStore, type NewRecheckEntry } from "../src/newRecheckStore.js";
import { applySystemLifecycle, finalizeNewInboxStore, readLifecycleAuditStore, readNewInboxStore, type NewInboxEntry } from "../src/systemLifecycle.js";
import type { PersistableCandidate, PersistableScannerOutput } from "../src/persistableScannerModel.js";

const roots: string[] = [];
const FIRST = "2026-07-28T13:10:01.820Z";
const FRESH = "2026-08-17T12:31:00.000Z";
const MIGRATED_AT = new Date("2026-08-17T12:45:00.000Z");
const REMEDIATION_ID = "legacy_followup_remediation_20260817T124500Z_fixture";

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("DISC.2B legacy Follow-up remediation", () => {
  it("deterministically remediates the frozen A=3/B=325/C=355 population without touching private state", async () => {
    const fixture = await createFixture();
    const privateBefore = await readFile(fixture.privateState, "utf8");
    const result = await apply(fixture);

    assert.deepEqual(result, {
      status: "APPLIED",
      remediation_id: REMEDIATION_ID,
      archive_path: fixture.archive,
      group_a_active_follow_up: 3,
      group_b_moved_to_new: 324,
      group_b_already_new_merged: 1,
      group_c_quarantined: 354,
      group_c_existing_new_preserved: 1,
      duplicate_active_identities: 0,
      provider_calls: 0,
    });

    const [followUp, inbox, recheck, audit, archiveRaw] = await Promise.all([
      readFollowUpStore(fixture.followUp),
      readNewInboxStore(fixture.inbox),
      readNewRecheckStore(fixture.recheck),
      readLifecycleAuditStore(fixture.audit),
      readFile(fixture.archive, "utf8"),
    ]);
    const activeNew = new Set(inbox.entries.filter(activeNewEntry).map((entry) => entry.identity));
    const activeFollow = new Set(followUp.entries.map((entry) => followUpIdentity(entry.chain, entry.contract_address).identity));
    assert.equal(followUp.entries.length, 3, "A stays active Follow-up and B/C are removed");
    assert.equal([...activeFollow].every((identity) => fixture.a.has(identity)), true);
    const aEntry = followUp.entries.find((entry) => followUpIdentity(entry.chain, entry.contract_address).identity === [...fixture.a][0])!;
    assert.equal(aEntry.first_seen_at, FIRST, "A preserves legacy history");
    assert.equal(aEntry.latest_filter_result?.status, "passed_basic_filter", "A receives only the frozen current baseline result");
    assert.equal(aEntry.latest_security_status.status, "MANUAL_VERIFICATION_REQUIRED", "A does not invent security PASS");
    assert.equal([...activeNew].filter((identity) => fixture.b.has(identity)).length, 325, "all B identities have one effective New state");
    assert.equal(activeNew.has(fixture.cExisting), true, "an independent C New record is preserved");
    assert.equal([...activeNew].some((identity) => activeFollow.has(identity)), false, "no active New/Follow-up duplicate remains");
    assert.equal(audit.entries.filter((entry) => entry.reason === "LEGACY_ADMISSION_REMEDIATION_BASELINE_REJECT").length, 325);

    const newlyMovedB = recheck.entries.find((entry) => entry.identity === fixture.bMoved)!;
    assert.equal(newlyMovedB.first_seen_at, FIRST, "historical first observation is preserved");
    assert.equal(newlyMovedB.schedule_origin_at, MIGRATED_AT.toISOString(), "incubation begins at the remediation boundary");
    assert.deepEqual(newlyMovedB.completed_checkpoints, [], "legacy checkpoints are not replayed as DISC.1 success");
    assert.equal(newlyMovedB.latest_source_timestamp, FRESH, "the frozen current observation remains distinct from migration time");
    const existingB = recheck.entries.find((entry) => entry.identity === fixture.bExisting)!;
    assert.equal(existingB.schedule_origin_at, "2026-08-16T00:00:00.000Z", "existing DISC.1 recheck state wins");
    assert.equal(existingB.completed_checkpoints.includes(1), true);

    const archive = JSON.parse(archiveRaw) as { status: string; entries: Array<{ identity: string; original_follow_up_record: unknown; completed_legacy_checkpoints: number[]; security_history: unknown; migration_reason: string }> };
    assert.equal(archive.status, "APPLIED");
    assert.equal(archive.entries.length, 683);
    assert.equal(archive.entries.every((entry) => entry.original_follow_up_record !== null && Array.isArray(entry.completed_legacy_checkpoints) && entry.security_history !== null), true, "full legacy lineage is retained in the durable archive");
    assert.equal(archive.entries.filter((entry) => entry.migration_reason === LEGACY_FOLLOW_UP_DATA_UNRESOLVED_REASON).length, 355);
    assert.equal(await readFile(fixture.privateState, "utf8"), privateBefore, "private state is not read or mutated by remediation");
  });

  it("is idempotent and does not block a later independent New discovery", async () => {
    const fixture = await createFixture();
    await apply(fixture);
    const beforeAudit = (await readLifecycleAuditStore(fixture.audit)).entries.length;
    const second = await apply(fixture);
    assert.equal(second.status, "ALREADY_APPLIED");
    assert.equal((await readLifecycleAuditStore(fixture.audit)).entries.length, beforeAudit, "no duplicate remediation transitions are written");

    const rediscovered = [...fixture.c][1]!;
    await applySystemLifecycle(snapshotForRediscovery(rediscovered), {
      newInboxStorePath: fixture.inbox,
      followUpStorePath: fixture.followUp,
      auditStorePath: fixture.audit,
      establishedStorePath: resolve(fixture.root, "established", "store.json"),
      centralCycleId: "cycle_future_rediscovery",
      now: new Date("2026-08-18T00:00:00.000Z"),
    });
    assert.equal((await readNewInboxStore(fixture.inbox)).entries.some((entry) => entry.identity === rediscovered && activeNewEntry(entry)), true, "the remediation archive is not an active duplicate blocklist");
  });
});

async function createFixture() {
  const root = await mkdtemp(resolve(tmpdir(), "legacy-followup-remediation-"));
  roots.push(root);
  const paths = {
    root,
    followUp: resolve(root, "follow-up", "store.json"),
    inbox: resolve(root, "lifecycle", "new-inbox.json"),
    recheck: resolve(root, "new-recheck", "store.json"),
    audit: resolve(root, "lifecycle", "audit.json"),
    archive: resolve(root, "remediation", "legacy-followup-remediation-v1.json"),
    manifest: resolve(root, "diagnostics", "disc2a-population-manifest.json"),
    revalidation: resolve(root, "diagnostics", "disc2a-revalidation.json"),
    privateState: resolve(root, "private", "research-evidence.txt"),
  };
  const identities = Array.from({ length: 683 }, (_, index) => identity(index));
  const a = new Set(identities.slice(0, 3));
  const b = new Set(identities.slice(3, 328));
  const c = new Set(identities.slice(328));
  await updateFollowUpStore((store) => {
    const ingested = ingestFollowUpObservations(store, identities.map((item, index) => observation(item, index === 0 ? "Max" : index === 1 ? "CZ" : index === 2 ? "Buddy" : `L${index}`)), FIRST, "scan_legacy");
    return {
      ...ingested,
      entries: ingested.entries.map((entry) => ({
        ...entry,
        lifecycle_status: "MATURING" as const,
        next_check_at: "2026-07-29T13:10:01.820Z",
        completed_checkpoints: entry.contract_address === contractOf(identities[1]!) ? [1] : [],
      })),
    };
  }, { storePath: paths.followUp, now: new Date(FIRST) });
  const bExisting = identities[3]!;
  const cExisting = identities[328]!;
  const existingEntries = [existingNew(bExisting, "B-existing"), existingNew(cExisting, "C-existing")];
  await writeJson(paths.inbox, finalizeNewInboxStore({ schema_version: "new_inbox_store_v1", store_version: 1, generated_at: "2026-08-16T00:00:00.000Z", entries: existingEntries }, new Date("2026-08-16T00:00:00.000Z")));
  const existingRecheck = existingNewRecheck(bExisting);
  await writeJson(paths.recheck, finalizeNewRecheckStore({ schema_version: "new_recheck_store_v3", generated_at: "2026-08-16T00:00:00.000Z", entries: [existingRecheck], last_receipt: null }, new Date("2026-08-16T00:00:00.000Z")));
  await mkdir(resolve(paths.privateState, ".."), { recursive: true });
  await writeFile(paths.privateState, "private actor evidence must remain byte-for-byte unchanged\n", "utf8");

  const follow = await readFollowUpStore(paths.followUp);
  const manifestEntries = follow.entries.map((entry) => ({
    identity: followUpIdentity(entry.chain, entry.contract_address).identity,
    chain: entry.chain,
    contract_address: entry.contract_address,
    first_seen_at: entry.first_seen_at,
    lifecycle_status: entry.lifecycle_status,
    completed_checkpoints: entry.completed_checkpoints,
    latest_filter_result: entry.latest_filter_result,
    latest_security_status: entry.latest_security_status,
    last_checked_at: entry.last_checked_at,
    source_run_id: entry.source_run_id,
  }));
  const results = identities.map((item, index) => index < 3
    ? { identity: item, chain: "base", contract_address: contractOf(item), provider_class: "VALID_CURRENT_OBSERVATION", baseline_status: "PASS", hard_reasons: [], symbol: index === 0 ? "Max" : index === 1 ? "CZ" : "Buddy", data_complete: true }
    : index < 328
      ? { identity: item, chain: "base", contract_address: contractOf(item), provider_class: "VALID_CURRENT_OBSERVATION", baseline_status: "REJECT", hard_reasons: ["liquidity_below_30000"], symbol: `L${index}`, data_complete: true }
      : { identity: item, chain: "base", contract_address: contractOf(item), provider_class: index >= 679 ? "UNUSABLE_PAIR_DATA" : "NO_MATCHING_PAIR", error_code: index >= 679 ? "UNUSABLE_PAIR_DATA" : "NO_MATCHING_PAIR" });
  await writeJson(paths.manifest, { manifest_version: "disc2a_legacy_followup_population_v1", frozen_at: "2026-08-17T12:38:08.764Z", follow_up: { record_count: 683, unique_identity_count: 683 }, entries: manifestEntries });
  await writeJson(paths.revalidation, { report_version: "disc2a_legacy_followup_revalidation_v1", started_at: "2026-08-17T12:30:00.000Z", finished_at: FRESH, population_count: 683, batch_count: 26, provider_request_count: 26, provider_retry_count: 0, results });
  return { ...paths, a, b, c, bExisting, bMoved: identities[4]!, cExisting };
}

async function apply(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return applyLegacyFollowUpRemediation({
    remediationId: REMEDIATION_ID,
    manifestPath: fixture.manifest,
    revalidationPath: fixture.revalidation,
    archivePath: fixture.archive,
    followUpStorePath: fixture.followUp,
    newInboxStorePath: fixture.inbox,
    newRecheckStorePath: fixture.recheck,
    auditStorePath: fixture.audit,
    now: MIGRATED_AT,
  });
}

function identity(index: number): string { return `base:${contract(index)}`; }
function contract(index: number): string { return `0x${(index + 1).toString(16).padStart(40, "0")}`; }
function contractOf(identity: string): string { return identity.slice(identity.indexOf(":") + 1); }

function observation(tokenIdentity: string, symbol: string): FollowUpObservationCandidate {
  const address = contractOf(tokenIdentity);
  return {
    candidate_id: `candidate_${address.slice(-8)}`,
    symbol,
    name: symbol,
    chain: "base",
    contract_address: address,
    pair_address: null,
    pair_created_at: null,
    price_usd: null,
    market_cap_usd: null,
    fdv_usd: null,
    liquidity_usd: null,
    volume_24h_usd: null,
    volume_market_cap_ratio: null,
    pair_age_days: null,
    basic_filter_status: "rejected_basic_filter",
    filter_reasons: ["liquidity_below_30000"],
    discovery_basket: "new_emerging",
    observation_only: true,
  };
}

function existingNew(tokenIdentity: string, symbol: string): NewInboxEntry {
  const address = contractOf(tokenIdentity);
  return {
    identity: tokenIdentity,
    chain: "base",
    contract_address: address,
    display_name: symbol,
    symbol,
    first_seen_at: "2026-08-16T00:00:00.000Z",
    last_seen_at: "2026-08-16T00:00:00.000Z",
    first_scanner_run_id: "scan_existing",
    last_scanner_run_id: "scan_existing",
    system_status: "NEW",
    last_evaluation: { conditions_met: ["IDENTITY_VALID"], conditions_unmet: [], missing_data: [], risks: [], readiness: "CONDITIONS_MET", security_state: "NOT_CHECKED", verification_state: "NOT_REQUIRED" },
    policy_version: "system_lifecycle_policy_v1",
    archived_at: null,
    rejected_at: null,
    transition_ids: ["tr_existing_state"],
  };
}

function existingNewRecheck(tokenIdentity: string): NewRecheckEntry {
  const address = contractOf(tokenIdentity);
  const states = createNewRecheckCheckpointStates().map((state) => state.checkpoint === 1
    ? { ...state, attempt_count: 1, last_attempt_at: "2026-08-17T00:00:00.000Z", last_error_code: null, retry_not_before: null, outcome: "SUCCESS" as const }
    : state);
  return {
    identity: tokenIdentity,
    chain: "base",
    contract_address: address,
    first_seen_at: "2026-08-16T00:00:00.000Z",
    schedule_origin_at: "2026-08-16T00:00:00.000Z",
    completed_checkpoints: [1],
    checkpoint_states: states,
    last_attempt_at: "2026-08-17T00:00:00.000Z",
    last_success_at: "2026-08-17T00:00:00.000Z",
    last_checkpoint: 1,
    next_checkpoint: 3,
    latest_source_timestamp: "2026-08-17T00:00:00.000Z",
    latest_normalized_candidate: persistedCandidate(address),
    latest_filter_result: { status: "rejected_basic_filter", reasons: ["liquidity_below_30000"], evaluated_at: "2026-08-17T00:00:00.000Z" },
    last_error_code: null,
  };
}

function persistedCandidate(address: string): PersistableCandidate {
  return {
    run_id: "scan_existing", candidate_id: `candidate_${address.slice(-8)}`, symbol: "EXISTING", name: "Existing", chain: "base", contract_address: address,
    pair_address: null, dex: null, source: "dexscreener", source_url: null, price_usd: null, market_cap_usd: null, fdv_usd: null, liquidity_usd: null, volume_24h_usd: null, volume_market_cap_ratio: null, pair_created_at: null, pair_age_days: null,
    basic_filter_status: "rejected_basic_filter", filter_reasons: ["liquidity_below_30000"], final_label: "REJECT", final_reasons: ["liquidity_below_30000"], created_at: "2026-08-17T00:00:00.000Z", discovery_basket: "new_emerging", observation_only: true,
  };
}

function snapshotForRediscovery(tokenIdentity: string): PersistableScannerOutput {
  const candidate = persistedCandidate(contractOf(tokenIdentity));
  const timestamp = "2026-08-18T00:00:00.000Z";
  return {
    provenance: { contract_version: "test", fixture_used: false, generated_at: timestamp } as unknown as PersistableScannerOutput["provenance"],
    scan_run: { run_id: "scan_future_rediscovery", source: "combined-scanner-poc", mode: "live", query: "fixture", filters: {}, limits: {}, started_at: timestamp, finished_at: timestamp, total_raw: 1, passed_basic_filter: 0, rejected_basic_filter: 1, security_checked: 0, security_passed: 0, needs_manual_verification: 0, critical_risk: 0, watchlist_candidates: 0, errors: [] },
    candidates: [{ ...candidate, run_id: "scan_future_rediscovery", created_at: timestamp }],
    security_checks: [],
    scorecards: [],
  };
}

function activeNewEntry(entry: NewInboxEntry): boolean { return entry.system_status === "NEW" && entry.archived_at === null && entry.rejected_at === null; }
async function writeJson(path: string, value: unknown): Promise<void> { await mkdir(resolve(path, ".."), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
