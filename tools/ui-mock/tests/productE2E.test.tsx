import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { after, before, describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  captureCanonicalProductState,
  PRODUCT_E2E_REPORT_SCHEMA_VERSION,
  PRODUCT_E2E_SCHEMA_VERSION,
  PRODUCT_E2E_VIEW_SEQUENCE,
  assertReadyAnalysisForProductReport,
  previewFullProductE2E,
  runFullProductE2E,
  selectRealProductE2EIdentity,
  type ProductE2EManifest,
  type ProductE2ERunResult,
} from "../server/productE2E.js";
import { createAIAnalysisQueueStore } from "../server/aiResearchQueueStore.js";
import { createFeedbackStore } from "../server/feedbackStore.js";
import { readFollowUpList, readFollowUpStatus } from "../server/followUpApi.js";
import { readLatestScannerOutput } from "../server/latestScannerOutput.js";
import {
  readReportDetail,
  readReportsLibraryStatus,
  readReportsList,
} from "../server/reportsLibrary.js";
import { readEstablishedUniverseStore } from "../../data-poc/src/establishedUniverseManager.js";
import { FOLLOW_UP_CHECKPOINT_DAYS, readFollowUpStore } from "../../data-poc/src/followUpBasket.js";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import {
  resolveDetailTab,
  resolveRouteTokenIdentity,
  writeCandidateDetailRoute,
} from "../src/candidateDetailRoute.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { CandidateResultsView } from "../src/components/CandidateResultsView.js";
import { AIResearchBriefCanvas } from "../src/components/AIResearchBriefCanvas.js";
import { Feedback } from "../src/components/Feedback.js";
import { ReportsLibrary } from "../src/components/ReportsLibrary.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import type { AIResearchBrief } from "../src/types/aiResearchTypes.js";
import type { ReportDetail } from "../src/types/reportTypes.js";
import type { ScannerApiOutput, UiTokenCandidate } from "../src/types/scannerTypes.js";

void React;

const execFileAsync = promisify(execFile);
const runId = "product-e2e-20260730T120000Z-deadbeef";
const testBase = resolve(tmpdir(), "crypto-edge-product-e2e-tests");
const isolatedRoot = resolve(testBase, runId);
const taskState = "TASK_SCHEDULER_TEST_STATE_UNCHANGED";
const dataOutput = resolve(import.meta.dirname, "..", "..", "data-poc", "output");
const launcherPath = resolve(import.meta.dirname, "..", "..", "..", "scripts", "win", "start-full-product-e2e-review.cmd");

let result: ProductE2ERunResult;
let manifest: ProductE2EManifest;
let stores: ProductE2EManifest["isolated_stores"];
let candidate: UiTokenCandidate;
let reportDetail: ReportDetail;
let readyBrief: AIResearchBrief;
let followUp = await readFollowUpList({ storePath: resolve(isolatedRoot, "missing.json") });
let followUpStatus = await readFollowUpStatus({ storePath: resolve(isolatedRoot, "missing.json") });

before(async () => {
  await rm(testBase, { recursive: true, force: true });
  result = await runFullProductE2E({
    runId,
    isolatedRoot,
    taskSchedulerStateReader: async () => taskState,
  });
  manifest = result.manifest;
  stores = result.isolatedStores;
  assert.equal(manifest.status, "PASS", JSON.stringify({
    errors: manifest.safe_error_codes,
    steps: manifest.steps,
  }, null, 2));
  const scanner = await readLatestScannerOutput({
    runtimeMode: "INTERNAL_BETA",
    outputDirPath: dataOutput,
    committedRunId: manifest.source_snapshot_id,
    now: new Date(manifest.started_at),
  });
  candidate = mapPersistableScannerOutputToUiCandidates(scanner as ScannerApiOutput)
    .find((value) => (
      value.chain === manifest.chain
      && value.contractAddress === manifest.contract_address
    ))!;
  assert.ok(candidate);

  const universe = await readEstablishedUniverseStore(stores.established);
  followUp = await readFollowUpList({
    storePath: stores.follow_up,
    establishedUniverse: universe.current,
  });
  followUpStatus = await readFollowUpStatus({
    storePath: stores.follow_up,
    establishedUniverse: universe.current,
  });

  const list = await readReportsList({ reportsRootPath: stores.reports });
  reportDetail = (await readReportDetail(list.reports[0]!.report_id, {
    reportsRootPath: stores.reports,
  }))!;
  assert.ok(reportDetail);

  const queue = await createAIAnalysisQueueStore({ databaseFilePath: stores.ai_queue });
  try {
    readyBrief = queue.findByAnalysisId(manifest.isolated_records.analysis_id!)!.result!;
  } finally {
    queue.close();
  }
});

