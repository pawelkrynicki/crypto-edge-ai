import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  createAutomationStateStore,
  createInitialAutomationState,
  type AutomationState,
  type AutomationStateStore,
} from "../src/automation/automationState.js";
import { acquireGlobalCollectorLock } from "../src/automation/globalCollectorLock.js";
import { runCentralLiveCycleOnce, runCentralSchedulerOnce } from "../src/automation/runCentralAutomation.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("owner one-shot central data smoke", () => {
  it("publishes one successful suspended owner run without resuming or scheduling automation", async () => {
    const automationDirectoryPath = await tempAutomationDirectory();
    const before: AutomationState = {
      ...createInitialAutomationState(),
      automation_suspended: true,
      suspended_at: "2026-08-25T10:00:00.000Z",
      suspended_reason: "DEXSCREENER_DISCOVERY_INSUFFICIENT_COVERAGE",
      resume_required: true,
      next_scanner_run_at: "2026-08-25T10:15:00.000Z",
    };
    const store = memoryStore(before);
    let runnerCalls = 0;

    const result = await runCentralLiveCycleOnce({
      automationDirectoryPath,
      stateStore: store.store,
      runner: async () => {
        runnerCalls += 1;
        return { request_counts: { dexscreener: 1 }, scanner_run_id: "scan_owner_once", context_run_id: "context_owner_once" };
      },
    });

    assert.equal(result.run_status, "SUCCESS");
    assert.equal(runnerCalls, 1);
    assert.equal(store.writes, 1);
    assert.equal(store.state.last_published_scanner_run_id, "scan_owner_once");
    assert.equal(store.state.last_published_context_run_id, "context_owner_once");
    assert.equal(store.state.automation_suspended, true);
    assert.equal(store.state.resume_required, true);
    assert.equal(store.state.suspended_at, before.suspended_at);
    assert.equal(store.state.suspended_reason, before.suspended_reason);
    assert.equal(store.state.next_scanner_run_at, before.next_scanner_run_at);

    const scheduled = await runCentralSchedulerOnce({
      enabled: true,
      now: () => new Date("2026-08-25T10:16:00.000Z"),
      automationDirectoryPath,
      stateStore: store.store,
      activeLockRunId: null,
      scannerAndContextRunner: async () => {
        throw new Error("SCHEDULED_RUN_MUST_NOT_START_WHILE_SUSPENDED");
      },
    });
    assert.equal(scheduled.decision, "AUTOMATION_SUSPENDED");
  });

  it("creates and atomically commits a fresh owner one-shot publication state", async () => {
    const automationDirectoryPath = await tempAutomationDirectory();
    const result = await runCentralLiveCycleOnce({
      automationDirectoryPath,
      now: () => new Date("2026-08-28T14:40:00.000Z"),
      runner: async () => ({
        request_counts: { dexscreener: 0, alternative_me_fng: 0, defillama_api: 0 },
        scanner_run_id: "scan_fresh_vps_owner_once",
        context_run_id: "approved_sources_fresh_vps_owner_once",
        snapshot_generated_at: "2026-08-28T14:40:00.000Z",
        source_statuses: { dexscreener: "READY", alternative_me_fng: "READY", defillama_api: "READY" },
      }),
    });

    assert.equal(result.run_status, "SUCCESS");
    const statePath = resolve(automationDirectoryPath, "automation-state.json");
    await access(statePath);
    const state = await createAutomationStateStore(automationDirectoryPath).read();
    assert.equal(state.last_published_scanner_run_id, "scan_fresh_vps_owner_once");
    assert.equal(state.last_published_context_run_id, "approved_sources_fresh_vps_owner_once");
    assert.equal(state.automation_suspended, false);
    assert.equal(state.resume_required, false);
    assert.equal(state.next_scanner_run_at, null);
    assert.equal(state.next_alternative_me_run_at, null);
    assert.equal(state.next_defillama_run_at, null);
  });

  it("preserves an enabled schedule and lets only its normal future cadence run", async () => {
    const automationDirectoryPath = await tempAutomationDirectory();
    const before: AutomationState = {
      ...createInitialAutomationState(),
      last_scanner_success_at: "2026-08-25T10:00:00.000Z",
      last_context_success_at: "2026-08-25T10:00:00.000Z",
      next_scanner_run_at: "2026-08-25T10:15:00.000Z",
      next_defillama_run_at: "2026-08-25T12:00:00.000Z",
      next_alternative_me_run_at: "2026-08-25T16:00:00.000Z",
    };
    const store = memoryStore(before);
    let oneShotCalls = 0;
    let scheduledCalls = 0;

    await runCentralLiveCycleOnce({
      automationDirectoryPath,
      stateStore: store.store,
      runner: async () => {
        oneShotCalls += 1;
        return { request_counts: { dexscreener: 1 }, scanner_run_id: "scan_owner_once", context_run_id: "context_owner_once" };
      },
    });
    assert.equal(oneShotCalls, 1);
    assert.equal(store.writes, 1);
    assert.equal(store.state.last_published_scanner_run_id, "scan_owner_once");
    assert.equal(store.state.last_published_context_run_id, "context_owner_once");
    assert.equal(store.state.next_scanner_run_at, before.next_scanner_run_at);
    assert.equal(store.state.next_defillama_run_at, before.next_defillama_run_at);
    assert.equal(store.state.next_alternative_me_run_at, before.next_alternative_me_run_at);

    const beforeCadence = await runCentralSchedulerOnce({
      enabled: true,
      now: () => new Date("2026-08-25T10:14:59.000Z"),
      automationDirectoryPath,
      stateStore: store.store,
      activeLockRunId: null,
      scannerAndContextRunner: async () => {
        scheduledCalls += 1;
        return {};
      },
    });
    assert.equal(beforeCadence.decision, "NOTHING_DUE");
    assert.equal(scheduledCalls, 0);

    const atCadence = await runCentralSchedulerOnce({
      enabled: true,
      now: () => new Date("2026-08-25T10:15:00.000Z"),
      automationDirectoryPath,
      stateStore: store.store,
      activeLockRunId: null,
      scannerAndContextRunner: async () => {
        scheduledCalls += 1;
        return {};
      },
    });
    assert.equal(atCadence.decision, "RUN_SCANNER_AND_CONTEXT");
    assert.equal(scheduledCalls, 1);
  });

  it("uses the same global lock and never duplicates an active scheduled run", async () => {
    const automationDirectoryPath = await tempAutomationDirectory();
    const store = memoryStore(createInitialAutomationState());
    const active = await acquireGlobalCollectorLock("scheduled_active", { directoryPath: automationDirectoryPath });
    assert.equal(active.status, "ACQUIRED");
    let runnerCalls = 0;
    try {
      const result = await runCentralLiveCycleOnce({
        automationDirectoryPath,
        stateStore: store.store,
        runner: async () => {
          runnerCalls += 1;
          return {};
        },
      });
      assert.deepEqual(result, {
        decision: "RUN_ALREADY_IN_PROGRESS",
        run_mode: "scanner_and_context",
        run_status: "RUN_ALREADY_IN_PROGRESS",
        active_run_id: "scheduled_active",
      });
      assert.equal(runnerCalls, 0);
      assert.equal(store.writes, 0);
    } finally {
      if (active.status === "ACQUIRED") await active.release();
    }
  });

  it("does not publish a failed one-shot or change its suspended governance", async () => {
    const automationDirectoryPath = await tempAutomationDirectory();
    const before: AutomationState = {
      ...createInitialAutomationState(),
      last_published_scanner_run_id: "scan_last_known_good",
      last_published_context_run_id: "approved_sources_last_known_good",
      automation_suspended: true,
      suspended_at: "2026-08-25T10:00:00.000Z",
      suspended_reason: "TEST_SUSPENSION",
      resume_required: true,
      retry_not_before: "2026-08-25T10:30:00.000Z",
    };
    const store = memoryStore(before);

    const result = await runCentralLiveCycleOnce({
      automationDirectoryPath,
      stateStore: store.store,
      runner: async () => {
        throw Object.assign(new Error("mock provider failure"), { code: "MOCK_PROVIDER_FAILED" });
      },
    });

    assert.equal(result.run_status, "FAILED");
    assert.equal(store.writes, 0);
    assert.deepEqual(store.state, before);
  });

  it("publishes a valid partial one-shot without changing scheduler governance", async () => {
    const automationDirectoryPath = await tempAutomationDirectory();
    const before: AutomationState = {
      ...createInitialAutomationState(),
      scheduler_schema_version: "central_source_scheduler_v2",
      last_scheduler_check_at: "2026-08-28T14:30:00.000Z",
      last_decision: "NOTHING_DUE",
      next_scanner_run_at: "2026-08-28T14:45:00.000Z",
      next_alternative_me_run_at: "2026-08-28T20:30:00.000Z",
      next_defillama_run_at: "2026-08-28T16:30:00.000Z",
      consecutive_failure_count: 2,
      retry_not_before: "2026-08-28T14:35:00.000Z",
    };
    const store = memoryStore(before);

    const result = await runCentralLiveCycleOnce({
      automationDirectoryPath,
      stateStore: store.store,
      runner: async () => ({
        scanner_run_id: "scan_partial_owner_once",
        context_run_id: "approved_sources_partial_owner_once",
        source_statuses: { dexscreener: "READY", defillama_api: "DEGRADED" },
      }),
    });

    assert.equal(result.run_status, "PARTIAL");
    assert.equal(store.writes, 1);
    assert.equal(store.state.last_published_scanner_run_id, "scan_partial_owner_once");
    assert.equal(store.state.last_published_context_run_id, "approved_sources_partial_owner_once");
    assert.equal(store.state.last_result, "PARTIAL");
    assert.equal(store.state.next_scanner_run_at, before.next_scanner_run_at);
    assert.equal(store.state.next_alternative_me_run_at, before.next_alternative_me_run_at);
    assert.equal(store.state.next_defillama_run_at, before.next_defillama_run_at);
    assert.equal(store.state.consecutive_failure_count, before.consecutive_failure_count);
    assert.equal(store.state.retry_not_before, before.retry_not_before);
  });
});

function memoryStore(initial: AutomationState): { store: AutomationStateStore; state: AutomationState; writes: number } {
  const holder = {
    state: structuredClone(initial),
    writes: 0,
    store: {} as AutomationStateStore,
  };
  holder.store = {
    read: async () => structuredClone(holder.state),
    write: async (next) => {
      holder.writes += 1;
      holder.state = structuredClone(next);
    },
  };
  return holder;
}

async function tempAutomationDirectory(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-owner-one-shot-"));
  roots.push(root);
  return resolve(root, "automation");
}
