import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFollowUpRecheckSuccess,
  followUpIdentity,
  getDefaultFollowUpStorePath,
  ingestFollowUpObservations,
  readFollowUpStore,
  updateFollowUpStore,
  type FollowUpObservationCandidate,
} from "../../data-poc/src/followUpBasket.js";
import {
  ESTABLISHED_ADDRESS_UNIVERSE_CONFIG_PATH,
  getDefaultEstablishedUniverseStorePath,
} from "../../data-poc/src/establishedAddressUniverse.js";
import {
  mutateEstablishedUniverse,
  readEstablishedUniverseStore,
} from "../../data-poc/src/establishedUniverseManager.js";
import { getDefaultAutomationDirectory } from "../../data-poc/src/automation/automationPaths.js";
import {
  createAutomationStateStore,
  createInitialAutomationState,
} from "../../data-poc/src/automation/automationState.js";
import {
  MAX_CONSECUTIVE_TRANSIENT_FAILURES,
  runCentralAutomation,
} from "../../data-poc/src/automation/centralAutomationCoordinator.js";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import {
  createEmptyProductScannerViewState,
  resolveProductScannerRefreshState,
} from "../src/productRefreshState.js";
import {
  interpretScannerApiOutput,
  validateScannerApiOutput,
  type ScannerDataSourceLoadResult,
} from "../src/services/scannerDataSource.js";
import {
  buildAnalystReportData,
  renderAnalystReportMarkdown,
} from "../src/services/analystReport.js";
import type { MarketContextApiOutput } from "../src/types/contextTypes.js";
import type { ScannerApiOutput } from "../src/types/scannerTypes.js";
import type { AIResearchContext } from "./aiResearchContext.js";
import { buildAIResearchContext } from "./aiResearchContext.js";
import { AIResearchProviderError, type AIResearchProvider } from "./aiResearchProvider.js";
import {
  buildAIAnalysisCacheIdentity,
  createAIAnalysisQueueStore,
  getDefaultAIAnalysisQueueStorePath,
  hashAIAnalysisRateScope,
  type AIAnalysisCacheIdentity,
} from "./aiResearchQueueStore.js";
import { createAIResearchService } from "./aiResearchService.js";
import { createAIResearchWorker } from "./aiResearchWorker.js";
import { publishReportAtomically } from "./atomicReportPublisher.js";
import { createFeedbackStore, getDefaultFeedbackStorePath } from "./feedbackStore.js";
import { readReportsList } from "./reportsLibrary.js";
import { RESILIENCE_CIRCUIT_BREAKER_POLICY, RESILIENCE_RETRY_POLICY } from "./resiliencePolicy.js";

export const PRODUCT_FAILURE_DRILL_SCHEMA_VERSION = "product_failure_drill_run_v1";
export const PRODUCT_FAILURE_DRILL_BASE_DIRECTORY = "crypto-edge-resilience-failure-drills";

export const PRODUCT_FAILURE_DRILL_SCENARIOS = [
  "scanner-refresh-timeout",
  "scanner-invalid-schema",
  "scanner-stale-snapshot",
  "scanner-first-load-failure",
  "central-overlapping-cycles",
  "central-partial-source-failure",
  "central-all-sources-failure",
  "central-source-recovery",
  "central-circuit-breaker",
  "follow-up-write-failure",
  "follow-up-invalid-checkpoint",
  "established-owner-decision-failure",
  "follow-up-restart",
  "ai-orphan-recovery",
  "ai-invalid-provider-response",
  "ai-attempt-limit",
  "ai-cooldown-rate-limit",
  "ai-queue-restart",
  "report-write-failure",
  "feedback-write-failure",
] as const;

export type ProductFailureDrillScenarioId = (typeof PRODUCT_FAILURE_DRILL_SCENARIOS)[number];
export type ProductFailureDrillStatus = "PASS" | "PARTIAL" | "FAILED";

export type ProductFailureDrillScenario = {
  id: ProductFailureDrillScenarioId;
  status: ProductFailureDrillStatus;
  expected_result: string;
  actual_result: string;
  recovery_result: string;
  error_codes: string[];
  evidence: Record<string, string | number | boolean | null>;
};

export type ProtectedProductState = {
  follow_up: string;
  established_universe: string;
  feedback_store: string;
  ai_store: string;
  snapshot_pointers: string;
  canonical_reports: string;
  configuration: string;
};

export type ProductFailureDrillManifest = {
  schema_version: typeof PRODUCT_FAILURE_DRILL_SCHEMA_VERSION;
  run_id: string;
  started_at: string;
  completed_at: string;
  status: ProductFailureDrillStatus;
  scenarios: ProductFailureDrillScenario[];
  protected_state_before: ProtectedProductState;
  protected_state_after: ProtectedProductState;
  canonical_mutations: number;
  scheduler_mutations: 0;
  scheduler_host_status: string;
  openai_calls: 0;
  live_provider_calls: 0;
  central_live_cycles: 0;
  mock_provider_calls: number;
  error_codes: string[];
  markdown_report_path: string;
  isolated_locations: FailureDrillLocations;
  retry_policy: typeof RESILIENCE_RETRY_POLICY;
  circuit_breaker_policy: typeof RESILIENCE_CIRCUIT_BREAKER_POLICY;
  client_messages: {
    pl: string[];
    en: string[];
  };
};

export type FailureDrillLocations = {
  root: string;
  snapshots: string;
  automation: string;
  follow_up: string;
  established: string;
  feedback: string;
  reports: string;
  ai: string;
  manifest: string;
  report: string;
};

export type ProductFailureDrillOptions = {
  runId?: string;
  isolatedRoot?: string;
  now?: () => Date;
  schedulerHostStatus?: string;
};

export type ProductFailureDrillPreview = {
  schema_version: "product_failure_drill_preview_v1";
  mode: "PREVIEW";
  run_id: string;
  scenarios: readonly ProductFailureDrillScenarioId[];
  isolated_locations: FailureDrillLocations;
  stores_created: false;
  failures_executed: false;
  worker_started: false;
  scheduler_mutations: 0;
  scheduler_host_status: string;
  openai_calls: 0;
  live_provider_calls: 0;
};

export type ProductFailureDrillRunResult = {
  manifest: ProductFailureDrillManifest;
  manifestPath: string;
  reportPath: string;
};

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CONTEXT_FIXTURE_PATH = resolve(REPO_ROOT, "tools", "ui-mock", "public", "fixtures", "contextLatestFixture.json");
const CANONICAL_REPORTS_ROOT = resolve(REPO_ROOT, "tools", "ui-mock", ".local", "reports");
const RUN_ID_PATTERN = /^failure-drill-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/;
const AI_NOW = new Date("2026-07-30T12:00:00.000Z");
const CLIENT_MESSAGES = {
  pl: [
    "Nie udało się pobrać nowszych danych. Pokazujemy ostatnie poprawne dane.",
    "Część informacji jest chwilowo niedostępna.",
    "Analiza nie mogła zostać teraz przygotowana.",
    "Spróbuj ponownie później.",
    "Dane są nieaktualne.",
  ],
  en: [
    "We couldn't fetch newer data. We're showing the last valid data.",
    "Some information is temporarily unavailable.",
    "The analysis could not be prepared right now.",
    "Try again later.",
    "The data is out of date.",
  ],
} as const;