after(async () => {
  await rm(testBase, { recursive: true, force: true });
});

describe("E2E.1 full product journey", () => {
  it("1. selects a real supported identity from the current snapshot", async () => {
    const selected = await selectRealProductE2EIdentity();
    assert.match(selected.sourceSnapshotId, /^scan_/);
    assert.ok(selected.identity.chain);
    assert.ok(selected.identity.contract_address);
    assert.notEqual(selected.candidate.symbol, "E2E");
  });

  it("2. renders New before isolated Follow-up", () => {
    const markup = renderLocale("pl", React.createElement(CandidateResultsView, {
      candidates: [candidate],
      followUpStatus: { ...followUpStatus, entries_total: 0, established_count: 0 },
      followUpEntries: [],
    }));
    assert.match(markup, /Radar|Nowe/);
    assert.match(markup, new RegExp(escapeRegExp(candidate.symbol)));
  });

  it("3. keeps Follow-up ingest idempotent", () => {
    assert.equal(manifest.idempotency.follow_up_records, 1);
    assert.equal(step("follow-up-idempotency").status, "PASS");
  });

  it("4. preserves checkpoints 1, 3, 7, 14 and 30", async () => {
    const store = await readFollowUpStore(stores.follow_up);
    assert.deepEqual(store.entries[0]?.completed_checkpoints, [...FOLLOW_UP_CHECKPOINT_DAYS]);
  });

  it("5. never auto-promotes before the owner decision", () => {
    assert.equal(step("owner-decision-required").status, "PASS");
    assert.equal(manifest.idempotency.established_versions_created, 1);
  });

  it("6. records one owner decision and isolated Established version", async () => {
    const universe = await readEstablishedUniverseStore(stores.established);
    assert.equal(manifest.owner_user_boundaries.owner_decision_recorded, true);
    assert.equal(universe.current.universe_version, manifest.isolated_records.established_universe_version);
    assert.equal(universe.audit_log[0]?.actor, "product-e2e-owner");
  });

  it("7. blocks ordinary-user promotion", () => {
    assert.equal(manifest.owner_user_boundaries.user_can_promote_established, false);
    assert.equal(step("user-owner-boundary").status, "PASS");
  });

  it("8. public AI POST only queues", () => {
    assert.equal(step("public-ai-post-queues-only").status, "PASS");
    assert.ok(manifest.isolated_records.analysis_id?.startsWith("air_"));
  });

  it("9. mock worker completes exactly one happy-path job", () => {
    assert.equal(manifest.happy_path_mock_provider_calls, 1);
    assert.deepEqual(manifest.ai_status_trace, ["QUEUED", "PROCESSING", "READY"]);
    assert.equal(step("owner-mock-worker").status, "PASS");
  });

  it("10. a second request shares the same AI status", () => {
    assert.equal(step("shared-ai-status").status, "PASS");
    assert.equal(manifest.idempotency.ai_queue_records, 1);
  });

  it("11. READY renders the complete AI Canvas", () => {
    const markup = renderLocale("pl", React.createElement(AIResearchBriefCanvas, {
      brief: readyBrief,
      symbol: candidate.symbol,
      name: candidate.name,
    }));
    assert.match(markup, /ai-research-canvas/);
    assert.match(markup, new RegExp(escapeRegExp(candidate.symbol)));
    assert.doesNotMatch(markup, /OpenAI|gpt-5-mini/i);
  });

  it("12. report keeps chain and contract identity", () => {
    assert.equal(reportDetail.chain, manifest.chain);
    assert.equal(reportDetail.contract_address, manifest.contract_address);
    assert.equal(reportDetail.analysis_id, manifest.isolated_records.analysis_id);
  });

  it("13. report contains no transaction recommendation", async () => {
    const source = await readFile(result.productReportPath!, "utf8");
    const parsed = JSON.parse(source) as { product_e2e: { transaction_signal: string; lifecycle_mutation: boolean } };
    assert.equal(parsed.product_e2e.transaction_signal, "NONE");
    assert.equal(parsed.product_e2e.lifecycle_mutation, false);
    assert.doesNotMatch(source, /"(?:BUY|SELL|HOLD)"/);
  });

  it("14. feedback is visible only in the isolated store", async () => {
    const store = await createFeedbackStore({ databaseFilePath: stores.feedback });
    try {
      const record = store.get(manifest.isolated_records.feedback_id!);
      assert.equal(store.health(true).total_count, 1);
      assert.equal(record?.candidate_identity?.chain, manifest.chain);
      assert.equal(record?.candidate_identity?.contract_address, manifest.contract_address);
      assert.equal(record?.pseudonymous_session_id.includes("@"), false);
    } finally {
      store.close();
    }
  });

  it("15. feedback changes no lifecycle artifact", () => {
    assert.equal(step("feedback").status, "PASS");
    assert.equal(followUp.entries[0]?.lifecycle_status, "ESTABLISHED");
    assert.equal(readyBrief.analysis_id, manifest.isolated_records.analysis_id);
    assert.equal(reportDetail.report_id, manifest.isolated_records.report_id);
  });

  it("16. routing preserves token and active detail tab", () => {
    const restore = installWindow(manifest.chain, manifest.contract_address, "summary");
    try {
      writeCandidateDetailRoute({
        chain: manifest.chain,
        contract_address: manifest.contract_address,
      }, "ai");
      assert.deepEqual(resolveRouteTokenIdentity(), {
        chain: manifest.chain,
        contract_address: manifest.contract_address,
      });
      assert.equal(resolveDetailTab(), "ai");
    } finally {
      restore();
    }
  });

  it("17. PL and EN render the same identity across detail views", () => {
    const pl = renderDetail("pl", "summary");
    const en = renderDetail("en", "observation");
    assert.match(pl, new RegExp(escapeRegExp(candidate.contractAddress)));
    assert.match(en, new RegExp(escapeRegExp(candidate.contractAddress)));
  });

  it("18. second E2E pass creates no duplicates", () => {
    assert.equal(step("second-run-idempotency").status, "PASS");
    assert.deepEqual(manifest.idempotency, {
      follow_up_records: 1,
      established_versions_created: 1,
      ai_queue_records: 1,
      product_reports: 1,
      feedback_records: 1,
    });
  });

  it("19. invalid contract address stops the flow", () => {
    assert.equal(step("fail-closed-identity-boundaries").status, "PASS");
    assert.equal(boundary("INVALID_CONTRACT_ADDRESS").blocked, true);
  });

  it("20. unsupported network stops Follow-up", () => {
    assert.equal(step("fail-closed-identity-boundaries").status, "PASS");
    assert.equal(boundary("UNSUPPORTED_CHAIN").blocked, true);
  });

  it("21. lack of owner decision stops Established", () => {
    assert.equal(step("owner-decision-required").safe_error_code, null);
    assert.ok(stepIndex("owner-decision-required") < stepIndex("owner-established-promotion"));
    assert.equal(boundary("OWNER_DECISION_REQUIRED").blocked, true);
  });

  it("22. invalid mock response publishes no brief", () => {
    assert.equal(step("invalid-mock-fails-closed").status, "PASS");
    assert.equal(manifest.mock_provider_calls, 2);
    assert.equal(step("ai-unvalidated-data-boundary").status, "PASS");
    assert.equal(boundary("CANDIDATE_NOT_FOUND").blocked, true);
    assert.throws(
      () => assertReadyAnalysisForProductReport({ queue_status: "FAILED", brief: null }),
      /READY_ANALYSIS_REQUIRED_FOR_REPORT/,
    );
  });

  it("23. JSON manifest is complete and versioned", async () => {
    const parsed = JSON.parse(await readFile(result.manifestPath, "utf8")) as ProductE2EManifest;
    assert.equal(parsed.schema_version, PRODUCT_E2E_SCHEMA_VERSION);
    assert.equal(parsed.report_schema_version, PRODUCT_E2E_REPORT_SCHEMA_VERSION);
    for (const key of [
      "run_id", "started_at", "completed_at", "status", "source_snapshot_id",
      "chain", "contract_address", "steps", "isolated_records", "mock_provider_calls",
      "live_openai_calls", "live_data_provider_calls", "canonical_store_mutations",
      "safe_error_codes", "e2e_report_path",
    ]) assert.ok(Object.hasOwn(parsed, key), key);
    assert.doesNotMatch(JSON.stringify(parsed), /authorization|api[_-]?key|full_prompt|raw_response/i);
    assert.doesNotMatch(JSON.stringify(parsed), /[A-Z]:\\Users\\|pawel/i);
    assert.ok(Object.values(parsed.isolated_stores).every((value) => value.startsWith("%TEMP%\\")));
  });

  it("24. Markdown owner report is complete", async () => {
    const markdown = await readFile(result.reportPath, "utf8");
    assert.match(markdown, /E2E\.1 PASS/);
    assert.match(markdown, /Isolation/);
    assert.match(markdown, /Idempotency/);
    assert.match(markdown, /Canonical state unchanged: yes/);
    assert.equal(PRODUCT_E2E_REPORT_SCHEMA_VERSION, "product_e2e_report_v1");
  });

  it("25. canonical hashes stay unchanged", () => {
    assert.equal(manifest.canonical_protection.unchanged, true);
    assert.equal(manifest.canonical_store_mutations, 0);
    assert.deepEqual(manifest.canonical_protection.before, manifest.canonical_protection.after);
  });

  it("26. Task Scheduler stays unchanged", async () => {
    assert.equal(manifest.task_scheduler_unchanged, true);
    assert.equal(manifest.canonical_protection.before.task_scheduler, manifest.canonical_protection.after.task_scheduler);
    const actual = await captureCanonicalProductState();
    assert.notEqual(actual.task_scheduler, "TASK_SCHEDULER_STATUS_UNAVAILABLE");
  });

  it("27. performs zero OpenAI calls", () => {
    assert.equal(manifest.live_openai_calls, 0);
    assert.equal(manifest.owner_user_boundaries.user_can_force_provider_call, false);
  });

  it("28. performs zero live data-provider calls", () => {
    assert.equal(manifest.live_data_provider_calls, 0);
    assert.equal(manifest.navigation.refresh_collector_calls, 0);
  });

  it("29. launcher preview performs no mutations", async () => {
    const before = await captureCanonicalProductState({ taskSchedulerStateReader: async () => taskState });
    const preview = await previewFullProductE2E({ runId });
    const after = await captureCanonicalProductState({ taskSchedulerStateReader: async () => taskState });
    assert.equal(preview.mutations_performed, 0);
    assert.equal(preview.mock_worker_started, false);
    assert.deepEqual(after, before);
  });

  it("30. launcher opens exactly one result tab", async () => {
    const launcher = await readFile(launcherPath, "utf8");
    assert.equal((launcher.match(/^\s*start\s+""/gmi) ?? []).length, 1);
    assert.match(launcher, /CRYPTO_EDGE_PRODUCT_E2E_PLAN_ONLY/);
    const executed = await execFileAsync("cmd.exe", ["/d", "/s", "/c", launcherPath], {
      cwd: resolve(import.meta.dirname, "..", "..", ".."),
      env: { ...process.env, CRYPTO_EDGE_PRODUCT_E2E_PLAN_ONLY: "1" },
      windowsHide: true,
      timeout: 30_000,
    });
    assert.equal((executed.stdout.match(/^OPEN_URL=/gmi) ?? []).length, 1);
    assert.match(executed.stdout, /OpenAI calls: 0/);
  });
});

