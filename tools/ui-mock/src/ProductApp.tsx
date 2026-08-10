/* eslint-disable react-refresh/only-export-components -- Product contract helpers are intentionally exported for focused tests. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
import type { CandidateDetailTabId } from "./candidateDetailTabs";
import {
  resolveDetailTab,
  resolveRouteTokenIdentity,
  writeCandidateDetailRoute,
  writeVerificationListRoute,
  writeVerificationRoute,
  type RouteTokenIdentity,
} from "./candidateDetailRoute";
import { CandidateDetailView } from "./components/CandidateDetailView";
import { CandidateResultsView } from "./components/CandidateResultsView";
import { VerificationTokenBrowser } from "./components/VerificationTokenBrowser";
import { Feedback } from "./components/Feedback";
import { Methodology } from "./components/Methodology";
import { ProductControlCenter } from "./components/ProductControlCenter";
import { ReportsLibrary } from "./components/ReportsLibrary";
import { LoadingState } from "./components/ProductUi";
import {
  ProductWorkspaceSection,
  ProductWorkspaceShell,
  type ProductNavItem,
  type ProductSectionId,
} from "./components/ProductWorkspaceShell";
import { ProductLocaleProvider, useProductLocale } from "./productI18n";
import type { ControlCenterStatus } from "./controlCenterStatus";
import { resolveProductSourceHealth } from "./productSourceHealth";
import { createProductVersionPoller, type ProductVersionPoller } from "./productVersionPolling";
import { getProductRuntimeMode, isAIResearchRenderPreviewMode } from "./runtimeMode";
import {
  loadScannerApiDataSourceResult,
  loadScannerReadinessResult,
  type ResolvedScannerSource,
} from "./services/scannerDataSource";
import { loadProductVersion } from "./services/productVersionDataSource";
import { loadAutomationStatus, type AutomationStatus } from "./services/automationStatusDataSource";
import {
  loadEstablishedUniverseStatus,
  type EstablishedUniverseStatus,
} from "./services/establishedUniverseStatusDataSource";
import { loadControlCenterStatus } from "./services/controlCenterStatusDataSource";
import { loadFollowUpByIdentity, loadFollowUpList, loadFollowUpStatus } from "./services/followUpDataSource";
import { loadLifecycleRadar, setLifecycleReviewRole } from "./services/lifecycleDataSource";
import type { LifecycleRadarCard, LifecycleRadarView, LifecycleSummary, LifecycleTokenView } from "./types/lifecycleTypes";
import type { FollowUpPublicEntry, FollowUpPublicStatus } from "./types/followUpTypes";
import {
  findFollowUpByIdentity,
  isSameTokenIdentity,
  resolveTokenIdentity,
} from "./tokenLifecycle";
import type { ReportDetail } from "./types/reportTypes";
import type { FeedbackScreenContext, FeedbackSubjectRef } from "./services/feedbackDataSource";
import type {
  ProductReadinessOutput,
  ScannerDiscoveryMetadata,
  UiTokenCandidate,
} from "./types/scannerTypes";
import {
  createEmptyProductScannerViewState,
  resolveGlobalProductTimestamp,
  resolveProductScannerRefreshState,
} from "./productRefreshState";
import type { ManualVerificationRecord } from "./services/manualOwnerActionsDataSource";

export {
  getAcceptedProductRefreshTimestamps,
  resolveScannerSnapshotTimestamp,
  resolveGlobalProductTimestamp,
} from "./productRefreshState";

const HASH_TO_SECTION: Record<string, ProductSectionId> = {
  "#candidate-results": "candidate-results",
  "#candidate-detail": "candidate-detail",
  "#external-checks": "external-checks",
  "#feedback": "feedback",
  "#reports": "reports",
  "#methodology": "methodology",
  "#control-center": "control-center",
};
type RadarBasketId = "new_emerging" | "maturing" | "established";

const SECTION_TO_HASH: Record<ProductSectionId, string> = {
  "candidate-results": "#candidate-results",
  "candidate-detail": "#candidate-detail",
  "external-checks": "#external-checks",
  feedback: "#feedback",
  reports: "#reports",
  methodology: "#methodology",
  "control-center": "#control-center",
};

export default function ProductApp() {
  return (
    <ProductLocaleProvider>
      <ProductAppContent />
    </ProductLocaleProvider>
  );
}

export type ProductAppDataSources = {
  loadScanner: typeof loadScannerApiDataSourceResult;
  loadReadiness: typeof loadScannerReadinessResult;
  loadAutomation: typeof loadAutomationStatus;
  loadEstablishedUniverse: typeof loadEstablishedUniverseStatus;
  loadControlCenter: typeof loadControlCenterStatus;
  loadFollowUpStatus: typeof loadFollowUpStatus;
  loadFollowUpList: typeof loadFollowUpList;
  loadFollowUpByIdentity?: typeof loadFollowUpByIdentity;
  loadLifecycleRadar?: typeof loadLifecycleRadar;
  loadProductVersion?: typeof loadProductVersion;
  now: () => string;
};

const DEFAULT_PRODUCT_APP_DATA_SOURCES: ProductAppDataSources = {
  loadScanner: loadScannerApiDataSourceResult,
  loadReadiness: loadScannerReadinessResult,
  loadAutomation: loadAutomationStatus,
  loadEstablishedUniverse: loadEstablishedUniverseStatus,
  loadControlCenter: loadControlCenterStatus,
  loadFollowUpStatus,
  loadFollowUpList,
  loadFollowUpByIdentity,
  loadLifecycleRadar,
  loadProductVersion,
  now: () => new Date().toISOString(),
};

export function ProductAppContent({
  dataSources = DEFAULT_PRODUCT_APP_DATA_SOURCES,
  runtimeModeOverride,
}: {
  dataSources?: ProductAppDataSources;
  runtimeModeOverride?: ReturnType<typeof getProductRuntimeMode>;
} = {}) {
  const { t } = useProductLocale();
  const runtimeMode = runtimeModeOverride ?? getProductRuntimeMode();
  const loadVersionPointer = dataSources.loadProductVersion;
  const [activeSection, setActiveSection] = useState<ProductSectionId>(() => resolveSection());
  const [candidates, setCandidates] = useState<UiTokenCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedSource, setResolvedSource] = useState<ResolvedScannerSource>("unavailable");
  const [runId, setRunId] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [ageSeconds, setAgeSeconds] = useState<number | null>(null);
  const [freshnessStatus, setFreshnessStatus] = useState<"FRESH" | "STALE" | null>(null);
  const [viewRefreshedAt, setViewRefreshedAt] = useState<string | null>(null);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<ScannerDiscoveryMetadata | null>(null);
  const [readiness, setReadiness] = useState<ProductReadinessOutput | null>(null);
  const [readinessReasonCode, setReadinessReasonCode] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [routeTokenIdentity, setRouteTokenIdentity] = useState<RouteTokenIdentity | null>(() => resolveRouteTokenIdentity());
  const [activeDetailTab, setActiveDetailTab] = useState<CandidateDetailTabId>(() => resolveDetailTab());
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);
  const [establishedUniverseStatus, setEstablishedUniverseStatus] = useState<EstablishedUniverseStatus | null>(null);
  const [controlCenterStatus, setControlCenterStatus] = useState<ControlCenterStatus | null>(null);
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpPublicStatus | null>(null);
  const [lifecycleSummary, setLifecycleSummary] = useState<LifecycleSummary | null>(null);
  const [lifecycleRadar, setLifecycleRadar] = useState<LifecycleRadarView | null>(null);
  const [preferredLifecycleBasket, setPreferredLifecycleBasket] = useState<RadarBasketId | null>(null);
  const [reviewAutoUpdatePublished, setReviewAutoUpdatePublished] = useState(false);
  const [followUpEntries, setFollowUpEntries] = useState<FollowUpPublicEntry[]>([]);
  const [selectedFollowUpEntryId, setSelectedFollowUpEntryId] = useState<string | null>(null);
  const [manualVerificationRecord, setManualVerificationRecord] = useState<ManualVerificationRecord | null>(null);
  const [feedbackContext, setFeedbackContext] = useState<FeedbackScreenContext>(() => (
    resolveSection() === "feedback" ? "feedback" : resolveSection()
  ));
  const [feedbackSubject, setFeedbackSubject] = useState<FeedbackSubjectRef | undefined>();
  const [feedbackSubjectLabel, setFeedbackSubjectLabel] = useState<string | undefined>();
  const [feedbackRefreshRevision, setFeedbackRefreshRevision] = useState(0);
  const [selectedReportContext, setSelectedReportContext] = useState<ReportDetail | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const productVersionPollerRef = useRef<ProductVersionPoller | null>(null);
  const scannerViewStateRef = useRef(createEmptyProductScannerViewState());
  const routeTokenIdentityRef = useRef<RouteTokenIdentity | null>(routeTokenIdentity);
  const [lastKnownGoodRefreshError, setLastKnownGoodRefreshError] = useState(false);

  const navItems = useMemo<ProductNavItem[]>(() => [
    { id: "candidate-results", label: t("nav.radar"), icon: "R", description: t("nav.radarDescription"), groupLabel: t("nav.groupProductFlow"), groupDescription: t("nav.groupProductFlowDescription") },
    { id: "candidate-detail", label: t("nav.details"), icon: "D", description: t("nav.detailsDescription"), groupLabel: t("nav.groupProductFlow"), groupDescription: t("nav.groupProductFlowDescription") },
    { id: "external-checks", label: t("nav.verification"), icon: "V", description: t("nav.verificationDescription"), groupLabel: t("nav.groupReview"), groupDescription: t("nav.groupReviewDescription") },
    { id: "reports", label: t("nav.reports"), icon: "RP", description: t("nav.reportsDescription"), groupLabel: t("nav.groupReview"), groupDescription: t("nav.groupReviewDescription") },
    { id: "feedback", label: t("nav.feedback"), icon: "F", description: t("nav.feedbackDescription"), groupLabel: t("nav.groupReview"), groupDescription: t("nav.groupReviewDescription") },
    { id: "methodology", label: t("nav.methodology"), icon: "M", description: t("nav.methodologyDescription"), groupLabel: t("nav.groupStatus"), groupDescription: t("nav.groupStatusDescription") },
    { id: "control-center", label: t("nav.controlCenter"), icon: "C", description: t("nav.controlCenterDescription"), groupLabel: t("nav.groupStatus"), groupDescription: t("nav.groupStatusDescription") },
  ], [t]);

  const sectionCopy = useMemo<Record<ProductSectionId, { title: string; description: string }>>(() => ({
    "candidate-results": { title: t("nav.radar"), description: t("section.radarDescription") },
    "candidate-detail": { title: t("nav.details"), description: t("section.detailsDescription") },
    "external-checks": { title: t("nav.verification"), description: t("section.verificationDescription") },
    reports: { title: t("nav.reports"), description: t("section.reportsDescription") },
    feedback: { title: t("nav.feedback"), description: t("section.feedbackDescription") },
    methodology: { title: t("nav.methodology"), description: t("section.methodologyDescription") },
    "control-center": { title: t("nav.controlCenter"), description: t("section.controlCenterDescription") },
  }), [t]);

  const routedFollowUp = routeTokenIdentity
    ? followUpEntries.find((entry) => isSameTokenIdentity(entry, routeTokenIdentity)) ?? null
    : null;
  const explicitlySelectedFollowUp = followUpEntries.find((entry) => entry.entry_id === selectedFollowUpEntryId) ?? routedFollowUp;
  const reviewPreviewCandidate = selectAIResearchReviewCandidate(candidates);
  const routedCandidate = routeTokenIdentity
    ? candidates.find((candidate) => isSameTokenIdentity(
      { chain: candidate.chain, contract_address: candidate.contractAddress },
      routeTokenIdentity,
    )) ?? null
    : null;
  const routedLifecycleCard = findLifecycleRadarCard(lifecycleRadar, routeTokenIdentity);
  const routedLifecycleCandidate = routedLifecycleCard ? lifecycleCardToCandidate(routedLifecycleCard) : null;
  const selectedCandidate = explicitlySelectedFollowUp
    ? candidates.find((candidate) => isSameTokenIdentity(
      explicitlySelectedFollowUp,
      { chain: candidate.chain, contract_address: candidate.contractAddress },
    )) ?? null
    : routeTokenIdentity
      ? routedCandidate ?? routedLifecycleCandidate
      : reviewPreviewCandidate
        ?? candidates.find((candidate) => candidate.id === selectedCandidateId)
        ?? candidates.find((candidate) => candidate.discoveryBasket === "established" && candidate.finalLabel === "WATCHLIST")
        ?? candidates.find((candidate) => candidate.discoveryBasket === "established")
        ?? candidates[0]
        ?? null;
  const selectedFollowUp = explicitlySelectedFollowUp
    ?? (selectedCandidate ? findFollowUpByIdentity(followUpEntries, selectedCandidate) : null);
  const verificationCandidate = routeTokenIdentity
    ? candidates.find((candidate) => isSameTokenIdentity(
      { chain: candidate.chain, contract_address: candidate.contractAddress },
      routeTokenIdentity,
    )) ?? null
    : null;
  const verificationFollowUp = routeTokenIdentity
    ? findFollowUpByIdentity(followUpEntries, {
      chain: routeTokenIdentity.chain,
      contractAddress: routeTokenIdentity.contract_address,
    })
    : null;
  const sourceHealth = useMemo(
    () => resolveProductSourceHealth({ metadata, readiness, sourceIds }),
    [metadata, readiness, sourceIds],
  );
  const workspaceGeneratedAt = resolveGlobalProductTimestamp(
    generatedAt,
    readiness?.context.generated_at,
    selectedFollowUp?.last_seen_at,
  );

  const loadData = useCallback((): Promise<void> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const refresh = (async () => {
      setLoading(true);

      const [scannerResult, readinessResult, automationResult, universeStatusResult, controlCenterResult, lifecycleRadarResult] = await Promise.all([
        dataSources.loadScanner({ runtimeMode }),
        dataSources.loadReadiness({ runtimeMode }),
        dataSources.loadAutomation(),
        dataSources.loadEstablishedUniverse(),
        dataSources.loadControlCenter(),
        dataSources.loadLifecycleRadar?.() ?? Promise.resolve(null),
      ]);
      setAutomationStatus(automationResult);
      setEstablishedUniverseStatus(universeStatusResult);
      setControlCenterStatus(controlCenterResult);
      setFeedbackRefreshRevision((value) => value + 1);
      setLifecycleRadar(lifecycleRadarResult);
      setLifecycleSummary(lifecycleRadarResult?.summary ?? null);

      const hadAcceptedSnapshot = scannerViewStateRef.current.hasAcceptedSnapshot;
      if (scannerResult.status === "ready" || !hadAcceptedSnapshot) {
        if (readinessResult.status === "ready") {
          setReadiness(readinessResult.output);
          setReadinessReasonCode(null);
        } else {
          setReadiness(null);
          setReadinessReasonCode(readinessResult.reasonCode);
        }
      }

      const nextScannerView = resolveProductScannerRefreshState(
        scannerViewStateRef.current,
        scannerResult,
        dataSources.now(),
      );
      scannerViewStateRef.current = nextScannerView;
      setCandidates(nextScannerView.candidates);
      setResolvedSource(nextScannerView.resolvedSource);
      setRunId(nextScannerView.runId);
      setGeneratedAt(nextScannerView.generatedAt);
      setViewRefreshedAt(nextScannerView.viewRefreshedAt);
      setAgeSeconds(nextScannerView.ageSeconds);
      setFreshnessStatus(nextScannerView.freshnessStatus);
      setSourceIds(nextScannerView.sourceIds);
      setMetadata(nextScannerView.metadata);
      setReasonCode(nextScannerView.reasonCode);
      setUnavailableMessage(nextScannerView.unavailableMessage);
      setLastKnownGoodRefreshError(nextScannerView.lastKnownGoodRefreshError);
    })().finally(() => {
      setLoading(false);
      refreshPromiseRef.current = null;
    });

    refreshPromiseRef.current = refresh;
    return refresh;
  }, [dataSources, runtimeMode]);

  const loadFollowUpDetails = useCallback((): void => {
    const routedIdentity = routeTokenIdentityRef.current;
    void Promise.all([dataSources.loadFollowUpStatus(), dataSources.loadFollowUpList()]).then(async ([status, list]) => {
      setFollowUpStatus(status);
      let entries = list?.entries ?? [];
      if (routedIdentity && dataSources.loadFollowUpByIdentity && !findFollowUpByIdentity(entries, {
        chain: routedIdentity.chain,
        contractAddress: routedIdentity.contract_address,
      })) {
        const entry = await dataSources.loadFollowUpByIdentity(routedIdentity.chain, routedIdentity.contract_address);
        if (entry) entries = [entry, ...entries];
      }
      setFollowUpEntries(entries);
    });
  }, [dataSources]);

  const loadMoreLifecycleRadar = useCallback((cursor: string): void => {
    if (!dataSources.loadLifecycleRadar) return;
    void dataSources.loadLifecycleRadar(cursor).then((next) => {
      if (!next) return;
      setLifecycleRadar((current) => mergeLifecycleRadar(current, next));
    });
  }, [dataSources]);

  const refreshLifecycleRadar = useCallback(async (view?: LifecycleTokenView): Promise<void> => {
    if (view) setPreferredLifecycleBasket(lifecycleStatusToBasket(view.user_status));
    if (!dataSources.loadLifecycleRadar) return;
    const next = await dataSources.loadLifecycleRadar();
    if (!next) return;
    setLifecycleRadar(next);
    setLifecycleSummary(next.summary);
  }, [dataSources]);

  const refreshControlCenterAfterFeedback = useCallback(() => {
    void loadControlCenterStatus().then((value) => {
      if (value) setControlCenterStatus(value);
    });
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!loadVersionPointer) return undefined;
    const poller = createProductVersionPoller({
      loadVersion: loadVersionPointer,
      onVersionChanged: async () => {
        await loadData();
        if (isReviewMode()) setReviewAutoUpdatePublished(true);
      },
      document: typeof document === "undefined" ? undefined : document,
      window: typeof window === "undefined" ? undefined : window,
    });
    productVersionPollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      if (productVersionPollerRef.current === poller) productVersionPollerRef.current = null;
    };
  }, [loadData, loadVersionPointer]);

  const refreshView = useCallback((): Promise<void> => {
    if (loadVersionPointer) {
      void loadVersionPointer().then((version) => productVersionPollerRef.current?.markKnown(version));
    }
    return loadData();
  }, [loadData, loadVersionPointer]);

  useEffect(() => {
    if (activeSection !== "candidate-detail" && activeSection !== "external-checks" && routeTokenIdentity === null) return;
    loadFollowUpDetails();
  }, [activeSection, loadFollowUpDetails, routeTokenIdentity]);

  useEffect(() => {
    const handleRouteChange = () => {
      setActiveSection(resolveSection());
      const identity = resolveRouteTokenIdentity();
      routeTokenIdentityRef.current = identity;
      setRouteTokenIdentity(identity);
      setActiveDetailTab(resolveDetailTab());
    };
    const handleHashChange = () => handleRouteChange();
    const handlePopState = () => handleRouteChange();
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const navigate = useCallback((section: ProductSectionId) => {
    setActiveSection(section);
    if (window.location.hash !== SECTION_TO_HASH[section]) {
      window.location.hash = SECTION_TO_HASH[section];
    }
  }, []);

  const openFeedback = useCallback(() => {
    const context = activeSection === "feedback" ? feedbackContext : activeSection;
    setFeedbackContext(context);
    if ((activeSection === "candidate-detail" || activeSection === "external-checks") && selectedCandidate) {
      setFeedbackSubject({ type: "candidate", id: selectedCandidate.id });
      setFeedbackSubjectLabel(`${selectedCandidate.symbol} · ${selectedCandidate.chain} · ${selectedCandidate.contractAddress}`);
    } else if (activeSection === "reports" && selectedReportContext) {
      setFeedbackSubject({ type: "report", id: selectedReportContext.report_id });
      setFeedbackSubjectLabel(`${selectedReportContext.title} · ${selectedReportContext.report_id}`);
    } else {
      setFeedbackSubject(undefined);
      setFeedbackSubjectLabel(undefined);
    }
    navigate("feedback");
  }, [activeSection, feedbackContext, navigate, selectedCandidate, selectedReportContext]);

  const openCandidate = useCallback((candidateId: string) => {
    const candidate = candidates.find((entry) => entry.id === candidateId);
    setSelectedFollowUpEntryId(null);
    setSelectedCandidateId(candidateId);
    setManualVerificationRecord(null);
    setActiveDetailTab("summary");
    if (candidate) {
      const identity = { chain: candidate.chain, contract_address: candidate.contractAddress };
      routeTokenIdentityRef.current = identity;
      setRouteTokenIdentity(identity);
      writeCandidateDetailRoute(identity, "summary");
      setActiveSection("candidate-detail");
      return;
    }
    navigate("candidate-detail");
  }, [candidates, navigate]);

  const openLifecycleCard = useCallback((identity: RouteTokenIdentity) => {
    const card = findLifecycleRadarCard(lifecycleRadar, identity);
    if (card) setPreferredLifecycleBasket(lifecycleStatusToBasket(card.user_status));
    setSelectedFollowUpEntryId(null);
    setSelectedCandidateId(null);
    setManualVerificationRecord(null);
    setActiveDetailTab("summary");
    routeTokenIdentityRef.current = identity;
    setRouteTokenIdentity(identity);
    writeCandidateDetailRoute(identity, "summary");
    setActiveSection("candidate-detail");
  }, [lifecycleRadar]);

  const openFollowUp = useCallback((entryId: string) => {
    const entry = followUpEntries.find((candidate) => candidate.entry_id === entryId);
    const matchingCandidate = entry
      ? candidates.find((candidate) => isSameTokenIdentity(
        entry,
        { chain: candidate.chain, contract_address: candidate.contractAddress },
      ))
      : null;
    setSelectedFollowUpEntryId(entryId);
    setManualVerificationRecord(null);
    setSelectedCandidateId(matchingCandidate?.id ?? null);
    setActiveDetailTab("summary");
    if (entry) {
      const identity = { chain: entry.chain, contract_address: entry.contract_address };
      routeTokenIdentityRef.current = identity;
      setRouteTokenIdentity(identity);
      writeCandidateDetailRoute(identity, "summary");
      setActiveSection("candidate-detail");
      return;
    }
    navigate("candidate-detail");
  }, [candidates, followUpEntries, navigate]);

  const changeDetailTab = useCallback((tab: CandidateDetailTabId) => {
    setActiveDetailTab(tab);
    const identity = selectedCandidate
      ? { chain: selectedCandidate.chain, contract_address: selectedCandidate.contractAddress }
      : selectedFollowUp
        ? { chain: selectedFollowUp.chain, contract_address: selectedFollowUp.contract_address }
        : routeTokenIdentity;
    if (identity) {
      routeTokenIdentityRef.current = identity;
      setRouteTokenIdentity(identity);
      writeCandidateDetailRoute(identity, tab);
      setActiveSection("candidate-detail");
    }
  }, [routeTokenIdentity, selectedCandidate, selectedFollowUp]);

  const openVerification = useCallback((token: UiTokenCandidate | FollowUpPublicEntry) => {
    const isFollowUp = "entry_id" in token;
    const identity = isFollowUp
      ? { chain: token.chain, contract_address: token.contract_address }
      : { chain: token.chain, contract_address: token.contractAddress };
    if (isFollowUp) {
      setSelectedFollowUpEntryId(token.entry_id);
    } else {
      setSelectedFollowUpEntryId(null);
      setSelectedCandidateId(token.id);
    }
    setManualVerificationRecord(null);
    routeTokenIdentityRef.current = identity;
    setRouteTokenIdentity(identity);
    writeVerificationRoute(identity);
    setActiveSection("external-checks");
  }, []);

  const saveVerificationInPlace = useCallback((record: ManualVerificationRecord) => {
    setManualVerificationRecord(record);
  }, []);

  const closeVerification = useCallback(() => {
    routeTokenIdentityRef.current = null;
    setRouteTokenIdentity(null);
    writeVerificationListRoute();
    setActiveSection("external-checks");
  }, []);

  const openDetailFromVerification = useCallback(() => {
    const identity = routeTokenIdentity
      ?? (verificationCandidate
        ? { chain: verificationCandidate.chain, contract_address: verificationCandidate.contractAddress }
        : verificationFollowUp
          ? { chain: verificationFollowUp.chain, contract_address: verificationFollowUp.contract_address }
          : null);
    if (!identity) return;
    routeTokenIdentityRef.current = identity;
    setRouteTokenIdentity(identity);
    setActiveDetailTab("security");
    writeCandidateDetailRoute(identity, "security");
    setActiveSection("candidate-detail");
  }, [routeTokenIdentity, verificationCandidate, verificationFollowUp]);

  const renderSection = () => {
    const copy = sectionCopy[activeSection];
    if (activeSection === "feedback") {
      return (
        <ProductWorkspaceSection {...copy}>
          <Feedback
            screenContext={feedbackContext}
            subjectRef={feedbackSubject}
            subjectLabel={feedbackSubjectLabel}
            refreshRevision={feedbackRefreshRevision}
            onFeedbackRecorded={refreshControlCenterAfterFeedback}
          />
        </ProductWorkspaceSection>
      );
    }
    if (activeSection === "reports") {
      return (
        <ProductWorkspaceSection {...copy}>
          <ReportsLibrary
            candidates={candidates}
            onSelectedReportChange={setSelectedReportContext}
            onOpenCandidate={openCandidate}
            onOpenManualVerification={(candidateId) => {
              const candidate = candidates.find((entry) => entry.id === candidateId);
              if (candidate) openVerification(candidate);
            }}
          />
        </ProductWorkspaceSection>
      );
    }

    if (loading && candidates.length === 0) {
      return (
        <ProductWorkspaceSection {...copy}>
          <LoadingState label={t("app.loading")} />
        </ProductWorkspaceSection>
      );
    }

    if (activeSection === "candidate-results") {
      return (
        <ProductWorkspaceSection {...copy}>
          <CandidateResultsView
            key={preferredLifecycleBasket ?? "system"}
            candidates={candidates}
            metadata={metadata}
            readiness={readiness}
            generatedAt={generatedAt}
            ageSeconds={ageSeconds}
            freshnessStatus={freshnessStatus}
            sourceIds={sourceIds}
            sourceHealth={sourceHealth}
            scannerUnavailableReasonCode={reasonCode}
            followUpStatus={followUpStatus}
            lifecycleSummary={lifecycleSummary}
            lifecycleRadar={lifecycleRadar}
            preferredLifecycleBasket={preferredLifecycleBasket}
            onLifecycleBasketChange={setPreferredLifecycleBasket}
            onLifecycleChanged={refreshLifecycleRadar}
            onLoadMoreLifecycle={loadMoreLifecycleRadar}
            followUpEntries={followUpEntries}
            establishedUniverseStatus={establishedUniverseStatus}
            onOpenCandidate={openCandidate}
            onOpenFollowUp={openFollowUp}
            onOpenLifecycleCard={openLifecycleCard}
            onOpenExternalChecks={openVerification}
          />
        </ProductWorkspaceSection>
      );
    }

    if (activeSection === "candidate-detail") {
      return (
        <ProductWorkspaceSection {...copy} workspaceMode="tabbed">
          <CandidateDetailView
            candidate={selectedCandidate}
            followUp={selectedFollowUp}
            followUpStatus={followUpStatus}
            onBackToResults={() => navigate("candidate-results")}
            onOpenExternalChecks={openVerification}
            onOpenFollowUpExternalChecks={openVerification}
            onOpenControlCenter={() => navigate("control-center")}
            initialManualVerification={manualVerificationRecord}
            onLifecycleChanged={refreshLifecycleRadar}
            activeTab={activeDetailTab}
            onActiveTabChange={changeDetailTab}
          />
        </ProductWorkspaceSection>
      );
    }

    if (activeSection === "external-checks") {
      return (
        <ProductWorkspaceSection {...copy}>
          <VerificationTokenBrowser
            candidates={candidates}
            followUpEntries={followUpEntries}
            selectedCandidate={verificationCandidate}
            selectedFollowUp={verificationFollowUp}
            onSelectToken={openVerification}
            onCloseToken={closeVerification}
            onOpenResearchBrief={() => changeDetailTab("ai")}
            onVerificationSaved={saveVerificationInPlace}
            onReturnToDetail={openDetailFromVerification}
          />
        </ProductWorkspaceSection>
      );
    }

    if (activeSection === "control-center") {
      return (
        <ProductWorkspaceSection {...copy}>
          <ProductControlCenter status={controlCenterStatus} automationStatus={automationStatus} />
        </ProductWorkspaceSection>
      );
    }

    return (
      <ProductWorkspaceSection {...copy}>
        <Methodology />
      </ProductWorkspaceSection>
    );
  };

  return (
    <>
      {lifecycleRadar && isReviewMode() && <LifecycleReviewSwitch role={lifecycleRadar.actor.role} autoUpdatePublished={reviewAutoUpdatePublished} />}
      <ProductWorkspaceShell
        navItems={navItems}
        activeSection={activeSection}
        onSectionChange={(section) => section === "feedback" ? openFeedback() : navigate(section)}
        onSendFeedback={openFeedback}
        loading={loading}
        runtimeMode={runtimeMode}
        resolvedSource={resolvedSource}
        runId={runId}
        generatedAt={workspaceGeneratedAt}
        ageSeconds={ageSeconds}
        freshnessStatus={freshnessStatus}
        viewRefreshedAt={viewRefreshedAt}
        sourceIds={sourceIds}
        sourceHealth={sourceHealth}
        readiness={readiness}
        readinessReasonCode={readinessReasonCode}
        dataUnavailableMessage={unavailableMessage}
        dataUnavailableReasonCode={reasonCode}
        lastKnownGoodRefreshError={lastKnownGoodRefreshError}
        onRefresh={() => void refreshView()}
        automationStatus={automationStatus}
        establishedUniverseStatus={establishedUniverseStatus}
      >
        {renderSection()}
      </ProductWorkspaceShell>
    </>
  );
}

function LifecycleReviewSwitch({
  role,
  autoUpdatePublished,
}: {
  role: LifecycleRadarView["actor"]["role"];
  autoUpdatePublished: boolean;
}) {
  const copy = { label: "Visual review", camp: "CAMP_USER", owner: "OWNER" };
  const switchTo = (next: "CAMP_USER" | "OWNER") => {
    void setLifecycleReviewRole(next).then((changed) => { if (changed) window.location.reload(); });
  };
  return (
    <aside className="personal-radar-review-switch" data-pc1-review-switch="global" aria-label={copy.label}>
      <span>{copy.label}: {role}</span>
      <span className="personal-radar-review-auto-update" role="status">
        {autoUpdatePublished ? "New review version published" : "Auto-update test active"}
      </span>
      {role !== "CAMP_USER" && <button type="button" onClick={() => switchTo("CAMP_USER")}>{copy.camp}</button>}
      {role !== "OWNER" && <button type="button" onClick={() => switchTo("OWNER")}>{copy.owner}</button>}
    </aside>
  );
}

function mergeLifecycleRadar(current: LifecycleRadarView | null, next: LifecycleRadarView): LifecycleRadarView {
  if (!current) return next;
  const mergeGroup = <T extends { identity: string }>(left: { cards: T[]; total: number; displayed: number; limit: number; next_cursor: string | null }, right: typeof left) => {
    const cards = [...left.cards, ...right.cards].filter((card, index, values) => values.findIndex((value) => value.identity === card.identity) === index);
    return { ...right, cards, displayed: cards.length, total: Math.max(left.total, right.total), next_cursor: right.next_cursor };
  };
  const newInbox = mergeGroup(current.new_inbox, next.new_inbox);
  const actionDue = mergeGroup(current.follow_up.action_due, next.follow_up.action_due);
  const candidatesReady = mergeGroup(current.follow_up.candidates_ready, next.follow_up.candidates_ready);
  const observed = mergeGroup(current.follow_up.observed, next.follow_up.observed);
  const privateNew = mergeGroup(current.private_baskets.new, next.private_baskets.new);
  const privateFollowUp = mergeGroup(current.private_baskets.follow_up, next.private_baskets.follow_up);
  const privateMainRadar = mergeGroup(current.private_baskets.main_radar, next.private_baskets.main_radar);
  const summary = { ...next.summary, follow_up_displayed: actionDue.displayed + candidatesReady.displayed + observed.displayed };
  return {
    ...next,
    summary,
    new_inbox: newInbox,
    follow_up: { action_due: actionDue, candidates_ready: candidatesReady, observed },
    private_new_total: privateNew.total,
    private_follow_up_total: privateFollowUp.total,
    private_main_radar_total: privateMainRadar.total,
    private_baskets: { new: privateNew, follow_up: privateFollowUp, main_radar: privateMainRadar },
  };
}

export function findLifecycleRadarCard(
  radar: LifecycleRadarView | null,
  identity: RouteTokenIdentity | null,
): LifecycleRadarCard | null {
  if (!radar || !identity) return null;
  return [
    ...radar.new_inbox.cards,
    ...radar.follow_up.action_due.cards,
    ...radar.follow_up.candidates_ready.cards,
    ...radar.follow_up.observed.cards,
    ...radar.private_baskets.new.cards,
    ...radar.private_baskets.follow_up.cards,
    ...radar.private_baskets.main_radar.cards,
  ].find((card) => isSameTokenIdentity(card, identity)) ?? null;
}

export function lifecycleStatusToBasket(status: LifecycleTokenView["user_status"]): RadarBasketId {
  return status === "NEW" ? "new_emerging" : status === "FOLLOW_UP" ? "maturing" : "established";
}

export function lifecycleCardToCandidate(card: LifecycleRadarCard): UiTokenCandidate {
  const conditionsMet = card.conditions.readiness === "CONDITIONS_MET";
  const missingData = [...new Set([
    ...card.conditions.missing_data,
    ...(card.follow_up?.missing_data ?? []),
  ])];
  const riskFlags = [...new Set([
    ...card.conditions.risks,
    ...(card.follow_up?.risk_flags ?? []),
  ])];
  const unresolved = [...card.conditions.conditions_unmet, ...missingData];
  return {
    id: `lifecycle:${card.identity}`,
    runId: "lifecycle-radar",
    symbol: card.symbol ?? card.display_name ?? card.contract_address,
    name: card.display_name ?? card.symbol ?? card.contract_address,
    chain: card.chain,
    dex: "",
    source: "lifecycle_radar",
    contractAddress: card.contract_address,
    pairAddress: "",
    sourceUrl: "",
    discoveryBasket: "new_emerging",
    discoveryMethod: "dexscreener_latest_token_profiles",
    observationOnly: true,
    establishedEligible: false,
    universeVersion: null,
    universeEntryIndex: null,
    addressIdentityVerified: card.conditions.conditions_met.includes("IDENTITY_VALID"),
    priceUsd: card.market?.price_usd ?? null,
    marketCap: card.market?.market_cap_usd ?? null,
    fdvUsd: card.market?.market_cap_usd ?? null,
    liquidity: card.market?.liquidity_usd ?? null,
    volume24h: card.market?.volume_24h_usd ?? null,
    volumeMarketCapRatio: card.market?.market_cap_usd && card.market.market_cap_usd > 0 && card.market.volume_24h_usd != null
      ? card.market.volume_24h_usd / card.market.market_cap_usd
      : null,
    pairCreatedAt: card.first_seen_at,
    pairAgeDays: null,
    basicFilterStatus: conditionsMet ? "passed_basic_filter" : "not_evaluated",
    securityLabel: card.conditions.security_state,
    finalLabel: conditionsMet ? "WATCHLIST" : "NEEDS_MANUAL_VERIFICATION",
    mainReason: unresolved[0] ?? "LIFECYCLE_RADAR_RECORD",
    filterReasons: card.conditions.conditions_unmet,
    criticalReasons: riskFlags,
    warningReasons: missingData,
    finalReasons: unresolved,
    missingData,
    riskFlags,
    security: null,
    scorecard: null,
    lastCheckedAt: card.follow_up?.last_checked_at ?? card.last_seen_at,
  };
}

export function selectAIResearchReviewCandidate(candidates: UiTokenCandidate[]): UiTokenCandidate | null {
  if (!isAIResearchRenderPreviewMode()) return null;
  return candidates.find((candidate) => (
    resolveTokenIdentity(candidate.chain, candidate.contractAddress).status === "valid"
  )) ?? null;
}

function resolveSection(): ProductSectionId {
  if (typeof window === "undefined") return "candidate-results";
  return HASH_TO_SECTION[window.location.hash.trim().toLowerCase()] ?? "candidate-results";
}

function isReviewMode(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pc1_review") === "1";
}