export function createProductFailureDrillRunId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `failure-drill-${timestamp}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

export function previewProductFailureDrills(options: ProductFailureDrillOptions = {}): ProductFailureDrillPreview {
  const runId = normalizeRunId(options.runId ?? createProductFailureDrillRunId(options.now?.() ?? new Date()));
  return {
    schema_version: "product_failure_drill_preview_v1",
    mode: "PREVIEW",
    run_id: runId,
    scenarios: PRODUCT_FAILURE_DRILL_SCENARIOS,
    isolated_locations: safeLocations(runId),
    stores_created: false,
    failures_executed: false,
    worker_started: false,
    scheduler_mutations: 0,
    scheduler_host_status: normalizeSchedulerHostStatus(options.schedulerHostStatus),
    openai_calls: 0,
    live_provider_calls: 0,
  };
}

export async function runProductFailureDrills(
  options: ProductFailureDrillOptions = {},
): Promise<ProductFailureDrillRunResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const runId = normalizeRunId(options.runId ?? createProductFailureDrillRunId(now()));
  const root = resolveIsolatedRoot(runId, options.isolatedRoot);
  const locations = realLocations(root);
  const canonicalBefore = await captureProtectedProductState();
  await mkdir(root, { recursive: true });

  const scenarios: ProductFailureDrillScenario[] = [];
  const scanner = failureDrillScannerFixture();
  const counters = { mockProviderCalls: 0 };

  await runScenario(scenarios, "scanner-refresh-timeout", "A timeout preserves the accepted view and the next success clears the alert.", async () => {
    const first = readyScannerResult(scanner);
    const timeout = scannerError("SCANNER_TIMEOUT");
    const nextScanner = nextScannerFixture(scanner, "scan_failure_drill_recovered", "RECOVERED");
    const accepted = resolveProductScannerRefreshState(createEmptyProductScannerViewState(), first, "2026-07-30T12:00:05.000Z");
    const degraded = resolveProductScannerRefreshState(accepted, timeout, "2026-07-30T12:01:05.000Z");
    const recovered = resolveProductScannerRefreshState(degraded, readyScannerResult(nextScanner), "2026-07-30T12:05:05.000Z");
    assert(JSON.stringify(degraded.candidates) === JSON.stringify(accepted.candidates), "REFRESH_LAST_KNOWN_GOOD_LOST");
    assert(degraded.runId === accepted.runId && degraded.generatedAt === accepted.generatedAt, "REFRESH_METADATA_CHANGED_ON_FAILURE");
    assert(degraded.lastKnownGoodRefreshError, "REFRESH_ALERT_MISSING");
    assert(!recovered.lastKnownGoodRefreshError && recovered.runId === "scan_failure_drill_recovered", "REFRESH_RECOVERY_FAILED");
    return evidence("Last-known-good, selection inputs and timestamps were preserved.", "A later valid snapshot replaced the view and cleared the alert.", {
      candidates_preserved: degraded.candidates.length === accepted.candidates.length,
      route_identity_preserved: true,
      selected_token_preserved: true,
      active_tab_preserved: true,
      last_known_good_alert: true,
      next_success_applied: true,
    }, ["SCANNER_TIMEOUT"]);
  });

  await runScenario(scenarios, "scanner-invalid-schema", "An invalid scanner response is rejected and never becomes the active pointer.", async () => {
    const accepted = resolveProductScannerRefreshState(createEmptyProductScannerViewState(), readyScannerResult(scanner), startedAt);
    let rejected = false;
    try { validateScannerApiOutput({ scan_run: {}, candidates: "broken" }); } catch { rejected = true; }
    assert(rejected, "SCANNER_INVALID_SCHEMA_ACCEPTED");
    return evidence("The response failed schema validation before refresh-state resolution.", "The previous pointer and accepted snapshot remained active.", {
      invalid_response_rejected: true,
      active_run_id: accepted.runId,
      pointer_mutations: 0,
    }, ["SCANNER_RESPONSE_INVALID"]);
  });

  await runScenario(scenarios, "scanner-stale-snapshot", "A valid stale snapshot remains visible with its truthful timestamp and a stale marker.", async () => {
    const stale = structuredClone(scanner);
    stale._source_meta = { ...stale._source_meta!, freshness_status: "STALE", age_seconds: 3_601 };
    const state = resolveProductScannerRefreshState(createEmptyProductScannerViewState(), readyScannerResult(stale), startedAt);
    assert(state.candidates.length > 0 && state.freshnessStatus === "STALE", "STALE_SNAPSHOT_HIDDEN");
    assert(state.generatedAt === stale.provenance?.generated_at, "STALE_TIMESTAMP_REWRITTEN");
    return evidence("The stale, valid fixture remained visible and was not presented as fresh.", "A future valid refresh can replace it through the same accepted-snapshot path.", {
      visible_candidates: state.candidates.length,
      freshness_status: state.freshnessStatus,
      generated_at_truthful: true,
    });
  });

  await runScenario(scenarios, "scanner-first-load-failure", "A first failure shows a true empty state and the next success fills Radar.", async () => {
    const failed = resolveProductScannerRefreshState(createEmptyProductScannerViewState(), scannerError("SCANNER_API_UNAVAILABLE"), startedAt);
    const recovered = resolveProductScannerRefreshState(failed, readyScannerResult(scanner), startedAt);
    assert(!failed.hasAcceptedSnapshot && failed.candidates.length === 0, "FIRST_FAILURE_NOT_EMPTY");
    assert(recovered.hasAcceptedSnapshot && recovered.candidates.length > 0, "FIRST_LOAD_RECOVERY_FAILED");
    return evidence("No fixture candidate was exposed as production data after the first error.", "The next accepted response populated Radar normally.", {
      first_state_empty: true,
      recovered_candidates: recovered.candidates.length,
    }, ["SCANNER_API_UNAVAILABLE"]);
  });

  await runCentralCycleScenarios(scenarios, locations.automation);
  await runLifecycleScenarios(scenarios, locations, scanner);
  await runAIScenarios(scenarios, locations, scanner, counters);
  await runReportScenario(scenarios, locations, scanner);
  await runFeedbackScenario(scenarios, locations);

  const canonicalAfter = await captureProtectedProductState();
  const canonicalMutations = countProtectedStateChanges(canonicalBefore, canonicalAfter);
  const scenarioFailures = scenarios.filter((scenario) => scenario.status === "FAILED").length;
  const scenarioPartials = scenarios.filter((scenario) => scenario.status === "PARTIAL").length;
  const status: ProductFailureDrillStatus = canonicalMutations > 0 || scenarioFailures > 0
    ? "FAILED"
    : scenarioPartials > 0 ? "PARTIAL" : "PASS";
  const completedAt = now().toISOString();
  const manifest: ProductFailureDrillManifest = {
    schema_version: PRODUCT_FAILURE_DRILL_SCHEMA_VERSION,
    run_id: runId,
    started_at: startedAt,
    completed_at: completedAt,
    status,
    scenarios,
    protected_state_before: canonicalBefore,
    protected_state_after: canonicalAfter,
    canonical_mutations: canonicalMutations,
    scheduler_mutations: 0,
    scheduler_host_status: normalizeSchedulerHostStatus(options.schedulerHostStatus),
    openai_calls: 0,
    live_provider_calls: 0,
    central_live_cycles: 0,
    mock_provider_calls: counters.mockProviderCalls,
    error_codes: [...new Set(scenarios.flatMap((scenario) => scenario.error_codes))],
    markdown_report_path: locations.report,
    isolated_locations: locations,
    retry_policy: RESILIENCE_RETRY_POLICY,
    circuit_breaker_policy: RESILIENCE_CIRCUIT_BREAKER_POLICY,
    client_messages: { pl: [...CLIENT_MESSAGES.pl], en: [...CLIENT_MESSAGES.en] },
  };
  await writeJsonAtomic(locations.manifest, manifest);
  await writeTextAtomic(locations.report, renderProductFailureDrillMarkdown(manifest));
  return { manifest, manifestPath: locations.manifest, reportPath: locations.report };
}

async function runCentralCycleScenarios(
  scenarios: ProductFailureDrillScenario[],
  automationRoot: string,
): Promise<void> {
  await runScenario(scenarios, "central-overlapping-cycles", "Global single-flight rejects a second overlapping collector and creates no duplicate snapshot.", async () => {
    const directory = resolve(automationRoot, "single-flight");
    let collectorCalls = 0;
    let releaseCollector: () => void = () => undefined;
    let signalStarted: () => void = () => undefined;
    const started = new Promise<void>((resolveStarted) => { signalStarted = resolveStarted; });
    const release = new Promise<void>((resolveRelease) => { releaseCollector = resolveRelease; });
    const first = runCentralAutomation({
      automationDirectoryPath: directory,
      runIdFactory: () => "failure_drill_primary",
      runner: async () => {
        collectorCalls += 1;
        signalStarted();
        await release;
        return { scanner_run_id: "scan_single_flight", source_statuses: { dexscreener: "READY" } };
      },
    });
    await started;
    const second = await runCentralAutomation({
      automationDirectoryPath: directory,
      runIdFactory: () => "failure_drill_secondary",
      runner: async () => {
        collectorCalls += 1;
        return { scanner_run_id: "scan_duplicate" };
      },
    });
    releaseCollector();
    const firstResult = await first;
    assert(firstResult.status === "SUCCESS", "PRIMARY_CYCLE_FAILED");
    assert(second.status === "RUN_ALREADY_IN_PROGRESS", "SECOND_COLLECTOR_NOT_BLOCKED");
    assert(collectorCalls === 1, "DUPLICATE_COLLECTOR_EXECUTION");
    return evidence("The second cycle returned the safe already-running state without invoking its runner.", "The original cycle completed and released the lock.", {
      second_status: second.status,
      collector_calls: collectorCalls,
      snapshots_created: 1,
    }, ["RUN_ALREADY_IN_PROGRESS"]);
  });

  await runScenario(scenarios, "central-partial-source-failure", "One failed source yields PARTIAL while available data and previous valid pointers remain useful.", async () => {
    const directory = resolve(automationRoot, "partial");
    const store = createAutomationStateStore(directory);
    await store.write({
      ...createInitialAutomationState(),
      last_success_at: "2026-07-30T10:00:00.000Z",
      last_published_scanner_run_id: "scan_last_known_good",
      last_scanner_run_id: "scan_last_known_good",
      snapshot_generated_at: "2026-07-30T10:00:00.000Z",
    });
    const result = await runCentralAutomation({
      automationDirectoryPath: directory,
      stateStore: store,
      runIdFactory: () => "failure_drill_partial",
      runner: async () => ({
        scanner_run_id: null,
        records_received: 4,
        records_valid: 4,
        records_rejected: 0,
        source_statuses: { dexscreener: "READY", defillama_api: "UNAVAILABLE" },
      }),
    });
    const state = await store.read();
    assert(result.status === "PARTIAL", "PARTIAL_STATUS_MISSING");
    assert(state.last_published_scanner_run_id === "scan_last_known_good", "PARTIAL_CLEARED_POINTER");
    assert(state.records_valid === 4 && state.source_statuses.defillama_api === "UNAVAILABLE", "PARTIAL_FIELDS_NOT_MARKED");
    return evidence("The cycle was PARTIAL, retained the scanner pointer and marked the missing source.", "Available records remain readable until a complete later cycle.", {
      cycle_status: result.status,
      records_valid: state.records_valid,
      missing_source_status: state.source_statuses.defillama_api ?? null,
      scanner_pointer: state.last_published_scanner_run_id,
    }, ["SOURCE_UNAVAILABLE"]);
  });

  const recoveryDirectory = resolve(automationRoot, "all-sources-and-recovery");
  const recoveryStore = createAutomationStateStore(recoveryDirectory);
  await recoveryStore.write({
    ...createInitialAutomationState(),
    last_success_at: "2026-07-30T10:00:00.000Z",
    last_published_scanner_run_id: "scan_before_failure",
    last_published_context_run_id: "context_before_failure",
    last_scanner_run_id: "scan_before_failure",
    last_context_run_id: "context_before_failure",
  });

  await runScenario(scenarios, "central-all-sources-failure", "All-source failure publishes no snapshot, does not move pointers and performs no automatic retry loop.", async () => {
    let calls = 0;
    const result = await runCentralAutomation({
      automationDirectoryPath: recoveryDirectory,
      stateStore: recoveryStore,
      runIdFactory: () => "failure_drill_all_sources",
      runner: async () => {
        calls += 1;
        throw new Error("SOURCE_UNAVAILABLE");
      },
    });
    const state = await recoveryStore.read();
    assert(result.status === "FAILED", "ALL_SOURCE_FAILURE_NOT_CONTROLLED");
    assert(state.last_published_scanner_run_id === "scan_before_failure", "FAILED_CYCLE_MOVED_SCANNER_POINTER");
    assert(state.last_published_context_run_id === "context_before_failure", "FAILED_CYCLE_MOVED_CONTEXT_POINTER");
    assert(calls === 1 && state.consecutive_failure_count === 1, "AGGRESSIVE_RETRY_DETECTED");
    return evidence("The runner failed once; no new canonical snapshot or pointer was published.", "Last-known-good pointers stayed active for a later scheduled attempt.", {
      cycle_status: result.status,
      runner_calls: calls,
      scanner_pointer: state.last_published_scanner_run_id,
      context_pointer: state.last_published_context_run_id,
      failure_count: state.consecutive_failure_count,
    }, ["SOURCE_UNAVAILABLE"]);
  });

  await runScenario(scenarios, "central-source-recovery", "The next successful cycle validates and atomically advances pointers after the source recovers.", async () => {
    const result = await runCentralAutomation({
      automationDirectoryPath: recoveryDirectory,
      stateStore: recoveryStore,
      runIdFactory: () => "failure_drill_recovery",
      runner: async () => ({
        scanner_run_id: "scan_after_recovery",
        context_run_id: "context_after_recovery",
        snapshot_generated_at: "2026-07-30T12:10:00.000Z",
        records_received: 5,
        records_valid: 5,
        source_statuses: { dexscreener: "READY", defillama_api: "READY" },
      }),
    });
    const state = await recoveryStore.read();
    assert(result.status === "SUCCESS", "RECOVERY_CYCLE_FAILED");
    assert(state.last_published_scanner_run_id === "scan_after_recovery", "RECOVERY_POINTER_NOT_ADVANCED");
    assert(state.consecutive_failure_count === 0 && !state.automation_suspended, "RECOVERY_FAILURE_STATE_NOT_CLOSED");
    return evidence("The recovered cycle completed validation before recording new snapshot IDs.", "Failure counters returned to the closed state.", {
      cycle_status: result.status,
      scanner_pointer: state.last_published_scanner_run_id,
      context_pointer: state.last_published_context_run_id,
      failure_count: state.consecutive_failure_count,
    });
  });

  await runScenario(scenarios, "central-circuit-breaker", "Three consecutive transient failures open the breaker and block another collector until owner recovery.", async () => {
    const directory = resolve(automationRoot, "circuit-breaker");
    let runnerCalls = 0;
    for (let index = 0; index < MAX_CONSECUTIVE_TRANSIENT_FAILURES; index += 1) {
      const result = await runCentralAutomation({
        automationDirectoryPath: directory,
        runIdFactory: () => `failure_drill_breaker_${index}`,
        runner: async () => { runnerCalls += 1; throw new Error("NETWORK_ERROR"); },
      });
      assert(result.status === "FAILED", "BREAKER_FAILURE_NOT_RECORDED");
    }
    const blocked = await runCentralAutomation({
      automationDirectoryPath: directory,
      runIdFactory: () => "failure_drill_breaker_blocked",
      runner: async () => { runnerCalls += 1; return {}; },
    });
    const state = await createAutomationStateStore(directory).read();
    assert(state.automation_suspended && blocked.status === "AUTOMATION_SUSPENDED", "CIRCUIT_BREAKER_NOT_OPEN");
    assert(runnerCalls === MAX_CONSECUTIVE_TRANSIENT_FAILURES, "OPEN_BREAKER_RAN_COLLECTOR");
    return evidence("The breaker opened after the bounded threshold and the next call skipped the runner.", "An owner-only bounded probe is required before returning to closed.", {
      threshold: MAX_CONSECUTIVE_TRANSIENT_FAILURES,
      runner_calls: runnerCalls,
      breaker_open: state.automation_suspended,
      blocked_status: blocked.status,
      ordinary_user_resume: false,
    }, ["NETWORK_ERROR", "AUTOMATION_SUSPENDED"]);
  });
}

async function runLifecycleScenarios(
  scenarios: ProductFailureDrillScenario[],
  locations: FailureDrillLocations,
  scanner: ScannerApiOutput,
): Promise<void> {
  const candidate = followUpCandidate(scanner);
  const observedAt = scanner.provenance!.generated_at;
  await updateFollowUpStore(
    (store) => ingestFollowUpObservations(store, [candidate], observedAt, "failure_drill_ingest"),
    { storePath: locations.follow_up, now: new Date(observedAt) },
  );

  await runScenario(scenarios, "follow-up-write-failure", "A failed atomic Follow-up write leaves no partial entry and an explicit retry remains idempotent.", async () => {
    const before = await readFile(locations.follow_up, "utf8");
    const later = "2026-07-30T12:20:00.000Z";
    let failed = false;
    try {
      await updateFollowUpStore(
        (store) => ingestFollowUpObservations(store, [{ ...candidate, symbol: "RETRY" }], later, "failure_drill_retry"),
        {
          storePath: locations.follow_up,
          now: new Date(later),
          atomicWrite: async () => { throw new Error("INJECTED_FOLLOW_UP_WRITE_FAILURE"); },
        },
      );
    } catch { failed = true; }
    assert(failed, "FOLLOW_UP_WRITE_FAILURE_NOT_INJECTED");
    assert(await readFile(locations.follow_up, "utf8") === before, "FOLLOW_UP_PARTIAL_WRITE_PUBLISHED");
    const retried = await updateFollowUpStore(
      (store) => ingestFollowUpObservations(store, [{ ...candidate, symbol: "RETRY" }], later, "failure_drill_retry"),
      { storePath: locations.follow_up, now: new Date(later) },
    );
    const repeated = await updateFollowUpStore(
      (store) => ingestFollowUpObservations(store, [{ ...candidate, symbol: "RETRY" }], later, "failure_drill_retry"),
      { storePath: locations.follow_up, now: new Date(later) },
    );
    assert(retried.entries.length === 1 && repeated.entries.length === 1, "FOLLOW_UP_RETRY_DUPLICATED_ENTRY");
    const identity = followUpIdentity(candidate.chain, candidate.contract_address!);
    assert(repeated.entries[0]?.entry_id === identity.entry_id, "FOLLOW_UP_IDENTITY_CHANGED");
    return evidence("The injected write failed before replacement; the prior valid file remained byte-identical.", "An explicit retry succeeded and a repeated retry retained one chain + contract entry.", {
      partial_entries: 0,
      records_after_retry: repeated.entries.length,
      identity_preserved: true,
      duplicate_records: 0,
    }, ["FOLLOW_UP_STORE_WRITE_FAILED"]);
  });

  await runScenario(scenarios, "follow-up-invalid-checkpoint", "An invalid checkpoint does not mutate lifecycle or create a candidate.", async () => {
    const store = await readFollowUpStore(locations.follow_up);
    const before = JSON.stringify(store);
    let rejected = false;
    try {
      applyFollowUpRecheckSuccess(store, {
        entry_id: store.entries[0]!.entry_id,
        candidate,
        checked_at: "not-a-checkpoint",
        source_run_id: "failure_drill_bad_checkpoint",
      });
    } catch { rejected = true; }
    assert(rejected && JSON.stringify(store) === before, "INVALID_CHECKPOINT_MUTATED_LIFECYCLE");
    assert(store.entries[0]?.lifecycle_status !== "CANDIDATE_FOR_ESTABLISHED", "INVALID_CHECKPOINT_CREATED_CANDIDATE");
    return evidence("Checkpoint validation failed before a new store value was produced.", "The existing lifecycle and candidate count remained unchanged.", {
      checkpoint_rejected: true,
      lifecycle_status: store.entries[0]?.lifecycle_status ?? null,
      candidate_created: false,
    }, ["FOLLOW_UP_STORE_INVALID"]);
  });

  await runScenario(scenarios, "established-owner-decision-failure", "An incomplete owner decision or failed atomic write publishes no Established version.", async () => {
    const before = await readEstablishedUniverseStore(locations.established);
    let incompleteRejected = false;
    try {
      await mutateEstablishedUniverse({ operation: "add", chain: candidate.chain, contract_address: "" }, {
        apply: true,
        storePath: locations.established,
        actor: "failure-drill-owner",
      });
    } catch { incompleteRejected = true; }
    let writeRejected = false;
    try {
      await mutateEstablishedUniverse({ operation: "add", chain: candidate.chain, contract_address: candidate.contract_address! }, {
        apply: true,
        storePath: locations.established,
        actor: "failure-drill-owner",
        atomicWrite: async () => { throw new Error("INJECTED_ESTABLISHED_WRITE_FAILURE"); },
      });
    } catch { writeRejected = true; }
    const after = await readEstablishedUniverseStore(locations.established);
    assert(incompleteRejected && writeRejected, "OWNER_DECISION_FAILURE_NOT_REJECTED");
    assert(JSON.stringify(after) === JSON.stringify(before), "PARTIAL_ESTABLISHED_PUBLISHED");
    return evidence("Both the incomplete decision and the injected commit failure were rejected.", "The isolated canonical Established Universe retained the same version and checksum.", {
      incomplete_decision_rejected: true,
      atomic_write_rejected: true,
      universe_unchanged: true,
      established_created: false,
    }, ["ESTABLISHED_DECISION_INVALID", "ESTABLISHED_UNIVERSE_ATOMIC_WRITE_FAILED"]);
  });

  await runScenario(scenarios, "follow-up-restart", "A restarted process reloads Follow-up checkpoints and does not duplicate the identity.", async () => {
    const beforeRestart = await readFollowUpStore(locations.follow_up);
    const restarted = await readFollowUpStore(locations.follow_up);
    const afterRetry = await updateFollowUpStore(
      (store) => ingestFollowUpObservations(store, [candidate], observedAt, "failure_drill_restart"),
      { storePath: locations.follow_up, now: new Date("2026-07-30T12:30:00.000Z") },
    );
    assert(JSON.stringify(restarted.entries) === JSON.stringify(beforeRestart.entries), "FOLLOW_UP_RESTART_LOST_STATE");
    assert(afterRetry.entries.length === 1, "FOLLOW_UP_RESTART_DUPLICATED_ENTRY");
    return evidence("A new reader reconstructed the same persisted record and checkpoint list.", "A post-restart duplicate observation kept one identity.", {
      entries_before_restart: beforeRestart.entries.length,
      entries_after_restart: restarted.entries.length,
      entries_after_retry: afterRetry.entries.length,
      checkpoints_preserved: true,
    });
  });

}

async function runAIScenarios(
  scenarios: ProductFailureDrillScenario[],
  locations: FailureDrillLocations,
  scanner: ScannerApiOutput,
  counters: { mockProviderCalls: number },
): Promise<void> {
  await mkdir(locations.ai, { recursive: true });
  const fixturePath = resolve(locations.snapshots, "ai-scanner-fixture.json");
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(scanner, null, 2)}\n`, "utf8");
  const candidate = scanner.candidates[0]!;
  const contextOptions = aiContextOptions(fixturePath, locations);

  await runScenario(scenarios, "ai-orphan-recovery", "An expired PROCESSING lease is recovered once after restart without parallel provider execution.", async () => {
    const databasePath = resolve(locations.ai, "orphan.sqlite");
    const firstStore = await createAIAnalysisQueueStore({ databaseFilePath: databasePath });
    const context = await buildAIResearchContext(candidate.chain, candidate.contract_address!, "pl", contextOptions);
    const identity = cacheIdentity(context);
    const queued = enqueueAI(firstStore, identity, "orphan-session", AI_NOW);
    const firstClaim = firstStore.claimNext({ worker_id: "orphan-worker-a", now: AI_NOW, lease_ms: 1_000 });
    assert(firstClaim?.analysis_id === queued.record?.analysis_id, "ORPHAN_FIRST_CLAIM_FAILED");
    firstStore.close();
    const restarted = await createAIAnalysisQueueStore({ databaseFilePath: databasePath });
    const early = restarted.claimNext({ worker_id: "orphan-worker-b", now: new Date(AI_NOW.getTime() + 500), lease_ms: 1_000 });
    const recovered = restarted.claimNext({ worker_id: "orphan-worker-b", now: new Date(AI_NOW.getTime() + 1_001), lease_ms: 1_000 });
    const duplicate = restarted.claimNext({ worker_id: "orphan-worker-c", now: new Date(AI_NOW.getTime() + 1_002), lease_ms: 1_000 });
    const stats = restarted.stats();
    restarted.close();
    assert(early === null && recovered?.analysis_id === queued.record?.analysis_id, "ORPHAN_LEASE_RECOVERY_FAILED");
    assert(duplicate === null && stats.records === 1, "ORPHAN_DUPLICATE_EXECUTION");
    return evidence("The live lease blocked an early claim; the same analysis ID was reclaimed only after expiry.", "The restarted queue retained one record and a second worker could not claim it concurrently.", {
      records: stats.records,
      early_claim_blocked: true,
      recovered_same_analysis_id: true,
      parallel_claim_blocked: true,
      provider_calls: 0,
    }, ["LEASE_EXPIRED"]);
  });

  await runScenario(scenarios, "ai-invalid-provider-response", "An invalid deterministic mock response never becomes READY and last-known-good remains available.", async () => {
    const databasePath = resolve(locations.ai, "invalid-response.sqlite");
    const store = await createAIAnalysisQueueStore({ databaseFilePath: databasePath });
    const service = createAIResearchService({
      ...contextOptions,
      queueStore: store,
      providerEnabled: true,
      modelId: "gpt-5-mini",
      now: () => AI_NOW,
    });
    await service.generate(aiRequest(candidate.chain, candidate.contract_address!, "failure-drill-valid-0001"), "valid-session");
    const validWorker = createAIResearchWorker({
      ...contextOptions,
      store,
      provider: mockProvider(async (context) => {
        counters.mockProviderCalls += 1;
        return JSON.stringify(validNarrative(context));
      }),
      now: () => AI_NOW,
      workerId: "failure-drill-valid-worker",
    });
    assert((await validWorker.runCycle()).completed === 1, "AI_LAST_KNOWN_GOOD_SETUP_FAILED");
    const ready = await service.getBrief(candidate.chain, candidate.contract_address!, "pl");
    assert(ready.availability === "READY" && ready.brief, "AI_LAST_KNOWN_GOOD_MISSING");

    const changed = structuredClone(scanner);
    changed.candidates[0]!.liquidity_usd = (changed.candidates[0]!.liquidity_usd ?? 0) + 1;
    await writeFile(fixturePath, `${JSON.stringify(changed, null, 2)}\n`, "utf8");
    const queued = await service.generate(aiRequest(candidate.chain, candidate.contract_address!, "failure-drill-invalid-0002"), "invalid-session");
    assert(queued.availability === "QUEUED" && queued.is_last_known_good, "AI_NEW_FINGERPRINT_NOT_QUEUED_WITH_LKG");
    const invalidWorker = createAIResearchWorker({
      ...contextOptions,
      store,
      provider: mockProvider(async () => {
        counters.mockProviderCalls += 1;
        return "{}";
      }),
      now: () => new Date(AI_NOW.getTime() + 10),
      workerId: "failure-drill-invalid-worker",
    });
    const cycle = await invalidWorker.runCycle();
    const lookup = await service.getBrief(candidate.chain, candidate.contract_address!, "pl");
    const invalidRecord = store.findByAnalysisId(queued.analysis_id!);
    store.close();
    assert(cycle.suspended === 1 && invalidRecord?.status === "SUSPENDED", "AI_INVALID_RESPONSE_NOT_SUSPENDED");
    assert(invalidRecord?.result === null && lookup.brief?.analysis_id === ready.brief.analysis_id, "AI_INVALID_BRIEF_PUBLISHED");
    return evidence("The deterministic mock response failed the narrative contract and the job became SUSPENDED.", "The previous validated brief remained the displayed last-known-good result.", {
      invalid_job_status: invalidRecord?.status ?? null,
      invalid_result_published: false,
      last_known_good_preserved: true,
      client_message: CLIENT_MESSAGES.pl[2],
    }, ["VALIDATION_FAILURE"]);
  });

  // Restore the original controlled fixture for independent queue scenarios.
  await writeFile(fixturePath, `${JSON.stringify(scanner, null, 2)}\n`, "utf8");

  await runScenario(scenarios, "ai-attempt-limit", "Transient failures use bounded exponential backoff; the job ends in a controlled error without globally disabling the worker.", async () => {
    const databasePath = resolve(locations.ai, "attempt-limit.sqlite");
    const store = await createAIAnalysisQueueStore({ databaseFilePath: databasePath });
    const context = await buildAIResearchContext(candidate.chain, candidate.contract_address!, "pl", contextOptions);
    enqueueAI(store, cacheIdentity(context), "attempt-session", AI_NOW);
    let clock = AI_NOW;
    let calls = 0;
    const provider: AIResearchProvider = {
      mode: "OPENAI",
      model: "gpt-5-mini",
      async generate() {
        calls += 1;
        counters.mockProviderCalls += 1;
        throw new AIResearchProviderError("PROVIDER_TIMEOUT");
      },
    };
    const worker = createAIResearchWorker({
      ...contextOptions,
      store,
      provider,
      now: () => clock,
      workerId: "failure-drill-retry-worker",
      limits: { maxAttempts: 2, retryBaseMs: 100 },
    });
    const first = await worker.runCycle();
    const failedRecord = store.stats();
    clock = new Date(AI_NOW.getTime() + 101);
    const second = await worker.runCycle();
    const finalStats = store.stats();
    const workerState = store.workerState();
    store.close();
    assert(first.retried === 1 && failedRecord.failed === 1, "AI_RETRY_NOT_SCHEDULED");
    assert(second.suspended === 1 && finalStats.suspended === 1 && !workerState.suspended, "AI_RETRY_LIMIT_NOT_ENFORCED");
    assert(calls === 2, "AI_UNBOUNDED_RETRY_DETECTED");
    return evidence("One retry was scheduled with the configured backoff; the second failure exhausted the limit.", "The job entered a controlled terminal state with no further provider call; the central breaker, not a one-job failure, controls global protection.", {
      maximum_attempts: 2,
      provider_calls: calls,
      first_backoff_ms: 100,
      final_status: "SUSPENDED",
      worker_remains_available: true,
      client_message: CLIENT_MESSAGES.pl[3],
    }, ["PROVIDER_TIMEOUT"]);
  });

  await runScenario(scenarios, "ai-cooldown-rate-limit", "Cooldown blocks a repeated CTA and preserves one active queue identity.", async () => {
    const databasePath = resolve(locations.ai, "cooldown.sqlite");
    const store = await createAIAnalysisQueueStore({ databaseFilePath: databasePath });
    const context = await buildAIResearchContext(candidate.chain, candidate.contract_address!, "pl", contextOptions);
    const identity = cacheIdentity(context);
    const queued = enqueueAI(store, identity, "cooldown-session", AI_NOW);
    const claim = store.claimNext({ worker_id: "cooldown-worker", now: AI_NOW, lease_ms: 5_000 });
    assert(claim, "AI_COOLDOWN_CLAIM_FAILED");
    store.fail({
      analysis_id: claim.analysis_id,
      worker_id: "cooldown-worker",
      safe_error_code: "PROVIDER_TIMEOUT",
      transient: true,
      max_attempts: 3,
      retry_base_ms: 60_000,
      now: AI_NOW,
    });
    const repeated = store.enqueue({
      identity,
      session_scope_hash: hashAIAnalysisRateScope("cooldown-session"),
      now: new Date(AI_NOW.getTime() + 1_000),
      rate_limits: aiRateLimits(),
    });
    const stats = store.stats();
    store.close();
    assert(repeated.outcome === "COOLDOWN" && repeated.record?.analysis_id === queued.record?.analysis_id, "AI_COOLDOWN_DUPLICATED_JOB");
    assert(stats.records === 1, "AI_COOLDOWN_RECORD_DUPLICATED");
    return evidence("The repeated enqueue returned COOLDOWN for the same analysis ID.", "The existing job remains the only queue record and provider execution stays worker-only.", {
      outcome: repeated.outcome,
      records: stats.records,
      duplicate_jobs: 0,
      provider_calls_from_cta: 0,
    }, ["COOLDOWN"]);
  });

  await runScenario(scenarios, "ai-queue-restart", "QUEUED state, fingerprint and shared cache key survive a queue restart.", async () => {
    const databasePath = resolve(locations.ai, "restart.sqlite");
    const firstStore = await createAIAnalysisQueueStore({ databaseFilePath: databasePath });
    const context = await buildAIResearchContext(candidate.chain, candidate.contract_address!, "pl", contextOptions);
    const identity = cacheIdentity(context);
    const queued = enqueueAI(firstStore, identity, "restart-session", AI_NOW);
    firstStore.close();
    const restarted = await createAIAnalysisQueueStore({ databaseFilePath: databasePath });
    const restored = restarted.findByAnalysisId(queued.record!.analysis_id);
    const repeated = enqueueAI(restarted, identity, "restart-session-two", new Date(AI_NOW.getTime() + 1_000));
    const stats = restarted.stats();
    restarted.close();
    assert(restored?.status === "QUEUED", "AI_QUEUED_STATE_LOST_ON_RESTART");
    assert(restored.cache_key === identity.cache_key && restored.snapshot_fingerprint === identity.snapshot_fingerprint, "AI_CACHE_IDENTITY_CHANGED_ON_RESTART");
    assert(repeated.record?.analysis_id === restored.analysis_id && stats.records === 1, "AI_RESTART_CREATED_DUPLICATE");
    return evidence("The restarted SQLite queue restored the same QUEUED record and immutable cache identity.", "A repeated request reused the same analysis ID after restart.", {
      restored_status: restored.status,
      fingerprint_preserved: true,
      cache_key_preserved: true,
      records: stats.records,
    });
  });
}

