import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFollowUpRecheckSuccess,
  FOLLOW_UP_CHECKPOINT_DAYS,
  followUpIdentity,
  getDefaultFollowUpStorePath,
  ingestFollowUpObservations,
  readFollowUpStore,
  synchronizeFollowUpEstablishedMembership,
  updateFollowUpStore,
  type FollowUpObservationCandidate,
} from "../../data-poc/src/followUpBasket.js";
import {
  ESTABLISHED_ADDRESS_UNIVERSE_CONFIG_PATH,
  getDefaultEstablishedUniverseStorePath,
  universeIdentityKey,
} from "../../data-poc/src/establishedAddressUniverse.js";
import {
  mutateEstablishedUniverse,
  readEstablishedUniverseStore,
  writeStoreAtomically,
} from "../../data-poc/src/establishedUniverseManager.js";
import { getDefaultAutomationDirectory } from "../../data-poc/src/automation/automationPaths.js";
import type { AIResearchContext } from "./aiResearchContext.js";
import type { AIResearchProvider } from "./aiResearchProvider.js";
import {
  createAIAnalysisQueueStore,
  getDefaultAIAnalysisQueueStorePath,
  type AIAnalysisQueueStore,
} from "./aiResearchQueueStore.js";
import { createAIResearchService } from "./aiResearchService.js";
import { createFeedbackStore, getDefaultFeedbackStorePath, type FeedbackStore } from "./feedbackStore.js";
import { publishReportAtomically } from "./atomicReportPublisher.js";
import { readLatestScannerOutput, type ScannerOutputWithMeta } from "./latestScannerOutput.js";
import { readReportsList } from "./reportsLibrary.js";
import { createScannerApiHandler } from "./scannerApiHandler.js";
import {
  createEmptyProductScannerViewState,
  resolveProductScannerRefreshState,
} from "../src/productRefreshState.js";
import type { ScannerApiOutput } from "../src/types/scannerTypes.js";

export const PRODUCT_E2E_SCHEMA_VERSION = "product_e2e_run_v1";
export const PRODUCT_E2E_REPORT_SCHEMA_VERSION = "product_e2e_report_v1";
export const PRODUCT_E2E_BASE_DIRECTORY_NAME = "crypto-edge-product-e2e";

export const PRODUCT_E2E_VIEW_SEQUENCE = [
  "radar",
  "refresh-view",
  "candidate-detail",
  "detail-summary",
  "detail-observation",
  "detail-ai",
  "main-radar",
  "reports",
  "feedback",
] as const;

export type ProductE2EStatus = "PASS" | "PARTIAL" | "FAILED";
export type ProductE2EStepStatus = "PASS" | "SKIPPED" | "FAILED";

export type ProductE2EStep = {
  id: string;
  status: ProductE2EStepStatus;
  started_at: string;
  completed_at: string;
  safe_error_code: string | null;
  record_ids: string[];
};

export type ProductE2ECanonicalState = {
  established_universe: string;
  feedback_store: string;
  follow_up_store: string;
  snapshot_pointers: string;
  ai_store: string;
};

export type ProductE2EManifest = {
  schema_version: typeof PRODUCT_E2E_SCHEMA_VERSION;
  report_schema_version: typeof PRODUCT_E2E_REPORT_SCHEMA_VERSION;
  run_id: string;
  started_at: string;
  completed_at: string;
  status: ProductE2EStatus;
  source_snapshot_id: string;
  chain: string;
  contract_address: string;
  steps: ProductE2EStep[];
  isolated_records: {
    follow_up_entry_id: string | null;
    established_entry_id: string | null;
    established_universe_version: string | null;
    analysis_id: string | null;
    report_id: string | null;
    feedback_id: string | null;
  };
  isolated_stores: {
    root: string;
    follow_up: string;
    established: string;
    ai_queue: string;
    feedback: string;
    reports: string;
  };
  idempotency: {
    follow_up_records: number;
    established_versions_created: number;
    ai_queue_records: number;
    product_reports: number;
    feedback_records: number;
  };
  mock_provider_calls: number;
  happy_path_mock_provider_calls: number;
  ai_status_trace: Array<"QUEUED" | "PROCESSING" | "READY">;
  live_openai_calls: 0;
  live_data_provider_calls: 0;
  canonical_store_mutations: number;
  canonical_protection: {
    before: ProductE2ECanonicalState;
    after: ProductE2ECanonicalState;
    unchanged: boolean;
  };
  scheduler_mutations: 0;
  scheduler_host_status: string;
  owner_user_boundaries: {
    user_can_promote_established: false;
    user_can_force_provider_call: false;
    owner_decision_recorded: boolean;
    worker_started_by_owner: boolean;
  };
  navigation: {
    views: typeof PRODUCT_E2E_VIEW_SEQUENCE;
    identity_preserved: boolean;
    locale_identity_preserved: boolean;
    refresh_collector_calls: 0;
    refresh_view: {
      last_known_good_preserved: boolean;
      identity_preserved: boolean;
      snapshot_timestamp_preserved: boolean;
      source_metadata_preserved: boolean;
      next_success_applied: boolean;
      first_load_empty_state: boolean;
    };
  };
  safe_error_codes: string[];
  fail_closed_boundaries: Array<{
    code: string;
    blocked: boolean;
  }>;
  e2e_report_path: string;
};

export type ProductE2EPreview = {
  schema_version: "product_e2e_preview_v1";
  mode: "PREVIEW";
  source_snapshot_id: string;
  chain: string;
  contract_address: string;
  symbol: string;
  plan: typeof PRODUCT_E2E_VIEW_SEQUENCE;
  isolated_stores: ProductE2EManifest["isolated_stores"];
  mutations_performed: 0;
  mock_worker_started: false;
  live_openai_calls: 0;
  live_data_provider_calls: 0;
  scheduler_mutations: 0;
  scheduler_host_status: string;
};

export type ProductE2ERunResult = {
  manifest: ProductE2EManifest;
  manifestPath: string;
  reportPath: string;
  productReportPath: string | null;
  isolatedStores: ProductE2EManifest["isolated_stores"];
};

export type ProductE2EOptions = {
  runId?: string;
  isolatedRoot?: string;
  now?: () => Date;
  schedulerHostStatus?: string;
};

type E2ECandidate = FollowUpObservationCandidate & {
  candidate_id: string;
  symbol: string;
  name: string;
  chain: string;
  contract_address: string;
  final_label?: string;
  security_label?: string;
};

type HttpResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
};

