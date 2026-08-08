import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import React from "react";
import TestRenderer from "react-test-renderer";
import { applySystemLifecycle, evaluateFollowUpToMainRadar, type LifecycleConditions } from "../../data-poc/src/systemLifecycle.js";
import { findLatestManualVerification, readFollowUpStore } from "../../data-poc/src/followUpBasket.js";
import type { PersistableCandidate, PersistableScannerOutput } from "../../data-poc/src/persistableScannerModel.js";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import { createUserWorkspaceRepository, UserWorkspaceError } from "../server/userWorkspaceRepository.js";
import { ProductAppContent, type ProductAppDataSources } from "../src/ProductApp.js";
import { CandidateResultsView } from "../src/components/CandidateResultsView.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import type { LifecycleRadarCard, LifecycleRadarView } from "../src/types/lifecycleTypes.js";
import type { UiTokenCandidate } from "../src/types/scannerTypes.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const IDENTITY = `base:${ADDRESS}`;
const roots: string[] = [];
const MET: LifecycleConditions = { conditions_met: ["IDENTITY_VALID"], conditions_unmet: [], missing_data: [], risks: [], readiness: "CONDITIONS_MET", security_state: "CHECKED", verification_state: "VERIFIED" };
const UNMET: LifecycleConditions = { conditions_met: ["IDENTITY_VALID"], conditions_unmet: ["PROMOTION_RESOLVER_READY"], missing_data: ["FOLLOW_UP_CHECK"], risks: [], readiness: "CONDITIONS_UNMET", security_state: "NOT_CHECKED", verification_state: "VERIFICATION_REQUIRED" };
const { act, create } = TestRenderer;

void React;

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("PC.1 private workspace repository", () => {
  it("keeps private forward decisions separate per server actor, with an auditable override", async () => {
    const repository = await workspace();
    const first = repository.transition({ actorId: "camp-user-one", identity: IDENTITY, previousPrivateStatus: "NEW", newPrivateStatus: "FOLLOW_UP", systemStatus: "NEW", conditions: UNMET, overrideReason: "I want to monitor this earlier", sessionReference: "session-one" });
    assert.match(first.session_reference, /^sha256:/);
    assert.equal(repository.get("camp-user-two", IDENTITY), null);
    const second = repository.transition({ actorId: "camp-user-one", identity: IDENTITY, previousPrivateStatus: "FOLLOW_UP", newPrivateStatus: "MAIN_RADAR", systemStatus: "FOLLOW_UP", conditions: MET, overrideReason: null, sessionReference: "session-one" });
    assert.equal(second.new_private_status, "MAIN_RADAR");
    assert.equal(repository.integrity().audits, 2);
    repository.close();
  });

  it("requires an override reason only when conditions are unmet and rejects invalid, duplicate, and backward writes", async () => {
    const repository = await workspace();
    const base = { actorId: "camp-user-one", identity: IDENTITY, previousPrivateStatus: "NEW" as const, newPrivateStatus: "FOLLOW_UP" as const, systemStatus: "NEW" as const, sessionReference: "session-one" };
    assert.throws(() => repository.transition({ ...base, conditions: UNMET, overrideReason: null }), (error: unknown) => error instanceof UserWorkspaceError && error.code === "WORKSPACE_OVERRIDE_REASON_REQUIRED");
    assert.throws(() => repository.transition({ ...base, identity: "base:not-an-address", conditions: MET, overrideReason: null }), UserWorkspaceError);
    repository.transition({ ...base, conditions: MET, overrideReason: null });
    assert.throws(() => repository.transition({ ...base, conditions: MET, overrideReason: null }), (error: unknown) => error instanceof UserWorkspaceError && error.code === "WORKSPACE_DUPLICATE");
    repository.close();
  });
});

