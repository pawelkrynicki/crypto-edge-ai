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
import { readProductVersion, type ProductVersionOptions } from "./productVersion.js";
import { createProductReviewPublication, type ProductReviewPublicationOptions } from "./productReviewPublication.js";
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
  readFollowUpByIdentity,
  readFollowUpList,
  readFollowUpStatus,
  type FollowUpApiOptions,
} from "./followUpApi.js";
import { createOwnerSessionSecret } from "./ownerPreflight.js";
import {
  createFeedbackService,
  createFeedbackSessionManager,
  FeedbackApiError,
  feedbackRecordsToCsv,
  isFeedbackId,
  parseOwnerFeedbackExportFormat,
  parseOwnerFeedbackListQuery,
  readFeedbackJsonBody,
  requireFeedbackPostRequest,
  type FeedbackServiceOptions,
  type FeedbackSubjectRef,
} from "./feedbackApi.js";
import {
  resolveFeedbackStore,
  type FeedbackStore,
  type FeedbackStoreOptions,
  type VerifiedFeedbackSubject,
} from "./feedbackStore.js";
import {
  publicAIResearchError,
  parseAIResearchQuery,
  parseAIResearchReviewMetricsQuery,
  readAIResearchGenerateRequest,
  type AIResearchApiOptions,
} from "./aiResearchApi.js";
import { createAIResearchService } from "./aiResearchService.js";
import { presentAIProductionAvailability, presentAIProductionLookup } from "./aiProductionPublic.js";
import {
  createManualOwnerActionsService,
  ManualOwnerActionError,
  type ManualOwnerActionsOptions,
} from "./manualOwnerActions.js";
import type { ManualVerificationVerdict } from "../../data-poc/src/followUpBasket.js";
import type { LifecycleCycleReceipt } from "../../data-poc/src/systemLifecycle.js";
import { createLifecycleService, LifecycleServiceError, parseRadarCursor } from "./lifecycleService.js";
import { createPc1SessionContextService } from "./lifecycleSession.js";
import { getDefaultUserWorkspaceDatabasePath, type UserWorkspaceRepository } from "./userWorkspaceRepository.js";

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
  productVersion?: ProductVersionOptions;
  reviewPublication?: ProductReviewPublicationOptions;
  establishedUniverse?: EstablishedUniverseStatusOptions;
  establishedPromotion?: EstablishedPromotionOptions;
  ownerOperations?: OwnerOperationsOptions;
  manualOwnerActions?: ManualOwnerActionsOptions;
  reports?: ReportsLibraryOptions;
  followUp?: FollowUpApiOptions;
  aiResearch?: AIResearchApiOptions;
  lifecycle?: {
    newInboxStorePath?: string;
    auditStorePath?: string;
    cycleReceiptPath?: string;
    workspaceDatabasePath?: string;
    workspace?: UserWorkspaceRepository;
  };
  feedback?: FeedbackStoreOptions & {
    store?: FeedbackStore;
    submissionEnabled?: boolean;
    sessionSecret?: string;
    now?: () => Date;
    sessionLimit?: number;
    globalLimit?: number;
    rateWindowMs?: number;
    resolveSubject?: FeedbackServiceOptions["resolveSubject"];
  };
};