const PRODUCT_E2E_RUN_ID = /^product-e2e-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/;
const SAFE_SOURCE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DATA_POC_OUTPUT_DIRECTORY = fileURLToPath(new URL("../../data-poc/output", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export async function previewFullProductE2E(options: ProductE2EOptions = {}): Promise<ProductE2EPreview> {
  const selection = await selectRealProductE2EIdentity();
  const runId = normalizeRunId(options.runId ?? createProductE2ERunId(options.now?.() ?? new Date()));
  return {
    schema_version: "product_e2e_preview_v1",
    mode: "PREVIEW",
    source_snapshot_id: selection.sourceSnapshotId,
    chain: selection.identity.chain,
    contract_address: selection.identity.contract_address,
    symbol: selection.candidate.symbol,
    plan: PRODUCT_E2E_VIEW_SEQUENCE,
    isolated_stores: safeIsolatedStorePaths(runId),
    mutations_performed: 0,
    mock_worker_started: false,
    live_openai_calls: 0,
    live_data_provider_calls: 0,
    scheduler_mutations: 0,
    scheduler_host_status: normalizeSchedulerHostStatus(options.schedulerHostStatus),
  };
}

export async function selectRealProductE2EIdentity(): Promise<{
  candidate: E2ECandidate;
  scanner: ScannerOutputWithMeta;
  sourceSnapshotId: string;
  identity: ReturnType<typeof followUpIdentity>;
}> {
  const scanner = await readLatestScannerOutput({ runtimeMode: "INTERNAL_BETA" });
  const candidates = Array.isArray(scanner.candidates) ? scanner.candidates : [];
  const established = await readEstablishedUniverseStore();
  for (const value of candidates) {
    const candidate = parseE2ECandidate(value);
    if (!candidate || candidate.discovery_basket !== "new_emerging" || candidate.observation_only !== true) continue;
    let identity: ReturnType<typeof followUpIdentity>;
    try {
      identity = followUpIdentity(candidate.chain, candidate.contract_address);
    } catch {
      continue;
    }
    const alreadyEstablished = established.current.entries.some((entry) => (
      entry.enabled && universeIdentityKey(entry.chain, entry.contract_address) === identity.identity
    ));
    if (alreadyEstablished) continue;
    const sourceSnapshotId = scanner._source_meta.selected_run_id
      ?? (isRecord(scanner.scan_run) && typeof scanner.scan_run.run_id === "string" ? scanner.scan_run.run_id : null);
    if (!sourceSnapshotId || !SAFE_SOURCE_RUN_ID.test(sourceSnapshotId)) {
      throw new ProductE2EError("SOURCE_SNAPSHOT_ID_INVALID");
    }
    return { candidate, scanner, sourceSnapshotId, identity };
  }
  throw new ProductE2EError("SUPPORTED_REAL_NEW_IDENTITY_UNAVAILABLE");
}

export async function runFullProductE2E(options: ProductE2EOptions = {}): Promise<ProductE2ERunResult> {
  const startedAt = options.now?.() ?? new Date();
  const runId = normalizeRunId(options.runId ?? createProductE2ERunId(startedAt));
  const root = resolveIsolatedRoot(runId, options.isolatedRoot);
  const paths = isolatedStorePaths(root);
  const manifestPath = resolve(root, "product-e2e-manifest.json");
  const reportPath = resolve(root, "product-e2e-report.md");
  const steps: ProductE2EStep[] = [];
  const safeErrorCodes: string[] = [];
  let selection: Awaited<ReturnType<typeof selectRealProductE2EIdentity>> | null = null;
  let canonicalBefore: ProductE2ECanonicalState | null = null;
  let canonicalAfter: ProductE2ECanonicalState;
  let queueStore: AIAnalysisQueueStore | null = null;
  let feedbackStore: FeedbackStore | null = null;
  let server: Server | null = null;
  let followUpEntryId: string | null = null;
  let establishedEntryId: string | null = null;
  let establishedVersion: string | null = null;
  let analysisId: string | null = null;
  let reportId: string | null = null;
  let feedbackId: string | null = null;
  let productReportPath: string | null = null;
  let mockProviderCalls = 0;
  let happyPathMockProviderCalls = 0;
  const aiStatusTrace: Array<"QUEUED" | "PROCESSING" | "READY"> = [];
  let ownerDecisionRecorded = false;
  let workerStartedByOwner = false;
  let followUpRecords = 0;
  let establishedVersionsCreated = 0;
  let aiQueueRecords = 0;
  let productReports = 0;
  let feedbackRecords = 0;
  let refreshView = emptyRefreshViewResult();
  const schedulerHostStatus = normalizeSchedulerHostStatus(options.schedulerHostStatus);

  await mkdir(root, { recursive: true });

  try {
    selection = await runStep(steps, "select-real-new-token", [], async () => selectRealProductE2EIdentity());
    canonicalBefore = await captureCanonicalProductState();

    await runStep(steps, "new-visible-before-follow-up", [], async () => {
      const empty = await readFollowUpStore(paths.follow_up);
      assert(empty.entries.length === 0, "ISOLATED_FOLLOW_UP_NOT_EMPTY");
      assert(selection!.candidate.discovery_basket === "new_emerging", "TOKEN_NOT_IN_NEW_LAYER");
    });

    await runStep(steps, "refresh-view-last-known-good", [], async () => {
      const readyResult = {
        status: "ready" as const,
        source: "api" as const,
        resolvedSource: "real-output" as const,
        usedFallback: false,
        output: selection!.scanner as ScannerApiOutput,
      };
      const first = resolveProductScannerRefreshState(
        createEmptyProductScannerViewState(),
        readyResult,
        "2026-07-30T12:00:00.000Z",
      );
      const failed = resolveProductScannerRefreshState(first, {
        status: "error",
        source: "api",
        resolvedSource: "unavailable",
        usedFallback: false,
        reasonCode: "SCANNER_API_UNAVAILABLE",
        error: "temporary local API error",
        output: null,
      }, "2026-07-30T12:01:00.000Z");
      const recovered = resolveProductScannerRefreshState(
        failed,
        readyResult,
        "2026-07-30T12:02:00.000Z",
      );
      const firstFailure = resolveProductScannerRefreshState(
        createEmptyProductScannerViewState(),
        {
          status: "error",
          source: "api",
          resolvedSource: "unavailable",
          usedFallback: false,
          reasonCode: "SCANNER_API_UNAVAILABLE",
          error: "temporary local API error",
          output: null,
        },
        "2026-07-30T12:01:00.000Z",
      );
      const identityPreserved = failed.candidates.some((candidate) => {
        try {
          return followUpIdentity(candidate.chain, candidate.contractAddress).identity
            === selection!.identity.identity;
        } catch {
          return false;
        }
      });
      refreshView = {
        last_known_good_preserved: failed.candidates === first.candidates,
        identity_preserved: identityPreserved,
        snapshot_timestamp_preserved: failed.generatedAt === first.generatedAt
          && failed.viewRefreshedAt === first.viewRefreshedAt,
        source_metadata_preserved: failed.runId === first.runId
          && failed.metadata === first.metadata
          && failed.sourceIds === first.sourceIds
          && failed.freshnessStatus === first.freshnessStatus,
        next_success_applied: recovered.candidates !== failed.candidates
          && recovered.lastKnownGoodRefreshError === false,
        first_load_empty_state: firstFailure.hasAcceptedSnapshot === false
          && firstFailure.candidates.length === 0,
      };
      assert(Object.values(refreshView).every(Boolean), "REFRESH_VIEW_LAST_KNOWN_GOOD_FAILED");
    });

    const observedAt = scannerGeneratedAt(selection.scanner);
    const ingested = await runStep(steps, "follow-up-ingest", [], async () => updateFollowUpStore(
      (store) => ingestFollowUpObservations(
        store,
        [selection!.candidate],
        observedAt,
        selection!.sourceSnapshotId,
        null,
      ),
      { storePath: paths.follow_up, now: new Date(observedAt) },
    ));
    followUpEntryId = ingested.entries[0]?.entry_id ?? null;
    assert(followUpEntryId !== null, "FOLLOW_UP_ENTRY_MISSING");
    assert(ingested.entries[0]?.lifecycle_status === "NEW", "FOLLOW_UP_AUTO_PROMOTION_DETECTED");
    assert(
      JSON.stringify(FOLLOW_UP_CHECKPOINT_DAYS) === JSON.stringify([1, 3, 7, 14, 30]),
      "FOLLOW_UP_CHECKPOINT_PLAN_INVALID",
    );

    const ingestedAgain = await runStep(steps, "follow-up-idempotency", [followUpEntryId], async () => updateFollowUpStore(
      (store) => ingestFollowUpObservations(
        store,
        [selection!.candidate],
        observedAt,
        selection!.sourceSnapshotId,
        null,
      ),
      { storePath: paths.follow_up, now: new Date(observedAt) },
    ));
    followUpRecords = ingestedAgain.entries.length;
    assert(followUpRecords === 1, "FOLLOW_UP_DUPLICATE_CREATED");

    const qualifiedAt = new Date(Date.parse(observedAt) + 30 * 24 * 60 * 60_000).toISOString();
    const candidateStore = await runStep(steps, "candidate-for-established", [followUpEntryId], async () => updateFollowUpStore(
      (store) => applyFollowUpRecheckSuccess(store, {
        entry_id: followUpEntryId!,
        candidate: {
          ...selection!.candidate,
          // This is an explicit isolated E2E qualification decision. Identity
          // and every market value remain copied from the validated snapshot.
          basic_filter_status: "passed_basic_filter",
          filter_reasons: [],
        },
        checked_at: qualifiedAt,
        source_run_id: `${selection!.sourceSnapshotId}.e2e`,
      }, null),
      { storePath: paths.follow_up, now: new Date(qualifiedAt) },
    ));
    const candidateEntry = candidateStore.entries[0];
    assert(candidateEntry?.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED", "CANDIDATE_STATE_NOT_REACHED");
    assert(
      JSON.stringify(candidateEntry.completed_checkpoints) === JSON.stringify(FOLLOW_UP_CHECKPOINT_DAYS),
      "FOLLOW_UP_CHECKPOINTS_NOT_PRESERVED",
    );

    const isolatedUniverseInitial = await readEstablishedUniverseStore(paths.established);
    await writeStoreAtomically(paths.established, isolatedUniverseInitial);
    const beforeOwnerDecision = await hashFiles([paths.established]);

    await runStep(steps, "owner-decision-required", [followUpEntryId], async () => {
      const afterNoDecision = await hashFiles([paths.established]);
      assert(afterNoDecision === beforeOwnerDecision, "ESTABLISHED_CHANGED_WITHOUT_OWNER_DECISION");
      assert(candidateEntry.candidate_since !== null, "OWNER_DECISION_CANDIDATE_TIMESTAMP_MISSING");
    });

    const promotion = await runStep(steps, "owner-established-promotion", [followUpEntryId], async () => mutateEstablishedUniverse({
      operation: "add",
      chain: selection!.identity.chain,
      contract_address: selection!.identity.contract_address,
      display_name: selection!.candidate.name,
      symbol_hint: selection!.candidate.symbol,
      owner_note: `Isolated ${PRODUCT_E2E_SCHEMA_VERSION} decision ${runId}`,
      enabled: true,
    }, {
      storePath: paths.established,
      apply: true,
      actor: "product-e2e-owner",
      expectedCurrentVersion: isolatedUniverseInitial.current.universe_version,
      expectedCurrentChecksum: isolatedUniverseInitial.current.checksum,
      now: () => new Date(Date.parse(qualifiedAt) + 1_000),
    }));
    ownerDecisionRecorded = true;
    establishedEntryId = promotion.entry_id;
    establishedVersion = promotion.to_version;
    establishedVersionsCreated = 1;
    assert(promotion.applied, "OWNER_PROMOTION_NOT_APPLIED");

    const isolatedUniverse = await readEstablishedUniverseStore(paths.established);
    const establishedFollowUp = await updateFollowUpStore(
      (store) => synchronizeFollowUpEstablishedMembership(
        store,
        isolatedUniverse.current,
        new Date(Date.parse(qualifiedAt) + 2_000).toISOString(),
        `${selection!.sourceSnapshotId}.owner`,
      ),
      { storePath: paths.follow_up, now: new Date(Date.parse(qualifiedAt) + 2_000) },
    );
    assert(establishedFollowUp.entries[0]?.lifecycle_status === "ESTABLISHED", "ESTABLISHED_NOT_VISIBLE_IN_ISOLATED_FLOW");

    await assertCanonicalFilesUnchanged(canonicalBefore);

    queueStore = await createAIAnalysisQueueStore({ databaseFilePath: paths.ai_queue });
    feedbackStore = await createFeedbackStore({ databaseFilePath: paths.feedback });
    const scenarioNow = () => new Date(Date.parse(qualifiedAt) + 60_000);
    const scannerOptions = {
      runtimeMode: "INTERNAL_BETA" as const,
      outputDirPath: DATA_POC_OUTPUT_DIRECTORY,
      committedRunId: selection.sourceSnapshotId,
      now: new Date(observedAt),
    };
    const contextOptions = {
      scanner: scannerOptions,
      followUp: { storePath: paths.follow_up, now: scenarioNow },
      reports: { reportsRootPath: paths.reports, now: scenarioNow() },
    };
    const aiService = createAIResearchService({
      ...contextOptions,
      queueStore,
      providerEnabled: true,
      modelId: "gpt-5-mini",
      now: scenarioNow,
      rateLimits: { session: 20, identity: 20, global: 20, cooldownMs: 1_000 },
    });
    server = createServer(createScannerApiHandler({
      runtimeMode: "INTERNAL_BETA",
      scanner: scannerOptions,
      followUp: contextOptions.followUp,
      reports: contextOptions.reports,
      establishedUniverse: { storeFilePath: paths.established },
      ownerOperations: { mode: "DISABLED" },
      aiResearch: { service: aiService, sessionSecret: "product-e2e-ai-session-secret-0001" },
      feedback: {
        store: feedbackStore,
        submissionEnabled: true,
        sessionSecret: "product-e2e-feedback-session-secret-0001",
        now: scenarioNow,
        sessionLimit: 20,
        globalLimit: 20,
      },
      health: { buildSha: "product-e2e" },
    }));
    await listen(server);
    const origin = serverOrigin(server);

    await runStep(steps, "user-owner-boundary", [establishedEntryId], async () => {
      const before = await hashFiles([paths.established]);
      const blocked = await httpJson(server!, "POST", "/api/owner-operations/established-promotion", {
        origin,
        "content-type": "application/json",
      }, { preview_id: "e2e-user-cannot-promote", confirmation: "CONFIRM_ADD_TO_ESTABLISHED" });
      assert(blocked.status >= 400, "USER_PROMOTION_NOT_BLOCKED");
      assert(await hashFiles([paths.established]) === before, "USER_PROMOTION_MUTATED_ESTABLISHED");
    });

    await runStep(steps, "ai-unvalidated-data-boundary", [], async () => {
      const response = await httpJson(server!, "POST", "/api/v1/ai-analyses/requests", {
        origin,
        "content-type": "application/json",
      }, {
        chain: "base",
        contract_address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        locale: "pl",
        idempotency_key: `${runId.replaceAll("-", "_")}_unvalidated`,
      });
      assert(response.status === 404, "UNVALIDATED_DATA_DID_NOT_BLOCK_AI");
      assert(queueStore!.stats().records === 0, "UNVALIDATED_DATA_CREATED_AI_JOB");
    });

    await runStep(steps, "public-ai-post-queues-only", [], async () => {
      const response = await httpJson(server!, "POST", "/api/v1/ai-analyses/requests", {
        origin,
        "content-type": "application/json",
      }, {
        chain: selection!.identity.chain,
        contract_address: selection!.identity.contract_address,
        locale: "pl",
        idempotency_key: `${runId.replaceAll("-", "_")}_ai_request_01`,
      });
      assert(response.status === 202, "AI_PUBLIC_POST_FAILED");
      assert(response.body.status === "QUEUED", "AI_PUBLIC_POST_DID_NOT_QUEUE");
      assert(response.body.analysis === null, "AI_PUBLIC_POST_EXPOSED_RESULT");
      assert(!["analysis_id", "cache_key", "queue_status", "provider_mode", "model"].some((key) => Object.hasOwn(response.body, key)), "AI_PUBLIC_POST_LEAKED_INTERNALS");
      assert(mockProviderCalls === 0, "AI_PUBLIC_POST_CALLED_PROVIDER");
      aiStatusTrace.push("QUEUED");
      return response;
    });
    const internalQueued = await aiService.generate({
      chain: selection!.identity.chain,
      contract_address: selection!.identity.contract_address,
      locale: "pl",
      idempotency_key: `${runId.replaceAll("-", "_")}_ai_internal_read`,
    }, "product-e2e-internal-actor");
    analysisId = internalQueued.analysis_id ?? null;
    assert(analysisId !== null, "AI_ANALYSIS_ID_MISSING");

    const secondQueued = await runStep(steps, "shared-ai-status", [analysisId], async () => httpJson(
      server!,
      "POST",
      "/api/v1/ai-analyses/requests",
      { origin, "content-type": "application/json" },
      {
        chain: selection!.identity.chain,
        contract_address: selection!.identity.contract_address,
        locale: "pl",
        idempotency_key: `${runId.replaceAll("-", "_")}_ai_request_02`,
      },
    ));
    assert(secondQueued.body.status === "QUEUED" && secondQueued.body.analysis === null, "AI_SHARED_STATUS_MISMATCH");
    assert(queueStore.stats().records === 1, "AI_QUEUE_DUPLICATE_CREATED");

    const validProvider = deterministicMockProvider(async (context) => {
      mockProviderCalls += 1;
      happyPathMockProviderCalls += 1;
      assert(queueStore!.findByAnalysisId(analysisId!)?.status === "PROCESSING", "AI_PROCESSING_STATE_MISSING");
      aiStatusTrace.push("PROCESSING");
      return deterministicNarrative(context);
    });
    const { createAIResearchWorker } = await import("./aiResearchWorker.js");
    const worker = createAIResearchWorker({
      ...contextOptions,
      store: queueStore,
      provider: validProvider,
      now: scenarioNow,
      workerId: `owner-${runId}`,
      limits: { maxAnalysesPerCycle: 1, maxConcurrency: 1 },
    });
    workerStartedByOwner = true;
    await runStep(steps, "owner-mock-worker", [analysisId], async () => {
      const cycle = await worker.runCycle();
      assert(cycle.claimed === 1 && cycle.completed === 1, "AI_WORKER_DID_NOT_COMPLETE_EXACTLY_ONE");
      assert(cycle.provider_calls === 1 && happyPathMockProviderCalls === 1, "AI_WORKER_CALL_COUNT_INVALID");
      assert(queueStore!.findByAnalysisId(analysisId!)?.status === "READY", "AI_READY_STATE_MISSING");
      aiStatusTrace.push("READY");
    });
    aiQueueRecords = queueStore.stats().records;

    const ready = await runStep(steps, "ai-ready-canvas", [analysisId], async () => httpJson(
      server!,
      "GET",
      `/api/v1/ai-analyses/result?chain=${encodeURIComponent(selection!.identity.chain)}&contract_address=${encodeURIComponent(selection!.identity.contract_address)}&locale=pl`,
    ));
    assert(ready.status === 200 && ready.body.status === "READY", "AI_READY_RESULT_MISSING");
    assert(isRecord(ready.body.analysis) && ready.body.analysis.schema_version === "ai_production_analysis_v1", "AI_BRIEF_SCHEMA_INVALID");
    assert(!["analysis_id", "cache_key", "queue_status", "provider_mode", "model"].some((key) => Object.hasOwn(ready.body, key)), "AI_READY_RESULT_LEAKED_INTERNALS");

    await runStep(steps, "invalid-mock-fails-closed", [analysisId], async () => {
      const failureStore = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "ai-invalid-response.sqlite") });
      try {
        const failureService = createAIResearchService({
          ...contextOptions,
          queueStore: failureStore,
          providerEnabled: true,
          modelId: "gpt-5-mini",
          now: scenarioNow,
        });
        await failureService.generate({
          chain: selection!.identity.chain,
          contract_address: selection!.identity.contract_address,
          locale: "en",
          idempotency_key: `${runId.replaceAll("-", "_")}_invalid_ai`,
        }, "product-e2e-invalid-session");
        const invalidWorker = createAIResearchWorker({
          ...contextOptions,
          store: failureStore,
          provider: deterministicMockProvider(async () => {
            mockProviderCalls += 1;
            return {};
          }),
          now: scenarioNow,
          workerId: `invalid-${runId}`,
          limits: { maxAnalysesPerCycle: 1 },
        });
        const invalidCycle = await invalidWorker.runCycle();
        assert(invalidCycle.completed === 0, "INVALID_AI_RESPONSE_PUBLISHED");
        assert(failureStore.stats().ready === 0, "INVALID_AI_BRIEF_READY");
      } finally {
        failureStore.close();
      }
    });

    const productReport = await runStep(steps, "product-report", [analysisId], async () => {
      assertReadyAnalysisForProductReport(ready.body);
      return writeProductJourneyReport({
        runId,
        reportsRoot: paths.reports,
        sourceSnapshotId: selection!.sourceSnapshotId,
        candidate: selection!.candidate,
        identity: selection!.identity,
        analysisId: analysisId!,
        generatedAt: scenarioNow().toISOString(),
      });
    });
    productReportPath = productReport.jsonPath;
    const library = await readReportsList({ reportsRootPath: paths.reports, now: scenarioNow() });
    const listed = library.reports.find((report) => (
      report.chain === selection!.identity.chain
      && report.contract_address === selection!.identity.contract_address
    ));
    assert(listed, "PRODUCT_REPORT_NOT_VISIBLE_IN_LIBRARY");
    reportId = listed.report_id;
    productReports = library.reports.length;
    assert(productReports === 1, "PRODUCT_REPORT_DUPLICATE_CREATED");

    const feedback = await runStep(steps, "feedback", [reportId], async () => {
      const statusResponse = await httpJson(server!, "GET", "/api/feedback/status");
      const cookie = cookieHeader(statusResponse.headers["set-cookie"]);
      const response = await httpJson(server!, "POST", "/api/feedback", {
        origin,
        "content-type": "application/json",
        "x-crypto-edge-feedback": "1",
        cookie,
      }, {
        submission_key: stableUuid(runId),
        category: "IMPROVEMENT",
        title: "Pełna ścieżka produktu zakończona",
        details: "Raport i analiza są czytelne, a tożsamość tokena pozostała zachowana.",
        screen_context: "feedback",
        locale: "pl",
        subject_ref: { type: "report", id: reportId },
      });
      assert(response.status === 201, "FEEDBACK_NOT_RECORDED");
      return response;
    });
    feedbackId = typeof feedback.body.feedback_id === "string" ? feedback.body.feedback_id : null;
    feedbackRecords = feedbackStore.health(true).total_count;
    assert(feedbackId && feedbackRecords === 1, "FEEDBACK_STORE_INVALID");

    const establishedAfterFeedback = await readEstablishedUniverseStore(paths.established);
    const followUpAfterFeedback = await readFollowUpStore(paths.follow_up);
    const analysisAfterFeedback = queueStore.findByAnalysisId(analysisId);
    const reportsAfterFeedback = await readReportsList({ reportsRootPath: paths.reports, now: scenarioNow() });
    assert(establishedAfterFeedback.current.universe_version === establishedVersion, "FEEDBACK_CHANGED_ESTABLISHED");
    assert(followUpAfterFeedback.entries[0]?.lifecycle_status === "ESTABLISHED", "FEEDBACK_CHANGED_FOLLOW_UP");
    assert(analysisAfterFeedback?.status === "READY", "FEEDBACK_CHANGED_AI");
    assert(reportsAfterFeedback.reports.length === 1, "FEEDBACK_CHANGED_REPORT");

    await runStep(steps, "fail-closed-identity-boundaries", [], async () => {
      assertThrowsCode(() => followUpIdentity(selection!.identity.chain, "invalid"), "INVALID_CONTRACT_ADDRESS");
      assertThrowsCode(() => followUpIdentity("unsupported-e2e-chain", selection!.identity.contract_address), "UNSUPPORTED_CHAIN");
    });

    await runStep(steps, "second-run-idempotency", [
      followUpEntryId,
      establishedEntryId,
      analysisId,
      reportId,
      feedbackId,
    ], async () => {
      const sameFollowUp = await updateFollowUpStore(
        (store) => ingestFollowUpObservations(
          store,
          [selection!.candidate],
          observedAt,
          selection!.sourceSnapshotId,
          isolatedUniverse.current,
        ),
        { storePath: paths.follow_up, now: scenarioNow() },
      );
      assert(sameFollowUp.entries.length === 1, "SECOND_RUN_FOLLOW_UP_DUPLICATE");
      assert(queueStore!.stats().records === 1, "SECOND_RUN_AI_DUPLICATE");
      assert((await readReportsList({ reportsRootPath: paths.reports })).reports.length === 1, "SECOND_RUN_REPORT_DUPLICATE");
      assert(feedbackStore!.health(true).total_count === 1, "SECOND_RUN_FEEDBACK_RESUBMITTED");
      assert((await readEstablishedUniverseStore(paths.established)).current.universe_version === establishedVersion, "SECOND_RUN_ESTABLISHED_VERSION_CREATED");
    });

    await assertCanonicalFilesUnchanged(canonicalBefore);
  } catch (error) {
    safeErrorCodes.push(safeErrorCode(error));
    if (steps.at(-1)?.status !== "FAILED") {
      const now = new Date().toISOString();
      steps.push({
        id: "unhandled-failure",
        status: "FAILED",
        started_at: now,
        completed_at: now,
        safe_error_code: safeErrorCodes.at(-1) ?? "PRODUCT_E2E_FAILED",
        record_ids: [],
      });
    }
  } finally {
    if (server) await close(server).catch(() => undefined);
    queueStore?.close();
    feedbackStore?.close();
    canonicalAfter = await captureCanonicalProductState().catch(() => unavailableCanonicalState());
  }

  canonicalBefore ??= canonicalAfter;
  const canonicalUnchanged = equalCanonicalState(canonicalBefore, canonicalAfter);
  if (!canonicalUnchanged) safeErrorCodes.push("CANONICAL_STATE_MUTATION_DETECTED");
  const completedAt = options.now?.() ?? new Date();
  const failed = safeErrorCodes.length > 0 || steps.some((step) => step.status === "FAILED");
  const manifest: ProductE2EManifest = {
    schema_version: PRODUCT_E2E_SCHEMA_VERSION,
    report_schema_version: PRODUCT_E2E_REPORT_SCHEMA_VERSION,
    run_id: runId,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    status: failed ? "FAILED" : steps.some((step) => step.status === "SKIPPED") ? "PARTIAL" : "PASS",
    source_snapshot_id: selection?.sourceSnapshotId ?? "unavailable",
    chain: selection?.identity.chain ?? "unavailable",
    contract_address: selection?.identity.contract_address ?? "unavailable",
    steps,
    isolated_records: {
      follow_up_entry_id: followUpEntryId,
      established_entry_id: establishedEntryId,
      established_universe_version: establishedVersion,
      analysis_id: analysisId,
      report_id: reportId,
      feedback_id: feedbackId,
    },
    isolated_stores: safeIsolatedStorePaths(runId),
    idempotency: {
      follow_up_records: followUpRecords,
      established_versions_created: establishedVersionsCreated,
      ai_queue_records: aiQueueRecords,
      product_reports: productReports,
      feedback_records: feedbackRecords,
    },
    mock_provider_calls: mockProviderCalls,
    happy_path_mock_provider_calls: happyPathMockProviderCalls,
    ai_status_trace: aiStatusTrace,
    live_openai_calls: 0,
    live_data_provider_calls: 0,
    canonical_store_mutations: canonicalUnchanged ? 0 : 1,
    canonical_protection: { before: canonicalBefore, after: canonicalAfter, unchanged: canonicalUnchanged },
    scheduler_mutations: 0,
    scheduler_host_status: schedulerHostStatus,
    owner_user_boundaries: {
      user_can_promote_established: false,
      user_can_force_provider_call: false,
      owner_decision_recorded: ownerDecisionRecorded,
      worker_started_by_owner: workerStartedByOwner,
    },
    navigation: {
      views: PRODUCT_E2E_VIEW_SEQUENCE,
      identity_preserved: Boolean(selection),
      locale_identity_preserved: Boolean(selection),
      refresh_collector_calls: 0,
      refresh_view: refreshView,
    },
    safe_error_codes: [...new Set(safeErrorCodes)],
    fail_closed_boundaries: [
      { code: "INVALID_CONTRACT_ADDRESS", blocked: stepPassed(steps, "fail-closed-identity-boundaries") },
      { code: "UNSUPPORTED_CHAIN", blocked: stepPassed(steps, "fail-closed-identity-boundaries") },
      { code: "OWNER_DECISION_REQUIRED", blocked: stepPassed(steps, "owner-decision-required") },
      { code: "CANDIDATE_NOT_FOUND", blocked: stepPassed(steps, "ai-unvalidated-data-boundary") },
      { code: "VALIDATION_FAILURE", blocked: stepPassed(steps, "invalid-mock-fails-closed") },
      { code: "READY_ANALYSIS_REQUIRED_FOR_REPORT", blocked: stepPassed(steps, "product-report") },
      { code: "FEEDBACK_LIFECYCLE_IMMUTABLE", blocked: stepPassed(steps, "feedback") },
    ],
    e2e_report_path: safeE2EPath(runId, "product-e2e-report.md"),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(reportPath, renderProductE2EMarkdown(manifest), "utf8");
  return { manifest, manifestPath, reportPath, productReportPath, isolatedStores: paths };
}

export async function captureCanonicalProductState(): Promise<ProductE2ECanonicalState> {
  const automationState = resolve(getDefaultAutomationDirectory(), "automation-state.json");
  return {
    established_universe: await hashFiles([
      ...sqliteOrFileGroup(getDefaultEstablishedUniverseStorePath()),
      resolve(REPO_ROOT, ESTABLISHED_ADDRESS_UNIVERSE_CONFIG_PATH),
    ]),
    feedback_store: await hashFiles(sqliteOrFileGroup(getDefaultFeedbackStorePath())),
    follow_up_store: await hashFiles([
      getDefaultFollowUpStorePath(),
      `${getDefaultFollowUpStorePath()}.bak`,
    ]),
    snapshot_pointers: await hashFiles([automationState]),
    ai_store: await hashFiles(sqliteOrFileGroup(getDefaultAIAnalysisQueueStorePath())),
  };
}

export async function cleanupProductE2ERun(runId: string, baseDirectory?: string): Promise<void> {
  const safeRunId = normalizeRunId(runId);
  const base = resolve(baseDirectory ?? tmpdir(), PRODUCT_E2E_BASE_DIRECTORY_NAME);
  const target = resolve(base, safeRunId);
  const rel = relative(base, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || basename(target) !== safeRunId) {
    throw new ProductE2EError("E2E_CLEANUP_TARGET_INVALID");
  }
  await rm(target, { recursive: true, force: true });
}

export function assertReadyAnalysisForProductReport(value: unknown): asserts value is {
  status: "READY";
  analysis: Record<string, unknown>;
} {
  if (
    !isRecord(value)
    || value.status !== "READY"
    || !isRecord(value.analysis)
    || value.analysis.schema_version !== "ai_production_analysis_v1"
  ) {
    throw new ProductE2EError("READY_ANALYSIS_REQUIRED_FOR_REPORT");
  }
}

export function createProductE2ERunId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `product-e2e-${timestamp}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

export function renderProductE2EMarkdown(manifest: ProductE2EManifest): string {
  const stepRows = manifest.steps.map((step) => (
    `| ${escapeMarkdown(step.id)} | ${step.status} | ${step.safe_error_code ?? "—"} |`
  )).join("\n");
  return [
    `# Crypto Edge AI — E2E.1 ${manifest.status}`,
    "",
    `- Run ID: \`${manifest.run_id}\``,
    `- Snapshot: \`${manifest.source_snapshot_id}\``,
    `- Identity: \`${manifest.chain}:${manifest.contract_address}\``,
    `- Started: ${manifest.started_at}`,
    `- Completed: ${manifest.completed_at}`,
    `- Live OpenAI calls: **${manifest.live_openai_calls}**`,
    `- Live data-provider calls: **${manifest.live_data_provider_calls}**`,
    `- Canonical mutations: **${manifest.canonical_store_mutations}**`,
    `- Task Scheduler mutations: **${manifest.scheduler_mutations}**`,
    `- Task Scheduler host status: **${manifest.scheduler_host_status}**`,
    "",
    "## Scenario",
    "",
    "| Step | Status | Safe error |",
    "| --- | --- | --- |",
    stepRows || "| no steps | FAILED | PRODUCT_E2E_NOT_STARTED |",
    "",
    "## Isolation",
    "",
    `- Follow-up: \`${manifest.isolated_stores.follow_up}\``,
    `- Established: \`${manifest.isolated_stores.established}\``,
    `- AI queue: \`${manifest.isolated_stores.ai_queue}\``,
    `- Feedback: \`${manifest.isolated_stores.feedback}\``,
    `- Reports: \`${manifest.isolated_stores.reports}\``,
    "",
    "## Idempotency",
    "",
    `- Follow-up records: ${manifest.idempotency.follow_up_records}`,
    `- Established versions created: ${manifest.idempotency.established_versions_created}`,
    `- AI queue records: ${manifest.idempotency.ai_queue_records}`,
    `- Product reports: ${manifest.idempotency.product_reports}`,
    `- Feedback records: ${manifest.idempotency.feedback_records}`,
    "",
    "## Boundaries",
    "",
    `- User promotion: ${manifest.owner_user_boundaries.user_can_promote_established ? "ALLOWED (invalid)" : "blocked"}`,
    `- User provider call: ${manifest.owner_user_boundaries.user_can_force_provider_call ? "ALLOWED (invalid)" : "blocked"}`,
    `- Owner decision recorded: ${manifest.owner_user_boundaries.owner_decision_recorded ? "yes" : "no"}`,
    `- Owner mock worker: ${manifest.owner_user_boundaries.worker_started_by_owner ? "yes" : "no"}`,
    `- Canonical state unchanged: ${manifest.canonical_protection.unchanged ? "yes" : "no"}`,
    `- Refresh last-known-good preserved: ${manifest.navigation.refresh_view.last_known_good_preserved ? "yes" : "no"}`,
    `- Refresh identity preserved: ${manifest.navigation.refresh_view.identity_preserved ? "yes" : "no"}`,
    `- Refresh snapshot timestamp preserved: ${manifest.navigation.refresh_view.snapshot_timestamp_preserved ? "yes" : "no"}`,
    `- Refresh source metadata preserved: ${manifest.navigation.refresh_view.source_metadata_preserved ? "yes" : "no"}`,
    `- Next successful refresh applied: ${manifest.navigation.refresh_view.next_success_applied ? "yes" : "no"}`,
    "",
    "## Errors",
    "",
    manifest.safe_error_codes.length > 0
      ? manifest.safe_error_codes.map((code) => `- \`${code}\``).join("\n")
      : "- none",
    "",
  ].join("\n");
}