describe("PC.1 bounded lifecycle Radar API", () => {
  it("derives actors only from sessions, keeps trusted tester read-only, and bounds public Radar reads", async () => {
    const database = resolve(await root(), "workspace.sqlite");
    const repository = await createUserWorkspaceRepository({ databaseFilePath: database });
    const server = createScannerApiServer({ runtimeMode: "DEVELOPMENT_DEMO", lifecycle: { workspace: repository } });
    await listen(server);
    try {
      const trusted = await requestApi(server, "GET", `/api/lifecycle/token?chain=base&contract_address=${ADDRESS}`);
      assert.deepEqual((JSON.parse(trusted.body) as { actor: { capabilities: string[] } }).actor.capabilities, []);
      const radar = await requestApi(server, "GET", "/api/lifecycle/radar?limit=24");
      const radarBody = JSON.parse(radar.body) as { schema_version: string; new_inbox: { cards: unknown[]; limit: number }; follow_up: { action_due: { cards: unknown[] } } };
      assert.equal(radar.status, 200, radar.body);
      assert.equal(radarBody.schema_version, "lifecycle_radar_view_v1");
      assert.equal(radarBody.new_inbox.limit, 24);
      assert.equal(Array.isArray(radarBody.follow_up.action_due.cards), true);
      assert.equal((await requestApi(server, "GET", "/api/lifecycle/radar?limit=101")).status, 400);
      assert.equal((await requestApi(server, "GET", "/api/lifecycle/radar?cursor=not-a-valid-cursor")).status, 400);
      assert.equal((await requestApi(server, "GET", "/api/lifecycle/new-inbox")).status, 403);
      assert.equal((await requestApi(server, "GET", "/api/lifecycle/workspace/integrity")).status, 403);
      const camp = await requestApi(server, "POST", "/api/lifecycle/review-session/camp-user");
      const rejected = await requestApi(server, "POST", "/api/lifecycle/token/status", { cookie: cookie(camp), "content-type": "application/json" }, JSON.stringify({ chain: "base", contract_address: ADDRESS, target_status: "FOLLOW_UP", override_reason: "reason", confirmation: true, user_id: "attacker" }));
      assert.equal(rejected.status, 400);
    } finally { await close(server); repository.close(); }
  });

  it("uses a server-created CAMP actor without exposing another actor's private state", async () => {
    const database = resolve(await root(), "workspace.sqlite");
    const repository = await createUserWorkspaceRepository({ databaseFilePath: database });
    const server = createScannerApiServer({ runtimeMode: "DEVELOPMENT_DEMO", lifecycle: { workspace: repository } });
    await listen(server);
    try {
      const first = await requestApi(server, "POST", "/api/lifecycle/review-session/camp-user");
      const moved = await requestApi(server, "POST", "/api/lifecycle/token/status", { cookie: cookie(first), "content-type": "application/json" }, JSON.stringify({ chain: "base", contract_address: ADDRESS, target_status: "FOLLOW_UP", override_reason: "early private review", confirmation: true }));
      assert.equal(moved.status, 200, moved.body);
      const second = await requestApi(server, "POST", "/api/lifecycle/review-session/camp-user");
      const view = await requestApi(server, "GET", `/api/lifecycle/token?chain=base&contract_address=${ADDRESS}`, { cookie: cookie(second) });
      const body = JSON.parse(view.body) as { user_status: string; user_status_is_override: boolean };
      assert.equal(body.user_status, "NEW");
      assert.equal(body.user_status_is_override, false);
    } finally { await close(server); repository.close(); }
  });

  it("returns identical Follow-up conditions in Candidate Detail, Radar, and the system resolver", async () => {
    const base = await root();
    const paths = {
      inbox: resolve(base, "lifecycle", "new-inbox.json"),
      audit: resolve(base, "lifecycle", "audit.json"),
      receipt: resolve(base, "lifecycle", "cycle-receipts.json"),
      followUp: resolve(base, "follow-up", "store.json"),
      established: resolve(base, "established", "store.json"),
      output: resolve(base, "output"),
    };
    const snapshot = lifecycleConditionsSnapshot();
    const centralCycleId = "cycle_conditions";
    const run = await applySystemLifecycle(snapshot, {
      newInboxStorePath: paths.inbox,
      auditStorePath: paths.audit,
      cycleReceiptPath: paths.receipt,
      followUpStorePath: paths.followUp,
      establishedStorePath: paths.established,
      centralCycleId,
      contextRunId: "context_conditions",
      now: new Date("2026-08-04T10:00:00.000Z"),
    });
    const followUp = await readFollowUpStore(paths.followUp);
    const entry = followUp.entries[0]!;
    await mkdir(resolve(paths.output, snapshot.scan_run.run_id), { recursive: true });
    await writeFile(resolve(paths.output, snapshot.scan_run.run_id, "full_output.json"), `${JSON.stringify(snapshot)}\n`, "utf8");
    const repository = await createUserWorkspaceRepository({ databaseFilePath: resolve(base, "workspace.sqlite") });
    const serviceOptions = {
      runtimeMode: "DEVELOPMENT_DEMO" as const,
      scanner: { outputDirPath: paths.output, allowFixtureFallback: false, now: new Date("2026-08-04T10:01:00.000Z") },
      followUp: { storePath: paths.followUp },
      establishedUniverse: { storeFilePath: paths.established },
      lifecycle: { newInboxStorePath: paths.inbox, auditStorePath: paths.audit, cycleReceiptPath: paths.receipt, workspace: repository },
    };
    const server = createScannerApiServer(serviceOptions);
    await listen(server);
    try {
      const tokenResponse = await requestApi(server, "GET", `/api/lifecycle/token?chain=base&contract_address=${ADDRESS}`);
      const radarResponse = await requestApi(server, "GET", "/api/lifecycle/radar?limit=24");
      assert.equal(tokenResponse.status, 200, tokenResponse.body);
      assert.equal(radarResponse.status, 200, radarResponse.body);
      const detail = JSON.parse(tokenResponse.body) as { conditions: LifecycleConditions };
      const radar = JSON.parse(radarResponse.body) as { follow_up: {
        action_due: { cards: Array<{ conditions: LifecycleConditions }> };
        candidates_ready: { cards: Array<{ conditions: LifecycleConditions }> };
        observed: { cards: Array<{ conditions: LifecycleConditions }> };
      } };
      const expected = evaluateFollowUpToMainRadar(entry, {
        lastCompletedCentralCycleId: run.lifecycle_receipt.central_cycle_id,
        currentScannerRunId: snapshot.scan_run.run_id,
        evaluatedAt: new Date("2026-08-04T10:01:00.000Z"),
        latestManualVerification: findLatestManualVerification(followUp, entry.chain, entry.contract_address),
        establishedMembership: false,
        universeValid: true,
      });
      const radarCard = [
        ...radar.follow_up.action_due.cards,
        ...radar.follow_up.candidates_ready.cards,
        ...radar.follow_up.observed.cards,
      ][0];
      assert.deepEqual(detail.conditions, expected);
      assert.deepEqual(radarCard?.conditions, expected);
      assert.equal(expected.readiness, "CONDITIONS_UNMET");
      assert.equal(expected.conditions_unmet.includes("FRESH_FOLLOW_UP_DATA_CURRENT_CYCLE"), true);
    } finally {
      await close(server);
      repository.close();
    }
  });

  it("uses one canonical Radar request for up to 100 cards and keeps private UI compact and localized", async () => {
    const source = await readFile(resolve(import.meta.dirname, "..", "src", "services", "lifecycleDataSource.ts"), "utf8");
    const component = await readFile(resolve(import.meta.dirname, "..", "src", "components", "PersonalRadarPanel.tsx"), "utf8");
    const results = await readFile(resolve(import.meta.dirname, "..", "src", "components", "CandidateResultsView.tsx"), "utf8");
    const app = await readFile(resolve(import.meta.dirname, "..", "src", "ProductApp.tsx"), "utf8");
    const presentation = await readFile(resolve(import.meta.dirname, "..", "src", "lifecyclePresentation.ts"), "utf8");
    assert.match(source, /\/api\/lifecycle\/radar\?limit=24/);
    assert.match(component, /initialView/);
    assert.match(component, /personal-radar-inline/);
    assert.doesNotMatch(results, /data-pc1-review-switch="global"/);
    assert.equal((app.match(/data-pc1-review-switch="global"/g) ?? []).length, 1);
    assert.match(app, /isReviewMode\(\)/);
    assert.match(presentation, /Status systemowy/);
    assert.match(presentation, /System status/);
    assert.doesNotMatch(component, /conditions_met\.join/);
  });

  it("loads exactly one lifecycle Radar request on entry and never falls back to per-card requests", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    Object.defineProperty(globalThis, "window", { configurable: true, value: productWindow() });
    const radar = lifecycleRadar(100);
    const dataSources = {
      loadScanner: async () => ({ status: "error", source: "api", resolvedSource: "unavailable", usedFallback: false, reasonCode: "SCANNER_OUTPUT_UNAVAILABLE", error: "unavailable", output: null }),
      loadReadiness: async () => ({ status: "unavailable", reasonCode: "SCANNER_OUTPUT_UNAVAILABLE" }),
      loadAutomation: async () => null,
      loadEstablishedUniverse: async () => null,
      loadControlCenter: async () => null,
      loadFollowUpStatus: async () => { await fetch("/api/follow-up/status"); return null; },
      loadFollowUpList: async () => { await fetch("/api/follow-up/list"); return null; },
      loadLifecycleRadar: async () => { await fetch("/api/lifecycle/radar?limit=24"); return radar; },
      now: () => "2026-08-04T10:00:00.000Z",
    } as ProductAppDataSources;
    let renderer: ReturnType<typeof create> | undefined;
    try {
      await act(async () => {
        renderer = create(React.createElement(ProductLocaleProvider, { initialLocale: "en" }, React.createElement(ProductAppContent, { dataSources, runtimeModeOverride: "INTERNAL_BETA" })));
        await flush();
      });
      assert.deepEqual(calls.filter((url) => url.startsWith("/api/lifecycle/radar")), ["/api/lifecycle/radar?limit=24"]);
      assert.equal(calls.filter((url) => url.includes("/api/lifecycle/summary")).length, 0);
      assert.equal(calls.filter((url) => url.includes("/api/follow-up/list")).length, 0);
      assert.equal(calls.filter((url) => url.includes("/api/lifecycle/token")).length, 0);
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      globalThis.fetch = originalFetch;
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("renders a 100-card lifecycle fallback without lifecycle token requests", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch;
    let renderer: ReturnType<typeof create> | undefined;
    try {
      await act(async () => {
        renderer = create(React.createElement(ProductLocaleProvider, { initialLocale: "en" }, React.createElement(CandidateResultsView, { candidates: Array.from({ length: 100 }, (_, index) => fallbackCandidate(index)), lifecycleRadar: null })));
        await flush();
      });
      assert.equal(calls.filter((url) => url.includes("/api/lifecycle/token")).length, 0);
      assert.equal(renderer!.root.findAll((node) => typeof node.props.className === "string" && node.props.className.includes("personal-radar-unavailable")).length, 1);
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps durable New cards visible under a scanner warning and localizes lifecycle KPI labels", async () => {
    let renderer: ReturnType<typeof create> | undefined;
    try {
      await act(async () => {
        renderer = create(React.createElement(ProductLocaleProvider, { initialLocale: "en" }, React.createElement(CandidateResultsView, { candidates: [], lifecycleRadar: lifecycleRadar(1), scannerUnavailableReasonCode: "SCANNER_OUTPUT_UNAVAILABLE" })));
        await flush();
      });
      const markup = JSON.stringify(renderer!.toJSON());
      assert.match(markup, /Durable lifecycle records remain visible/);
      assert.match(markup, /Token 0/);
      assert.match(markup, /Action due now/);
      assert.doesNotMatch(markup, /Do działania teraz|Łącznie obserwowane|Wyświetlane teraz/);
    } finally {
      renderer?.unmount();
    }
  });

  it("keeps the review launcher isolated, bounded to active snapshots, and fail-closed before runtime start", async () => {
    const launcher = await readFile(resolve(import.meta.dirname, "..", "..", "..", "scripts", "win", "start-pc1-lifecycle-radar-review.cmd"), "utf8");
    const bootstrap = await readFile(resolve(import.meta.dirname, "..", "..", "data-poc", "src", "bootstrapPc1LifecycleReview.ts"), "utf8");
    const radar = await readFile(resolve(import.meta.dirname, "..", "src", "components", "CandidateResultsView.tsx"), "utf8");
    const detail = await readFile(resolve(import.meta.dirname, "..", "src", "components", "CandidateDetailView.tsx"), "utf8");
    const personalRadar = await readFile(resolve(import.meta.dirname, "..", "src", "components", "PersonalRadarPanel.tsx"), "utf8");
    const productApp = await readFile(resolve(import.meta.dirname, "..", "src", "ProductApp.tsx"), "utf8");
    const styles = await readFile(resolve(import.meta.dirname, "..", "src", "index.css"), "utf8");
    assert.match(launcher, /build:internal-beta/);
    assert.match(launcher, /crypto-edge-pc1-review-/);
    assert.match(launcher, /netstat -ano/);
    assert.match(launcher, /Port %%P/);
    assert.match(launcher, /Port %%P jest już zajęty/);
    assert.match(launcher, /ALLOW_LIVE_PROVIDER_CALLS=0/);
    assert.match(launcher, /preparePc1LifecycleReview\.ts/);
    assert.match(launcher, /bootstrapPc1LifecycleReview\.ts/);
    assert.equal((launcher.match(/call "%UI_DIR%\\node_modules\\\.bin\\tsx\.cmd" "%DATA_POC_DIR%\\src\\(?:preparePc1LifecycleReview|bootstrapPc1LifecycleReview)\.ts"/g) ?? []).length, 2);
    assert.doesNotMatch(launcher, /pnpm\s+--dir\s+"%DATA_POC_DIR%"\s+exec\s+tsx/i);
    assert.doesNotMatch(launcher, /xcopy\s+\/E/i);
    assert.match(launcher, /ERROR: PC\.1 isolated review bootstrap failed\./);
    assert.equal((launcher.match(/if errorlevel 1 goto :bootstrap_failed/g) ?? []).length, 2);
    assert.equal(launcher.indexOf("if errorlevel 1 goto :bootstrap_failed") < launcher.indexOf("start \"Crypto Edge PC.1 Scanner API\""), true);
    assert.match(launcher, /CRYPTO_EDGE_LIFECYCLE_CYCLE_RECEIPT_PATH/);
    assert.match(launcher, /set "OPENAI_API_KEY="/);
    assert.match(launcher, /Honeypot\.is calls: 0/);
    assert.equal((launcher.match(/start "" "http:\/\/127\.0\.0\.1:%UI_PORT%\//g) ?? []).length, 1);
    assert.doesNotMatch(launcher, /runInternalBetaCollector|curl |Invoke-WebRequest/i);
    assert.doesNotMatch(launcher, /\.local\\lifecycle\\new-inbox\.json" "%REVIEW_DATA_POC%/);
    assert.doesNotMatch(bootstrap, /readdir\(/);
    assert.match(bootstrap, /PC1_REVIEW_ACTIVE_SCANNER_RUN_REQUIRED/);
    assert.match(bootstrap, /validateDisplayEligibleScannerSnapshot/);
    assert.doesNotMatch(bootstrap, /validatePersistableScannerOutput/);
    assert.match(bootstrap, /PC1_REVIEW_SCANNER_FILE_MISSING/);
    assert.match(bootstrap, /PC1_REVIEW_SCANNER_JSON_INVALID/);
    assert.match(bootstrap, /PC1_REVIEW_SCANNER_SCHEMA_INVALID/);
    assert.match(bootstrap, /PC1_REVIEW_SCANNER_RUN_ID_MISMATCH/);
    assert.match(bootstrap, /PC1_REVIEW_SCANNER_NOT_DISPLAY_ELIGIBLE/);
    assert.match(bootstrap, /Active scanner run:/);
    assert.match(bootstrap, /Validation: \$\{status\}/);
    assert.match(bootstrap, /Reason: \$\{reason\}/);
    assert.match(detail, /<\/header>\s*<TokenDetailTabs[\s\S]*?<TokenDetailTabPanel/);
    assert.doesNotMatch(detail, /<\/header>\s*<PersonalRadarPanel/);
    assert.match(detail, /PersonalRadarPanel[^>]+placement="detail"/);
    assert.match(radar, /product-radar-intro/);
    assert.match(radar, /product-summary-grid primary/);
    assert.match(radar, /radar-lifecycle-guide/);
    assert.match(radar, /basket-switcher/);
    assert.match(radar, /product-candidate-card observation token-card-compact lifecycle-radar-card/);
    assert.match(radar, /product-candidate-topline/);
    assert.match(radar, /product-metrics-grid/);
    assert.match(radar, /candidate-explanation-grid/);
    assert.doesNotMatch(radar, /personal-radar-review-switch/);
    assert.match(personalRadar, /data-personal-radar="inline"/);
    assert.doesNotMatch(personalRadar, /personal-radar-panel/);
    assert.match(personalRadar, /TechnicalDetails label=\{copy\.confirmAction\}/);
    assert.match(productApp, /isReviewMode\(\).*LifecycleReviewSwitch/);
    assert.match(productApp, /data-pc1-review-switch="global"/);
    assert.match(styles, /\.personal-radar-inline\.card \{ grid-column: 1 \/ -1; \}/);
    assert.match(styles, /\.personal-radar-review-switch \{\s*position: fixed;/);
  });
});

async function workspace() { return createUserWorkspaceRepository({ databaseFilePath: resolve(await root(), "workspace.sqlite") }); }
async function root(): Promise<string> { const path = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-workspace-")); roots.push(path); return path; }
function listen(server: Server): Promise<void> { return new Promise((done) => server.listen(0, "127.0.0.1", () => done())); }
function close(server: Server): Promise<void> { return new Promise((done, reject) => server.close((error) => error ? reject(error) : done())); }
function requestApi(server: Server, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const port = (server.address() as AddressInfo).port;
  return new Promise((done, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers }, (res) => { let response = ""; res.setEncoding("utf8"); res.on("data", (chunk: string) => { response += chunk; }); res.on("end", () => done({ status: res.statusCode ?? 0, body: response, headers: res.headers })); });
    req.on("error", reject); if (body) req.write(body); req.end();
  });
}
function cookie(response: { headers: Record<string, string | string[] | undefined> }): string { const value = response.headers["set-cookie"]; const header = Array.isArray(value) ? value[0] : value; assert.ok(header); return header.split(";", 1)[0]!; }

function lifecycleConditionsSnapshot(): PersistableScannerOutput {
  const timestamp = "2026-08-04T10:00:00.000Z";
  const runId = "scan_20260804100000";
  const candidate: PersistableCandidate = {
    run_id: runId,
    candidate_id: "candidate_conditions",
    symbol: "PC1",
    name: "PC1 Conditions",
    chain: "base",
    contract_address: ADDRESS,
    pair_address: "0x2222222222222222222222222222222222222222",
    dex: "uniswap",
    source: "dexscreener",
    source_url: "https://example.invalid/pc1",
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
    created_at: timestamp,
    discovery_basket: "new_emerging",
    observation_only: true,
  };
  return {
    provenance: {
      schema_version: "scanner_snapshot_v2",
      contract_version: "real_data_boundary_v1",
      generator_version: "pc1-test",
      environment: "INTERNAL_BETA",
      mode: "live",
      fixture_used: false,
      run_id: runId,
      generated_at: timestamp,
      finished_at: timestamp,
      source_ids: ["dexscreener"],
      policy_decisions: {},
    },
    scan_run: { run_id: runId, source: "combined-scanner-poc", mode: "live", query: "pc1-test", filters: {}, limits: {}, started_at: timestamp, finished_at: timestamp, total_raw: 1, passed_basic_filter: 1, rejected_basic_filter: 0, security_checked: 0, security_passed: 0, needs_manual_verification: 0, critical_risk: 0, watchlist_candidates: 1, errors: [] },
    candidates: [candidate],
    security_checks: [],
    scorecards: [],
  };
}

function lifecycleRadar(count: number): LifecycleRadarView {
  const cards = Array.from({ length: count }, (_, index) => lifecycleCard(index));
  return {
    schema_version: "lifecycle_radar_view_v1",
    actor: { role: "TRUSTED_TESTER", capabilities: [] },
    summary: { schema_version: "lifecycle_summary_v1", system_new_total: count, system_follow_up_total: 0, system_main_radar_total: 0, follow_up_action_due: 0, follow_up_candidates_ready: 0, follow_up_displayed: 0, follow_up_store_version: "sha256:test", last_lifecycle_change_at: null, last_central_cycle_id: "cycle_test", summary_as_of: "2026-08-04T10:00:00.000Z", last_completed_cycle_id: "cycle_test", last_completed_cycle_at: "2026-08-04T10:00:00.000Z", delta_source: "CENTRAL_CYCLE", last_change_summary: { added: count, updated: 0, promoted_to_follow_up: 0, promoted_to_main_radar: 0, archived: 0, rejected: 0, duplicate_noop: 0 } },
    new_inbox: { total: count, displayed: count, limit: 100, next_cursor: null, cards },
    follow_up: { action_due: { total: 0, displayed: 0, limit: 100, next_cursor: null, cards: [] }, candidates_ready: { total: 0, displayed: 0, limit: 100, next_cursor: null, cards: [] }, observed: { total: 0, displayed: 0, limit: 100, next_cursor: null, cards: [] } },
    main_radar: { total: 0 },
  };
}

function lifecycleCard(index: number): LifecycleRadarCard {
  const contract = `0x${index.toString(16).padStart(40, "0")}`;
  return { identity: `base:${contract}`, chain: "base", contract_address: contract, display_name: `Token ${index}`, symbol: `T${index}`, first_seen_at: "2026-08-04T10:00:00.000Z", last_seen_at: "2026-08-04T10:00:00.000Z", snapshot_present: true, snapshot_absence_notice: false, market: null, follow_up: null, system_status: "NEW", user_status: "NEW", user_status_is_override: false, conditions: MET, actor: { role: "TRUSTED_TESTER", capabilities: [] } };
}

function fallbackCandidate(index: number): UiTokenCandidate {
  const contract = `0x${index.toString(16).padStart(40, "0")}`;
  return {
    id: `fallback-${index}`, chain: "base", contractAddress: contract, pairAddress: contract, symbol: `F${index}`, name: `Fallback ${index}`, dex: "uniswap", source: "dexscreener", sourceUrl: "https://example.invalid", discoveryBasket: "new_emerging", discoveryMethod: "dexscreener_latest_token_profiles", observationOnly: true, establishedEligible: false, addressIdentityVerified: true, priceUsd: null, marketCap: null, fdvUsd: null, liquidity: null, volume24h: null, volumeMarketCapRatio: null, pairAgeDays: null, pairCreatedAt: null, basicFilterStatus: "rejected_basic_filter", filterReasons: [], security: null, riskFlags: [], missingData: [], finalLabel: "WATCHLIST", finalReasons: [], lastCheckedAt: "2026-08-04T10:00:00.000Z", runId: "scan_test", createdAt: "2026-08-04T10:00:00.000Z", universeVersion: null,
  } as UiTokenCandidate;
}

function productWindow() {
  const location = { href: "http://127.0.0.1:5173/#candidate-results", hash: "#candidate-results", search: "" };
  return { location, history: { pushState: () => undefined }, localStorage: { getItem: () => null, setItem: () => undefined }, addEventListener: () => undefined, removeEventListener: () => undefined, setTimeout, clearTimeout };
}

async function flush(): Promise<void> { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