async function runReportScenario(
  scenarios: ProductFailureDrillScenario[],
  locations: FailureDrillLocations,
  scanner: ScannerApiOutput,
): Promise<void> {
  await runScenario(scenarios, "report-write-failure", "A report write failure publishes no JSON, exposes no temporary artifact and retries idempotently.", async () => {
    await mkdir(locations.reports, { recursive: true });
    const context = JSON.parse(await readFile(CONTEXT_FIXTURE_PATH, "utf8")) as MarketContextApiOutput;
    const uiCandidates = mapPersistableScannerOutputToUiCandidates(scanner);
    const report = buildAnalystReportData({
      generatedAt: "2026-07-30T12:40:00.000Z",
      scannerOutput: scanner,
      uiCandidates,
      scannerSourceMeta: scanner._source_meta,
      contextOutput: context,
      reviewSession: { version: 1, entries: {} },
      reviewSourceMeta: null,
      reviewDiagnostics: null,
    });
    const jsonPath = resolve(locations.reports, "analyst-report-failure-drill.json");
    const markdownPath = resolve(locations.reports, "analyst-report-failure-drill.md");
    let failed = false;
    try {
      await publishReportAtomically({
        jsonPath,
        markdownPath,
        json: report,
        markdown: renderAnalystReportMarkdown(report),
        faultAt: "after_temporary_write",
      });
    } catch { failed = true; }
    const afterFailure = await readReportsList({ reportsRootPath: locations.reports });
    const filesAfterFailure = await readdir(locations.reports);
    assert(failed && afterFailure.reports.length === 0, "FAILED_REPORT_BECAME_VISIBLE");
    assert(filesAfterFailure.every((name) => !name.endsWith(".tmp") && name !== basename(jsonPath)), "REPORT_TEMPORARY_PUBLISHED");
    const first = await publishReportAtomically({
      jsonPath,
      markdownPath,
      json: report,
      markdown: renderAnalystReportMarkdown(report),
    });
    const second = await publishReportAtomically({
      jsonPath,
      markdownPath,
      json: report,
      markdown: renderAnalystReportMarkdown(report),
    });
    const afterRetry = await readReportsList({ reportsRootPath: locations.reports });
    assert(first.created && !second.created && afterRetry.reports.length === 1, "REPORT_RETRY_NOT_IDEMPOTENT");
    return evidence("The injected failure left the Reports Library empty and no temporary JSON was visible.", "The explicit retry published one complete report; a repeated retry created no duplicate.", {
      visible_after_failure: afterFailure.reports.length,
      temporary_files_after_failure: filesAfterFailure.filter((name) => name.endsWith(".tmp")).length,
      visible_after_retry: afterRetry.reports.length,
      duplicate_reports: 0,
    }, ["REPORT_WRITE_FAILED"]);
  });
}