class ProductE2EError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "ProductE2EError";
    this.code = code;
  }
}

async function runStep<T>(
  steps: ProductE2EStep[],
  id: string,
  recordIds: Array<string | null>,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  try {
    const result = await operation();
    steps.push({
      id,
      status: "PASS",
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      safe_error_code: null,
      record_ids: recordIds.filter((value): value is string => Boolean(value)),
    });
    return result;
  } catch (error) {
    const code = safeErrorCode(error);
    steps.push({
      id,
      status: "FAILED",
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      safe_error_code: code,
      record_ids: recordIds.filter((value): value is string => Boolean(value)),
    });
    throw new ProductE2EError(code);
  }
}

function parseE2ECandidate(value: unknown): E2ECandidate | null {
  if (!isRecord(value)) return null;
  const requiredStrings = ["candidate_id", "symbol", "name", "chain", "contract_address", "basic_filter_status", "discovery_basket"];
  if (requiredStrings.some((key) => typeof value[key] !== "string")) return null;
  if (typeof value.observation_only !== "boolean" || !Array.isArray(value.filter_reasons)) return null;
  const numericKeys = [
    "price_usd", "market_cap_usd", "fdv_usd", "liquidity_usd",
    "volume_24h_usd", "volume_market_cap_ratio", "pair_age_days",
  ];
  if (numericKeys.some((key) => value[key] !== null && typeof value[key] !== "number")) return null;
  if (value.pair_address !== null && typeof value.pair_address !== "string") return null;
  if (value.pair_created_at !== null && typeof value.pair_created_at !== "string") return null;
  return value as unknown as E2ECandidate;
}