export function createScannerApiHandler(options: ScannerApiHandlerOptions = {}): RequestListener {
  const runtimeMode = resolveProductRuntimeMode(options.runtimeMode ?? process.env.CRYPTO_EDGE_RUNTIME_MODE);
  const aiResearchRenderPreview = options.aiResearch?.renderPreview
    ?? process.env.CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW === "1";
  const reviewSessionProvider = options.reviewSessionProvider
    ?? createConfiguredReviewSessionStorageProvider({ reviewSession: options.reviewSession });
  const scannerOptions: LatestScannerOutputOptions = { ...options.scanner, runtimeMode };
  const aiResearchScannerOptions: LatestScannerOutputOptions = aiResearchRenderPreview ? {
    ...options.scanner,
    runtimeMode: "DEVELOPMENT_DEMO",
    allowFixtureFallback: false,
  } : scannerOptions;
  const contextOptions: LatestContextOutputOptions = { ...options.context, runtimeMode };
  const productVersionOptions: ProductVersionOptions = {
    automationStatePath: options.productVersion?.automationStatePath ?? options.scanner?.automationStatePath,
    outputDirectoryPath: options.productVersion?.outputDirectoryPath ?? options.scanner?.outputDirPath,
    lifecycleReceiptPath: options.productVersion?.lifecycleReceiptPath ?? options.lifecycle?.cycleReceiptPath,
    ...options.productVersion,
  };
  const reviewPublication = createProductReviewPublication({
    ...options.reviewPublication,
    loadBaseScanner: options.reviewPublication?.loadBaseScanner
      ?? (() => readLatestScannerOutput(scannerOptions)),
    loadBaseVersion: options.reviewPublication?.loadBaseVersion
      ?? (() => readProductVersion(productVersionOptions)),
  });
  const isActiveReviewRequest = (req: IncomingMessage): boolean => (
    reviewPublication.enabled && isLocalOwnerRequest(req) && isPc1ReviewRequest(req)
  );
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
  const manualOwnerActions = createManualOwnerActionsService({
    scanner: scannerOptions,
    storePath: options.followUp?.storePath,
    ...options.manualOwnerActions,
    mode: ownerMode,
    sessionSecret: ownerSessionSecret,
  });
  const feedbackSessionManager = createFeedbackSessionManager(
    options.feedback?.sessionSecret ?? process.env.CRYPTO_EDGE_FEEDBACK_SESSION_SECRET,
  );
  const feedbackSubmissionEnabled = options.feedback?.submissionEnabled
    ?? process.env.CRYPTO_EDGE_FEEDBACK_SUBMISSION_ENABLED !== "0";
  const feedbackStorePromise = resolveFeedbackStore(options.feedback);
  const feedbackServicePromise = feedbackStorePromise.then((store) => createFeedbackService({
    store,
    runtimeMode,
    buildSha: options.health?.buildSha,
    submissionEnabled: feedbackSubmissionEnabled,
    now: options.feedback?.now,
    sessionLimit: options.feedback?.sessionLimit,
    globalLimit: options.feedback?.globalLimit,
    rateWindowMs: options.feedback?.rateWindowMs,
    resolveSubject: options.feedback?.resolveSubject ?? ((subjectRef) => resolveFeedbackSubject(
      subjectRef,
      scannerOptions,
      options.followUp,
      options.reports,
    )),
  }));
  const aiResearchService = options.aiResearch?.service ?? createAIResearchService({
    ...options.aiResearch,
    scanner: aiResearchScannerOptions,
    followUp: options.followUp,
    reports: options.reports,
  });
  const pc1Sessions = createPc1SessionContextService();
  const lifecycle = createLifecycleService({
    scanner: scannerOptions,
    followUpStorePath: options.followUp?.storePath,
    establishedStorePath: options.establishedUniverse?.storeFilePath,
    newInboxStorePath: options.lifecycle?.newInboxStorePath,
    auditStorePath: options.lifecycle?.auditStorePath,
    cycleReceiptPath: options.lifecycle?.cycleReceiptPath,
    workspace: options.lifecycle?.workspace,
    workspaceDatabasePath: options.lifecycle?.workspaceDatabasePath ?? getDefaultUserWorkspaceDatabasePath(),
  });

  return async (req, res) => {
    const path = getRequestPath(req.url);

    if (req.method === "GET" && path === "/api/lifecycle/session") {
      const session = pc1Sessions.resolve(req);
      if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
      sendJson(req, res, 200, { actor: { role: session.context.role, capabilities: session.context.capabilities } }, runtimeMode);
      return;
    }

    if (req.method === "POST" && path === "/api/lifecycle/review-session/camp-user") {
      if (!isLocalOwnerRequest(req)) { sendJson(req, res, 404, { error: "not_found" }, runtimeMode); return; }
      const session = pc1Sessions.setReviewRole("CAMP_USER");
      res.setHeader("set-cookie", session.setCookie);
      sendJson(req, res, 200, { actor: { role: session.context.role, capabilities: session.context.capabilities } }, runtimeMode);
      return;
    }

    if (req.method === "POST" && path === "/api/lifecycle/review-session/owner") {
      if (!isLocalOwnerRequest(req)) { sendJson(req, res, 404, { error: "not_found" }, runtimeMode); return; }
      const session = pc1Sessions.setReviewRole("OWNER");
      res.setHeader("set-cookie", session.setCookie);
      sendJson(req, res, 200, { actor: { role: session.context.role, capabilities: session.context.capabilities } }, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/lifecycle/summary") {
      try { sendJson(req, res, 200, await lifecycle.summary(), runtimeMode); } catch (error) { sendLifecycleError(req, res, error, runtimeMode); }
      return;
    }

    if (req.method === "GET" && path === "/api/lifecycle/radar") {
      try {
        const session = pc1Sessions.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        const query = validateLifecycleRadarQuery(req.url);
        sendJson(req, res, 200, await lifecycle.radar(session.context, query), runtimeMode);
      } catch (error) { sendLifecycleError(req, res, error, runtimeMode); }
      return;
    }

    if (req.method === "GET" && path === "/api/lifecycle/new-inbox") {
      try {
        const session = pc1Sessions.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        if (!session.context.capabilities.includes("LIFECYCLE_SCAN_NOW")) throw new LifecycleServiceError("LIFECYCLE_OWNER_ONLY", 403);
        sendJson(req, res, 200, await lifecycle.inbox(), runtimeMode);
      } catch (error) { sendLifecycleError(req, res, error, runtimeMode); }
      return;
    }

    if (req.method === "GET" && path === "/api/lifecycle/workspace/integrity") {
      try {
        const session = pc1Sessions.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        if (!session.context.capabilities.includes("LIFECYCLE_SCAN_NOW")) throw new LifecycleServiceError("LIFECYCLE_OWNER_ONLY", 403);
        sendJson(req, res, 200, await lifecycle.workspaceIntegrity(), runtimeMode);
      } catch (error) { sendLifecycleError(req, res, error, runtimeMode); }
      return;
    }

    if (req.method === "GET" && path === "/api/lifecycle/token") {
      try {
        const session = pc1Sessions.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        const query = validateManualOwnerQuery(req.url);
        sendJson(req, res, 200, await lifecycle.resolveToken(query.chain, query.contract_address, session.context), runtimeMode);
      } catch (error) { sendLifecycleError(req, res, error, runtimeMode); }
      return;
    }

    if (req.method === "POST" && path === "/api/lifecycle/token/status") {
      try {
        const session = pc1Sessions.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        const body = validateLifecycleTransitionBody(await readOwnerJsonBody(req));
        sendJson(req, res, 200, await lifecycle.transition({
          chain: body.chain,
          contractAddress: body.contract_address,
          targetStatus: body.target_status,
          overrideReason: body.override_reason,
          session: session.context,
        }), runtimeMode);
      } catch (error) { sendLifecycleError(req, res, error, runtimeMode); }
      return;
    }

    if (req.method === "GET" && path === "/api/lifecycle/scan-preview") {
      try {
        const session = pc1Sessions.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        if (!session.context.capabilities.includes("LIFECYCLE_SCAN_NOW")) throw new LifecycleServiceError("LIFECYCLE_SCAN_FORBIDDEN", 403);
        const preview = await ownerOperations.createRefreshPreview(isLocalOwnerRequest(req));
        sendJson(req, res, 200, { ...preview, honeypot_is_called: false, lifecycle_policy_version: "system_lifecycle_policy_v1" }, runtimeMode);
      } catch (error) { sendLifecycleError(req, res, error, runtimeMode); }
      return;
    }

    if (req.method === "POST" && path === "/api/lifecycle/scan-now") {
      try {
        const session = pc1Sessions.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        if (!session.context.capabilities.includes("LIFECYCLE_SCAN_NOW")) throw new LifecycleServiceError("LIFECYCLE_SCAN_FORBIDDEN", 403);
        const body = validateOwnerRefreshBody(await readOwnerJsonBody(req));
        const result = await ownerOperations.refresh(body.preflight_id, body.preflight_id, isLocalOwnerRequest(req));
        const [scanner, lifecycleReceipt] = await Promise.all([
          readLatestScannerOutput(scannerOptions).catch(() => null),
          lifecycle.latestReceipt(),
        ]);
        const scannerReceipt = lifecycleScannerReceipt(scanner);
        sendJson(req, res, result.status === "FAILED" ? 500 : 200, {
          ...result,
          receipt: {
            found: scannerReceipt.found,
            valid: scannerReceipt.valid,
            rejected: scannerReceipt.rejected,
            ...lastCompletedLifecycleReceipt(lifecycleReceipt, scannerReceipt.snapshot_at),
            source_errors: scannerReceipt.source_errors,
            snapshot_at: scannerReceipt.snapshot_at,
            honeypot_is_calls: 0,
          },
        }, runtimeMode);
      } catch (error) { sendLifecycleError(req, res, error, runtimeMode); }
      return;
    }

    if (req.method === "GET" && path === "/api/ai-research/status") {
      sendJson(req, res, 200, presentAIProductionAvailability(aiResearchService.status().available), runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/ai-research/brief") {
      try {
        const session = pc1Sessions.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        const query = parseAIResearchQuery(req.url);
        sendJson(req, res, 200, presentAIProductionLookup(await aiResearchService.getBrief(query.chain, query.contract_address, query.locale), query.locale), runtimeMode);
      } catch (error) {
        sendAIResearchError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && (path === "/api/v1/ai-analyses/status" || path === "/api/v1/ai-analyses/result")) {
      try {
        const session = pc1Sessions.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        const query = parseAIResearchQuery(req.url);
        sendJson(req, res, 200, presentAIProductionLookup(await aiResearchService.getBrief(query.chain, query.contract_address, query.locale), query.locale), runtimeMode);
      } catch (error) {
        sendAIResearchError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/ai-research/review-metrics") {
      if (!isLocalOwnerRequest(req)) {
        sendJson(req, res, 404, { error: "not_found", message: "Route not found" }, runtimeMode);
        return;
      }
      try {
        const analysisId = parseAIResearchReviewMetricsQuery(req.url);
        sendJson(req, res, 200, await aiResearchService.getReviewMetrics(analysisId), runtimeMode);
      } catch (error) {
        sendAIResearchError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "POST" && path === "/api/ai-research/generate") {
      try {
        const session = pc1Sessions.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        const body = await readAIResearchGenerateRequest(req);
        sendJson(req, res, 200, presentAIProductionLookup(await aiResearchService.generate(body, session.context.actor_id), body.locale), runtimeMode);
      } catch (error) {
        sendAIResearchError(req, res, error, runtimeMode);
      }
      return;
    }


    if (req.method === "POST" && path === "/api/v1/ai-analyses/requests") {
      try {
        const session = pc1Sessions.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        const body = await readAIResearchGenerateRequest(req);
        sendJson(req, res, 202, presentAIProductionLookup(await aiResearchService.generate(body, session.context.actor_id), body.locale), runtimeMode);
      } catch (error) {
        sendAIResearchError(req, res, error, runtimeMode);
      }
      return;
    }

    if (path === "/api/ai-research" || path.startsWith("/api/ai-research/") || path.startsWith("/api/v1/ai-analyses/")) {
      res.setHeader("allow", path.endsWith("/generate") || path.endsWith("/requests") ? "POST" : "GET");
      sendJson(req, res, 405, { error: "method_not_allowed", message: "Method not allowed" }, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/feedback/status") {
      const session = feedbackSessionManager.resolve(req);
      if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
      sendJson(req, res, 200, (await feedbackServicePromise).publicStatus(), runtimeMode);
      return;
    }

    if (req.method === "POST" && path === "/api/feedback") {
      try {
        requireFeedbackPostRequest(req);
        const session = feedbackSessionManager.resolve(req);
        if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
        const receipt = await (await feedbackServicePromise).submit(
          await readFeedbackJsonBody(req),
          session.sessionId,
        );
        sendJson(req, res, receipt.submission_status === "RECORDED" ? 201 : 200, receipt, runtimeMode);
      } catch (error) {
        sendFeedbackError(req, res, error, runtimeMode);
      }
      return;
    }

    if (path === "/api/feedback" || path.startsWith("/api/feedback/")) {
      res.setHeader("allow", path === "/api/feedback" ? "POST" : "GET");
      sendJson(req, res, 405, { error: "method_not_allowed", message: "Method not allowed" }, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/owner/feedback/status") {
      try {
        requireOwnerFeedbackCapability(req, ownerMode);
        sendJson(req, res, 200, (await feedbackServicePromise).ownerStatus(), runtimeMode);
      } catch (error) {
        sendFeedbackError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/owner/feedback") {
      try {
        requireOwnerFeedbackCapability(req, ownerMode);
        sendJson(req, res, 200, (await feedbackServicePromise).list(parseOwnerFeedbackListQuery(req.url)), runtimeMode);
      } catch (error) {
        sendFeedbackError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/owner/feedback/export") {
      try {
        requireOwnerFeedbackCapability(req, ownerMode);
        const service = await feedbackServicePromise;
        const format = parseOwnerFeedbackExportFormat(req.url);
        const records = service.exportRecords();
        if (format === "csv") {
          sendText(req, res, 200, feedbackRecordsToCsv(records), "text/csv; charset=utf-8", runtimeMode, {
            "content-disposition": "attachment; filename=crypto-edge-feedback.csv",
          });
        } else {
          sendJson(req, res, 200, { feedback: records }, runtimeMode);
        }
      } catch (error) {
        sendFeedbackError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path.startsWith("/api/owner/feedback/")) {
      try {
        requireOwnerFeedbackCapability(req, ownerMode);
        const feedbackId = path.slice("/api/owner/feedback/".length);
        if (!isFeedbackId(feedbackId)) throw new FeedbackApiError("FEEDBACK_NOT_FOUND", 404);
        const detail = (await feedbackServicePromise).detail(feedbackId);
        if (!detail) throw new FeedbackApiError("FEEDBACK_NOT_FOUND", 404);
        sendJson(req, res, 200, detail, runtimeMode);
      } catch (error) {
        sendFeedbackError(req, res, error, runtimeMode);
      }
      return;
    }

    if (path === "/api/owner/feedback" || path.startsWith("/api/owner/feedback/")) {
      sendJson(req, res, 404, { error: "not_found", message: "Route not found" }, runtimeMode);
      return;
    }

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
          {
            identity_confirmation: body.identity_confirmation,
            owner_reason: body.owner_reason,
          },
        );
        sendJson(req, res, 200, result, runtimeMode);
      } catch (error) {
        sendEstablishedPromotionError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/owner-operations/follow-up-action/status") {
      try {
        const query = validateManualOwnerQuery(req.url);
        sendJson(req, res, 200, await manualOwnerActions.getFollowUpStatus(
          query.chain,
          query.contract_address,
          isLocalOwnerRequest(req),
        ), runtimeMode);
      } catch (error) {
        sendManualOwnerActionError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/owner-operations/follow-up-action/preview") {
      try {
        const query = validateManualOwnerQuery(req.url);
        sendJson(req, res, 200, await manualOwnerActions.createFollowUpPreview(
          query.chain,
          query.contract_address,
          isLocalOwnerRequest(req),
        ), runtimeMode);
      } catch (error) {
        sendManualOwnerActionError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "POST" && path === "/api/owner-operations/follow-up-action") {
      try {
        requireOwnerMutationRequest(req);
        const body = validateManualOwnerConfirmation(await readOwnerJsonBody(req));
        const sessionHeader = req.headers[OWNER_SESSION_HEADER];
        if (typeof sessionHeader !== "string") throw new ManualOwnerActionError("OWNER_SESSION_REQUIRED", 403);
        sendJson(req, res, 200, await manualOwnerActions.addToFollowUp(
          body.preview_id,
          sessionHeader,
          body,
          isLocalOwnerRequest(req),
        ), runtimeMode);
      } catch (error) {
        sendManualOwnerActionError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/owner-operations/manual-verification/status") {
      try {
        const query = validateManualOwnerQuery(req.url);
        sendJson(req, res, 200, await manualOwnerActions.getVerificationStatus(
          query.chain,
          query.contract_address,
          isLocalOwnerRequest(req),
        ), runtimeMode);
      } catch (error) {
        sendManualOwnerActionError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "POST" && path === "/api/owner-operations/manual-verification-preview") {
      try {
        requireOwnerMutationRequest(req);
        const body = validateManualVerificationPreviewBody(await readOwnerJsonBody(req));
        sendJson(req, res, 200, await manualOwnerActions.createVerificationPreview(
          body.chain,
          body.contract_address,
          body.verdict,
          body.note,
          isLocalOwnerRequest(req),
        ), runtimeMode);
      } catch (error) {
        sendManualOwnerActionError(req, res, error, runtimeMode);
      }
      return;
    }

    if (req.method === "POST" && path === "/api/owner-operations/manual-verification") {
      try {
        requireOwnerMutationRequest(req);
        const body = validateManualOwnerConfirmation(await readOwnerJsonBody(req));
        const sessionHeader = req.headers[OWNER_SESSION_HEADER];
        if (typeof sessionHeader !== "string") throw new ManualOwnerActionError("OWNER_SESSION_REQUIRED", 403);
        sendJson(req, res, 200, await manualOwnerActions.saveVerification(
          body.preview_id,
          sessionHeader,
          body,
          isLocalOwnerRequest(req),
        ), runtimeMode);
      } catch (error) {
        sendManualOwnerActionError(req, res, error, runtimeMode);
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
        const [scanner, lifecycleReceipt] = await Promise.all([
          readLatestScannerOutput(scannerOptions).catch(() => null),
          lifecycle.latestReceipt(),
        ]);
        const receipt = lifecycleScannerReceipt(scanner);
        sendJson(req, res, result.status === "FAILED" ? 500 : 200, {
          ...result,
          lifecycle_receipt: {
            ...receipt,
            ...lastCompletedLifecycleReceipt(lifecycleReceipt, receipt.snapshot_at),
            honeypot_is_calls: 0,
          },
        }, runtimeMode);
      } catch (error) {
        sendOwnerOperationsError(req, res, error, runtimeMode);
      }
      return;
    }

    if (path.startsWith("/api/owner-operations/")) {
      sendJson(req, res, 404, { error: "not_found", message: "Route not found" }, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/manual-verification") {
      try {
        const query = validateManualOwnerQuery(req.url);
        sendJson(req, res, 200, {
          schema_version: "manual_verification_lookup_v1",
          record: await manualOwnerActions.getPublicVerification(query.chain, query.contract_address),
        }, runtimeMode);
      } catch (error) {
        sendManualOwnerActionError(req, res, error, runtimeMode);
      }
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

    if (req.method === "GET" && path === "/api/follow-up/identity") {
      try {
        const query = validateManualOwnerQuery(req.url);
        const entry = await readFollowUpByIdentity(query.chain, query.contract_address, options.followUp);
        if (!entry) {
          sendJson(req, res, 404, { error: "follow_up_entry_not_found", message: "Follow-up entry not found" }, runtimeMode);
          return;
        }
        sendJson(req, res, 200, entry, runtimeMode);
      } catch {
        sendJson(req, res, 400, { error: "follow_up_query_invalid", message: "Follow-up query invalid" }, runtimeMode);
      }
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
      const [scanner, context, automation, establishedUniverse, reviewStorage, reportsLibrary, followUp, feedback] = await Promise.all([
        getReadinessEntry(() => readLatestScannerOutput(scannerOptions)),
        getReadinessEntry(() => readLatestContextOutput(contextOptions)),
        readAutomationStatus(options.automation),
        readEstablishedUniverseStatus(options.establishedUniverse),
        readReviewStorageStatus(reviewSessionProvider),
        readReportsLibraryStatus(options.reports),
        readFollowUpStatus(options.followUp),
        feedbackServicePromise.then((service) => service.ownerStatus()),
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
        feedback: {
          storageAvailable: feedback.storage_available,
          status: feedback.feedback_status,
          submissionEnabled: feedbackSubmissionEnabled && feedback.storage_available,
          ...(isOwnerFeedbackCapable(req, ownerMode) ? {
            totalCount: feedback.total_count,
            newCount: feedback.new_count,
            blockerCount: feedback.blocker_count,
            latestFeedbackAt: feedback.latest_feedback_at,
          } : {}),
        },
        gates: {
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

    if (req.method === "GET" && path === "/api/product/version") {
      try {
        const version = await readProductVersion(productVersionOptions);
        sendJson(req, res, 200, isActiveReviewRequest(req) ? reviewPublication.decorateVersion(version) : version, runtimeMode);
      } catch {
        sendJson(req, res, 200, {
          scanner_run_id: null,
          scanner_generated_at: null,
          context_run_id: null,
          context_generated_at: null,
          lifecycle_cycle_id: null,
          lifecycle_updated_at: null,
        }, runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/product/review/publication-status") {
      if (!isActiveReviewRequest(req)) {
        sendJson(req, res, 404, { error: "not_found", message: "Route not found" }, runtimeMode);
        return;
      }
      sendJson(req, res, 200, reviewPublication.getStatus(), runtimeMode);
      return;
    }

    if (req.method === "POST" && path === "/api/product/review/commit-ack") {
      if (!isActiveReviewRequest(req)) {
        sendJson(req, res, 404, { error: "not_found", message: "Route not found" }, runtimeMode);
        return;
      }
      try {
        const { scanner_run_id: scannerRunId } = validateReviewCommitAcknowledgement(await readJsonBody(req));
        const acknowledged = await reviewPublication.acknowledgeUiCommit(scannerRunId);
        if (!acknowledged) {
          sendJson(req, res, 409, { error: "review_commit_not_pending" }, runtimeMode);
          return;
        }
        sendJson(req, res, 200, reviewPublication.getStatus(), runtimeMode);
      } catch {
        sendJson(req, res, 400, { error: "review_commit_ack_invalid" }, runtimeMode);
      }
      return;
    }

    if (req.method === "POST" && path === "/api/product/review/publish-next") {
      if (!isActiveReviewRequest(req)) {
        sendJson(req, res, 404, { error: "not_found", message: "Route not found" }, runtimeMode);
        return;
      }
      await reviewPublication.publishNext();
      try {
        sendJson(req, res, 200, reviewPublication.decorateVersion(await readProductVersion(productVersionOptions)), runtimeMode);
      } catch {
        sendJson(req, res, 200, {
          scanner_run_id: null,
          scanner_generated_at: null,
          context_run_id: null,
          context_generated_at: null,
          lifecycle_cycle_id: null,
          lifecycle_updated_at: null,
        }, runtimeMode);
      }
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
        const scanner = await readLatestScannerOutput(scannerOptions);
        sendJson(req, res, 200, isActiveReviewRequest(req) ? reviewPublication.decorateScanner(scanner) : scanner, runtimeMode);
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
      if (!isActiveReviewRequest(req)) {
        sendJson(req, res, 404, { error: "not_found" }, runtimeMode);
        return;
      }
      const session = pc1Sessions.resolve(req);
      if (session.setCookie) res.setHeader("set-cookie", session.setCookie);
      if (!isReviewDiagnosticsRole(session.context.role)) {
        sendJson(req, res, 403, { error: "review_diagnostics_forbidden" }, runtimeMode);
        return;
      }
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

function sendText(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: string,
  contentType: string,
  runtimeMode: ResolvedProductRuntimeMode,
  additionalHeaders: Record<string, string> = {},
): void {
  res.writeHead(status, {
    ...responseHeaders(req, runtimeMode),
    "content-type": contentType,
    ...additionalHeaders,
  });
  res.end(body);
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

function sendFeedbackError(
  req: IncomingMessage,
  res: ServerResponse,
  error: unknown,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  const feedbackError = error instanceof FeedbackApiError
    ? error
    : new FeedbackApiError("FEEDBACK_UNAVAILABLE", 503);
  if (feedbackError.retryAfterSeconds !== undefined) {
    res.setHeader("retry-after", String(feedbackError.retryAfterSeconds));
  }
  sendJson(req, res, feedbackError.httpStatus, {
    error: feedbackError.code.toLowerCase(),
    message: feedbackError.code === "RATE_LIMITED"
      ? "Feedback rate limit reached"
      : feedbackError.httpStatus === 404 ? "Route or feedback not found" : "Feedback request rejected",
  }, runtimeMode);
}

function sendAIResearchError(
  req: IncomingMessage,
  res: ServerResponse,
  error: unknown,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  const value = publicAIResearchError(error);
  if (value.retryAfterSeconds !== undefined) res.setHeader("retry-after", String(value.retryAfterSeconds));
  sendJson(req, res, value.status, {
    schema_version: "ai_production_error_v1",
    error: value.code === "RATE_LIMITED" ? "LIMIT" : "UNAVAILABLE",
    message: value.code === "RATE_LIMITED"
      ? "AI research generation is temporarily limited. Try again after the indicated time."
      : "AI research brief is currently unavailable.",
    retry_after_seconds: value.retryAfterSeconds ?? null,
  }, runtimeMode);
}

function isOwnerFeedbackCapable(req: IncomingMessage, mode: ReturnType<typeof resolveOwnerOperationsMode>): boolean {
  return mode !== "DISABLED" && isLocalOwnerRequest(req);
}

function requireOwnerFeedbackCapability(
  req: IncomingMessage,
  mode: ReturnType<typeof resolveOwnerOperationsMode>,
): void {
  if (!isOwnerFeedbackCapable(req, mode)) throw new FeedbackApiError("NOT_FOUND", 404);
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

function validateLifecycleTransitionBody(value: unknown): {
  chain: string;
  contract_address: string;
  target_status: "FOLLOW_UP" | "MAIN_RADAR";
  override_reason: string | null;
  confirmation: true;
} {
  if (!isRecord(value)) throw new LifecycleServiceError("LIFECYCLE_BODY_INVALID", 400);
  const keys = Object.keys(value).sort();
  if (keys.length !== 5
    || keys[0] !== "chain"
    || keys[1] !== "confirmation"
    || keys[2] !== "contract_address"
    || keys[3] !== "override_reason"
    || keys[4] !== "target_status") throw new LifecycleServiceError("LIFECYCLE_BODY_INVALID", 400);
  if (typeof value.chain !== "string" || value.chain.length === 0 || value.chain.length > 32
    || typeof value.contract_address !== "string" || value.contract_address.length === 0 || value.contract_address.length > 128
    || (value.target_status !== "FOLLOW_UP" && value.target_status !== "MAIN_RADAR")
    || value.confirmation !== true
    || !(value.override_reason === null || (typeof value.override_reason === "string" && value.override_reason.trim().length > 0 && value.override_reason.length <= 500))) {
    throw new LifecycleServiceError("LIFECYCLE_BODY_INVALID", 400);
  }
  return {
    chain: value.chain,
    contract_address: value.contract_address,
    target_status: value.target_status,
    override_reason: value.override_reason,
    confirmation: true,
  };
}

function validateEstablishedPromotionBody(value: unknown): {
  preview_id: string;
  confirmation: true;
  identity_confirmation: string | null;
  owner_reason: string | null;
} {
  if (!isRecord(value)) throw new EstablishedPromotionError("PROMOTION_BODY_INVALID", 400);
  const keys = Object.keys(value).sort();
  const legacy = keys.length === 2 && keys[0] === "confirmation" && keys[1] === "preview_id";
  const current = keys.length === 4
    && keys[0] === "confirmation"
    && keys[1] === "identity_confirmation"
    && keys[2] === "owner_reason"
    && keys[3] === "preview_id";
  if (!legacy && !current) {
    throw new EstablishedPromotionError("PROMOTION_BODY_INVALID", 400);
  }
  if (typeof value.preview_id !== "string" || value.preview_id.length === 0 || value.confirmation !== true) {
    throw new EstablishedPromotionError("PROMOTION_BODY_INVALID", 400);
  }
  if (value.identity_confirmation !== undefined && value.identity_confirmation !== null
    && (typeof value.identity_confirmation !== "string" || value.identity_confirmation.length > 180)) {
    throw new EstablishedPromotionError("PROMOTION_BODY_INVALID", 400);
  }
  if (value.owner_reason !== undefined && value.owner_reason !== null
    && (typeof value.owner_reason !== "string" || value.owner_reason.length > 500)) {
    throw new EstablishedPromotionError("PROMOTION_BODY_INVALID", 400);
  }
  return {
    preview_id: value.preview_id,
    confirmation: true,
    identity_confirmation: typeof value.identity_confirmation === "string" ? value.identity_confirmation : null,
    owner_reason: typeof value.owner_reason === "string" ? value.owner_reason : null,
  };
}

function validateManualOwnerConfirmation(value: unknown): {
  preview_id: string;
  confirmation: true;
  identity_confirmation: string;
  owner_reason: string | null;
} {
  if (!isRecord(value)) throw new ManualOwnerActionError("OWNER_ACTION_BODY_INVALID", 400);
  const keys = Object.keys(value).sort();
  if (keys.length !== 4
    || keys[0] !== "confirmation"
    || keys[1] !== "identity_confirmation"
    || keys[2] !== "owner_reason"
    || keys[3] !== "preview_id") {
    throw new ManualOwnerActionError("OWNER_ACTION_BODY_INVALID", 400);
  }
  if (typeof value.preview_id !== "string" || value.preview_id.length === 0 || value.preview_id.length > 8_192
    || value.confirmation !== true
    || typeof value.identity_confirmation !== "string" || value.identity_confirmation.length > 180
    || (value.owner_reason !== null && (typeof value.owner_reason !== "string" || value.owner_reason.length > 500))) {
    throw new ManualOwnerActionError("OWNER_ACTION_BODY_INVALID", 400);
  }
  return {
    preview_id: value.preview_id,
    confirmation: true,
    identity_confirmation: value.identity_confirmation,
    owner_reason: value.owner_reason,
  } as {
    preview_id: string;
    confirmation: true;
    identity_confirmation: string;
    owner_reason: string | null;
  };
}

function validateManualVerificationPreviewBody(value: unknown): {
  chain: string;
  contract_address: string;
  verdict: ManualVerificationVerdict;
  note: string;
} {
  if (!isRecord(value)) throw new ManualOwnerActionError("VERIFICATION_BODY_INVALID", 400);
  const keys = Object.keys(value).sort();
  if (keys.length !== 4
    || keys[0] !== "chain"
    || keys[1] !== "contract_address"
    || keys[2] !== "note"
    || keys[3] !== "verdict") {
    throw new ManualOwnerActionError("VERIFICATION_BODY_INVALID", 400);
  }
  if (typeof value.chain !== "string" || value.chain.length === 0 || value.chain.length > 32
    || typeof value.contract_address !== "string" || value.contract_address.length === 0 || value.contract_address.length > 128
    || !["VERIFIED", "NEEDS_MORE_DATA", "CRITICAL_RISK", "REJECT"].includes(String(value.verdict))
    || typeof value.note !== "string" || value.note.length < 3 || value.note.length > 500) {
    throw new ManualOwnerActionError("VERIFICATION_BODY_INVALID", 400);
  }
  return {
    chain: value.chain,
    contract_address: value.contract_address,
    verdict: value.verdict,
    note: value.note,
  } as {
    chain: string;
    contract_address: string;
    verdict: ManualVerificationVerdict;
    note: string;
  };
}

function validateManualOwnerQuery(url: string | undefined): { chain: string; contract_address: string } {
  let parsed: URL;
  try {
    parsed = new URL(url ?? "/", "http://owner.local");
  } catch {
    throw new ManualOwnerActionError("OWNER_ACTION_QUERY_INVALID", 400);
  }
  const keys = [...parsed.searchParams.keys()].sort();
  if (keys.length !== 2
    || keys[0] !== "chain"
    || keys[1] !== "contract_address"
    || parsed.searchParams.getAll("chain").length !== 1
    || parsed.searchParams.getAll("contract_address").length !== 1) {
    throw new ManualOwnerActionError("OWNER_ACTION_QUERY_INVALID", 400);
  }
  const chain = parsed.searchParams.get("chain");
  const contractAddress = parsed.searchParams.get("contract_address");
  if (!chain || !contractAddress || chain.length > 32 || contractAddress.length > 128) {
    throw new ManualOwnerActionError("OWNER_ACTION_QUERY_INVALID", 400);
  }
  return { chain, contract_address: contractAddress };
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
  const contextReadiness = publicContextReadinessEntry(context);
  const ready = scanner.ready;
  const degraded = ready && (
    scannerReadiness.freshness_status === "STALE"
    || !contextReadiness.ready
    || contextReadiness.freshness_status === "STALE"
    || Object.values(contextReadiness.source_statuses ?? {}).some((status) => status === "DEGRADED")
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
    context: contextReadiness,
    new_emerging: discovery.new_emerging,
    established: discovery.established,
    discovery,
    reason_codes: [
      scannerReadiness.reason_code,
      contextReadiness.reason_code,
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

function sendManualOwnerActionError(
  req: IncomingMessage,
  res: ServerResponse,
  error: unknown,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  const actionError = error instanceof ManualOwnerActionError
    ? error
    : error instanceof OwnerOperationsError
      ? new ManualOwnerActionError(error.code, error.httpStatus)
      : new ManualOwnerActionError("OWNER_ACTION_REQUEST_REJECTED", 400);
  sendJson(req, res, actionError.httpStatus, {
    error: actionError.code,
    message: "Owner token action rejected",
  }, runtimeMode);
}

function validateLifecycleRadarQuery(url: string | undefined): { limit: number; cursor: ReturnType<typeof parseRadarCursor> } {
  let parsed: URL;
  try { parsed = new URL(url ?? "/", "http://radar.local"); } catch { throw new LifecycleServiceError("LIFECYCLE_QUERY_INVALID", 400); }
  const keys = [...parsed.searchParams.keys()].sort();
  if (!keys.every((key) => key === "limit" || key === "cursor") || parsed.searchParams.getAll("limit").length > 1 || parsed.searchParams.getAll("cursor").length > 1) throw new LifecycleServiceError("LIFECYCLE_QUERY_INVALID", 400);
  const limitText = parsed.searchParams.get("limit");
  const limit = limitText === null ? 24 : Number(limitText);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new LifecycleServiceError("LIFECYCLE_LIMIT_INVALID", 400);
  return { limit, cursor: parseRadarCursor(parsed.searchParams.get("cursor")) };
}

function sendLifecycleError(
  req: IncomingMessage,
  res: ServerResponse,
  error: unknown,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  const lifecycleError = error instanceof LifecycleServiceError
    ? error
    : new LifecycleServiceError("LIFECYCLE_REQUEST_REJECTED", 400);
  sendJson(req, res, lifecycleError.httpStatus, {
    error: lifecycleError.code,
    message: "Lifecycle request rejected",
  }, runtimeMode);
}

function lifecycleScannerReceipt(value: unknown): {
  found: number;
  valid: number;
  rejected: number;
  source_errors: string[];
  snapshot_at: string | null;
} {
  if (!isRecord(value) || !isRecord(value.scan_run)) {
    return { found: 0, valid: 0, rejected: 0, source_errors: [], snapshot_at: null };
  }
  const run = value.scan_run;
  const provenance = isRecord(value.provenance) ? value.provenance : null;
  return {
    found: isNonNegativeInteger(run.total_raw) ? Number(run.total_raw) : 0,
    valid: Array.isArray(value.candidates) ? value.candidates.length : 0,
    rejected: isNonNegativeInteger(run.rejected_basic_filter) ? Number(run.rejected_basic_filter) : 0,
    source_errors: Array.isArray(run.errors) ? run.errors.filter(isString) : [],
    snapshot_at: typeof provenance?.generated_at === "string"
      ? provenance.generated_at
      : typeof run.finished_at === "string" ? run.finished_at : null,
  };
}

function lastCompletedLifecycleReceipt(receipt: LifecycleCycleReceipt | null, fallbackSnapshotAt: string | null): {
  new_inbox: number;
  new_inbox_updated: number;
  promoted_to_follow_up: number;
  promoted_to_main_radar: number;
  duplicates: number;
  lifecycle_cycle_id: string | null;
  lifecycle_status: LifecycleCycleReceipt["status"] | null;
  snapshot_at: string | null;
} {
  return {
    new_inbox: receipt?.new_inbox_added ?? 0,
    new_inbox_updated: receipt?.new_inbox_updated ?? 0,
    promoted_to_follow_up: receipt?.promoted_to_follow_up ?? 0,
    promoted_to_main_radar: receipt?.promoted_to_main_radar ?? 0,
    duplicates: receipt?.duplicate_noop ?? 0,
    lifecycle_cycle_id: receipt?.central_cycle_id ?? null,
    lifecycle_status: receipt?.status ?? null,
    snapshot_at: receipt?.snapshot_timestamp ?? fallbackSnapshotAt,
  };
}

function publicContextReadinessEntry(entry: ReadinessEntry): ProductReadinessOutput["context"] {
  if (!entry.ready || !isRecord(entry.value)) {
    return { ready: false, reason_code: entry.reason_code };
  }
  const meta = isRecord(entry.value._source_meta) ? entry.value._source_meta : null;
  const sources = Array.isArray(entry.value.sources) ? entry.value.sources : [];
  const sourceStatuses = Object.fromEntries(sources.flatMap((source) => {
    if (!isRecord(source) || typeof source.source_id !== "string") return [];
    return [[source.source_id, source.status === "DEGRADED" ? "DEGRADED" : "READY"]] as const;
  }));
  const freshnessStatus = meta?.freshness_status === "STALE" ? "STALE" : "FRESH";
  return {
    ready: true,
    reason_code: freshnessStatus === "STALE" ? "CONTEXT_SNAPSHOT_STALE" : null,
    run_id: typeof entry.value.run_id === "string" ? entry.value.run_id : null,
    generated_at: typeof entry.value.generated_at === "string" ? entry.value.generated_at : null,
    freshness_status: freshnessStatus,
    source_statuses: sourceStatuses,
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
    context: publicContextReadinessEntry(context),
  };
}

function errorCode(error: unknown, fallback: string): string {
  if (error instanceof ScannerOutputError || error instanceof ContextOutputError) return error.code;
  return fallback;
}

async function resolveFeedbackSubject(
  subjectRef: FeedbackSubjectRef,
  scannerOptions: LatestScannerOutputOptions,
  followUpOptions: FollowUpApiOptions | undefined,
  reportsOptions: ReportsLibraryOptions | undefined,
): Promise<VerifiedFeedbackSubject | null> {
  if (subjectRef.type === "candidate") {
    const scanner = await readLatestScannerOutput(scannerOptions).catch(() => null);
    const candidates = scanner && Array.isArray(scanner.candidates) ? scanner.candidates : [];
    const candidate = candidates.find((entry) => isRecord(entry) && entry.candidate_id === subjectRef.id);
    if (!isRecord(candidate) || typeof candidate.chain !== "string" || typeof candidate.contract_address !== "string") {
      return null;
    }
    const runId = scanner && isRecord(scanner.scan_run) && typeof scanner.scan_run.run_id === "string"
      ? scanner.scan_run.run_id
      : null;
    return {
      candidate_identity: {
        chain: candidate.chain,
        contract_address: candidate.contract_address,
      },
      ...(runId ? { scanner_run_id: runId } : {}),
    };
  }
  if (subjectRef.type === "follow_up") {
    const entry = await readFollowUpDetail(subjectRef.id, followUpOptions);
    if (!entry) return null;
    return {
      candidate_identity: { chain: entry.chain, contract_address: entry.contract_address },
      follow_up_entry_id: entry.entry_id,
    };
  }
  const report = await readReportDetail(subjectRef.id, reportsOptions);
  return report ? {
    report_id: report.report_id,
    ...(report.chain && report.contract_address ? {
      candidate_identity: {
        chain: report.chain,
        contract_address: report.contract_address,
      },
    } : {}),
  } : null;
}

function getRequestPath(url: string | undefined): string {
  return url?.split("?")[0] ?? "/";
}

function isPc1ReviewRequest(req: IncomingMessage): boolean {
  try {
    return new URL(req.url ?? "/", "http://localhost").searchParams.get("pc1_review") === "1";
  } catch {
    return false;
  }
}

function isReviewDiagnosticsRole(role: "TRUSTED_TESTER" | "CAMP_USER" | "OWNER" | "ADMIN"): boolean {
  return role === "OWNER" || role === "ADMIN";
}

function validateReviewCommitAcknowledgement(value: unknown): { scanner_run_id: string } {
  if (!isRecord(value) || Object.keys(value).length !== 1 || typeof value.scanner_run_id !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.scanner_run_id)) {
    throw new Error("REVIEW_COMMIT_ACK_INVALID");
  }
  return { scanner_run_id: value.scanner_run_id };
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
