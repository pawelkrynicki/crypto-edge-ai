import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { readAutomationStatus, type AutomationStatusOptions } from "./automationStatus.js";
import {
  readEstablishedUniverseStatus,
  type EstablishedUniverseStatusOptions,
} from "./establishedUniverseStatus.js";
import {
  createEstablishedPromotionService,
  EstablishedPromotionError,
  type EstablishedPromotionOptions,
} from "./establishedPromotion.js";
import {
  ContextOutputError,
  type LatestContextOutputOptions,
  readLatestContextOutput,
} from "./latestContextOutput.js";
import {
  getScannerSourcesDiagnostics,
  type LatestScannerOutputOptions,
  readLatestScannerOutput,
  ScannerOutputError,
} from "./latestScannerOutput.js";
import type { ReviewSessionFileStoreOptions } from "./reviewSessionFileStore.js";
import { createConfiguredReviewSessionStorageProvider } from "./reviewSessionProviderConfig.js";
import {
  ReviewSessionStorageProviderError,
  type ReviewSessionStorageProvider,
  type ReviewSessionStorageResult,
} from "./reviewSessionStorageProvider.js";
import {
  resolveControlCenterStatus,
  type ControlCenterFreshness,
  type ControlCenterReadinessInput,
} from "../src/controlCenterStatus.js";
import { resolveProductSourceHealth } from "../src/productSourceHealth.js";
import {
  resolveProductRuntimeMode,
  type ProductRuntimeMode,
  type ResolvedProductRuntimeMode,
} from "../src/runtimeMode.js";
import type {
  ProductReadinessOutput,
  ScannerDiscoveryMetadata,
} from "../src/types/scannerTypes.js";
import {
  createOwnerOperationsService,
  OWNER_SESSION_HEADER,
  OwnerOperationsError,
  resolveOwnerOperationsMode,
  type OwnerOperationsOptions,
} from "./ownerOperations.js";
import {
  readReportDetail,
  readReportsLibraryStatus,
  readReportsList,
  type ReportsLibraryOptions,
} from "./reportsLibrary.js";
import {
  readFollowUpDetail,
  readFollowUpList,
  readFollowUpStatus,
  type FollowUpApiOptions,
} from "./followUpApi.js";
import { createOwnerSessionSecret } from "./ownerPreflight.js";

const DEMO_CORS_ORIGINS = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

export type ScannerApiHealthOptions = {
  service?: string;
  buildSha?: string;
  uptimeSeconds?: () => number;
};

export type ScannerApiHandlerOptions = {
  runtimeMode?: ProductRuntimeMode | string;
  scanner?: LatestScannerOutputOptions;
  context?: LatestContextOutputOptions;
  reviewSession?: ReviewSessionFileStoreOptions;
  reviewSessionProvider?: ReviewSessionStorageProvider;
  health?: ScannerApiHealthOptions;
  automation?: AutomationStatusOptions;
  establishedUniverse?: EstablishedUniverseStatusOptions;
  establishedPromotion?: EstablishedPromotionOptions;
  ownerOperations?: OwnerOperationsOptions;
  reports?: ReportsLibraryOptions;
  followUp?: FollowUpApiOptions;
};