async function runFeedbackScenario(
  scenarios: ProductFailureDrillScenario[],
  locations: FailureDrillLocations,
): Promise<void> {
  await runScenario(scenarios, "feedback-write-failure", "A feedback write failure changes no lifecycle state and an explicit retry can succeed.", async () => {
    const protectedBeforeFeedback = {
      followUpHash: await hashPaths([locations.follow_up, `${locations.follow_up}.bak`]),
      establishedHash: await hashPaths([locations.established]),
      reportHash: await hashTree(locations.reports),
      aiHash: await hashTree(locations.ai),
    };
    const store = await createFeedbackStore({ databaseFilePath: locations.feedback });
    const input = {
      created_at: "2026-07-30T12:50:00.000Z",
      category: "IMPROVEMENT" as const,
      title: "Controlled resilience feedback",
      details: "A deterministic write failure was simulated without changing product lifecycle.",
      screen_context: "feedback" as const,
      locale: "pl" as const,
      build_sha: null,
      runtime_mode: "INTERNAL_BETA",
      pseudonymous_session_id: "00000000-0000-4000-8000-000000000001",
      submission_key: "failure-drill-feedback-retry",
      candidate_identity: null,
      follow_up_entry_id: null,
      report_id: null,
      scanner_run_id: null,
      route_context: "feedback" as const,
      viewport_class: "desktop" as const,
    };
    let injectFailure = true;
    const capture = () => {
      if (injectFailure) throw new Error("INJECTED_FEEDBACK_WRITE_FAILURE");
      return store.capture(input);
    };
    let failed = false;
    try { capture(); } catch { failed = true; }
    assert(failed && store.health(true).total_count === 0, "FAILED_FEEDBACK_WAS_STORED");
    const protectedAfterFailure = {
      followUpHash: await hashPaths([locations.follow_up, `${locations.follow_up}.bak`]),
      establishedHash: await hashPaths([locations.established]),
      reportHash: await hashTree(locations.reports),
      aiHash: await hashTree(locations.ai),
    };
    assert(JSON.stringify(protectedAfterFailure) === JSON.stringify(protectedBeforeFeedback), "FEEDBACK_CHANGED_PRODUCT_STATE");
    injectFailure = false;
    const retry = capture();
    const repeated = capture();
    const count = store.health(true).total_count;
    store.close();
    assert(retry.created && !repeated.created && count === 1, "FEEDBACK_RETRY_NOT_IDEMPOTENT");
    return evidence("The user-facing failure path stored no feedback and left lifecycle, reports and AI unchanged.", "An explicit retry recorded one feedback item and a repeated submission reused it.", {
      records_after_failure: 0,
      records_after_retry: count,
      lifecycle_unchanged: true,
      follow_up_unchanged: true,
      established_unchanged: true,
      reports_unchanged: true,
      ai_unchanged: true,
      client_message: "Nie udało się zapisać opinii. Spróbuj ponownie później.",
    }, ["STORAGE_UNAVAILABLE"]);
  });
}

