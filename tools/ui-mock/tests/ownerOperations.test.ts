import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialAutomationState, type AutomationState, type AutomationStateStore } from "../../data-poc/src/automation/automationState.js";
import { decideCentralSchedule } from "../../data-poc/src/automation/schedulerDecision.js";
import type { RunCentralSchedulerOnceResult } from "../../data-poc/src/automation/runCentralAutomation.js";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import type { OwnerOperationsOptions } from "../server/ownerOperations.js";
import { OwnerOperationsPanel } from "../src/components/OwnerOperationsPanel.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import type { OwnerOperationsStatus, OwnerRefreshPreview } from "../src/services/ownerOperationsDataSource.js";

const NOW_ISO = "2026-07-22T10:00:00.000Z";
const SESSION_SECRET = "owner-review-session-secret-that-never-leaves-the-process";
const uiRoot = resolve(process.cwd());

describe("owner operations capability and UI boundary", () => {
  it("defaults to DISABLED and stays hidden despite URL parameters", async () => {
    const server = createScannerApiServer({ runtimeMode: "INTERNAL_BETA" });
    await listen(server);
    try {
      for (const path of [
        "/api/owner-operations/status",
        "/api/owner-operations/status?owner_operations=ENABLED",
        "/api/owner-operations/status?mode=REVIEW_SAFE",
      ]) {
        const response = await requestApi(server, "GET", path);
        assert.equal(response.status, 200);
        const body = JSON.parse(response.body) as OwnerOperationsStatus;
        assert.equal(body.mode, "DISABLED");
        assert.equal(body.owner_controls_visible, false);
        assert.equal(body.owner_actions_enabled, false);
        assert.equal(renderOwner(body, "en"), "");
      }
      assert.equal((await requestApi(server, "GET", "/api/owner-operations/refresh-preview")).status, 404);
    } finally {
      await close(server);
    }
  });

  it("shows the bilingual panel only for canonical REVIEW_SAFE capability", () => {
    const status = visibleStatus("REVIEW_SAFE");
    const english = renderOwner(status, "en");
    const polish = renderOwner(status, "pl");
    assert.match(english, /Owner operations/);
    assert.match(english, /One-time data refresh/);
    assert.match(english, /Preview refresh plan/);
    assert.match(english, /real refresh remains blocked/);
    assert.match(polish, /Operacje ownera/);
    assert.match(polish, /Jednorazowe odświeżenie danych/);
    assert.match(polish, /Sprawdź plan odświeżenia/);
    assert.match(polish, /prawdziwe odświeżenie pozostaje zablokowane/);
    assert.match(english, /<button[^>]*disabled=""[^>]*>Run one-time refresh<\/button>/);
  });

  it("keeps the local launcher DISABLED by default and exposes only the REVIEW_SAFE review variant", async () => {
    const launcher = await readFile(resolve(uiRoot, "..", "..", "scripts", "win", "start-product-radar-review.cmd"), "utf8");
    assert.match(launcher, /CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED/);
    assert.match(launcher, /--owner-operations-review/);
    assert.match(launcher, /CRYPTO_EDGE_OWNER_OPERATIONS_MODE=REVIEW_SAFE/);
    assert.doesNotMatch(launcher, /CRYPTO_EDGE_OWNER_OPERATIONS_MODE=ENABLED/);
    assert.doesNotMatch(launcher, /ALLOW_LIVE_PROVIDER_CALLS=1/);
  });

  it("allows REVIEW_SAFE preflight with zero provider calls, writes and lock reservations, then blocks POST", async () => {
    let reads = 0;
    let writes = 0;
    let lockInspections = 0;
    let runnerCalls = 0;
    let providerCalls = 0;
    const state = createInitialAutomationState();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      providerCalls += 1;
      throw new Error("provider call forbidden");
    }) as typeof fetch;
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      ownerOperations: ownerOptions("REVIEW_SAFE", state, {
        stateStore: countingStateStore(state, () => { reads += 1; }, () => { writes += 1; }),
        inspectActiveLock: async () => { lockInspections += 1; return null; },
        runOnce: async () => { runnerCalls += 1; return successfulRun(); },
      }),
    });
    await listen(server);
    try {
      const status = await requestApi(server, "GET", "/api/owner-operations/status");
      assert.equal(status.status, 200);
      assert.equal((JSON.parse(status.body) as OwnerOperationsStatus).owner_controls_visible, true);
      const previewResponse = await requestApi(server, "GET", "/api/owner-operations/refresh-preview");
      assert.equal(previewResponse.status, 200);
      const preview = JSON.parse(previewResponse.body) as OwnerRefreshPreview;
      assert.equal(preview.planned_mode, "scanner_and_context");
      assert.equal(preview.owner_actions_enabled, false);
      assert.equal(preview.lock_available, true);
      const post = await postRefresh(server, preview);
      assert.equal(post.status, 403);
      assert.equal((JSON.parse(post.body) as { error: string }).error, "OWNER_ACTIONS_DISABLED");
    } finally {
      globalThis.fetch = originalFetch;
      await close(server);
    }
    assert.ok(reads >= 2);
    assert.equal(writes, 0);
    assert.ok(lockInspections >= 2);
    assert.equal(runnerCalls, 0);
    assert.equal(providerCalls, 0);
  });

  it("derives preflight from the canonical scheduler cadence decision", async () => {
    const state = recentSuccessState();
    state.last_scanner_success_at = "2026-07-22T09:40:00.000Z";
    state.last_context_success_at = NOW_ISO;
    const canonical = decideCentralSchedule({
      now: new Date(NOW_ISO),
      enabled: true,
      state,
      active_lock_run_id: null,
      snapshots: {},
    });
    const server = enabledServer(state);
    await listen(server);
    try {
      const preview = await getPreview(server);
      assert.equal(preview.scanner_due, canonical.cadence.sources.dexscreener.due);
      assert.equal(preview.context_due, canonical.cadence.sources.alternative_me_fng.due || canonical.cadence.sources.defillama_api.due);
      assert.equal(preview.planned_mode, "scanner_and_context");
      assert.deepEqual(preview.sources_may_be_called, ["dexscreener", "goplus_security"]);
      assert.ok(preview.sources_not_called.includes("honeypot_is"));
    } finally {
      await close(server);
    }
  });

  it("returns NO_ACTION without runner, provider calls or last-success changes", async () => {
    const state = recentSuccessState();
    const before = JSON.stringify(state);
    let runnerCalls = 0;
    let writes = 0;
    let providerCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { providerCalls += 1; throw new Error("forbidden"); }) as typeof fetch;
    const server = enabledServer(state, {
      stateStore: countingStateStore(state, () => undefined, () => { writes += 1; }),
      runOnce: async () => { runnerCalls += 1; return successfulRun(); },
    });
    await listen(server);
    try {
      const preview = await getPreview(server);
      assert.equal(preview.planned_mode, "no_action");
      const response = await postRefresh(server, preview);
      assert.equal(response.status, 200);
      assert.equal((JSON.parse(response.body) as { status: string }).status, "NO_ACTION");
    } finally {
      globalThis.fetch = originalFetch;
      await close(server);
    }
    assert.equal(runnerCalls, 0);
    assert.equal(writes, 0);
    assert.equal(providerCalls, 0);
    assert.equal(JSON.stringify(state), before);
  });
});