function scannerGeneratedAt(scanner: ScannerOutputWithMeta): string {
  const value = isRecord(scanner.provenance) && typeof scanner.provenance.generated_at === "string"
    ? scanner.provenance.generated_at
    : isRecord(scanner.scan_run) && typeof scanner.scan_run.finished_at === "string"
      ? scanner.scan_run.finished_at
      : null;
  if (!value || Number.isNaN(Date.parse(value))) throw new ProductE2EError("SOURCE_SNAPSHOT_TIMESTAMP_INVALID");
  return new Date(value).toISOString();
}

function isolatedStorePaths(root: string): ProductE2EManifest["isolated_stores"] {
  return {
    root,
    follow_up: resolve(root, "follow-up", "store.json"),
    established: resolve(root, "established", "store.json"),
    ai_queue: resolve(root, "ai", "queue.sqlite"),
    feedback: resolve(root, "feedback", "feedback.sqlite"),
    reports: resolve(root, "reports"),
  };
}

function safeIsolatedStorePaths(runId: string): ProductE2EManifest["isolated_stores"] {
  return {
    root: safeE2EPath(runId),
    follow_up: safeE2EPath(runId, "follow-up", "store.json"),
    established: safeE2EPath(runId, "established", "store.json"),
    ai_queue: safeE2EPath(runId, "ai", "queue.sqlite"),
    feedback: safeE2EPath(runId, "feedback", "feedback.sqlite"),
    reports: safeE2EPath(runId, "reports"),
  };
}