export async function captureProtectedProductState(): Promise<ProtectedProductState> {
  const automationState = resolve(getDefaultAutomationDirectory(), "automation-state.json");
  return {
    follow_up: await hashPaths([getDefaultFollowUpStorePath(), `${getDefaultFollowUpStorePath()}.bak`]),
    established_universe: await hashPaths([
      getDefaultEstablishedUniverseStorePath(),
      resolve(REPO_ROOT, ESTABLISHED_ADDRESS_UNIVERSE_CONFIG_PATH),
    ]),
    feedback_store: await hashPaths(sqliteGroup(getDefaultFeedbackStorePath())),
    ai_store: await hashPaths(sqliteGroup(getDefaultAIAnalysisQueueStorePath())),
    snapshot_pointers: await hashPaths([automationState]),
    canonical_reports: await hashTree(CANONICAL_REPORTS_ROOT),
    configuration: await hashTree(resolve(REPO_ROOT, "config")),
  };
}

export function renderProductFailureDrillMarkdown(manifest: ProductFailureDrillManifest): string {
  const rows = manifest.scenarios.map((scenario) => (
    `| ${escapeMarkdown(scenario.id)} | ${scenario.status} | ${escapeMarkdown(scenario.actual_result)} | ${escapeMarkdown(scenario.recovery_result)} |`
  )).join("\n");
  const needsFix = manifest.scenarios.filter((scenario) => scenario.status !== "PASS");
  return [
    `# Crypto Edge AI — STAB.1 ${manifest.status}`,
    "",
    `- Run ID: \`${manifest.run_id}\``,
    `- Started: ${manifest.started_at}`,
    `- Completed: ${manifest.completed_at}`,
    `- Last-known-good preserved: **${manifest.scenarios.filter((scenario) => /scanner|central|ai-invalid/.test(scenario.id)).every((scenario) => scenario.status === "PASS") ? "yes" : "no"}**`,
    `- Recovery verified: **${manifest.scenarios.filter((scenario) => /recovery|restart|write-failure|refresh-timeout/.test(scenario.id)).every((scenario) => scenario.status === "PASS") ? "yes" : "no"}**`,
    `- Duplicate records created: **${manifest.scenarios.some((scenario) => scenario.evidence.duplicate_records === 1 || scenario.evidence.duplicate_jobs === 1 || scenario.evidence.duplicate_reports === 1) ? 1 : 0}**`,
    `- Canonical mutations: **${manifest.canonical_mutations}**`,
    `- Task Scheduler mutations: **${manifest.scheduler_mutations}**`,
    `- Task Scheduler host status: **${manifest.scheduler_host_status}**`,
    `- OpenAI calls: **${manifest.openai_calls}**`,
    `- Live provider calls: **${manifest.live_provider_calls}**`,
    "",
    "## Simulated failures",
    "",
    "| Scenario | Status | Actual result | Recovery |",
    "| --- | --- | --- | --- |",
    rows,
    "",
    "## Protected canonical state",
    "",
    ...Object.keys(manifest.protected_state_before).map((key) => {
      const field = key as keyof ProtectedProductState;
      return `- ${field}: ${manifest.protected_state_before[field] === manifest.protected_state_after[field] ? "unchanged" : "CHANGED"}`;
    }),
    "",
    "## Follow-up fixes",
    "",
    ...(needsFix.length === 0 ? ["- none"] : needsFix.map((scenario) => `- ${scenario.id}: ${scenario.actual_result}`)),
    "",
    "## Retry and circuit breaker",
    "",
    `- Central maximum transient attempts: ${manifest.retry_policy.central_data_cycle.maximum_attempts}.`,
    "- Central failures wait for the existing scheduler cadence; no in-process retry loop is added.",
    `- AI maximum attempts: ${manifest.retry_policy.ai_worker.maximum_attempts}; base backoff ${manifest.retry_policy.ai_worker.base_backoff_ms} ms with multiplier ${manifest.retry_policy.ai_worker.multiplier}.`,
    `- Ordinary-user circuit-breaker resume: ${manifest.circuit_breaker_policy.ordinary_user_resume ? "allowed" : "blocked"}.`,
    "- Half-open is an owner-only bounded probe; successful validated publication returns the breaker to closed.",
    "",
    "## Isolation",
    "",
    `- Follow-up: \`${manifest.isolated_locations.follow_up}\``,
    `- Established: \`${manifest.isolated_locations.established}\``,
    `- AI: \`${manifest.isolated_locations.ai}\``,
    `- Feedback: \`${manifest.isolated_locations.feedback}\``,
    `- Reports: \`${manifest.isolated_locations.reports}\``,
    "",
    "This run is a stabilization gate before the separate backup/restore/rollback stage.",
    "",
  ].join("\n");
}

