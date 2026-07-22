import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import {
  resolveControlCenterStatus,
  type ControlCenterReadinessInput,
} from "../src/controlCenterStatus.js";
import { ProductControlCenter } from "../src/components/ProductControlCenter.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import type { ReviewSessionStorageProvider } from "../server/reviewSessionStorageProvider.js";

const uiRoot = resolve(process.cwd());
const repoRoot = resolve(uiRoot, "..", "..");

describe("Control Center readiness model", () => {
  it("keeps overall NOT_READY when deployment, feedback and Reports Library are missing", () => {
    const status = resolveControlCenterStatus(baseInput());
    assert.equal(status.overallStatus, "NOT_READY");
    assert.equal(status.reports.status, "NOT_READY");
    assert.equal(status.feedback.status, "NOT_READY");
    assert.equal(status.accessDeployment.status, "NOT_READY");
    assert.equal(status.accessDeployment.externalTesterAccess, "NO_GO");
  });

  it("does not turn fresh data and a working API into external preview readiness", () => {
    const status = resolveControlCenterStatus(baseInput());
    assert.equal(status.runtimeApi.status, "READY");
    assert.equal(status.dataSnapshots.status, "READY");
    assert.equal(status.overallStatus, "NOT_READY");
  });

  it("keeps Runtime and API READY when data readiness is not ready", () => {
    const input = baseInput();
    input.runtime.readiness = "not_ready";
    const status = resolveControlCenterStatus(input);
    assert.equal(status.runtimeApi.status, "READY");
    assert.equal(status.overallStatus, "NOT_READY");
  });

  it("treats a stale scanner and missing context as PARTIAL data without reporting a runtime failure", () => {
    const input = baseInput();
    input.runtime.readiness = "degraded";
    input.scanner.freshness = "STALE";
    input.context.available = false;
    input.context.freshness = "UNAVAILABLE";
    const status = resolveControlCenterStatus(input);
    assert.equal(status.dataSnapshots.status, "PARTIAL");
    assert.equal(status.runtimeApi.status, "READY");
    assert.equal(status.overallStatus, "NOT_READY");
  });

  it("requires health, API connectivity, a configured mode and a valid same-origin response", () => {
    const inputs = [
      Object.assign(baseInput(), { runtime: { ...baseInput().runtime, healthAvailable: false } }),
      Object.assign(baseInput(), { runtime: { ...baseInput().runtime, apiConnected: false } }),
      Object.assign(baseInput(), { runtime: { ...baseInput().runtime, runtimeMode: "UNCONFIGURED" as const } }),
      Object.assign(baseInput(), { runtime: { ...baseInput().runtime, sameOriginResponseValid: false } }),
    ];
    for (const input of inputs) {
      assert.equal(resolveControlCenterStatus(input).runtimeApi.status, "NOT_READY");
    }
  });

  it("labels readiness as data readiness and shows no runtime recovery step while runtime is healthy", () => {
    const input = baseInput();
    input.runtime.readiness = "degraded";
    input.scanner.freshness = "STALE";
    input.context.available = false;
    input.context.freshness = "UNAVAILABLE";
    const status = resolveControlCenterStatus(input);
    const english = renderControlCenter("en", status);
    const polish = renderControlCenter("pl", status);
    assert.match(english, /Data readiness/);
    assert.match(polish, /Gotowość danych/);
    assert.doesNotMatch(english, /Restore a valid local runtime and readiness response/);
    assert.doesNotMatch(polish, /Przywróć prawidłowy lokalny runtime i odpowiedź readiness/);
  });

  it("maps partial source health to PARTIAL", () => {
    const input = baseInput();
    input.sources.availability = "partial";
    input.sources.affectedSourceIds = ["dexscreener"];
    assert.equal(resolveControlCenterStatus(input).sources.status, "PARTIAL");
  });

  it("accepts a valid empty Established Universe", () => {
    const input = baseInput();
    input.establishedUniverse.entriesEnabled = 0;
    const universe = resolveControlCenterStatus(input).establishedUniverse;
    assert.equal(universe.validationStatus, "valid");
    assert.equal(universe.entriesEnabled, 0);
    assert.equal(universe.status, "READY");
  });

  it("never resolves inactive automation as READY", () => {
    const input = baseInput();
    input.automation.enabled = false;
    assert.equal(resolveControlCenterStatus(input).automation.status, "MANUAL_CHECK_REQUIRED");
  });

  it("keeps Reports Library and persistent feedback capture NOT_READY", () => {
    const status = resolveControlCenterStatus(baseInput());
    assert.equal(status.reports.libraryReady, false);
    assert.equal(status.reports.status, "NOT_READY");
    assert.equal(status.feedback.persistentCaptureReady, false);
    assert.equal(status.feedback.status, "NOT_READY");
  });

  it("uses canonical Reports Library status and treats an empty available library as READY", () => {
    const input = baseInput();
    input.reportsLibrary = {
      libraryAvailable: true,
      status: "READY",
      reportCount: 0,
      validReportCount: 0,
      skippedReportCount: 0,
      latestReportGeneratedAt: null,
    };
    const status = resolveControlCenterStatus(input);
    assert.equal(status.reports.status, "READY");
    assert.equal(status.reports.libraryReady, true);
    assert.equal(status.reports.validReportCount, 0);
    assert.equal(status.overallStatus, "NOT_READY");
    assert.equal(status.accessDeployment.externalTesterAccess, "NO_GO");
  });

  it("maps skipped report artifacts to PARTIAL without changing overall NO-GO", () => {
    const input = baseInput();
    input.reportsLibrary = {
      libraryAvailable: true,
      status: "PARTIAL",
      reportCount: 2,
      validReportCount: 1,
      skippedReportCount: 1,
      latestReportGeneratedAt: "2026-07-21T12:00:00.000Z",
    };
    const status = resolveControlCenterStatus(input);
    assert.equal(status.reports.status, "PARTIAL");
    assert.equal(status.reports.skippedReportCount, 1);
    assert.equal(status.overallStatus, "NOT_READY");
  });

  it("keeps EN and PL presentation semantically identical", () => {
    const status = resolveControlCenterStatus(baseInput());
    const english = renderControlCenter("en", status);
    const polish = renderControlCenter("pl", status);
    assert.match(english, /Trusted tester preview/);
    assert.match(english, /Not ready/);
    assert.match(english, /read-only Reports Library uses the canonical local report index\./);
    assert.match(polish, /Podgląd dla zaufanego testera/);
    assert.match(polish, /Niegotowe/);
    assert.match(polish, /Biblioteka raportów wyłącznie do odczytu korzysta z kanonicznego lokalnego indeksu raportów\./);
    assert.equal(countStatusCards(english), countStatusCards(polish));
    assert.equal(status.overallStatus, "NOT_READY");
  });

  it("renders no mutating Control Center actions", () => {
    const markup = renderControlCenter("en", resolveControlCenterStatus(baseInput()));
    assert.doesNotMatch(markup, /<button\b/i);
    for (const label of ["Run collector", "Add token", "Apply", "Execute"]) {
      assert.equal(markup.includes(label), false, label);
    }
  });
});