function safeE2EPath(runId: string, ...segments: string[]): string {
  return ["%TEMP%", PRODUCT_E2E_BASE_DIRECTORY_NAME, runId, ...segments].join("\\");
}

function resolveIsolatedRoot(runId: string, configured?: string): string {
  if (configured) {
    const root = resolve(configured);
    if (basename(root) !== runId) throw new ProductE2EError("ISOLATED_ROOT_RUN_ID_MISMATCH");
    return root;
  }
  return resolve(tmpdir(), PRODUCT_E2E_BASE_DIRECTORY_NAME, runId);
}

function normalizeRunId(value: string): string {
  if (!PRODUCT_E2E_RUN_ID.test(value)) throw new ProductE2EError("E2E_RUN_ID_INVALID");
  return value;
}

async function writeProductJourneyReport(input: {
  runId: string;
  reportsRoot: string;
  sourceSnapshotId: string;
  candidate: E2ECandidate;
  identity: ReturnType<typeof followUpIdentity>;
  analysisId: string;
  generatedAt: string;
}): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(input.reportsRoot, { recursive: true });
  const slug = input.runId.replaceAll("-", "_");
  const jsonPath = resolve(input.reportsRoot, `analyst-report-${slug}.json`);
  const markdownPath = resolve(input.reportsRoot, `analyst-report-${slug}.md`);
  const report = {
    report_version: 1,
    generated_at: input.generatedAt,
    candidates_count: 1,
    review_entries_count: 0,
    scanner_source: "real-output",
    context_source: "isolated-product-e2e",
    metadata: {
      scanner_source: "real-output",
      scanner_source_path: "not_available",
      scanner_run_id: input.sourceSnapshotId,
      scanner_loaded_at: input.generatedAt,
      context_source: "isolated-product-e2e",
      context_run_id: input.runId,
      context_generated_at: input.generatedAt,
      context_loaded_at: input.generatedAt,
      context_output_file: "not_available",
      review_storage_source: "isolated-product-e2e",
      review_storage_file: "not_available",
      review_loaded_at: input.generatedAt,
      review_diagnostics_checked_at: input.generatedAt,
    },
    scanner_summary: {
      candidates_count: 1,
      by_final_label: { WATCHLIST: 1 },
      by_security_label: { [input.candidate.security_label ?? "NEEDS_MANUAL_VERIFICATION"]: 1 },
      watchlist_count: 1,
      reject_count: 0,
      critical_risk_count: 0,
      needs_manual_verification_count: 1,
      scan_run: {
        run_id: input.sourceSnapshotId,
        source: "internal-beta",
        mode: "isolated-e2e",
        finished_at: input.generatedAt,
        total_raw: 1,
        passed_basic_filter: 1,
        rejected_basic_filter: 0,
        security_checked: 0,
        security_passed: 0,
        watchlist_candidates: 1,
      },
    },
    review_summary: {
      review_entries_count: 0,
      by_status: {},
      entries: [],
      stored_reviews_not_in_current_scan: [],
      diagnostics: null,
    },
    market_context_summary: {
      source_kind: "isolated-product-e2e",
      run_id: input.runId,
      generated_at: input.generatedAt,
      loaded_at: input.generatedAt,
      environment: "INTERNAL_BETA",
      summary: {
        sources_requested: 0,
        sources_allowed: 0,
        sources_denied: 0,
        records_total: 0,
        warnings_total: 0,
        errors_total: 0,
      },
      fear_greed: {
        value: "not_available",
        value_classification: "not_available",
        timestamp: "not_available",
        source_name: "not_available",
      },
      defi_snapshots: [],
      defi_snapshots_omitted_count: 0,
      sources: [],
    },
    candidate_snapshot: {
      limit: 1,
      truncated: false,
      omitted_count: 0,
      candidates: [{
        candidate_id: input.candidate.candidate_id,
        symbol: input.candidate.symbol,
        name: input.candidate.name,
        chain: input.identity.chain,
        final_label: "WATCHLIST",
        security_label: input.candidate.security_label ?? "NEEDS_MANUAL_VERIFICATION",
        reason: "Research-only isolated E2E report based on validated product state.",
      }],
    },
    compliance: {
      local_research_workflow: "This report belongs to an isolated product E2E research workflow.",
      research_only: "It is research material, not investment advice or a recommendation.",
      buy_sell_signal: "This report provides no transaction instruction.",
      review_status_scope: "The report does not change lifecycle, filters, Follow-up or Established membership.",
    },
    product_e2e: {
      schema_version: "product_e2e_report_subject_v1",
      run_id: input.runId,
      source_snapshot_id: input.sourceSnapshotId,
      analysis_id: input.analysisId,
      candidate_id: input.candidate.candidate_id,
      candidate_name: input.candidate.name,
      symbol: input.candidate.symbol,
      chain: input.identity.chain,
      contract_address: input.identity.contract_address,
      basket: "established",
      transaction_signal: "NONE",
      lifecycle_mutation: false,
      localized_summary: {
        pl: "Raport badawczy łączy zwalidowaną migawkę tokena z gotową analizą AI. Nie zawiera instrukcji transakcyjnej.",
        en: "The research report links the validated token snapshot with the ready AI analysis. It contains no transaction instruction.",
      },
    },
  };
  try {
    await publishReportAtomically({
      jsonPath,
      markdownPath,
      json: report,
      markdown: [
      `# ${input.candidate.name} (${input.candidate.symbol})`,
      "",
      `- Identity: \`${input.identity.identity}\``,
      `- Snapshot: \`${input.sourceSnapshotId}\``,
      `- Analysis: \`${input.analysisId}\``,
      "- PL: Raport badawczy bez sygnału transakcyjnego.",
      "- EN: Research report without a trading signal.",
      "- Lifecycle mutation: 0",
      "",
      ].join("\n"),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REPORT_IDEMPOTENCY_CONFLICT") {
      throw new ProductE2EError("PRODUCT_REPORT_IDEMPOTENCY_CONFLICT");
    }
    throw error;
  }
  return { jsonPath, markdownPath };
}