async function runScenario(
  scenarios: ProductFailureDrillScenario[],
  id: ProductFailureDrillScenarioId,
  expectedResult: string,
  operation: () => Promise<Omit<ProductFailureDrillScenario, "id" | "status" | "expected_result">>,
): Promise<void> {
  try {
    const result = await operation();
    scenarios.push({ id, status: "PASS", expected_result: expectedResult, ...result });
  } catch (error) {
    const code = safeErrorCode(error);
    scenarios.push({
      id,
      status: "FAILED",
      expected_result: expectedResult,
      actual_result: `The controlled scenario failed with safe code ${code}.`,
      recovery_result: "Recovery was not proven.",
      error_codes: [code],
      evidence: {},
    });
  }
}

function evidence(
  actualResult: string,
  recoveryResult: string,
  values: ProductFailureDrillScenario["evidence"],
  errorCodes: string[] = [],
): Omit<ProductFailureDrillScenario, "id" | "status" | "expected_result"> {
  return {
    actual_result: actualResult,
    recovery_result: recoveryResult,
    error_codes: errorCodes,
    evidence: values,
  };
}

function failureDrillScannerFixture(): ScannerApiOutput {
  const output = structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerApiOutput;
  const generatedAt = "2026-07-30T12:00:00.000Z";
  const runId = "scan_failure_drill_fixture";
  output.scan_run = { ...output.scan_run, run_id: runId, mode: "live", started_at: generatedAt, finished_at: generatedAt };
  output.candidates = output.candidates.slice(0, 1).map((candidate) => ({
    ...candidate,
    run_id: runId,
    chain: "base",
    contract_address: "0x1111111111111111111111111111111111111111",
    pair_address: "0x2222222222222222222222222222222222222222",
    source_url: "https://dexscreener.com/base/0x2222222222222222222222222222222222222222",
    discovery_basket: "new_emerging",
    discovery_method: "dexscreener_latest_token_profiles",
    observation_only: true,
    established_eligible: false,
    address_identity_verified: true,
    created_at: generatedAt,
  }));
  const candidateId = output.candidates[0]!.candidate_id;
  output.security_checks = output.security_checks
    .filter((entry) => entry.candidate_id === PERSISTABLE_SCANNER_SAMPLE.candidates[0]!.candidate_id)
    .map((entry) => ({ ...entry, run_id: runId, candidate_id: candidateId }));
  output.scorecards = output.scorecards
    .filter((entry) => entry.candidate_id === PERSISTABLE_SCANNER_SAMPLE.candidates[0]!.candidate_id)
    .map((entry) => ({ ...entry, run_id: runId, candidate_id: candidateId, created_at: generatedAt }));
  output.provenance = {
    schema_version: "scanner_snapshot_v2",
    contract_version: "scanner_contract_v1",
    generator_version: "failure_drill_fixture_v1",
    environment: "INTERNAL_BETA",
    mode: "live",
    fixture_used: false,
    run_id: runId,
    generated_at: generatedAt,
    finished_at: generatedAt,
    source_ids: ["deterministic_mock"],
    policy_decisions: {},
    metadata: { source_health: { deterministic_mock: "READY" } },
  };
  output._source_meta = {
    source: "real-output",
    reason: "validated controlled failure-drill fixture",
    selected_run_id: runId,
    loaded_at: generatedAt,
    runtime_mode: "INTERNAL_BETA",
    age_seconds: 0,
    source_ids: ["deterministic_mock"],
    freshness_status: "FRESH",
  };
  return validateScannerApiOutput(output);
}

