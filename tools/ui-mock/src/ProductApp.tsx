import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
import { mapPersistableScannerOutputToUiCandidates } from "./adapters/scannerOutputAdapter";
import type { CandidateDetailLayerId } from "./candidateDetailLayers";
import {
  resolveDetailLayer,
  resolveRouteTokenIdentity,
  type RouteTokenIdentity,
} from "./candidateDetailRoute";
import { CandidateDetailView } from "./components/CandidateDetailView";
import { CandidateResultsView } from "./components/CandidateResultsView";
import { ExternalVerificationLinksView } from "./components/ExternalVerificationLinksView";
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
import { getProductRuntimeMode, isAIResearchRenderPreviewMode } from "./runtimeMode";
import {
  loadScannerApiDataSourceResult,
  loadScannerReadinessResult,
  type ResolvedScannerSource,
} from "./services/scannerDataSource";
import { loadAutomationStatus, type AutomationStatus } from "./services/automationStatusDataSource";
import {
  loadEstablishedUniverseStatus,
  type EstablishedUniverseStatus,
} from "./services/establishedUniverseStatusDataSource";
import { loadControlCenterStatus } from "./services/controlCenterStatusDataSource";
import { loadFollowUpList, loadFollowUpStatus } from "./services/followUpDataSource";
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
  ScannerApiOutput,
  ScannerDiscoveryMetadata,
  UiTokenCandidate,
} from "./types/scannerTypes";

const HASH_TO_SECTION: Record<string, ProductSectionId> = {
  "#candidate-results": "candidate-results",
  "#candidate-detail": "candidate-detail",
  "#external-checks": "external-checks",
  "#feedback": "feedback",
  "#reports": "reports",
  "#methodology": "methodology",
  "#control-center": "control-center",
};

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

