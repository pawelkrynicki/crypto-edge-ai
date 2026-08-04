import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { applyFollowUpRecheckSuccess, readFollowUpStore, recordManualVerification, updateFollowUpStore } from "../src/followUpBasket.js";
import { mutateEstablishedUniverse, readEstablishedUniverseStore } from "../src/establishedUniverseManager.js";
import { previewLifecycleMigration } from "../src/lifecycleMigrationPreview.js";
import {
  SYSTEM_LIFECYCLE_POLICY_VERSION,
  applySystemLifecycle,
  bootstrapLifecycleReview,
  readLifecycleAuditStore,
  readLifecycleCycleReceiptStore,
  readLifecycleOperationJournalStore,
  readNewInboxStore,
  type SystemLifecycleRunResult,
} from "../src/systemLifecycle.js";
import type { PersistableCandidate, PersistableScannerOutput } from "../src/persistableScannerModel.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const roots: string[] = [];

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("PC.1 system lifecycle policy", () => {
  it("keeps every valid discovery in a durable New Inbox when it is not yet eligible", async () => {
    const paths = await isolatedPaths();
    await run(candidate({ basic_filter_status: "rejected_basic_filter", final_label: "REJECT" }), paths, "2026-08-04T10:00:00.000Z");
    const inbox = await readNewInboxStore(paths.inbox);
    assert.equal(inbox.entries.length, 1);
    assert.equal(inbox.entries[0]?.system_status, "NEW");
    assert.equal(inbox.entries[0]?.first_scanner_run_id, "scan_20260804100000");
  });

  it("does not remove New Inbox entries when a later snapshot no longer contains them", async () => {
    const paths = await isolatedPaths();
    await run(candidate({ basic_filter_status: "rejected_basic_filter" }), paths, "2026-08-04T10:00:00.000Z");
    await run(null, paths, "2026-08-04T11:00:00.000Z");
    const inbox = await readNewInboxStore(paths.inbox);
    assert.equal(inbox.entries.length, 1);
    assert.equal(inbox.entries[0]?.system_status, "NEW");
  });

  it("promotes only a validated, filter-passing New candidate to Follow-up", async () => {
    const paths = await isolatedPaths();
    const result = await run(candidate(), paths, "2026-08-04T10:00:00.000Z");
    assert.equal(result.promoted_to_follow_up, 1);
    assert.equal((await readFollowUpStore(paths.followUp)).entries.length, 1);
    assert.equal((await readNewInboxStore(paths.inbox)).entries[0]?.system_status, "FOLLOW_UP");
  });

  it("promotes Follow-up to Main Radar only after the existing checkpoints and checked security", async () => {
    const paths = await isolatedPaths();
    await run(candidate(), paths, "2026-08-01T10:00:00.000Z");
    const followUp = await readFollowUpStore(paths.followUp);
    await updateFollowUpStore((store) => applyFollowUpRecheckSuccess(store, {
      entry_id: followUp.entries[0]!.entry_id,
      candidate: candidate(),
      checked_at: "2026-08-31T10:00:00.000Z",
      source_run_id: "scan_20260831100000",
      security_status: {
        status: "CHECKED",
        source: "goplus_security",
        checked_at: "2026-08-31T10:00:00.000Z",
        missing_data: [],
        risk_flags: [],
      },
    }), { storePath: paths.followUp, now: new Date("2026-08-31T10:00:00.000Z") });
    const result = await run(null, paths, "2026-08-31T10:00:00.000Z");
    assert.equal(result.promoted_to_main_radar, 1);
    assert.equal((await readNewInboxStore(paths.inbox)).entries[0]?.system_status, "MAIN_RADAR");
  });

  it("blocks automatic promotion when the snapshot is unvalidated, security is critical, or data is stale", async () => {
    const paths = await isolatedPaths();
    const invalidSnapshot = scanner(candidate(), "2026-08-04T10:00:00.000Z", true);
    const invalid = await applySystemLifecycle(invalidSnapshot, lifecycleOptions(paths, new Date("2026-08-04T10:00:00.000Z")));
    assert.equal(invalid.promoted_to_follow_up, 0);
    const inbox = await readNewInboxStore(paths.inbox);
    assert.equal(inbox.entries[0]?.system_status, "NEW");

    const criticalPaths = await isolatedPaths();
    const critical = await run(candidate({ final_label: "CRITICAL_RISK", final_reasons: ["CRITICAL_CONTRACT_RISK"] }), criticalPaths, "2026-08-04T10:00:00.000Z");
    assert.equal(critical.promoted_to_follow_up, 0);
  });

  it("is idempotent, never degrades a promoted record, and writes the policy and snapshot audit", async () => {
    const paths = await isolatedPaths();
    const first = await run(candidate(), paths, "2026-08-04T10:00:00.000Z");
    const second = await run(candidate(), paths, "2026-08-04T10:00:00.000Z");
    assert.equal(first.promoted_to_follow_up, 1);
    assert.equal(second.promoted_to_follow_up, 0);
    assert.equal((await readFollowUpStore(paths.followUp)).entries.length, 1);
    const audit = await readLifecycleAuditStore(paths.audit);
    assert.equal(audit.entries.some((entry) => entry.policy_version === SYSTEM_LIFECYCLE_POLICY_VERSION && entry.scanner_run_id === "scan_20260804100000"), true);
    assert.equal(JSON.stringify(audit).toLowerCase().includes("openai"), false);
    const receiptPath = resolve(paths.inbox, "..", "cycle-receipts.json");
    const beforeReceipt = await readFile(receiptPath, "utf8");
    await run(candidate(), paths, "2026-08-04T10:00:00.000Z");
    assert.equal(await readFile(receiptPath, "utf8"), beforeReceipt);
  });

  it("writes a versioned receipt for zero, added, and updated lifecycle cycles", async () => {
    const paths = await isolatedPaths();
    const zero = await run(null, paths, "2026-08-04T09:00:00.000Z");
    assert.equal(zero.lifecycle_receipt.new_inbox_added, 0);
    assert.equal(zero.lifecycle_receipt.promoted_to_follow_up, 0);
    assert.equal(zero.summary.last_completed_cycle_id, zero.lifecycle_receipt.central_cycle_id);
    const added = await run(candidate({ basic_filter_status: "rejected_basic_filter" }), paths, "2026-08-04T10:00:00.000Z");
    assert.equal(added.lifecycle_receipt.new_inbox_added, 1);
    const updated = await run(candidate({ basic_filter_status: "rejected_basic_filter", name: "PC1 Updated" }), paths, "2026-08-04T11:00:00.000Z");
    assert.equal(updated.lifecycle_receipt.new_inbox_updated, 1);
    const receipts = await readLifecycleCycleReceiptStore(resolve(paths.inbox, "..", "cycle-receipts.json"));
    assert.equal(receipts.entries[0]?.central_cycle_id, updated.lifecycle_receipt.central_cycle_id);
    assert.deepEqual(updated.summary.last_change_summary, {
      added: 0, updated: 1, promoted_to_follow_up: 0, promoted_to_main_radar: 0, archived: 0, rejected: 0, duplicate_noop: 0,
    });
  });

  it("uses a current-cycle recheck, manual verification, and archived protection for automatic Main Radar promotion", async () => {
    const paths = await isolatedPaths();
    await run(candidate(), paths, "2026-08-01T10:00:00.000Z");
    const followUp = await readFollowUpStore(paths.followUp);
    const entry = followUp.entries[0]!;
    await updateFollowUpStore((store) => applyFollowUpRecheckSuccess(store, {
      entry_id: entry.entry_id,
      candidate: candidate(),
      checked_at: "2026-08-31T10:00:00.000Z",
      source_run_id: "scan_20260831100000",
      security_status: { status: "CHECKED", source: "goplus_security", checked_at: "2026-08-31T10:00:00.000Z", missing_data: [], risk_flags: [] },
    }), { storePath: paths.followUp, now: new Date("2026-08-31T10:00:00.000Z") });
    const stale = await run(null, paths, "2026-08-31T11:00:00.000Z");
    assert.equal(stale.promoted_to_main_radar, 0);
    await updateFollowUpStore((store) => recordManualVerification(store, {
      chain: "base", contract_address: ADDRESS, display_name: "PC1 Token", symbol: "PC1", verdict: "NEEDS_MORE_DATA", note: "Needs a source check", checked_at: "2026-08-31T11:00:00.000Z", missing_data: ["security_context"], available_data: [],
    }, "scan_20260831110000", { actor: "owner", previous_layer: "FOLLOW_UP", new_layer: "FOLLOW_UP", chain: "base", contract_address: ADDRESS, conditions_met: [], conditions_unmet: ["MANUAL_VERIFICATION"], owner_reason: "test" }), { storePath: paths.followUp, now: new Date("2026-08-31T11:00:00.000Z") });
    const blocked = await run(null, paths, "2026-08-31T11:00:00.000Z");
    assert.equal(blocked.promoted_to_main_radar, 0);
  });

  it("keeps an incomplete journal recoverable and makes identical snapshots write no Inbox or audit change", async () => {
    const paths = await isolatedPaths();
    await assert.rejects(
      applySystemLifecycle(scanner(candidate(), "2026-08-04T10:00:00.000Z"), { ...lifecycleOptions(paths, new Date("2026-08-04T10:00:00.000Z")), failureInjection: (stage) => { if (stage === "TARGET_STORE_APPLIED") throw new Error("INJECTED_FAILURE"); } }),
      /INJECTED_FAILURE/,
    );
    const journal = await readLifecycleOperationJournalStore(resolve(paths.inbox, "..", "operation-journal.json"));
    assert.equal(journal.entries.some((entry) => entry.stage === "TARGET_STORE_APPLIED"), true);
    const recovered = await run(candidate(), paths, "2026-08-04T10:00:00.000Z");
    assert.equal(recovered.promoted_to_follow_up, 0);
    assert.equal((await readNewInboxStore(paths.inbox)).entries[0]?.system_status, "FOLLOW_UP");
    const beforeInbox = await readFile(paths.inbox, "utf8");
    const beforeAudit = await readFile(paths.audit, "utf8");
    await run(candidate(), paths, "2026-08-04T10:00:00.000Z");
    assert.equal(await readFile(paths.inbox, "utf8"), beforeInbox);
    assert.equal(await readFile(paths.audit, "utf8"), beforeAudit);
    assert.equal((await readLifecycleOperationJournalStore(resolve(paths.inbox, "..", "operation-journal.json"))).entries.every((entry) => entry.stage === "COMMITTED"), true);
  });

  it("recovers every New-to-Follow-up journal failure stage without duplicate final state", async () => {
    for (const stage of ["PLAN_CREATED", "TARGET_STORE_APPLIED", "NEW_INBOX_APPLIED", "AUDIT_APPLIED"] as const) {
      const paths = await isolatedPaths();
      await assert.rejects(
        applySystemLifecycle(scanner(candidate(), "2026-08-04T10:00:00.000Z"), { ...lifecycleOptions(paths, new Date("2026-08-04T10:00:00.000Z")), failureInjection: (actual) => { if (actual === stage) throw new Error(`INJECTED_${stage}`); } }),
        new RegExp(`INJECTED_${stage}`),
      );
      await run(candidate(), paths, "2026-08-04T10:00:00.000Z");
      assert.equal((await readFollowUpStore(paths.followUp)).entries.length, 1, stage);
      assert.equal((await readNewInboxStore(paths.inbox)).entries[0]?.system_status, "FOLLOW_UP", stage);
      assert.equal((await readLifecycleOperationJournalStore(resolve(paths.inbox, "..", "operation-journal.json"))).entries.every((entry) => entry.stage === "COMMITTED"), true, stage);
    }
  });

  it("recovers every Follow-up-to-Main journal failure stage without a partial lifecycle", async () => {
    for (const stage of ["PLAN_CREATED", "TARGET_STORE_APPLIED", "FOLLOW_UP_SYNCED", "NEW_INBOX_APPLIED", "AUDIT_APPLIED"] as const) {
      const paths = await isolatedPaths();
      await run(candidate(), paths, "2026-08-01T10:00:00.000Z");
      const entry = (await readFollowUpStore(paths.followUp)).entries[0]!;
      await updateFollowUpStore((store) => applyFollowUpRecheckSuccess(store, {
        entry_id: entry.entry_id,
        candidate: candidate(),
        checked_at: "2026-08-31T10:00:00.000Z",
        source_run_id: "scan_20260831100000",
        security_status: { status: "CHECKED", source: "goplus_security", checked_at: "2026-08-31T10:00:00.000Z", missing_data: [], risk_flags: [] },
      }), { storePath: paths.followUp, now: new Date("2026-08-31T10:00:00.000Z") });
      await assert.rejects(
        applySystemLifecycle(scanner(null, "2026-08-31T10:00:00.000Z"), { ...lifecycleOptions(paths, new Date("2026-08-31T10:00:00.000Z")), failureInjection: (actual) => { if (actual === stage) throw new Error(`INJECTED_${stage}`); } }),
        new RegExp(`INJECTED_${stage}`),
      );
      await run(null, paths, "2026-08-31T10:00:00.000Z");
      assert.equal((await readNewInboxStore(paths.inbox)).entries[0]?.system_status, "MAIN_RADAR", stage);
      assert.equal((await readLifecycleOperationJournalStore(resolve(paths.inbox, "..", "operation-journal.json"))).entries.every((entry) => entry.stage === "COMMITTED"), true, stage);
    }
  });

  it("reconciles an Established duplicate before committing the Main Radar journal", async () => {
    const paths = await isolatedPaths();
    await run(candidate(), paths, "2026-08-01T10:00:00.000Z");
    const entry = (await readFollowUpStore(paths.followUp)).entries[0]!;
    await updateFollowUpStore((store) => applyFollowUpRecheckSuccess(store, {
      entry_id: entry.entry_id,
      candidate: candidate(),
      checked_at: "2026-08-31T10:00:00.000Z",
      source_run_id: "scan_20260831100000",
      security_status: { status: "CHECKED", source: "goplus_security", checked_at: "2026-08-31T10:00:00.000Z", missing_data: [], risk_flags: [] },
    }), { storePath: paths.followUp, now: new Date("2026-08-31T10:00:00.000Z") });
    let inserted = false;
    const result = await applySystemLifecycle(scanner(null, "2026-08-31T10:00:00.000Z"), {
      ...lifecycleOptions(paths, new Date("2026-08-31T10:00:00.000Z")),
      failureInjection: async (stage) => {
        if (stage !== "PLAN_CREATED" || inserted) return;
        inserted = true;
        await mutateEstablishedUniverse({ operation: "add", chain: "base", contract_address: ADDRESS, display_name: "PC1 Token", symbol_hint: "PC1", owner_note: "duplicate race" }, { apply: true, storePath: paths.established, actor: "test", now: () => new Date("2026-08-31T10:00:00.000Z") });
      },
    });
    assert.equal(result.duplicate_noop, 1);
    assert.equal((await readEstablishedUniverseStore(paths.established)).current.entries.some((item) => item.enabled && item.contract_address === ADDRESS), true);
    assert.equal((await readFollowUpStore(paths.followUp)).entries[0]?.lifecycle_status, "ESTABLISHED");
    assert.equal((await readNewInboxStore(paths.inbox)).entries[0]?.system_status, "MAIN_RADAR");
    assert.equal((await readLifecycleAuditStore(paths.audit)).entries.some((item) => item.dedupe_result === "DUPLICATE_NOOP" && item.reason === "MAIN_RADAR_DUPLICATE_RECONCILED"), true);
  });

  it("bootstraps durable New Inbox records only inside the isolated review paths", async () => {
    const paths = await isolatedPaths();
    const result = await bootstrapLifecycleReview(scanner(candidate(), "2026-08-04T10:00:00.000Z"), {
      newInboxStorePath: paths.inbox,
      followUpStorePath: paths.followUp,
      establishedStorePath: paths.established,
      cycleReceiptPath: resolve(paths.inbox, "..", "cycle-receipts.json"),
      now: new Date("2026-08-04T10:00:00.000Z"),
    });
    assert.equal(result.new_inbox_records, 1);
    assert.equal(result.follow_up_records, 0);
    assert.equal(result.canonical_mutations, 0);
    assert.equal(result.provider_calls, 0);
    assert.equal((await readNewInboxStore(paths.inbox)).entries[0]?.system_status, "NEW");
    assert.equal((await readLifecycleCycleReceiptStore(resolve(paths.inbox, "..", "cycle-receipts.json"))).entries[0]?.central_cycle_id, "review_scan_20260804100000");
  });

  it("creates a deterministic, read-only migration preview and retains existing Follow-up and Main stores", async () => {
    const paths = await isolatedPaths();
    await run(candidate(), paths, "2026-08-04T10:00:00.000Z");
    const beforeFollowUp = await readFile(paths.followUp, "utf8");
    const previewOne = await previewLifecycleMigration({
      snapshot: scanner(candidate(), "2026-08-04T11:00:00.000Z"),
      followUpStorePath: paths.followUp,
      establishedStorePath: paths.established,
      newInboxStorePath: paths.inbox,
      auditStorePath: paths.audit,
    });
    const previewTwo = await previewLifecycleMigration({
      snapshot: scanner(candidate(), "2026-08-04T11:00:00.000Z"),
      followUpStorePath: paths.followUp,
      establishedStorePath: paths.established,
      newInboxStorePath: paths.inbox,
      auditStorePath: paths.audit,
    });
    assert.deepEqual(previewOne, previewTwo);
    assert.equal(previewOne.canonical_mutations, 0);
    assert.equal(previewOne.proposed.already_follow_up_or_main, 1);
    assert.equal(await readFile(paths.followUp, "utf8"), beforeFollowUp);
    await assert.rejects(stat(paths.established), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT"));
  });
});

async function isolatedPaths() {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-lifecycle-"));
  roots.push(root);
  return {
    inbox: resolve(root, "lifecycle", "new-inbox.json"),
    audit: resolve(root, "lifecycle", "audit.json"),
    followUp: resolve(root, "follow-up", "store.json"),
    established: resolve(root, "established", "store.json"),
  };
}

function lifecycleOptions(paths: Awaited<ReturnType<typeof isolatedPaths>>, now: Date) {
  return { newInboxStorePath: paths.inbox, auditStorePath: paths.audit, followUpStorePath: paths.followUp, establishedStorePath: paths.established, centralCycleId: `cycle_${now.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`, contextRunId: "context_20260804100000", now };
}

function run(value: PersistableCandidate | null, paths: Awaited<ReturnType<typeof isolatedPaths>>, timestamp: string): Promise<SystemLifecycleRunResult> {
  return applySystemLifecycle(scanner(value, timestamp), lifecycleOptions(paths, new Date(timestamp)));
}

function scanner(value: PersistableCandidate | null, timestamp: string, fixture = false): PersistableScannerOutput {
  const runId = `scan_${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}`;
  return {
    provenance: {
      schema_version: "scanner_snapshot_v2",
      contract_version: "real_data_boundary_v1",
      generator_version: "pc1-test",
      environment: "INTERNAL_BETA",
      mode: "live",
      fixture_used: fixture,
      run_id: runId,
      generated_at: timestamp,
      finished_at: timestamp,
      source_ids: ["dexscreener"],
      policy_decisions: {},
    },
    scan_run: { run_id: runId, source: "combined-scanner-poc", mode: "live", query: "pc1-test", filters: {}, limits: {}, started_at: timestamp, finished_at: timestamp, total_raw: value ? 1 : 0, passed_basic_filter: value?.basic_filter_status === "passed_basic_filter" ? 1 : 0, rejected_basic_filter: value?.basic_filter_status === "passed_basic_filter" ? 0 : 1, security_checked: 0, security_passed: 0, needs_manual_verification: 0, critical_risk: value?.final_label === "CRITICAL_RISK" ? 1 : 0, watchlist_candidates: value?.final_label === "WATCHLIST" ? 1 : 0, errors: [] },
    candidates: value ? [{ ...value, run_id: runId, created_at: timestamp }] : [],
    security_checks: [],
    scorecards: [],
  };
}

function candidate(overrides: Partial<PersistableCandidate> = {}): PersistableCandidate {
  return {
    run_id: "scan_seed",
    candidate_id: "candidate_a",
    symbol: "PC1",
    name: "PC1 Token",
    chain: "base",
    contract_address: ADDRESS,
    pair_address: "0x2222222222222222222222222222222222222222",
    dex: "uniswap",
    source: "dexscreener",
    source_url: "https://example.invalid/token",
    price_usd: 1,
    market_cap_usd: 1_000_000,
    fdv_usd: 1_000_000,
    liquidity_usd: 50_000,
    volume_24h_usd: 100_000,
    volume_market_cap_ratio: 0.1,
    pair_created_at: "2026-07-01T10:00:00.000Z",
    pair_age_days: 34,
    basic_filter_status: "passed_basic_filter",
    filter_reasons: [],
    final_label: "WATCHLIST",
    final_reasons: ["eligible_for_further_review_not_trading_signal"],
    created_at: "2026-08-04T10:00:00.000Z",
    discovery_basket: "new_emerging",
    observation_only: true,
    ...overrides,
  };
}
