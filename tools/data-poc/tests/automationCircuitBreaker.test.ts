import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  createAutomationStateStore,
  createInitialAutomationState,
  type AutomationState,
  type AutomationStateStore,
} from "../src/automation/automationState.js";
import {
  classifyAutomationFailure,
  runCentralAutomation,
} from "../src/automation/centralAutomationCoordinator.js";
import { resumeAutomationState } from "../src/automation/resumeAutomationState.js";
import { runCentralSchedulerOnce } from "../src/automation/runCentralAutomation.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("central automation circuit breaker", () => {
  it("suspends on the first deterministic metadata failure and blocks the next tick before all side effects", async () => {
    const root = await tempRoot();
    const automationDirectoryPath = resolve(root, "automation");
    const sentinels = await createCanonicalSentinels(root);
    let runnerCalls = 0;
    let providerCalls = 0;

    const failed = await runCentralAutomation({
      automationDirectoryPath,
      runIdFactory: () => "run_metadata_invalid",
      runner: async () => {
        throw Object.assign(new Error("invalid scanner metadata"), { code: "SCANNER_METADATA_INVALID" });
      },
    });
    assert.deepEqual(failed, {
      status: "FAILED",
      run_id: "run_metadata_invalid",
      error_code: "SCANNER_METADATA_INVALID",
    });
    const suspended = await createAutomationStateStore(automationDirectoryPath).read();
    assert.equal(suspended.consecutive_failure_count, 1);
    assert.equal(suspended.automation_suspended, true);
    assert.equal(suspended.suspended_reason, "SCANNER_METADATA_INVALID");
    assert.equal(suspended.last_failure_class, "DETERMINISTIC");
    assert.equal(suspended.resume_required, true);
    assert.ok(suspended.suspended_at);

    const nextTick = await runCentralSchedulerOnce({
      enabled: true,
      automationDirectoryPath,
      activeLockRunId: null,
      scannerAndContextRunner: async () => {
        runnerCalls += 1;
        providerCalls += 1;
        await mutateCanonicalSentinels(sentinels);
        return {};
      },
      contextOnlyRunner: async () => {
        runnerCalls += 1;
        providerCalls += 1;
        await mutateCanonicalSentinels(sentinels);
        return {};
      },
    });
    assert.equal(nextTick.decision, "AUTOMATION_SUSPENDED");
    assert.equal(nextTick.run_status, "AUTOMATION_SUSPENDED");
    assert.equal(nextTick.error_code, "SCANNER_METADATA_INVALID");
    assert.equal(runnerCalls, 0);
    assert.equal(providerCalls, 0);
    await assertCanonicalSentinelsUnchanged(sentinels);
  });

  it("suspends after three consecutive transient failures", async () => {
    const root = await tempRoot();
    const automationDirectoryPath = resolve(root, "automation");
    let runnerCalls = 0;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await runCentralAutomation({
        automationDirectoryPath,
        runIdFactory: () => `run_transient_${attempt}`,
        runner: async () => {
          runnerCalls += 1;
          throw Object.assign(new Error("temporary provider failure"), { code: "PROVIDER_TIMEOUT" });
        },
      });
      assert.equal(result.status, "FAILED");
      const state = await createAutomationStateStore(automationDirectoryPath).read();
      assert.equal(state.consecutive_failure_count, attempt);
      assert.equal(state.automation_suspended, attempt === 3);
      assert.equal(state.last_failure_class, "TRANSIENT");
    }
    assert.equal(runnerCalls, 3);

    const blocked = await runCentralAutomation({
      automationDirectoryPath,
      runner: async () => {
        runnerCalls += 1;
        return {};
      },
    });
    assert.equal(blocked.status, "AUTOMATION_SUSPENDED");
    assert.equal(runnerCalls, 3);
  });

  it("resets the failure counter only after SUCCESS or PARTIAL", async () => {
    const root = await tempRoot();
    const automationDirectoryPath = resolve(root, "automation");
    let state: AutomationState = {
      ...createInitialAutomationState(),
      consecutive_failure_count: 2,
      last_failure_class: "TRANSIENT",
    };
    const store: AutomationStateStore = {
      read: async () => structuredClone(state),
      write: async (next) => { state = structuredClone(next); },
    };
    const result = await runCentralAutomation({
      automationDirectoryPath,
      stateStore: store,
      runner: async () => ({ source_statuses: { dexscreener: "DEGRADED" } }),
    });
    assert.equal(result.status, "PARTIAL");
    assert.equal(state.consecutive_failure_count, 0);
    assert.equal(state.last_failure_class, "TRANSIENT");
  });

  it("requires explicit owner confirmation to resume and does not reset the failure counter", async () => {
    let state: AutomationState = {
      ...createInitialAutomationState(),
      consecutive_failure_count: 1,
      automation_suspended: true,
      suspended_at: "2026-07-29T10:00:00.000Z",
      suspended_reason: "SCANNER_METADATA_INVALID",
      last_failure_class: "DETERMINISTIC",
      resume_required: true,
    };
    let writes = 0;
    const store: AutomationStateStore = {
      read: async () => structuredClone(state),
      write: async (next) => { writes += 1; state = structuredClone(next); },
    };

    const preview = await resumeAutomationState({ ownerConfirmed: false, stateStore: store });
    assert.equal(preview.mode, "PREVIEW");
    assert.equal(preview.status, "RESUME_AVAILABLE");
    assert.equal(writes, 0);
    assert.equal(state.automation_suspended, true);

    const resumed = await resumeAutomationState({ ownerConfirmed: true, stateStore: store });
    assert.equal(resumed.mode, "OWNER_CONFIRMED");
    assert.equal(resumed.status, "RESUMED");
    assert.equal(writes, 1);
    assert.equal(state.automation_suspended, false);
    assert.equal(state.resume_required, false);
    assert.equal(state.suspended_at, null);
    assert.equal(state.suspended_reason, null);
    assert.equal(state.consecutive_failure_count, 1);
  });

  it("classifies schema, contract, lineage and version failures as deterministic", () => {
    for (const code of [
      "SCANNER_SCHEMA_INVALID",
      "CONTEXT_CONTRACT_INVALID",
      "SCANNER_LINEAGE_MISMATCH",
      "SCANNER_MANIFEST_VERSION_UNSUPPORTED",
      "SCANNER_CONTEXT_PROVENANCE_INVALID",
    ]) assert.equal(classifyAutomationFailure(code), "DETERMINISTIC");
    assert.equal(classifyAutomationFailure("PROVIDER_TIMEOUT"), "TRANSIENT");
  });
});

type CanonicalSentinels = Record<"established" | "followUp" | "ai" | "feedback", string>;

async function createCanonicalSentinels(root: string): Promise<CanonicalSentinels> {
  const sentinels = {
    established: resolve(root, "established-universe.json"),
    followUp: resolve(root, "follow-up-store.json"),
    ai: resolve(root, "ai-store.json"),
    feedback: resolve(root, "feedback-store.json"),
  };
  await mkdir(root, { recursive: true });
  await Promise.all(Object.values(sentinels).map((path) => writeFile(path, "last-known-good\n", "utf8")));
  return sentinels;
}

async function mutateCanonicalSentinels(sentinels: CanonicalSentinels): Promise<void> {
  await Promise.all(Object.values(sentinels).map((path) => writeFile(path, "mutated\n", "utf8")));
}

async function assertCanonicalSentinelsUnchanged(sentinels: CanonicalSentinels): Promise<void> {
  for (const path of Object.values(sentinels)) {
    assert.equal(await readFile(path, "utf8"), "last-known-good\n");
  }
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-circuit-breaker-"));
  roots.push(root);
  return root;
}