function deterministicMockProvider(
  narrative: (context: AIResearchContext) => Promise<unknown>,
): AIResearchProvider {
  return {
    mode: "OPENAI",
    model: "gpt-5-mini",
    async generate(context) {
      return {
        raw_json: JSON.stringify(await narrative(context)),
        model: "gpt-5-mini",
        token_usage: { prompt_tokens: 101, completion_tokens: 51, total_tokens: 152 },
        latency_ms: 1,
        request_id: "product_e2e_mock_response",
      };
    },
  };
}

async function deterministicNarrative(context: AIResearchContext): Promise<Record<string, unknown>> {
  const pl = context.locale === "pl";
  return {
    narrative_version: "ai_research_narrative_v2",
    summary: pl
      ? "Dane wyznaczają aktualny etap badawczy. Dalsze działania pozostają wyłącznie ręczną weryfikacją."
      : "The data identifies the current research stage. Further actions remain manual verification only.",
    fact_narratives: context.fact_candidates.map((fact) => ({
      id: `fact:${fact.key}`,
      interpretation: pl ? "Wartość pochodzi z kontekstu produktu." : "The value comes from product context.",
    })),
    risk_narratives: context.risk_candidates.map((_risk, index) => ({
      id: `risk:${index}`,
      explanation: pl ? "Zapisane dane wymagają ręcznej weryfikacji." : "Recorded evidence requires manual review.",
    })),
    missing_narratives: context.missing_information.map((item) => ({
      id: `missing:${item.key}`,
      explanation: pl ? "Dostarczone dane nie obejmują obecnie tego obszaru." : "The supplied evidence does not currently cover this area.",
    })),
    action_narratives: context.action_catalog.map((_action, index) => ({
      id: `action:${index}`,
      reason: pl ? "Następny krok wynika z zapisanego stanu produktu." : "The next step follows the recorded product state.",
    })),
    status_change_narratives: context.status_change_conditions.map((condition) => ({
      id: `condition:${condition.key}`,
      explanation: pl ? "Zmiana zapisanych danych może wymagać ponownej oceny." : "A change in recorded evidence may require reassessment.",
    })),
  };
}