describe("E2E.1 real product views", () => {
  it("walks Radar, Summary, Observation, AI, Main Radar, Reports and Feedback", async () => {
    assert.deepEqual(manifest.navigation.views, PRODUCT_E2E_VIEW_SEQUENCE);
    assert.match(renderDetail("pl", "summary"), /token-detail-tabpanel/);
    assert.match(renderDetail("pl", "observation"), /token-detail-tabpanel/);
    assert.match(renderDetail("pl", "ai"), /token-detail-tabpanel/);

    const establishedMarkup = renderLocale("pl", React.createElement(CandidateResultsView, {
      candidates: [{ ...candidate, discoveryBasket: "established" }],
      followUpStatus,
      followUpEntries: followUp.entries,
    }));
    assert.match(establishedMarkup, /Główny Radar|Established/);

    const reportStatus = await readReportsLibraryStatus({ reportsRootPath: stores.reports });
    const reportsMarkup = renderLocale("pl", React.createElement(ReportsLibrary, {
      candidates: [candidate],
      onOpenCandidate: () => undefined,
      onOpenManualVerification: () => undefined,
      initialStatus: reportStatus,
      initialReports: [reportDetail],
      initialDetail: reportDetail,
    }));
    assert.match(reportsMarkup, /Raport nie zawiera instrukcji transakcyjnej/);
    assert.match(reportsMarkup, new RegExp(escapeRegExp(manifest.contract_address)));

    const feedbackMarkup = renderLocale("pl", React.createElement(Feedback, {
      screenContext: "feedback",
      initialPublicStatus: {
        capture_available: true,
        feedback_status: "READY",
        submission_enabled: true,
        max_title_length: 120,
        max_details_length: 3_000,
        supported_categories: ["BLOCKER", "IMPROVEMENT", "CLARIFICATION", "LATER"],
      },
      initialReceipt: {
        submission_status: "RECORDED",
        feedback_id: manifest.isolated_records.feedback_id!,
        created_at: manifest.completed_at,
        category: "IMPROVEMENT",
      },
    }));
    assert.match(feedbackMarkup, /Opinia została zapisana|zapisana/);
  });

  it("keeps the established identity on mobile-safe layouts", async () => {
    const css = await readFile(resolve(import.meta.dirname, "..", "src", "index.css"), "utf8");
    assert.match(css, /overflow-x:\s*hidden/);
    assert.match(css, /token-detail-tabs[\s\S]*overflow-x:\s*auto/);
    assert.equal(manifest.navigation.identity_preserved, true);
    assert.equal(manifest.navigation.locale_identity_preserved, true);
  });
});

