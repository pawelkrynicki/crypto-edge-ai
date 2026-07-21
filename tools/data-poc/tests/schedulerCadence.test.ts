import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  createInitialAutomationState,
  normalizeAutomationState,
  type AutomationState,
  type AutomationStateStore,
} from "../src/automation/automationState.js";
import { decideCentralSchedule } from "../src/automation/schedulerDecision.js";
import { runCentralSchedulerOnce } from "../src/automation/runCentralAutomation.js";
import { planSourceCadence } from "../src/automation/sourceCadence.js";
import { runInternalBetaContextCollector } from "../src/internalBetaContextCollector.js";

const NOW = new Date("2026-07-21T12:00:00.000Z");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("source-aware cadence", () => {
  it("enforces exact scanner, Alternative.me and DefiLlama boundaries", () => {
    const fresh = planSourceCadence({
      now: NOW,
      last_success_at: {
        dexscreener: ago(14, "minutes"),
        alternative_me_fng: ago(359, "minutes"),
        defillama_api: ago(119, "minutes"),
      },
    });
    assert.equal(fresh.sources.dexscreener.due, false);
    assert.equal(fresh.sources.alternative_me_fng.due, false);
    assert.equal(fresh.sources.defillama_api.due, false);

    const due = planSourceCadence({
      now: NOW,
      last_success_at: {
        dexscreener: ago(15, "minutes"),
        alternative_me_fng: ago(6, "hours"),
        defillama_api: ago(2, "hours"),
      },
    });
    assert.equal(due.sources.dexscreener.due, true);
    assert.equal(due.sources.alternative_me_fng.due, true);
    assert.equal(due.sources.defillama_api.due, true);
    assert.equal(due.sources.dexscreener.delay_ms, 0);
    assert.equal(due.requires_scanner_and_context, true);
  });

  it("never schedules GoPlus independently or Honeypot.is automatically", () => {
    const plan = planSourceCadence({ now: NOW });
    assert.equal(plan.sources.goplus_security.due, false);
    assert.equal(plan.sources.goplus_security.reason, "CANDIDATE_SCOPED_WITH_SCANNER");
    assert.equal(plan.sources.honeypot_is.due, false);
    assert.equal(plan.sources.honeypot_is.reason, "MANUAL_LINK_ONLY");
  });

  it("does not depend on the number of users", () => {
    const base = { now: NOW, last_success_at: { dexscreener: ago(16, "minutes") } };
    assert.deepEqual(planSourceCadence({ ...base, user_count: 1 }), planSourceCadence({ ...base, user_count: 100_000 }));
  });
});