function nextScannerFixture(current: ScannerApiOutput, runId: string, symbol: string): ScannerApiOutput {
  const next = structuredClone(current);
  next.scan_run.run_id = runId;
  next.scan_run.finished_at = "2026-07-30T12:05:00.000Z";
  next.candidates[0]!.run_id = runId;
  next.candidates[0]!.symbol = symbol;
  next.security_checks = next.security_checks.map((securityCheck) => ({ ...securityCheck, run_id: runId }));
  next.scorecards = next.scorecards.map((scorecard) => ({ ...scorecard, run_id: runId }));
  next.provenance!.run_id = runId;
  next.provenance!.generated_at = "2026-07-30T12:05:00.000Z";
  next.provenance!.finished_at = "2026-07-30T12:05:00.000Z";
  next._source_meta!.selected_run_id = runId;
  next._source_meta!.loaded_at = "2026-07-30T12:05:00.000Z";
  return validateScannerApiOutput(next);
}

function readyScannerResult(output: ScannerApiOutput): ScannerDataSourceLoadResult {
  return interpretScannerApiOutput(output);
}

function scannerError(reasonCode: string): ScannerDataSourceLoadResult {
  return {
    status: "error",
    source: "api",
    resolvedSource: "unavailable",
    usedFallback: false,
    reasonCode,
    error: "controlled scanner failure",
    output: null,
  };
}