function step(id: string) {
  const found = manifest.steps.find((value) => value.id === id);
  assert.ok(found, id);
  return found;
}

function stepIndex(id: string): number {
  return manifest.steps.findIndex((value) => value.id === id);
}

function boundary(code: string) {
  const found = manifest.fail_closed_boundaries.find((value) => value.code === code);
  assert.ok(found, code);
  return found;
}

function renderDetail(locale: "pl" | "en", tab: "summary" | "observation" | "ai"): string {
  return renderLocale(locale, React.createElement(CandidateDetailView, {
    candidate,
    followUp: followUp.entries[0],
    followUpStatus,
    activeTab: tab,
    initialOwnerPromotionStatus: null,
  }));
}

function renderLocale(locale: "pl" | "en", child: React.ReactNode): string {
  return renderToStaticMarkup(React.createElement(
    ProductLocaleProvider,
    { initialLocale: locale },
    child,
  ));
}

function installWindow(chain: string, contract: string, detail: string): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let current = new URL(`http://127.0.0.1:5173/?chain=${encodeURIComponent(chain)}&contract=${encodeURIComponent(contract)}&detail=${detail}#candidate-detail`);
  const fake = {
    get location() {
      return {
        href: current.href,
        search: current.search,
        hash: current.hash,
      };
    },
    history: {
      pushState(_state: unknown, _title: string, next: string | URL | null) {
        current = new URL(String(next), current);
      },
    },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: fake });
  return () => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