describe("central scheduler decision", () => {
  it("returns every non-running guard decision without invoking a runner", async () => {
    const state = createInitialAutomationState();
    assert.equal(decideCentralSchedule({ now: NOW, enabled: false, state }).decision, "AUTOMATION_DISABLED");
    assert.equal(decideCentralSchedule({ now: NOW, enabled: true, state: null }).decision, "STATE_UNAVAILABLE");
    assert.equal(decideCentralSchedule({ now: NOW, enabled: true, state, active_lock_run_id: "active" }).decision, "RUN_ALREADY_IN_PROGRESS");
    const current = { ...state, last_scanner_success_at: NOW.toISOString(), last_context_success_at: NOW.toISOString() };
    assert.equal(decideCentralSchedule({ now: NOW, enabled: true, state: current, active_lock_run_id: null }).decision, "NOTHING_DUE");
    const contextDue = { ...current, last_context_success_at: ago(2, "hours") };
    assert.equal(decideCentralSchedule({ now: NOW, enabled: true, state: contextDue, active_lock_run_id: null }).decision, "RUN_CONTEXT_ONLY");
    const scannerDue = { ...current, last_scanner_success_at: ago(15, "minutes") };
    assert.equal(decideCentralSchedule({ now: NOW, enabled: true, state: scannerDue, active_lock_run_id: null }).decision, "RUN_SCANNER_AND_CONTEXT");
  });

  it("uses published snapshot timestamps when scheduler state has no successes", () => {
    const state = createInitialAutomationState();
    const decision = decideCentralSchedule({
      now: NOW,
      enabled: true,
      state,
      active_lock_run_id: null,
      snapshots: { scanner_published_at: NOW.toISOString(), context_published_at: NOW.toISOString() },
    });
    assert.equal(decision.decision, "NOTHING_DUE");
  });

  it("runs the selected mode once and computes next timestamps after success", async () => {
    const fullAutomationDirectory = await tempDirectory();
    let fullState = createInitialAutomationState();
    let fullCalls = 0;
    const fullStore: AutomationStateStore = {
      read: async () => fullState,
      write: async (next) => { fullState = structuredClone(next); },
    };
    const full = await runCentralSchedulerOnce({
      enabled: true,
      now: () => NOW,
      automationDirectoryPath: fullAutomationDirectory,
      stateStore: fullStore,
      activeLockRunId: null,
      scannerAndContextRunner: async () => {
        fullCalls += 1;
        return { scanner_run_id: "scanner_success", context_run_id: "context_with_scanner", request_counts: { dexscreener: 1 } };
      },
    });
    assert.equal(full.decision, "RUN_SCANNER_AND_CONTEXT");
    assert.equal(fullCalls, 1);
    assert.equal(fullState.last_scanner_run_id, "scanner_success");
    assert.equal(fullState.last_context_run_id, "context_with_scanner");
    assert.equal(fullState.next_scanner_run_at, "2026-07-21T12:15:00.000Z");
    assert.equal(fullState.next_alternative_me_run_at, "2026-07-21T18:00:00.000Z");
    assert.equal(fullState.next_defillama_run_at, "2026-07-21T14:00:00.000Z");

    let contextState: AutomationState = {
      ...createInitialAutomationState(),
      last_scanner_success_at: NOW.toISOString(),
      last_scanner_run_id: "scanner_last_good",
      last_published_scanner_run_id: "scanner_last_good",
      last_context_success_at: ago(2, "hours"),
    };
    let scannerCalls = 0;
    let contextCalls = 0;
    const contextStore: AutomationStateStore = {
      read: async () => contextState,
      write: async (next) => { contextState = structuredClone(next); },
    };
    const contextAutomationDirectory = await tempDirectory();
    const contextOnly = await runCentralSchedulerOnce({
      enabled: true,
      now: () => NOW,
      automationDirectoryPath: contextAutomationDirectory,
      stateStore: contextStore,
      activeLockRunId: null,
      scannerAndContextRunner: async () => { scannerCalls += 1; return {}; },
      contextOnlyRunner: async () => {
        contextCalls += 1;
        return { context_run_id: "context_only_success", context_sources_refreshed: ["defillama_api"] };
      },
    });
    assert.equal(contextOnly.decision, "RUN_CONTEXT_ONLY");
    assert.equal(scannerCalls, 0);
    assert.equal(contextCalls, 1);
    assert.equal(contextState.last_scanner_run_id, "scanner_last_good");
    assert.equal(contextState.last_context_run_id, "context_only_success");
    assert.equal(contextState.next_alternative_me_run_at, "2026-07-21T16:00:00.000Z");
    assert.equal(contextState.next_defillama_run_at, "2026-07-21T14:00:00.000Z");
  });

  it("increments missed_schedule_count once after crossing an overdue boundary", async () => {
    const automationDirectoryPath = await tempDirectory();
    let state: AutomationState = {
      ...createInitialAutomationState(),
      last_scanner_success_at: ago(16, "minutes"),
      last_context_success_at: NOW.toISOString(),
      last_scheduler_check_at: ago(2, "minutes"),
    };
    const store: AutomationStateStore = {
      read: async () => state,
      write: async (next) => { state = structuredClone(next); },
    };
    let runnerCalls = 0;
    const first = await runCentralSchedulerOnce({
      enabled: true,
      now: () => NOW,
      automationDirectoryPath,
      stateStore: store,
      activeLockRunId: null,
      scannerAndContextRunner: async () => {
        runnerCalls += 1;
        throw Object.assign(new Error("controlled"), { code: "CONTROLLED_FAILURE" });
      },
    });
    assert.equal(first.run_status, "FAILED");
    assert.equal(state.missed_schedule_count, 1);
    await runCentralSchedulerOnce({ enabled: true, now: () => NOW, automationDirectoryPath, stateStore: store, activeLockRunId: null, scannerAndContextRunner: async () => ({}) });
    assert.equal(state.missed_schedule_count, 1);
    assert.equal(runnerCalls, 1);
  });

  it("keeps v1 state files compatible and rejects corrupt state", () => {
    const legacy = createInitialAutomationState() as unknown as Record<string, unknown>;
    for (const key of [
      "scheduler_schema_version", "last_scheduler_check_at", "last_decision", "next_scanner_run_at",
      "next_alternative_me_run_at", "next_defillama_run_at", "last_scanner_success_at",
      "last_context_success_at", "last_scanner_run_id", "last_context_run_id", "missed_schedule_count",
    ]) delete legacy[key];
    assert.equal(normalizeAutomationState(legacy).missed_schedule_count, 0);
    assert.throws(() => normalizeAutomationState({ broken: true }), /AUTOMATION_STATE_INVALID/);
  });
});