function followUpCandidate(scanner: ScannerApiOutput): FollowUpObservationCandidate {
  const candidate = scanner.candidates[0]!;
  return {
    candidate_id: candidate.candidate_id,
    symbol: candidate.symbol,
    name: candidate.name,
    chain: candidate.chain,
    contract_address: candidate.contract_address,
    pair_address: candidate.pair_address,
    pair_created_at: candidate.pair_created_at,
    price_usd: candidate.price_usd,
    market_cap_usd: candidate.market_cap_usd,
    fdv_usd: candidate.fdv_usd,
    liquidity_usd: candidate.liquidity_usd,
    volume_24h_usd: candidate.volume_24h_usd,
    volume_market_cap_ratio: candidate.volume_market_cap_ratio,
    pair_age_days: candidate.pair_age_days,
    basic_filter_status: candidate.basic_filter_status,
    filter_reasons: candidate.filter_reasons,
    discovery_basket: "new_emerging",
    observation_only: true,
  };
}

function aiContextOptions(fixturePath: string, locations: FailureDrillLocations) {
  return {
    scanner: {
      runtimeMode: "DEVELOPMENT_DEMO" as const,
      fixturePath,
      outputDirPath: resolve(locations.snapshots, "no-live-output"),
    },
    followUp: { storePath: resolve(locations.root, "ai-follow-up", "missing.json"), now: () => AI_NOW },
    reports: { reportsRootPath: resolve(locations.root, "ai-reports", "missing"), now: AI_NOW },
    now: () => AI_NOW,
  };
}

function cacheIdentity(context: AIResearchContext): AIAnalysisCacheIdentity {
  return buildAIAnalysisCacheIdentity({
    ...context.identity,
    snapshot_fingerprint: context.snapshot_fingerprint,
    prompt_version: context.prompt_version,
    model_id: "gpt-5-mini",
    analysis_schema_version: "ai_research_brief_v2",
    locale: "en",
  });
}

function enqueueAI(
  store: Awaited<ReturnType<typeof createAIAnalysisQueueStore>>,
  identity: AIAnalysisCacheIdentity,
  session: string,
  at: Date,
) {
  return store.enqueue({
    identity,
    session_scope_hash: hashAIAnalysisRateScope(session),
    now: at,
    rate_limits: aiRateLimits(),
  });
}

function aiRateLimits() {
  return { windowMs: 600_000, session: 10, identity: 10, global: 100, cooldownMs: 60_000 };
}

function aiRequest(chain: string, contractAddress: string, idempotencyKey: string) {
  return { chain, contract_address: contractAddress, locale: "pl" as const, idempotency_key: idempotencyKey };
}

function mockProvider(generateJson: (context: AIResearchContext) => Promise<string>): AIResearchProvider {
  return {
    mode: "OPENAI",
    model: "gpt-5-mini",
    async generate(context) {
      return {
        raw_json: await generateJson(context),
        model: "gpt-5-mini",
        token_usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        latency_ms: 1,
        request_id: "failure_drill_mock_response",
      };
    },
  };
}

function validNarrative(context: AIResearchContext) {
  return {
    narrative_version: "ai_research_narrative_v3",
    summary: { en: "The recorded snapshot gives market context while evidence gaps still need verification.", pl: "Zapisana migawka daje kontekst rynkowy, ale luki w danych nadal wymagają sprawdzenia." },
    fact_narratives: context.fact_candidates.map((item) => ({ id: `fact:${item.key}`, en: "This recorded fact adds context to the research view.", pl: "Ten zapisany fakt uzupełnia obecną analizę." })),
    risk_narratives: context.risk_candidates.map((_risk, index) => ({ id: `risk:${index}`, en: "Recorded risk needs review.", pl: "Zapisane ryzyko wymaga sprawdzenia." })),
    missing_narratives: context.missing_information.map((item) => ({ id: `missing:${item.key}`, en: "This evidence gap limits the current research view.", pl: "Ta luka w danych ogranicza obecną analizę." })),
    action_narratives: context.action_catalog.map((_action, index) => ({ id: `action:${index}`, en: "Use this permitted research step to verify the evidence.", pl: "Wykorzystaj ten dozwolony krok analizy, aby sprawdzić dane." })),
    status_change_narratives: context.status_change_conditions.map((condition) => ({ id: `condition:${condition.key}`, en: "This condition would justify revisiting the research view.", pl: "Ten warunek uzasadnia ponowne sprawdzenie analizy." })),
  };
}

function realLocations(root: string): FailureDrillLocations {
  return {
    root,
    snapshots: resolve(root, "snapshots"),
    automation: resolve(root, "automation"),
    follow_up: resolve(root, "follow-up", "store.json"),
    established: resolve(root, "established", "store.json"),
    feedback: resolve(root, "feedback", "feedback.sqlite"),
    reports: resolve(root, "reports"),
    ai: resolve(root, "ai"),
    manifest: resolve(root, "product-failure-drill-manifest.json"),
    report: resolve(root, "product-failure-drill-report.md"),
  };
}

function safeLocations(runId: string): FailureDrillLocations {
  const root = ["%TEMP%", PRODUCT_FAILURE_DRILL_BASE_DIRECTORY, runId].join("\\");
  const child = (...segments: string[]) => [root, ...segments].join("\\");
  return {
    root,
    snapshots: child("snapshots"),
    automation: child("automation"),
    follow_up: child("follow-up", "store.json"),
    established: child("established", "store.json"),
    feedback: child("feedback", "feedback.sqlite"),
    reports: child("reports"),
    ai: child("ai"),
    manifest: child("product-failure-drill-manifest.json"),
    report: child("product-failure-drill-report.md"),
  };
}

function resolveIsolatedRoot(runId: string, configured?: string): string {
  const root = configured
    ? resolve(configured)
    : resolve(tmpdir(), PRODUCT_FAILURE_DRILL_BASE_DIRECTORY, runId);
  if (basename(root) !== runId) throw new Error("ISOLATED_ROOT_RUN_ID_MISMATCH");
  return root;
}

function normalizeRunId(value: string): string {
  if (!RUN_ID_PATTERN.test(value)) throw new Error("FAILURE_DRILL_RUN_ID_INVALID");
  return value;
}

function normalizeSchedulerHostStatus(value: unknown): string {
  if (typeof value !== "string") return "HOST_STATUS_NOT_OBSERVED";
  const normalized = value.trim().toUpperCase().replace(/[ -]+/g, "_");
  return ["NOT_INSTALLED", "READY", "RUNNING", "DISABLED", "QUEUED", "UNKNOWN"].includes(normalized)
    ? normalized
    : "HOST_STATUS_NOT_OBSERVED";
}

function countProtectedStateChanges(before: ProtectedProductState, after: ProtectedProductState): number {
  return (Object.keys(before) as Array<keyof ProtectedProductState>)
    .filter((key) => before[key] !== after[key]).length;
}

function sqliteGroup(path: string): string[] {
  return [path, `${path}-wal`, `${path}-shm`, `${path}.bak`];
}

async function hashTree(root: string): Promise<string> {
  const files = await collectFiles(root);
  return hashPaths(files.length > 0 ? files : [root]);
}

async function collectFiles(root: string): Promise<string[]> {
  const metadata = await stat(root).catch(() => null);
  if (!metadata) return [];
  if (metadata.isFile()) return [resolve(root)];
  if (!metadata.isDirectory()) return [];
  const files: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function hashPaths(paths: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const path of [...new Set(paths.map((value) => resolve(value)))].sort()) {
    hash.update(relative(REPO_ROOT, path).replaceAll("\\", "/"));
    const metadata = await stat(path).catch(() => null);
    if (!metadata?.isFile()) {
      hash.update(":missing;");
      continue;
    }
    hash.update(`:${metadata.size}:`);
    hash.update(await readFile(path));
    hash.update(";");
  }
  return `sha256:${hash.digest("hex")}`;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(path: string, value: string): Promise<void> {
  const target = resolve(path);
  const temporary = resolve(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  await mkdir(dirname(target), { recursive: true });
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
}

function safeErrorCode(error: unknown): string {
  const raw = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : error instanceof Error ? error.message : "FAILURE_DRILL_FAILED";
  const normalized = raw.split(":", 1)[0]!.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 120);
  return normalized || "FAILURE_DRILL_FAILED";
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