export function createScannerApiHandler(options: ScannerApiHandlerOptions = {}): RequestListener {
  const runtimeMode = resolveProductRuntimeMode(options.runtimeMode ?? process.env.CRYPTO_EDGE_RUNTIME_MODE);
  const reviewSessionProvider = options.reviewSessionProvider
    ?? createConfiguredReviewSessionStorageProvider({ reviewSession: options.reviewSession });
  const scannerOptions: LatestScannerOutputOptions = { ...options.scanner, runtimeMode };
  const contextOptions: LatestContextOutputOptions = { ...options.context, runtimeMode };
  const ownerMode = resolveOwnerOperationsMode(options.ownerOperations?.mode ?? process.env.CRYPTO_EDGE_OWNER_OPERATIONS_MODE);
  const ownerSessionSecret = ownerMode === "DISABLED"
    ? undefined
    : createOwnerSessionSecret(options.ownerOperations?.sessionSecret);
  const ownerOperations = createOwnerOperationsService({
    automationEnabled: options.automation?.enabled,
    ...options.ownerOperations,
    mode: ownerMode,
    sessionSecret: ownerSessionSecret,
  });
  const establishedPromotion = createEstablishedPromotionService({
    scanner: scannerOptions,
    followUp: options.followUp,
    storePath: options.establishedUniverse?.storeFilePath,
    ...options.establishedPromotion,
    mode: ownerMode,
    sessionSecret: ownerSessionSecret,
  });

  return async (req, res) => {
    const path = getRequestPath(req.url);

    if (req.method === "GET" && path === "/api/owner-operations/established-promotion/status") {
      try {
        establishedPromotion.assertVisible(isLocalOwnerRequest(req));
        const query = validateEstablishedPromotionQuery(req.url);
        sendJson(req, res, 200, await establishedPromotion.getStatus(
          query.chain,
          query.contract_address,
          isLocalOwnerRequest(req),
        ), runtimeMode);
      } catch (error) {
        sendEstablishedPromotionError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/owner-operations/established-promotion-preview") {
      try {
        establishedPromotion.assertVisible(isLocalOwnerRequest(req));
        const query = validateEstablishedPromotionQuery(req.url);
        sendJson(req, res, 200, await establishedPromotion.createPreview(
          query.chain,
          query.contract_address,
          isLocalOwnerRequest(req),
        ), runtimeMode);
      } catch (error) {
        sendEstablishedPromotionError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "POST" && path === "/api/owner-operations/established-promotion") {
      try {
        requireOwnerMutationRequest(req);
        const body = validateEstablishedPromotionBody(await readOwnerJsonBody(req));
        const sessionHeader = req.headers[OWNER_SESSION_HEADER];
        if (typeof sessionHeader !== "string") throw new EstablishedPromotionError("OWNER_SESSION_REQUIRED", 403);
        const result = await establishedPromotion.promote(
          body.preview_id,
          sessionHeader,
          isLocalOwnerRequest(req),
        );
        sendJson(req, res, 200, result, runtimeMode);
      } catch (error) {
        sendEstablishedPromotionError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/owner-operations/status") {
      const [scanner, context] = await Promise.all([
        getReadinessEntry(() => readLatestScannerOutput(scannerOptions)),
        getReadinessEntry(() => readLatestContextOutput(contextOptions)),
      ]);
      const scannerFacts = readScannerControlCenterFacts(scanner).publicFacts;
      const contextFacts = readContextControlCenterFacts(context);
      sendJson(req, res, 200, await ownerOperations.getStatus({
        scanner_timestamp: scannerFacts.generatedAt,
        context_timestamp: contextFacts.generatedAt,
        last_known_good_available: scannerFacts.lastKnownGood || contextFacts.lastKnownGood,
      }, isLocalOwnerRequest(req)), runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/owner-operations/refresh-preview") {
      try {
        sendJson(req, res, 200, await ownerOperations.createRefreshPreview(isLocalOwnerRequest(req)), runtimeMode);
      } catch (error) {
        sendOwnerOperationsError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "POST" && path === "/api/owner-operations/refresh") {
      try {
        requireOwnerMutationRequest(req);
        const body = validateOwnerRefreshBody(await readOwnerJsonBody(req));
        const sessionHeader = req.headers[OWNER_SESSION_HEADER];
        if (typeof sessionHeader !== "string") throw new OwnerOperationsError("OWNER_SESSION_REQUIRED", 403);
        const result = await ownerOperations.refresh(
          body.preflight_id,
          sessionHeader,
          isLocalOwnerRequest(req),
        );
        sendJson(req, res, result.status === "FAILED" ? 500 : 200, result, runtimeMode);
      } catch (error) {
        sendOwnerOperationsError(req, res, error, runtimeMode);
      }
      return;
    }

    if (path.startsWith("/api/owner-operations/")) {
      sendJson(req, res, 404, { error: "not_found", message: "Route not found" }, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/follow-up/status") {
      sendJson(req, res, 200, await readFollowUpStatus(options.followUp), runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/follow-up") {
      sendJson(req, res, 200, await readFollowUpList(options.followUp), runtimeMode);
      return;
    }

    if (req.method === "GET" && path.startsWith("/api/follow-up/")) {
      const entryId = path.slice("/api/follow-up/".length);
      const entry = await readFollowUpDetail(entryId, options.followUp);
      if (!entry) {
        sendJson(req, res, 404, { error: "follow_up_entry_not_found", message: "Follow-up entry not found" }, runtimeMode);
        return;
      }
      sendJson(req, res, 200, entry, runtimeMode);
      return;
    }

    if (isFollowUpApiPath(path)) {
      res.setHeader("allow", "GET");
      sendJson(req, res, 405, { error: "method_not_allowed", message: "Method not allowed" }, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/reports/status") {
      sendJson(req, res, 200, await readReportsLibraryStatus(options.reports), runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/reports") {
      sendJson(req, res, 200, await readReportsList(options.reports), runtimeMode);
      return;
    }

    if (req.method === "GET" && path.startsWith("/api/reports/")) {
      const reportId = path.slice("/api/reports/".length);
      const report = await readReportDetail(reportId, options.reports);
      if (!report) {
        sendJson(req, res, 404, {
          error: "report_not_found",
          message: "Report is unavailable or does not match the current contract",
        }, runtimeMode);
        return;
      }
      sendJson(req, res, 200, report, runtimeMode);
      return;
    }

    if (isReportsApiPath(path)) {
      res.setHeader("allow", "GET");
      sendJson(req, res, 405, { error: "method_not_allowed", message: "Method not allowed" }, runtimeMode);
      return;
    }

    if (req.method === "OPTIONS") {
      sendEmpty(req, res, isCorsOriginDenied(req, runtimeMode) ? 403 : 204, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/health") {
      sendJson(req, res, 200, {
        status: "ok",
        service: options.health?.service ?? "crypto-edge-ai-scanner-api",
        runtime_mode: runtimeMode,
        ...(options.health?.buildSha ? { build_sha: options.health.buildSha } : {}),
        ...(options.health?.uptimeSeconds
          ? { process_uptime_seconds: Math.max(0, Math.floor(options.health.uptimeSeconds())) }
          : {}),
      }, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/control-center/status") {
      const [scanner, context, automation, establishedUniverse, reviewStorage, reportsLibrary, followUp] = await Promise.all([
        getReadinessEntry(() => readLatestScannerOutput(scannerOptions)),
        getReadinessEntry(() => readLatestContextOutput(contextOptions)),
        readAutomationStatus(options.automation),
        readEstablishedUniverseStatus(options.establishedUniverse),
        readReviewStorageStatus(reviewSessionProvider),
        readReportsLibraryStatus(options.reports),
        readFollowUpStatus(options.followUp),
      ]);
      const readiness = buildProductReadiness(scanner, context, runtimeMode);
      const scannerFacts = readScannerControlCenterFacts(scanner);
      const contextFacts = readContextControlCenterFacts(context);
      const sourceHealth = resolveProductSourceHealth({
        metadata: scannerFacts.metadata,
        readiness,
        sourceIds: scannerFacts.sourceIds,
      });

      sendJson(req, res, 200, resolveControlCenterStatus({
        runtime: {
          runtimeMode,
          healthAvailable: true,
          apiConnected: true,
          sameOriginResponseValid: true,
          readiness: readiness.status === "not_ready"
            ? "not_ready"
            : readiness.status === "degraded" ? "degraded" : "ready",
          buildSha: safeBuildSha(options.health?.buildSha),
        },
        scanner: scannerFacts.publicFacts,
        context: contextFacts,
        sources: {
          availability: sourceHealth.status,
          sourceIds: scannerFacts.sourceIds,
          affectedSourceIds: sourceHealth.detailSourceIds,
        },
        automation: {
          enabled: automation.enabled,
          active: automation.active_run_id !== null,
          stateAvailable: automation.scheduler_status !== "STATE_UNAVAILABLE",
          lastRunAt: automation.last_attempt_at,
          lastResult: automation.last_result,
          nextRunAt: automation.next_run_at,
          nextDueAfterActivation: automation.next_due_at,
        },
        establishedUniverse: {
          validationStatus: establishedUniverse.validation_status,
          universeVersion: establishedUniverse.universe_version,
          entriesEnabled: establishedUniverse.entries_enabled,
          lastChangeAt: establishedUniverse.last_change_at,
        },
        reviewStorage,
        reportsLibrary: {
          libraryAvailable: reportsLibrary.library_available,
          status: reportsLibrary.library_status,
          reportCount: reportsLibrary.report_count,
          validReportCount: reportsLibrary.valid_report_count,
          skippedReportCount: reportsLibrary.skipped_report_count,
          latestReportGeneratedAt: reportsLibrary.latest_report_generated_at,
        },
        followUp: {
          storeAvailable: followUp.store_available,
          validationStatus: followUp.validation_status,
          activeEntries: followUp.entries_total - followUp.archived_count,
          dueEntries: followUp.due_count,
          candidateEntries: followUp.candidate_count,
          nextDueAt: followUp.next_due_at,
          lastUpdatedAt: followUp.last_updated_at,
        },
        gates: {
          feedbackCaptureReady: false,
          trustedTesterPreviewModeReady: false,
          vpsDeploymentConfirmed: false,
          cloudflareAccessVerified: false,
          rollbackTested: false,
          ownerApproved: false,
        },
      }), runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/automation/status") {
      sendJson(req, res, 200, await readAutomationStatus(options.automation), runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/established-universe/status") {
      sendJson(req, res, 200, await readEstablishedUniverseStatus(options.establishedUniverse), runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/readiness") {
      const [scanner, context] = await Promise.all([
        getReadinessEntry(() => readLatestScannerOutput(scannerOptions)),
        getReadinessEntry(() => readLatestContextOutput(contextOptions)),
      ]);
      const readiness = buildProductReadiness(scanner, context, runtimeMode);
      sendJson(req, res, readiness.ready ? 200 : 503, readiness, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/context/latest") {
      try {
        sendJson(req, res, 200, await readLatestContextOutput(contextOptions), runtimeMode);
      } catch (error) {
        sendDataUnavailable(req, res, errorCode(error, "CONTEXT_OUTPUT_UNAVAILABLE"), runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/scanner/latest") {
      try {
        sendJson(req, res, 200, await readLatestScannerOutput(scannerOptions), runtimeMode);
      } catch (error) {
        sendDataUnavailable(req, res, errorCode(error, "SCANNER_OUTPUT_UNAVAILABLE"), runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/scanner/sources") {
      try {
        sendJson(req, res, 200, await getScannerSourcesDiagnostics(scannerOptions), runtimeMode);
      } catch {
        sendDataUnavailable(req, res, "SCANNER_SOURCES_UNAVAILABLE", runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/review-session") {
      sendReviewSessionJson(req, res, 200, await reviewSessionProvider.read(), runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/review-session/diagnostics") {
      try {
        sendJson(req, res, 200, await reviewSessionProvider.diagnostics(), runtimeMode);
      } catch {
        sendJson(req, res, 500, {
          error: "review_session_diagnostics_unavailable",
          message: "Review session storage diagnostics are unavailable",
        }, runtimeMode);
      }
      return;
    }

    if (req.method === "PUT" && path === "/api/review-session") {
      try {
        const body = await readJsonBody(req);
        sendReviewSessionJson(req, res, 200, await reviewSessionProvider.write(body), runtimeMode);
      } catch (error) {
        if (error instanceof RequestBodyError || (
          error instanceof ReviewSessionStorageProviderError
          && error.code === "invalid_review_session"
        )) {
          sendJson(req, res, 400, {
            error: "invalid_review_session",
            message: error.message,
          }, runtimeMode);
          return;
        }
        sendJson(req, res, 500, {
          error: "review_session_storage_unavailable",
          message: "Review session storage could not be written",
        }, runtimeMode);
      }
      return;
    }

    sendJson(req, res, 404, {
      error: "not_found",
      message: "Route not found",
    }, runtimeMode);
  };
}

function sendDataUnavailable(
  req: IncomingMessage,
  res: ServerResponse,
  reasonCode: string,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  sendJson(req, res, 503, {
    status: "data_unavailable",
    reason_code: reasonCode,
    message: "Data Unavailable",
  }, runtimeMode);
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  res.writeHead(status, responseHeaders(req, runtimeMode));
  res.end(JSON.stringify(body));
}

function sendEmpty(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  res.writeHead(status, responseHeaders(req, runtimeMode));
  res.end();
}

function responseHeaders(req: IncomingMessage, runtimeMode: ResolvedProductRuntimeMode): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "x-content-type-options": "nosniff",
  };
  const origin = req.headers.origin;

  if (runtimeMode === "DEVELOPMENT_DEMO" && origin && DEMO_CORS_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "GET, PUT, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
    headers.vary = "Origin";
  }

  return headers;
}

function isCorsOriginDenied(req: IncomingMessage, runtimeMode: ResolvedProductRuntimeMode): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  return runtimeMode !== "DEVELOPMENT_DEMO" || !DEMO_CORS_ORIGINS.has(origin);
}

function sendReviewSessionJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  result: ReviewSessionStorageResult,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  sendJson(req, res, status, { ...result.state, _source_meta: result._source_meta }, runtimeMode);
}

function sendOwnerOperationsError(
  req: IncomingMessage,
  res: ServerResponse,
  error: unknown,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  const ownerError = error instanceof OwnerOperationsError
    ? error
    : new OwnerOperationsError("OWNER_REFRESH_REQUEST_REJECTED", 400);
  if (ownerError.code === "RUN_ALREADY_IN_PROGRESS") {
    sendJson(req, res, ownerError.httpStatus, {
      status: "RUN_ALREADY_IN_PROGRESS",
      error: ownerError.code,
      message: "Refresh already in progress / Odświeżenie już trwa",
      last_known_good_preserved: true,
    }, runtimeMode);
    return;
  }
  sendJson(req, res, ownerError.httpStatus, {
    error: ownerError.code,
    message: "Owner refresh request rejected",
  }, runtimeMode);
}

function sendEstablishedPromotionError(
  req: IncomingMessage,
  res: ServerResponse,
  error: unknown,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  const promotionError = error instanceof EstablishedPromotionError
    ? error
    : error instanceof OwnerOperationsError
      ? new EstablishedPromotionError(error.code, error.httpStatus)
      : new EstablishedPromotionError("PROMOTION_REQUEST_REJECTED", 400);
  sendJson(req, res, promotionError.httpStatus, {
    error: promotionError.code,
    message: "Established promotion request rejected",
  }, runtimeMode);
}

function requireOwnerMutationRequest(req: IncomingMessage): void {
  if (!isLocalOwnerRequest(req)) throw new OwnerOperationsError("LOOPBACK_REQUIRED", 403);
  const contentType = req.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType.trim())) {
    throw new OwnerOperationsError("JSON_CONTENT_TYPE_REQUIRED", 415);
  }
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (typeof host !== "string" || typeof origin !== "string" || origin.toLowerCase() !== `http://${host}`.toLowerCase()) {
    throw new OwnerOperationsError("SAME_ORIGIN_REQUIRED", 403);
  }
}

function isLocalOwnerRequest(req: IncomingMessage): boolean {
  const remoteAddress = req.socket.remoteAddress?.toLowerCase();
  if (remoteAddress !== "127.0.0.1" && remoteAddress !== "::1" && remoteAddress !== "::ffff:127.0.0.1") {
    return false;
  }
  const host = req.headers.host;
  if (typeof host !== "string") return false;
  try {
    const hostname = new URL(`http://${host}`).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

function validateOwnerRefreshBody(value: unknown): { preflight_id: string; confirmation: true } {
  if (!isRecord(value)) throw new OwnerOperationsError("OWNER_REFRESH_BODY_INVALID", 400);
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "confirmation" || keys[1] !== "preflight_id") {
    throw new OwnerOperationsError("OWNER_REFRESH_BODY_INVALID", 400);
  }
  if (typeof value.preflight_id !== "string" || value.preflight_id.length === 0 || value.confirmation !== true) {
    throw new OwnerOperationsError("OWNER_REFRESH_BODY_INVALID", 400);
  }
  return { preflight_id: value.preflight_id, confirmation: true };
}

function validateEstablishedPromotionBody(value: unknown): { preview_id: string; confirmation: true } {
  if (!isRecord(value)) throw new EstablishedPromotionError("PROMOTION_BODY_INVALID", 400);
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "confirmation" || keys[1] !== "preview_id") {
    throw new EstablishedPromotionError("PROMOTION_BODY_INVALID", 400);
  }
  if (typeof value.preview_id !== "string" || value.preview_id.length === 0 || value.confirmation !== true) {
    throw new EstablishedPromotionError("PROMOTION_BODY_INVALID", 400);
  }
  return { preview_id: value.preview_id, confirmation: true };
}

function validateEstablishedPromotionQuery(url: string | undefined): { chain: string; contract_address: string } {
  let parsed: URL;
  try {
    parsed = new URL(url ?? "/", "http://owner.local");
  } catch {
    throw new EstablishedPromotionError("PROMOTION_QUERY_INVALID", 400);
  }
  const keys = [...parsed.searchParams.keys()].sort();
  if (
    keys.length !== 2
    || keys[0] !== "chain"
    || keys[1] !== "contract_address"
    || parsed.searchParams.getAll("chain").length !== 1
    || parsed.searchParams.getAll("contract_address").length !== 1
  ) {
    throw new EstablishedPromotionError("PROMOTION_QUERY_INVALID", 400);
  }
  const chain = parsed.searchParams.get("chain");
  const contractAddress = parsed.searchParams.get("contract_address");
  if (!chain || !contractAddress || chain.length > 32 || contractAddress.length > 128) {
    throw new EstablishedPromotionError("PROMOTION_QUERY_INVALID", 400);
  }
  return { chain, contract_address: contractAddress };
}

async function readOwnerJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > 4_096) throw new OwnerOperationsError("OWNER_REFRESH_BODY_INVALID", 400);
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new OwnerOperationsError("OWNER_REFRESH_BODY_INVALID", 400);
  }
}

async function getReadinessEntry(read: () => Promise<unknown>): Promise<{
  ready: boolean;
  reason_code: string | null;
  value?: unknown;
}> {
  try {
    return { ready: true, reason_code: null, value: await read() };
  } catch (error) {
    return { ready: false, reason_code: errorCode(error, "DATA_UNAVAILABLE") };
  }
}

type ReadinessEntry = Awaited<ReturnType<typeof getReadinessEntry>>;

function buildProductReadiness(
  scanner: ReadinessEntry,
  context: ReadinessEntry,
  runtimeMode: ResolvedProductRuntimeMode,
): ProductReadinessOutput {
  const discovery = buildDiscoveryReadiness(scanner, context);
  const scannerReadiness = publicScannerReadinessEntry(scanner);
  const ready = scanner.ready;
  const degraded = ready && (
    scannerReadiness.freshness_status === "STALE"
    || !context.ready
    || discovery.new_emerging.status === "degraded"
  );

  return {
    status: !ready
      ? "not_ready"
      : degraded
        ? "degraded"
        : discovery.established.status === "empty_configured" ? "ready_with_empty_established_universe" : "ready",
    runtime_mode: runtimeMode,
    ready,
    process: { ready: true, reason_code: null },
    scanner: scannerReadiness,
    context: publicReadinessEntry(context),
    new_emerging: discovery.new_emerging,
    established: discovery.established,
    discovery,
    reason_codes: [
      scannerReadiness.reason_code,
      context.reason_code,
      discovery.new_emerging.reason_code,
      discovery.established.reason_code,
    ].filter(isString),
  } as ProductReadinessOutput;
}

function readScannerControlCenterFacts(entry: ReadinessEntry): {
  publicFacts: ControlCenterReadinessInput["scanner"];
  metadata: ScannerDiscoveryMetadata | null;
  sourceIds: string[];
} {
  if (!entry.ready || !isRecord(entry.value)) {
    return {
      publicFacts: {
        available: false,
        generatedAt: null,
        freshness: "UNAVAILABLE",
        lastKnownGood: false,
        newObservationCount: 0,
        establishedAfterFilters: 0,
      },
      metadata: null,
      sourceIds: [],
    };
  }

  const meta = isRecord(entry.value._source_meta) ? entry.value._source_meta : null;
  const provenance = isRecord(entry.value.provenance) ? entry.value.provenance : null;
  const scanRun = isRecord(entry.value.scan_run) ? entry.value.scan_run : null;
  const metadata = provenance && isRecord(provenance.metadata)
    ? provenance.metadata as ScannerDiscoveryMetadata
    : null;
  const established = metadata?.established;
  const candidates = Array.isArray(entry.value.candidates) ? entry.value.candidates : [];
  const freshness: ControlCenterFreshness = meta?.freshness_status === "STALE" ? "STALE" : "FRESH";

  return {
    publicFacts: {
      available: true,
      generatedAt: typeof provenance?.generated_at === "string"
        ? provenance.generated_at
        : typeof scanRun?.finished_at === "string" ? scanRun.finished_at : null,
      freshness,
      lastKnownGood: meta?.source === "real-output",
      newObservationCount: candidates.filter((candidate) => (
        isRecord(candidate) && candidate.discovery_basket === "new_emerging"
      )).length,
      establishedAfterFilters: isNonNegativeInteger(established?.candidates_after_filters)
        ? Number(established?.candidates_after_filters)
        : candidates.filter((candidate) => (
          isRecord(candidate) && candidate.discovery_basket === "established"
        )).length,
    },
    metadata,
    sourceIds: isStringArray(meta?.source_ids)
      ? meta.source_ids
      : isStringArray(provenance?.source_ids) ? provenance.source_ids : [],
  };
}

function readContextControlCenterFacts(entry: ReadinessEntry): ControlCenterReadinessInput["context"] {
  if (!entry.ready || !isRecord(entry.value)) {
    return {
      available: false,
      generatedAt: null,
      freshness: "UNAVAILABLE",
      lastKnownGood: false,
    };
  }
  const meta = isRecord(entry.value._source_meta) ? entry.value._source_meta : null;
  return {
    available: true,
    generatedAt: typeof entry.value.generated_at === "string" ? entry.value.generated_at : null,
    freshness: "FRESH",
    lastKnownGood: meta?.source_kind === "approved-sources-output",
  };
}

async function readReviewStorageStatus(
  provider: ReviewSessionStorageProvider,
): Promise<ControlCenterReadinessInput["reviewStorage"]> {
  try {
    const result = await provider.read();
    const entries = Object.values(result.state.entries);
    const lastSavedAt = entries
      .map((entry) => entry.updated_at)
      .filter((value) => !Number.isNaN(Date.parse(value)))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
    return {
      available: !result._source_meta.warning,
      entriesCount: entries.length,
      lastSavedAt,
    };
  } catch {
    return { available: false, entriesCount: 0, lastSavedAt: null };
  }
}

function safeBuildSha(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9._-]{1,128}$/.test(normalized) ? normalized : null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isNonNegativeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function publicReadinessEntry(entry: ReadinessEntry): { ready: boolean; reason_code: string | null } {
  return { ready: entry.ready, reason_code: entry.reason_code };
}

function publicScannerReadinessEntry(entry: ReadinessEntry): {
  ready: boolean;
  status: "ready" | "stale" | "unavailable";
  reason_code: string | null;
  freshness_status: "FRESH" | "STALE" | null;
  generated_at: string | null;
  age_seconds: number | null;
} {
  if (!entry.ready || !isRecord(entry.value)) {
    return {
      ready: false,
      status: "unavailable",
      reason_code: entry.reason_code,
      freshness_status: null,
      generated_at: null,
      age_seconds: null,
    };
  }
  const meta = isRecord(entry.value._source_meta) ? entry.value._source_meta : null;
  const provenance = isRecord(entry.value.provenance) ? entry.value.provenance : null;
  const freshnessStatus = meta?.freshness_status === "STALE" ? "STALE" : "FRESH";
  return {
    ready: true,
    status: freshnessStatus === "STALE" ? "stale" : "ready",
    reason_code: freshnessStatus === "STALE" ? "SCANNER_SNAPSHOT_STALE" : null,
    freshness_status: freshnessStatus,
    generated_at: typeof provenance?.generated_at === "string" ? provenance.generated_at : null,
    age_seconds: typeof meta?.age_seconds === "number" ? meta.age_seconds : null,
  };
}

function buildDiscoveryReadiness(scanner: ReadinessEntry, context: ReadinessEntry) {
  if (!scanner.ready || !isRecord(scanner.value)) {
    const reasonCode = scanner.reason_code ?? "SCANNER_OUTPUT_UNAVAILABLE";
    return {
      new_emerging: { ready: false, status: "unavailable", reason_code: reasonCode },
      established: { ready: false, configured: false, status: "unavailable", reason_code: reasonCode },
    };
  }
  const provenance = isRecord(scanner.value.provenance) ? scanner.value.provenance : null;
  const metadata = provenance && isRecord(provenance.metadata) ? provenance.metadata : null;
  const readiness = metadata && isRecord(metadata.readiness) ? metadata.readiness : null;
  if (!readiness) {
    return {
      new_emerging: { ready: false, status: "unavailable", reason_code: "SCANNER_METADATA_INVALID" },
      established: { ready: false, configured: false, status: "unavailable", reason_code: "SCANNER_METADATA_INVALID" },
    };
  }
  const newEmergingReady = readiness.new_emerging === "READY";
  const newEmergingDegraded = readiness.new_emerging === "DEGRADED";
  const establishedEmpty = readiness.established === "EMPTY_CONFIGURED";
  return {
    new_emerging: {
      ready: newEmergingReady || newEmergingDegraded,
      status: newEmergingDegraded ? "degraded" : newEmergingReady ? "ready" : "unavailable",
      reason_code: newEmergingDegraded
        ? "DEXSCREENER_PARTIAL_COVERAGE"
        : newEmergingReady ? null : "NEW_EMERGING_UNAVAILABLE",
    },
    established: establishedEmpty
      ? {
        ready: false,
        configured: true,
        status: "empty_configured",
        reason_code: "ESTABLISHED_UNIVERSE_EMPTY",
      }
      : {
        ready: readiness.established === "READY",
        configured: true,
        status: readiness.established === "READY" ? "ready" : "unavailable",
        reason_code: readiness.established === "READY" ? null : "ESTABLISHED_UNAVAILABLE",
      },
    context: publicReadinessEntry(context),
  };
}

function errorCode(error: unknown, fallback: string): string {
  if (error instanceof ScannerOutputError || error instanceof ContextOutputError) return error.code;
  return fallback;
}

function getRequestPath(url: string | undefined): string {
  return url?.split("?")[0] ?? "/";
}

function isReportsApiPath(path: string): boolean {
  return path === "/api/reports" || path === "/api/reports/status" || path.startsWith("/api/reports/");
}

function isFollowUpApiPath(path: string): boolean {
  return path === "/api/follow-up" || path.startsWith("/api/follow-up/");
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

class RequestBodyError extends Error {
  readonly code: "invalid_json" | "body_too_large";

  constructor(code: RequestBodyError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > 1_000_000) {
      throw new RequestBodyError("body_too_large", "Review session request body is too large.");
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RequestBodyError("invalid_json", "Request body must be valid ReviewSessionState JSON.");
  }
}
