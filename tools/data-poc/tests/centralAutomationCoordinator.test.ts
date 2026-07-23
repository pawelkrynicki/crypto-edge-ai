import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  createAutomationStateStore,
  createInitialAutomationState,
  type AutomationStateStore,
} from "../src/automation/automationState.js";
import {
  CentralAutomationError,
  runCentralAutomation,
} from "../src/automation/centralAutomationCoordinator.js";
import { acquireGlobalCollectorLock } from "../src/automation/globalCollectorLock.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("central automation coordinator", () => {
  it("runs exactly one shared collector for 100 concurrent users and shares active run_id", async () => {
    const automationDirectoryPath = await tempDirectory();
    let runnerCalls = 0;
    let releaseRunner!: () => void;
    const runnerGate = new Promise<void>((resolveRunner) => { releaseRunner = resolveRunner; });
    let notifyStarted!: () => void;
    const runnerStarted = new Promise<void>((resolveStarted) => { notifyStarted = resolveStarted; });
    let sequence = 0;
    const runner = async () => {
      runnerCalls += 1;
      notifyStarted();
      await runnerGate;
      return { request_counts: { dexscreener: 0 }, scanner_run_id: "scanner_shared", context_run_id: "context_shared" };
    };

    const attempts = Array.from({ length: 100 }, () => runCentralAutomation({
      runner,
      automationDirectoryPath,
      runIdFactory: () => `run_parallel_${sequence += 1}`,
      lockOptions: { ttlMs: 5_000 },
      heartbeatIntervalMs: 500,
    }));
    await runnerStarted;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 100));
    releaseRunner();
    const results = await Promise.all(attempts);

    assert.equal(runnerCalls, 1);
    const success = results.find((result) => result.status === "SUCCESS");
    const blocked = results.filter((result) => result.status === "RUN_ALREADY_IN_PROGRESS");
    assert.ok(success && success.status === "SUCCESS");
    assert.equal(blocked.length, 99);
    assert.deepEqual(new Set(blocked.map((result) => result.status === "RUN_ALREADY_IN_PROGRESS" ? result.active_run_id : null)), new Set([success.run_id]));

    const state = await createAutomationStateStore(automationDirectoryPath).read();
    assert.equal(state.last_result, "SUCCESS");
    assert.equal(state.active_run_id, null);
    assert.deepEqual(state.request_counts, { dexscreener: 0 });
    assert.equal(state.last_published_scanner_run_id, "scanner_shared");
    assert.equal(state.last_published_context_run_id, "context_shared");
  });

  it("releases a controlled lock after runner failure and preserves last-known-good state and snapshots", async () => {
    const automationDirectoryPath = await tempDirectory();
    const snapshotPath = resolve(await tempDirectory(), "last-known-good.json");
    await mkdir(resolve(snapshotPath, ".."), { recursive: true });
    await writeFile(snapshotPath, "{\"run_id\":\"last_good\"}\n", "utf8");
    let sequence = 0;

    const success = await runCentralAutomation({
      automationDirectoryPath,
      runIdFactory: () => `run_success_${sequence += 1}`,
      runner: async () => ({
        request_counts: { dexscreener: 7, goplus: 2 },
        scanner_run_id: "scanner_last_good",
        context_run_id: "context_last_good",
      }),
    });
    assert.equal(success.status, "SUCCESS");

    const failed = await runCentralAutomation({
      automationDirectoryPath,
      runIdFactory: () => `run_failed_${sequence += 1}`,
      runner: async () => {
        throw Object.assign(new Error("provider exploded at C:\\secret\\path"), { code: "PROVIDER_FAILED" });
      },
    });
    assert.deepEqual(failed, { status: "FAILED", run_id: "run_failed_2", error_code: "PROVIDER_FAILED" });
    assert.equal(await readFile(snapshotPath, "utf8"), "{\"run_id\":\"last_good\"}\n");

    const state = await createAutomationStateStore(automationDirectoryPath).read();
    assert.equal(state.last_result, "FAILED");
    assert.equal(state.last_error_code, "PROVIDER_FAILED");
    assert.deepEqual(state.request_counts, { dexscreener: 7, goplus: 2 });
    assert.equal(state.last_published_scanner_run_id, "scanner_last_good");
    assert.equal(state.last_published_context_run_id, "context_last_good");
    assert.doesNotMatch(JSON.stringify(state), /secret|stack|C:\\/i);

    const nextLock = await acquireGlobalCollectorLock("run_after_failure", { directoryPath: automationDirectoryPath });
    assert.equal(nextLock.status, "ACQUIRED");
    if (nextLock.status === "ACQUIRED") await nextLock.release();
  });

  it("fails closed before runner execution when state cannot be written and still releases the lock", async () => {
    const automationDirectoryPath = await tempDirectory();
    let runnerCalls = 0;
    const failingStore: AutomationStateStore = {
      read: async () => createInitialAutomationState(),
      write: async () => { throw new Error("disk unavailable"); },
    };

    await assert.rejects(
      runCentralAutomation({
        automationDirectoryPath,
        stateStore: failingStore,
        runIdFactory: () => "run_state_failure",
        runner: async () => {
          runnerCalls += 1;
          return {};
        },
      }),
      (error: unknown) => error instanceof CentralAutomationError && error.code === "AUTOMATION_STATE_WRITE_FAILED",
    );
    assert.equal(runnerCalls, 0);

    const nextLock = await acquireGlobalCollectorLock("run_after_state_failure", { directoryPath: automationDirectoryPath });
    assert.equal(nextLock.status, "ACQUIRED");
    if (nextLock.status === "ACQUIRED") await nextLock.release();
  });

  it("keeps runtime files ignored and performs no network access", async () => {
    const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
    const gitignore = await readFile(resolve(repoRoot, ".gitignore"), "utf8");
    assert.match(gitignore, /tools\/data-poc\/\.local\//);

    const automationDirectoryPath = await tempDirectory();
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("network forbidden");
    }) as typeof fetch;
    try {
      const result = await runCentralAutomation({
        automationDirectoryPath,
        runIdFactory: () => "run_offline",
        runner: async () => ({ request_counts: {} }),
      });
      assert.equal(result.status, "SUCCESS");
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(fetchCalls, 0);
    await assert.rejects(access(resolve(automationDirectoryPath, "collector.lock.json")));
  });

  it("keeps the live runner behind two explicit opt-ins before its dynamic collector import", async () => {
    const sourcePath = resolve(import.meta.dirname, "..", "..", "src", "automation", "runCentralAutomation.ts");
    const source = await readFile(sourcePath, "utf8");
    const gateIndex = source.indexOf("assertExplicitLiveAutomationOptIn(process.env)");
    const importIndex = source.indexOf('import("../internalBetaCollector.js")');
    assert.ok(gateIndex >= 0 && importIndex > gateIndex);
    assert.match(source, /CRYPTO_EDGE_AUTOMATION_ENABLED\s*!==\s*"1"/);
    assert.match(source, /ALLOW_LIVE_PROVIDER_CALLS\s*!==\s*"1"/);
    assert.doesNotMatch(source, /setInterval|retry/i);
  });
});

async function tempDirectory(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-coordinator-"));
  tempRoots.push(root);
  return resolve(root, "automation");
}
