import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createInitialAutomationState, type AutomationState, type AutomationStateStore } from "../src/automation/automationState.js";
import { acquireGlobalCollectorLock } from "../src/automation/globalCollectorLock.js";
import { runCentralLiveCycleOnce, runCentralSchedulerOnce } from "../src/automation/runCentralAutomation.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("owner one-shot central data smoke", () => {
  it("executes once from a suspended operator state and preserves that state without scheduling a follow-up", async () => {
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
    assert.equal(store.writes, 0);
    assert.deepEqual(store.state, before);

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
    assert.equal(store.writes, 0);
    assert.deepEqual(store.state, before);

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