describe("context-only collector", () => {
  it("calls only approved context sources and leaves scanner snapshot unchanged", async () => {
    const root = await tempDirectory();
    const scannerPath = resolve(root, "scanner-sentinel.json");
    await writeFile(scannerPath, "scanner-last-known-good\n", "utf8");
    const urls: string[] = [];
    const result = await runInternalBetaContextCollector({
      env: {
        CRYPTO_EDGE_DATA_ENV: "INTERNAL_BETA",
        CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
        ALLOW_LIVE_PROVIDER_CALLS: "1",
      },
      outputDir: root,
      now: NOW,
      fetchImpl: async (input) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("alternative.me")) {
          return Response.json({ data: [{ value: "40", value_classification: "Fear", timestamp: String(NOW.getTime() / 1_000), time_until_update: "3600" }] });
        }
        if (url === "https://api.llama.fi/protocols") {
          return Response.json([{ name: "Lido", chain: "Ethereum", tvl: 1_000_000, change_1d: 1, change_7d: 2, url: "https://lido.fi" }]);
        }
        throw new Error(`unexpected URL ${url}`);
      },
    });
    assert.deepEqual(Object.keys(result.request_counts).sort(), ["alternative_me_fng", "defillama_api"]);
    assert.equal(urls.some((url) => /dexscreener|goplus/i.test(url)), false);
    assert.equal(await readFile(scannerPath, "utf8"), "scanner-last-known-good\n");

    const contextOnlyUrls: string[] = [];
    const second = await runInternalBetaContextCollector({
      env: {
        CRYPTO_EDGE_DATA_ENV: "INTERNAL_BETA",
        CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
        ALLOW_LIVE_PROVIDER_CALLS: "1",
      },
      outputDir: root,
      now: new Date("2026-07-21T14:00:00.000Z"),
      dueSourceIds: ["defillama_api"],
      previousContext: result.context,
      fetchImpl: async (input) => {
        const url = String(input);
        contextOnlyUrls.push(url);
        if (url === "https://api.llama.fi/protocols") {
          return Response.json([{ name: "Aave", chain: "Ethereum", tvl: 2_000_000, change_1d: 2, change_7d: 3, url: "https://aave.com" }]);
        }
        throw new Error(`non-due provider called: ${url}`);
      },
    });
    assert.deepEqual(contextOnlyUrls, ["https://api.llama.fi/protocols"]);
    assert.deepEqual(second.request_counts, { alternative_me_fng: 0, defillama_api: 1 });
    assert.deepEqual(second.refreshed_source_ids, ["defillama_api"]);
    assert.equal(second.context.sources.find((source) => source.source_id === "alternative_me_fng")?.fetched_at, NOW.toISOString());
  });
});

function ago(value: number, unit: "minutes" | "hours"): string {
  const multiplier = unit === "minutes" ? 60_000 : 3_600_000;
  return new Date(NOW.getTime() - value * multiplier).toISOString();
}

async function tempDirectory(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-scheduler-"));
  tempRoots.push(root);
  return root;
}