describe("owner refresh mutation security", () => {
  it("rejects missing or foreign Origin and missing or invalid owner session header", async () => {
    const server = enabledServer(createInitialAutomationState());
    await listen(server);
    try {
      const preview = await getPreview(server);
      const body = JSON.stringify({ preflight_id: preview.preflight_id, confirmation: true });
      assert.equal((await requestApi(server, "POST", "/api/owner-operations/refresh", {
        "content-type": "application/json",
        "x-crypto-edge-owner-session": preview.preflight_id,
      }, body)).status, 403);
      assert.equal((await requestApi(server, "POST", "/api/owner-operations/refresh", {
        origin: "https://foreign.invalid",
        "content-type": "application/json",
        "x-crypto-edge-owner-session": preview.preflight_id,
      }, body)).status, 403);
      assert.equal((await requestApi(server, "POST", "/api/owner-operations/refresh", ownerHeaders(server), body)).status, 403);
      assert.equal((await requestApi(server, "POST", "/api/owner-operations/refresh", {
        ...ownerHeaders(server),
        "x-crypto-edge-owner-session": "invalid-owner-token",
      }, body)).status, 403);
      assert.equal((await requestApi(server, "POST", "/api/owner-operations/refresh", {
        origin: ownerHeaders(server).origin,
        "content-type": "text/plain",
        "x-crypto-edge-owner-session": preview.preflight_id,
      }, body)).status, 415);
    } finally {
      await close(server);
    }
  });

  it("rejects stale preflight, confirmation=false, extra fields, commands and paths", async () => {
    let nowMs = Date.parse(NOW_ISO);
    const server = enabledServer(createInitialAutomationState(), { now: () => new Date(nowMs), preflightTtlMs: 1_000 });
    await listen(server);
    try {
      const preview = await getPreview(server);
      const invalidBodies = [
        { preflight_id: preview.preflight_id, confirmation: false },
        { preflight_id: preview.preflight_id, confirmation: true, extra: true },
        { preflight_id: preview.preflight_id, confirmation: true, command: "anything" },
        { preflight_id: preview.preflight_id, confirmation: true, path: "C:\\private" },
      ];
      for (const body of invalidBodies) {
        const response = await requestApi(server, "POST", "/api/owner-operations/refresh", {
          ...ownerHeaders(server),
          "x-crypto-edge-owner-session": preview.preflight_id,
        }, JSON.stringify(body));
        assert.equal(response.status, 400);
      }
      nowMs += 1_001;
      const stale = await postRefresh(server, preview);
      assert.equal(stale.status, 409);
      assert.equal((JSON.parse(stale.body) as { error: string }).error, "PREFLIGHT_STALE");
    } finally {
      await close(server);
    }
  });

  it("returns HTTP 409 for the occupied global lock and never invokes the runner", async () => {
    let runnerCalls = 0;
    const server = enabledServer(createInitialAutomationState(), {
      inspectActiveLock: async () => "automation_active",
      runOnce: async () => { runnerCalls += 1; return successfulRun(); },
    });
    await listen(server);
    try {
      const preview = await getPreview(server);
      assert.equal(preview.lock_available, false);
      const response = await postRefresh(server, preview);
      assert.equal(response.status, 409);
      assert.match(response.body, /Refresh already in progress \/ Odświeżenie już trwa/);
    } finally {
      await close(server);
    }
    assert.equal(runnerCalls, 0);
  });

  it("accepts at most one of 100 concurrent attempts and calls the injected coordinator once", async () => {
    let runnerCalls = 0;
    let releaseRunner: (() => void) | undefined;
    const runnerGate = new Promise<void>((resolveGate) => { releaseRunner = resolveGate; });
    const server = enabledServer(createInitialAutomationState(), {
      runOnce: async () => {
        runnerCalls += 1;
        await runnerGate;
        return successfulRun();
      },
    });
    await listen(server);
    try {
      const preview = await getPreview(server);
      const attempts = Array.from({ length: 100 }, () => postRefresh(server, preview));
      await waitFor(() => runnerCalls === 1);
      releaseRunner?.();
      const responses = await Promise.all(attempts);
      assert.equal(responses.filter((response) => response.status === 200).length, 1);
      assert.equal(responses.filter((response) => response.status === 409).length, 99);
      assert.equal(runnerCalls, 1);
    } finally {
      releaseRunner?.();
      await close(server);
    }
  });

  it("keeps ordinary Product Radar GET responsive during a run", async () => {
    let runnerStarted = false;
    let releaseRunner: (() => void) | undefined;
    const runnerGate = new Promise<void>((resolveGate) => { releaseRunner = resolveGate; });
    const server = enabledServer(createInitialAutomationState(), {
      runOnce: async () => {
        runnerStarted = true;
        await runnerGate;
        return successfulRun();
      },
    });
    await listen(server);
    try {
      const preview = await getPreview(server);
      let refreshSettled = false;
      const refreshPromise = postRefresh(server, preview).finally(() => { refreshSettled = true; });
      await waitFor(() => runnerStarted);
      const scanner = await requestApi(server, "GET", "/api/scanner/latest");
      assert.ok(scanner.status === 200 || scanner.status === 503);
      assert.equal(refreshSettled, false);
      releaseRunner?.();
      assert.equal((await refreshPromise).status, 200);
    } finally {
      releaseRunner?.();
      await close(server);
    }
  });

  it("reports failure without leaking internals and confirms last-known-good preservation", async () => {
    const server = enabledServer(createInitialAutomationState(), {
      runOnce: async () => ({
        decision: "RUN_SCANNER_AND_CONTEXT",
        run_mode: "scanner_and_context",
        run_status: "FAILED",
        run_id: "owner_failed_run",
        error_code: "SAFE_FAKE_FAILURE",
      }),
    });
    await listen(server);
    try {
      const status = await requestApi(server, "GET", "/api/owner-operations/status");
      const preview = await getPreview(server);
      const failed = await postRefresh(server, preview);
      assert.equal(failed.status, 500);
      const result = JSON.parse(failed.body) as { status: string; last_known_good_preserved: boolean };
      assert.equal(result.status, "FAILED");
      assert.equal(result.last_known_good_preserved, true);
      for (const response of [status.body, JSON.stringify(preview), failed.body]) {
        for (const forbidden of ["pid", "lock file", "C:\\", "session-secret", SESSION_SECRET, "stack", "command line", "credential"]) {
          assert.equal(response.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
        }
      }
    } finally {
      await close(server);
    }
  });

  it("fails closed for every unapproved owner-operation method and path", async () => {
    const server = enabledServer(createInitialAutomationState());
    await listen(server);
    try {
      for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"]) {
        for (const path of [
          "/api/owner-operations/status",
          "/api/owner-operations/refresh-preview",
          "/api/owner-operations/refresh",
        ]) {
          assert.equal((await requestApi(server, method, path)).status, 404, `${method} ${path}`);
        }
      }
      for (const path of ["/api/owner-operations/run-command", "/api/owner-operations/shell", "/api/owner-operations/action"]) {
        assert.equal((await requestApi(server, "POST", path)).status, 404, path);
      }
    } finally {
      await close(server);
    }
  });

  it("keeps frontend provider-free and limits Product Radar refresh reads to GET", async () => {
    const ownerSource = await readFile(resolve(uiRoot, "src", "services", "ownerOperationsDataSource.ts"), "utf8");
    const scannerSource = await readFile(resolve(uiRoot, "src", "services", "scannerDataSource.ts"), "utf8");
    const panelSource = await readFile(resolve(uiRoot, "src", "components", "OwnerOperationsPanel.tsx"), "utf8");
    for (const source of [ownerSource, panelSource]) {
      assert.doesNotMatch(source, /https?:\/\/(?:api\.)?(?:dexscreener|gopluslabs|honeypot|defillama|alternative\.me)/i);
      assert.doesNotMatch(source, /ALLOW_LIVE_PROVIDER_CALLS|runInternalBetaCollector/);
    }
    assert.match(ownerSource, /\/api\/owner-operations\/refresh-preview/);
    assert.match(ownerSource, /method:\s*"GET"/);
    assert.match(scannerSource, /\/api\/scanner\/latest/);
    assert.doesNotMatch(scannerSource, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  });
});

function enabledServer(state: AutomationState, overrides: Partial<OwnerOperationsOptions> = {}) {
  return createScannerApiServer({
    runtimeMode: "INTERNAL_BETA",
    ownerOperations: ownerOptions("ENABLED", state, overrides),
  });
}

function ownerOptions(
  mode: "REVIEW_SAFE" | "ENABLED",
  state: AutomationState,
  overrides: Partial<OwnerOperationsOptions> = {},
): OwnerOperationsOptions {
  return {
    mode,
    sessionSecret: SESSION_SECRET,
    now: () => new Date(NOW_ISO),
    stateStore: countingStateStore(state),
    readSnapshots: async () => ({}),
    inspectActiveLock: async () => null,
    ...overrides,
  };
}

function countingStateStore(
  state: AutomationState,
  onRead: () => void = () => undefined,
  onWrite: () => void = () => undefined,
): AutomationStateStore {
  return {
    read: async () => { onRead(); return state; },
    write: async () => { onWrite(); },
  };
}

function recentSuccessState(): AutomationState {
  return {
    ...createInitialAutomationState(),
    last_success_at: NOW_ISO,
    last_scanner_success_at: NOW_ISO,
    last_context_success_at: NOW_ISO,
  };
}

function successfulRun(): RunCentralSchedulerOnceResult {
  return {
    decision: "RUN_SCANNER_AND_CONTEXT",
    run_mode: "scanner_and_context",
    run_status: "SUCCESS",
    run_id: "owner_success_run",
  };
}

async function getPreview(server: Server): Promise<OwnerRefreshPreview> {
  const response = await requestApi(server, "GET", "/api/owner-operations/refresh-preview");
  assert.equal(response.status, 200, response.body);
  return JSON.parse(response.body) as OwnerRefreshPreview;
}

function postRefresh(server: Server, preview: OwnerRefreshPreview) {
  return requestApi(server, "POST", "/api/owner-operations/refresh", {
    ...ownerHeaders(server),
    "x-crypto-edge-owner-session": preview.preflight_id,
  }, JSON.stringify({ preflight_id: preview.preflight_id, confirmation: true }));
}

function ownerHeaders(server: Server): Record<string, string> {
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    "content-type": "application/json",
  };
}

function renderOwner(status: OwnerOperationsStatus, locale: "en" | "pl"): string {
  return renderToStaticMarkup(React.createElement(
    ProductLocaleProvider,
    { initialLocale: locale },
    React.createElement(OwnerOperationsPanel, { initialStatus: status }),
  ));
}

function visibleStatus(mode: "REVIEW_SAFE" | "ENABLED"): OwnerOperationsStatus {
  return {
    mode,
    owner_controls_visible: true,
    owner_actions_enabled: mode === "ENABLED",
    action_in_progress: false,
    last_action_status: null,
    last_action_started_at: null,
    last_action_finished_at: null,
    scanner_due: true,
    context_due: false,
    next_scanner_due_at: NOW_ISO,
    next_context_due_at: NOW_ISO,
    automation_enabled: false,
    current_scanner_snapshot_timestamp: NOW_ISO,
    current_context_snapshot_timestamp: NOW_ISO,
    last_known_good_available: true,
  };
}

function listen(server: Server): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

function requestApi(
  server: Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string }> {
  const address = server.address() as AddressInfo;
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request({ hostname: "127.0.0.1", port: address.port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolveRequest({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.once("error", rejectRequest);
    req.end(body);
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("WAIT_TIMEOUT");
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 5));
  }
}