export function ProductAppContent() {
  const { t } = useProductLocale();
  const runtimeMode = getProductRuntimeMode();
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
  const [activeDetailLayer, setActiveDetailLayer] = useState<CandidateDetailLayerId | null>(() => resolveDetailLayer());
  const [verificationCandidateId, setVerificationCandidateId] = useState<string | null>(null);
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);
  const [establishedUniverseStatus, setEstablishedUniverseStatus] = useState<EstablishedUniverseStatus | null>(null);
  const [controlCenterStatus, setControlCenterStatus] = useState<ControlCenterStatus | null>(null);
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpPublicStatus | null>(null);
  const [followUpEntries, setFollowUpEntries] = useState<FollowUpPublicEntry[]>([]);
  const [selectedFollowUpEntryId, setSelectedFollowUpEntryId] = useState<string | null>(null);
  const [feedbackContext, setFeedbackContext] = useState<FeedbackScreenContext>(() => (
    resolveSection() === "feedback" ? "feedback" : resolveSection()
  ));
  const [feedbackSubject, setFeedbackSubject] = useState<FeedbackSubjectRef | undefined>();
  const [feedbackSubjectLabel, setFeedbackSubjectLabel] = useState<string | undefined>();
  const [feedbackRefreshRevision, setFeedbackRefreshRevision] = useState(0);
  const [selectedReportContext, setSelectedReportContext] = useState<ReportDetail | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

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
  const selectedCandidate = explicitlySelectedFollowUp
    ? candidates.find((candidate) => isSameTokenIdentity(
      explicitlySelectedFollowUp,
      { chain: candidate.chain, contract_address: candidate.contractAddress },
    )) ?? null
    : routedCandidate
      ?? reviewPreviewCandidate
      ?? candidates.find((candidate) => candidate.id === selectedCandidateId)
      ?? candidates.find((candidate) => candidate.discoveryBasket === "established" && candidate.finalLabel === "WATCHLIST")
      ?? candidates.find((candidate) => candidate.discoveryBasket === "established")
      ?? candidates[0]
      ?? null;
  const verificationCandidate =
    candidates.find((candidate) => candidate.id === verificationCandidateId)
    ?? selectedCandidate;
  const selectedFollowUp = explicitlySelectedFollowUp
    ?? (selectedCandidate ? findFollowUpByIdentity(followUpEntries, selectedCandidate) : null);
  const sourceHealth = useMemo(
    () => resolveProductSourceHealth({ metadata, readiness, sourceIds }),
    [metadata, readiness, sourceIds],
  );

  const loadData = useCallback((): Promise<void> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const refresh = (async () => {
      setLoading(true);
      setReasonCode(null);
      setReadinessReasonCode(null);
      setUnavailableMessage(null);

      const [scannerResult, readinessResult, automationResult, universeStatusResult, controlCenterResult, followUpStatusResult, followUpListResult] = await Promise.all([
        loadScannerApiDataSourceResult({ runtimeMode }),
        loadScannerReadinessResult({ runtimeMode }),
        loadAutomationStatus(),
        loadEstablishedUniverseStatus(),
        loadControlCenterStatus(),
        loadFollowUpStatus(),
        loadFollowUpList(),
      ]);
      setAutomationStatus(automationResult);
      setEstablishedUniverseStatus(universeStatusResult);
      setControlCenterStatus(controlCenterResult);
      setFeedbackRefreshRevision((value) => value + 1);
      setFollowUpStatus(followUpStatusResult);
      setFollowUpEntries(followUpListResult?.entries ?? []);

      if (readinessResult.status === "ready") {
        setReadiness(readinessResult.output);
      } else {
        setReadiness(null);
        setReadinessReasonCode(readinessResult.reasonCode);
      }

      if (scannerResult.status === "error") {
        setCandidates([]);
        setResolvedSource("unavailable");
        setRunId(null);
        setGeneratedAt(null);
        setAgeSeconds(null);
        setFreshnessStatus(null);
        setSourceIds([]);
        setMetadata(null);
        setReasonCode(scannerResult.reasonCode);
        setUnavailableMessage(scannerResult.error);
        return;
      }

      const output = scannerResult.output;
      const acceptedTimestamps = getAcceptedProductRefreshTimestamps(output, new Date().toISOString());
      setCandidates(mapPersistableScannerOutputToUiCandidates(output));
      setResolvedSource(scannerResult.resolvedSource);
      setRunId(output.scan_run.run_id ?? null);
      setGeneratedAt(acceptedTimestamps.generatedAt);
      setViewRefreshedAt(acceptedTimestamps.viewRefreshedAt);
      setAgeSeconds(output._source_meta?.age_seconds ?? null);
      setFreshnessStatus(output._source_meta?.freshness_status ?? null);
      setSourceIds(output._source_meta?.source_ids ?? output.provenance?.source_ids ?? []);
      setMetadata(output.provenance?.metadata ?? null);
    })().finally(() => {
      setLoading(false);
      refreshPromiseRef.current = null;
    });

    refreshPromiseRef.current = refresh;
    return refresh;
  }, [runtimeMode]);

  const refreshControlCenterAfterFeedback = useCallback(() => {
    void loadControlCenterStatus().then((value) => {
      if (value) setControlCenterStatus(value);
    });
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const handleRouteChange = () => {
      setActiveSection(resolveSection());
      setRouteTokenIdentity(resolveRouteTokenIdentity());
      setActiveDetailLayer(resolveDetailLayer());
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
    setActiveDetailLayer(null);
    if (candidate) {
      const identity = { chain: candidate.chain, contract_address: candidate.contractAddress };
      setRouteTokenIdentity(identity);
      writeCandidateDetailRoute(identity, null);
      setActiveSection("candidate-detail");
      return;
    }
    navigate("candidate-detail");
  }, [candidates, navigate]);

  const openFollowUp = useCallback((entryId: string) => {
    const entry = followUpEntries.find((candidate) => candidate.entry_id === entryId);
    const matchingCandidate = entry
      ? candidates.find((candidate) => isSameTokenIdentity(
        entry,
        { chain: candidate.chain, contract_address: candidate.contractAddress },
      ))
      : null;
    setSelectedFollowUpEntryId(entryId);
    setSelectedCandidateId(matchingCandidate?.id ?? null);
    setActiveDetailLayer(null);
    if (entry) {
      const identity = { chain: entry.chain, contract_address: entry.contract_address };
      setRouteTokenIdentity(identity);
      writeCandidateDetailRoute(identity, null);
      setActiveSection("candidate-detail");
      return;
    }
    navigate("candidate-detail");
  }, [candidates, followUpEntries, navigate]);

  const changeDetailLayer = useCallback((layer: CandidateDetailLayerId | null) => {
    setActiveDetailLayer(layer);
    const identity = selectedCandidate
      ? { chain: selectedCandidate.chain, contract_address: selectedCandidate.contractAddress }
      : selectedFollowUp
        ? { chain: selectedFollowUp.chain, contract_address: selectedFollowUp.contract_address }
        : routeTokenIdentity;
    if (identity) {
      setRouteTokenIdentity(identity);
      writeCandidateDetailRoute(identity, layer);
      setActiveSection("candidate-detail");
    }
  }, [routeTokenIdentity, selectedCandidate, selectedFollowUp]);

  const openVerification = useCallback((candidate: UiTokenCandidate) => {
    setSelectedCandidateId(candidate.id);
    setVerificationCandidateId(candidate.id);
    navigate("external-checks");
  }, [navigate]);

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
            followUpEntries={followUpEntries}
            onOpenCandidate={openCandidate}
            onOpenFollowUp={openFollowUp}
            onOpenExternalChecks={openVerification}
          />
        </ProductWorkspaceSection>
      );
    }

    if (activeSection === "candidate-detail") {
      return (
        <ProductWorkspaceSection {...copy} workspaceMode="columns">
          <CandidateDetailView
            candidate={selectedCandidate}
            followUp={selectedFollowUp}
            followUpStatus={followUpStatus}
            onBackToResults={() => navigate("candidate-results")}
            onOpenExternalChecks={openVerification}
            activeLayer={activeDetailLayer}
            onActiveLayerChange={changeDetailLayer}
          />
        </ProductWorkspaceSection>
      );
    }

    if (activeSection === "external-checks") {
      return (
        <ProductWorkspaceSection {...copy}>
          <ExternalVerificationLinksView
            candidate={verificationCandidate}
            onOpenResearchBrief={(candidate) => openCandidate(candidate.id)}
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
    <ProductWorkspaceShell
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={(section) => section === "feedback" ? openFeedback() : navigate(section)}
      onSendFeedback={openFeedback}
      loading={loading}
      runtimeMode={runtimeMode}
      resolvedSource={resolvedSource}
      runId={runId}
      generatedAt={generatedAt}
      ageSeconds={ageSeconds}
      freshnessStatus={freshnessStatus}
      viewRefreshedAt={viewRefreshedAt}
      sourceIds={sourceIds}
      sourceHealth={sourceHealth}
      readiness={readiness}
      readinessReasonCode={readinessReasonCode}
      dataUnavailableMessage={unavailableMessage}
      dataUnavailableReasonCode={reasonCode}
      onRefresh={() => void loadData()}
      automationStatus={automationStatus}
      establishedUniverseStatus={establishedUniverseStatus}
    >
      {renderSection()}
    </ProductWorkspaceShell>
  );
}