describe("Control Center read-only API", () => {
  it("serves 100 concurrent reads with zero provider calls and no state changes", async () => {
    const scannerFixture = resolve(uiRoot, "public", "fixtures", "persistableScannerSample.json");
    const contextFixture = resolve(uiRoot, "public", "fixtures", "contextLatestFixture.json");
    const missingOutput = resolve(uiRoot, `.missing-control-center-${crypto.randomUUID()}`);
    const universeTemplate = await readFile(
      resolve(repoRoot, "config", "established_address_universe_v1.json"),
      "utf8",
    );
    const automationState = {
      schema_version: "central_automation_state_v1",
      active_run_id: null,
      last_result: "SUCCESS",
      last_attempt_at: "2026-07-21T12:00:00.000Z",
      next_scanner_run_at: "2026-07-21T12:16:00.000Z",
      next_alternative_me_run_at: "2026-07-21T18:00:00.000Z",
      next_defillama_run_at: "2026-07-21T14:00:00.000Z",
      request_counts: { dexscreener: 4, goplus_security: 0 },
      last_decision: "NOTHING_DUE",
      pid: 4312,
      storage_path: "C:\\private\\automation.json",
      secret: "must-not-leak",
    };
    const reviewState = {
      version: 1 as const,
      entries: {},
    };
    const before = JSON.stringify({ automationState, reviewState, universeTemplate });
    let automationReads = 0;
    let universeReads = 0;
    let reviewReads = 0;
    let reviewWrites = 0;
    let providerCalls = 0;
    const reviewProvider: ReviewSessionStorageProvider = {
      read: async () => {
        reviewReads += 1;
        return {
          state: reviewState,
          _source_meta: {
            source_kind: "file-backed-review-session",
            storage_file: "C:\\private\\review-session.json",
            loaded_at: "2026-07-21T12:00:00.000Z",
          },
        };
      },
      write: async () => {
        reviewWrites += 1;
        throw new Error("write must not be called");
      },
      diagnostics: async () => ({
        source_kind: "file-backed-review-session-diagnostics",
        storage_file: "C:\\private\\review-session.json",
        checked_at: "2026-07-21T12:00:00.000Z",
        file_exists: false,
        file_size_bytes: null,
        entries_count: 0,
        valid: true,
      }),
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      providerCalls += 1;
      throw new Error("provider calls are forbidden");
    }) as typeof fetch;
    const server = createScannerApiServer({
      runtimeMode: "DEVELOPMENT_DEMO",
      scanner: { outputDirPath: missingOutput, fixturePath: scannerFixture, now: new Date("2026-07-21T12:00:00.000Z") },
      context: { outputDirPath: missingOutput, fixturePath: contextFixture, now: new Date("2026-07-21T12:00:00.000Z") },
      automation: {
        enabled: false,
        readState: async () => {
          automationReads += 1;
          return automationState;
        },
      },
      establishedUniverse: {
        readText: async () => {
          universeReads += 1;
          return universeTemplate;
        },
      },
      reviewSessionProvider: reviewProvider,
      health: { buildSha: "control-center-test" },
    });
    await listen(server);
    try {
      const responses = await Promise.all(Array.from({ length: 100 }, () => (
        requestRaw(server, "GET", "/api/control-center/status")
      )));
      assert.equal(responses.every((response) => response.status === 200), true);
      for (const response of responses) {
        const body = JSON.parse(response.body) as Record<string, unknown>;
        assert.equal(body.overallStatus, "NOT_READY");
        for (const forbidden of ["storage_file", "storage_path", "pid", "secret", "C:\\private", "lock"]) {
          assert.equal(response.body.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
      await close(server);
    }
    assert.equal(automationReads, 100);
    assert.equal(universeReads, 100);
    assert.equal(reviewReads, 100);
    assert.equal(reviewWrites, 0);
    assert.equal(providerCalls, 0);
    assert.equal(JSON.stringify({ automationState, reviewState, universeTemplate }), before);
  });

  it("exposes no mutating Control Center endpoint", async () => {
    const server = createScannerApiServer({ runtimeMode: "DEVELOPMENT_DEMO" });
    await listen(server);
    try {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const response = await requestRaw(server, method, "/api/control-center/status");
        assert.equal(response.status, 404, method);
      }
    } finally {
      await close(server);
    }
  });

  it("keeps the endpoint in the shared handler and refresh limited to GET", async () => {
    const handler = await readFile(resolve(uiRoot, "server", "scannerApiHandler.ts"), "utf8");
    const dataSource = await readFile(resolve(uiRoot, "src", "services", "controlCenterStatusDataSource.ts"), "utf8");
    assert.match(handler, /req\.method === "GET" && path === "\/api\/control-center\/status"/);
    assert.match(dataSource, /method:\s*"GET"/);
    assert.doesNotMatch(dataSource, /POST|PUT|PATCH|DELETE|collector|provider/i);
  });
});

function baseInput(): ControlCenterReadinessInput {
  return {
    runtime: {
      runtimeMode: "INTERNAL_BETA",
      healthAvailable: true,
      apiConnected: true,
      sameOriginResponseValid: true,
      readiness: "ready",
      buildSha: "3f20dc8",
    },
    scanner: {
      available: true,
      generatedAt: "2026-07-21T12:00:00.000Z",
      freshness: "FRESH",
      lastKnownGood: true,
      newObservationCount: 4,
      establishedAfterFilters: 0,
    },
    context: {
      available: true,
      generatedAt: "2026-07-21T11:55:00.000Z",
      freshness: "FRESH",
      lastKnownGood: true,
    },
    sources: {
      availability: "available",
      sourceIds: ["dexscreener", "alternative_me_fng", "defillama_api"],
      affectedSourceIds: [],
    },
    automation: {
      enabled: true,
      active: false,
      stateAvailable: true,
      lastRunAt: "2026-07-21T12:00:00.000Z",
      lastResult: "SUCCESS",
      nextRunAt: "2026-07-21T12:16:00.000Z",
      nextDueAfterActivation: "2026-07-21T12:16:00.000Z",
    },
    establishedUniverse: {
      validationStatus: "valid",
      universeVersion: "established-universe-v000001",
      entriesEnabled: 0,
      lastChangeAt: "2026-07-21T10:00:00.000Z",
    },
    reviewStorage: {
      available: true,
      entriesCount: 0,
      lastSavedAt: null,
    },
    reportsLibrary: {
      libraryAvailable: false,
      status: "NOT_READY",
      reportCount: 0,
      validReportCount: 0,
      skippedReportCount: 0,
      latestReportGeneratedAt: null,
    },
    gates: {
      feedbackCaptureReady: false,
      trustedTesterPreviewModeReady: false,
      vpsDeploymentConfirmed: false,
      cloudflareAccessVerified: false,
      rollbackTested: false,
      ownerApproved: false,
    },
  };
}

function renderControlCenter(locale: "en" | "pl", status: ReturnType<typeof resolveControlCenterStatus>): string {
  return renderToStaticMarkup(React.createElement(
    ProductLocaleProvider,
    { initialLocale: locale },
    React.createElement(ProductControlCenter, { status }),
  ));
}

function countStatusCards(markup: string): number {
  return (markup.match(/product-control-card/g) ?? []).length;
}

function listen(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
}

function close(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

function requestRaw(
  server: ReturnType<typeof createScannerApiServer>,
  method: string,
  path: string,
): Promise<{ status: number; body: string }> {
  const port = (server.address() as AddressInfo).port;
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request({ hostname: "127.0.0.1", port, method, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolveRequest({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.once("error", rejectRequest);
    req.end();
  });
}