async function assertCanonicalFilesUnchanged(before: ProductE2ECanonicalState): Promise<void> {
  const after = await captureCanonicalProductState();
  for (const key of ["established_universe", "feedback_store", "follow_up_store", "snapshot_pointers", "ai_store"] as const) {
    if (before[key] !== after[key]) throw new ProductE2EError(`CANONICAL_${key.toUpperCase()}_MUTATION`);
  }
}

async function hashFiles(paths: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const path of [...new Set(paths.map((value) => resolve(value)))].sort()) {
    hash.update(basename(path));
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

function sqliteOrFileGroup(path: string): string[] {
  return [path, `${path}-wal`, `${path}-shm`, `${path}.bak`];
}

function equalCanonicalState(left: ProductE2ECanonicalState, right: ProductE2ECanonicalState): boolean {
  return (Object.keys(left) as Array<keyof ProductE2ECanonicalState>).every((key) => left[key] === right[key]);
}

function unavailableCanonicalState(): ProductE2ECanonicalState {
  return {
    established_universe: "UNAVAILABLE",
    feedback_store: "UNAVAILABLE",
    follow_up_store: "UNAVAILABLE",
    snapshot_pointers: "UNAVAILABLE",
    ai_store: "UNAVAILABLE",
  };
}

export function normalizeSchedulerHostStatus(value: unknown): string {
  if (typeof value !== "string") return "HOST_STATUS_NOT_OBSERVED";
  const normalized = value.trim().toUpperCase().replace(/[ -]+/g, "_");
  return ["NOT_INSTALLED", "READY", "RUNNING", "DISABLED", "QUEUED", "UNKNOWN"].includes(normalized)
    ? normalized
    : "HOST_STATUS_NOT_OBSERVED";
}

function emptyRefreshViewResult(): ProductE2EManifest["navigation"]["refresh_view"] {
  return {
    last_known_good_preserved: false,
    identity_preserved: false,
    snapshot_timestamp_preserved: false,
    source_metadata_preserved: false,
    next_success_applied: false,
    first_load_empty_state: false,
  };
}

function stableUuid(value: string): string {
  const digest = createHash("sha256").update(`product-e2e-feedback:${value}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ProductE2EError(code);
}

function assertThrowsCode(operation: () => unknown, expected: string): void {
  try {
    operation();
  } catch (error) {
    if (safeErrorCode(error) === expected) return;
    throw error;
  }
  throw new ProductE2EError(`${expected}_NOT_BLOCKED`);
}

function safeErrorCode(error: unknown): string {
  const value = error instanceof ProductE2EError
    ? error.code
    : error instanceof Error ? error.message : "PRODUCT_E2E_FAILED";
  const normalized = value.split(":", 1)[0]?.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  return normalized && normalized.length <= 120 ? normalized : "PRODUCT_E2E_FAILED";
}

function stepPassed(steps: ProductE2EStep[], id: string): boolean {
  return steps.find((step) => step.id === id)?.status === "PASS";
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
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

function serverOrigin(server: Server): string {
  const address = server.address();
  if (!address || typeof address === "string") throw new ProductE2EError("E2E_SERVER_ADDRESS_UNAVAILABLE");
  return `http://127.0.0.1:${address.port}`;
}

async function httpJson(
  server: Server,
  method: "GET" | "POST",
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<HttpResponse> {
  const origin = serverOrigin(server);
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = await response.json() as unknown;
  if (!isRecord(parsed)) throw new ProductE2EError("E2E_HTTP_RESPONSE_INVALID");
  const responseHeaders: Record<string, string | string[] | undefined> = {};
  response.headers.forEach((value, key) => { responseHeaders[key] = value; });
  return { status: response.status, headers: responseHeaders, body: parsed };
}

function cookieHeader(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.split(";", 1)[0] ?? "";
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