export function selectAIResearchReviewCandidate(candidates: UiTokenCandidate[]): UiTokenCandidate | null {
  if (!isAIResearchRenderPreviewMode()) return null;
  return candidates.find((candidate) => (
    resolveTokenIdentity(candidate.chain, candidate.contractAddress).status === "valid"
  )) ?? null;
}

function writeCandidateDetailRoute(identity: RouteTokenIdentity, layer: CandidateDetailLayerId | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("chain", identity.chain);
  url.searchParams.set("contract", identity.contract_address);
  if (layer) url.searchParams.set("detail", layer);
  else url.searchParams.delete("detail");
  url.hash = SECTION_TO_HASH["candidate-detail"];
  window.history.pushState(null, "", url);
}

function resolveSection(): ProductSectionId {
  if (typeof window === "undefined") return "candidate-results";
  return HASH_TO_SECTION[window.location.hash.trim().toLowerCase()] ?? "candidate-results";
}

export function resolveScannerSnapshotTimestamp(output: ScannerApiOutput): string | null {
  return output.provenance?.generated_at ?? output.scan_run.finished_at ?? null;
}

export function getAcceptedProductRefreshTimestamps(
  output: ScannerApiOutput,
  viewRefreshedAt: string,
): { generatedAt: string | null; viewRefreshedAt: string } {
  return {
    generatedAt: resolveScannerSnapshotTimestamp(output),
    viewRefreshedAt,
  };
}
