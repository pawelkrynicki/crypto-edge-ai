import { useState, useEffect, useCallback } from "react";
import { StatCards } from "./components/StatCards";
import { ScannerRadar } from "./components/ScannerRadar";
import { ResearchReview } from "./components/ResearchReview";
import { WatchlistTab } from "./components/WatchlistTab";
import { RiskAlerts } from "./components/RiskAlerts";
import { Methodology } from "./components/Methodology";
import { MarketContextPanel, type MarketContextPanelState } from "./components/MarketContextPanel";
import { LocalMvpWorkflowPanel } from "./components/LocalMvpWorkflowPanel";
import { WorkspaceOverview } from "./components/WorkspaceOverview";
import { ControlCenter } from "./components/ControlCenter";
import { CandidateDetailView } from "./components/CandidateDetailView";
import { CandidateResultsView } from "./components/CandidateResultsView";
import { ExternalVerificationLinksView } from "./components/ExternalVerificationLinksView";
import { TokenContractLookupView } from "./components/TokenContractLookupView";
import { TrustedPreview } from "./components/TrustedPreview";
import { FeedbackNotes } from "./components/FeedbackNotes";
import { WebinarTeaser } from "./components/WebinarTeaser";
import {
  WorkspaceSection,
  WorkspaceShell,
  type WorkspaceSectionId,
} from "./components/WorkspaceShell";
import {
  loadScannerDataSourceResult,
  type DataSourceKey,
  type ResolvedScannerSource,
  type ScannerDataSourceResult,
} from "./services/scannerDataSource";
import { loadLatestMarketContext } from "./services/contextDataSource";
import {
  clearReviewRecord,
  createEmptyReviewSession,
  getCandidateReview,
  loadReviewSession,
  saveReviewRecord,
  saveReviewSessionState,
} from "./services/reviewSessionStore";
import {
  loadReviewSessionFromApi,
  saveReviewSessionToApi,
  type ReviewSessionApiStatus,
  type ReviewSessionApiResult,
  type ReviewSessionApiSourceMeta,
} from "./services/reviewSessionApi";
import { mapPersistableScannerOutputToUiCandidates } from "./adapters/scannerOutputAdapter";
import { toMockCandidate, type MockCandidate } from "./mockData";
import {
  DEFAULT_WORKSPACE_SECTION,
  WORKSPACE_NAV_GROUPS,
  resolveInitialWorkspaceSection,
  sectionToHash,
} from "./workspaceNavigation";
import type { CandidateReviewInput, ReviewSessionState } from "./types/reviewSessionTypes";

function buildMockCandidates(result: ScannerDataSourceResult): MockCandidate[] {
  const uiCandidates = mapPersistableScannerOutputToUiCandidates(result.output);
  return uiCandidates.map(toMockCandidate);
}

function buildSummary(candidates: MockCandidate[]) {
  return {
    total_candidates:          candidates.length,
    watchlist:                 candidates.filter((c) => c.final_label === "WATCHLIST").length,
    critical_risk:             candidates.filter((c) => c.final_label === "CRITICAL_RISK").length,
    needs_manual_verification: candidates.filter((c) => c.final_label === "NEEDS_MANUAL_VERIFICATION").length,
    rejected:                  candidates.filter((c) => c.final_label === "REJECT").length,
  };
}

const SECTION_COPY: Record<WorkspaceSectionId, { title: string; description: string }> = {
  overview: {
    title: "Source Freshness Overview",
    description: "Admin / status view for source freshness, local workflow status and health context.",
  },
  "control-center": {
    title: "Control Center",
    description: "Admin / status view for preview readiness, source freshness and owner follow-up.",
  },
  "candidate-results": {
    title: "Candidate Results",
    description: "Research candidate list for manual review, source freshness, risk flags and next review step.",
  },
  "candidate-detail": {
    title: "Candidate Detail",
    description: "Candidate detail for manual review, source freshness, risk flags and next review step.",
  },
  "token-lookup": {
    title: "Token Lookup",
    description: "Token lookup shell for local input classification and manual verification required states.",
  },
  "external-checks": {
    title: "External Checks",
    description: "External checks with link-only manual verification and copy fallback states.",
  },
  "trusted-preview": {
    title: "Trusted Preview",
    description: "Guided standalone preview path for a trusted external reviewer.",
  },
  "feedback-notes": {
    title: "Feedback Notes",
    description: "Review / feedback notes after the Manual Review Only flow.",
  },
  "webinar-teaser": {
    title: "Webinar Teaser",
    description: "Demo / preview screenshot mode for controlled product concept content.",
  },
  scanner: {
    title: "Candidate Source Review",
    description: "Admin / status read-only candidate source view. WATCHLIST means Manual Review Only.",
  },
  watchlist: {
    title: "Manual Review",
    description: "Review / feedback flow for watchlist candidate status and local notes.",
  },
  research: {
    title: "Manual Research Notes",
    description: "Admin / status frontend-only research note workspace. It is not an external AI call.",
  },
  risks: {
    title: "Risk Flags",
    description: "Critical Risk Flags and Manual Verification Required candidates from current candidate output.",
  },
  methodology: {
    title: "Methodology",
    description: "Admin / status reference for candidate labels, context and review layers.",
  },
};

const DATA_SOURCE_OPTIONS: { key: DataSourceKey; label: string }[] = [
  { key: "fixture",     label: "Built-in sample" },
  { key: "static-json", label: "Local data file" },
  { key: "api",         label: "Latest local data" },
];

const SOURCE_STATUS_TEXT: Record<ResolvedScannerSource, string> = {
  "built-in-fixture": "Source Freshness: built-in sample",
  "static-json": "Source Freshness: local data file",
  "real-output": "Source Freshness: latest local output",
  "fixture-fallback": "Source Freshness: sample fallback",
};

type ReviewStorageStatus = {
  tone: "ready" | "fallback" | "warning" | "error";
  text: string;
  detail?: string;
};

type ReviewSessionResetResult = {
  status: ReviewSessionApiStatus;
  message: string;
};

const INITIAL_REVIEW_STORAGE_STATUS: ReviewStorageStatus = {
  tone: "fallback",
  text: "Review storage: browser fallback",
};

export default function App() {
  const [activeSection, setActiveSection] = useState<WorkspaceSectionId>(() => {
    if (typeof window === "undefined") return DEFAULT_WORKSPACE_SECTION;
    return resolveInitialWorkspaceSection(window.location.hash);
  });

  const [dataSource, setDataSource] = useState<DataSourceKey>("fixture");
  const [resolvedSource, setResolvedSource] = useState<ResolvedScannerSource>("built-in-fixture");
  const [scannerGeneratedAt, setScannerGeneratedAt] = useState<string | null>(null);
  const [scannerMode, setScannerMode] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MockCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null | undefined>(undefined);
  const [tokenLookupInput, setTokenLookupInput] = useState("");
  const [externalChecksInput, setExternalChecksInput] = useState("");
  const [externalChecksCandidateId, setExternalChecksCandidateId] = useState<string | null | undefined>(undefined);
  const [reviewSession, setReviewSession] = useState<ReviewSessionState>(() => loadReviewSession());
  const [reviewStorageStatus, setReviewStorageStatus] = useState<ReviewStorageStatus>(INITIAL_REVIEW_STORAGE_STATUS);
  const [marketContextState, setMarketContextState] = useState<MarketContextPanelState>({
    status: "loading",
    context: null,
  });

  const summary = buildSummary(candidates);
  const sourceStatusText = SOURCE_STATUS_TEXT[resolvedSource];
  const contextSourceStatus = getContextSourceStatus(marketContextState);
  const selectedDetailCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    candidates.find((candidate) => candidate.final_label === "WATCHLIST") ??
    candidates[0] ??
    null;
  const selectedDetailReviewRecord = selectedDetailCandidate
    ? getCandidateReview(selectedDetailCandidate.id, reviewSession)
    : null;
  const externalChecksCandidate =
    externalChecksCandidateId === null
      ? null
      : externalChecksCandidateId
        ? candidates.find((candidate) => candidate.id === externalChecksCandidateId) ?? selectedDetailCandidate
        : selectedDetailCandidate;

  const loadData = useCallback(async (source: DataSourceKey) => {
    setLoading(true);
    setFallbackMsg(null);
    try {
      const result = await loadScannerDataSourceResult(source);
      const built = buildMockCandidates(result);
      setCandidates(built);
      setResolvedSource(result.resolvedSource);
      setScannerGeneratedAt(result.output.scan_run.finished_at ?? result.output.scan_run.started_at ?? null);
      setScannerMode(result.output.scan_run.mode ?? null);
      if (result.usedFallback && result.fallbackReason) {
        setFallbackMsg(result.fallbackReason);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResolvedSource("built-in-fixture");
      setScannerGeneratedAt(null);
      setScannerMode(null);
      setFallbackMsg(`Unexpected error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMarketContext = useCallback(async () => {
    setMarketContextState({ status: "loading", context: null });
    const result = await loadLatestMarketContext();

    if (result.status === "ready") {
      setMarketContextState({
        status: "ready",
        context: result.output,
        message: result.usedFallback ? result.fallbackReason : undefined,
      });
      return;
    }

    setMarketContextState({
      status: "error",
      context: null,
      message: result.error,
    });
  }, []);

  useEffect(() => {
    loadData("fixture");
  }, [loadData]);

  useEffect(() => {
    loadMarketContext();
  }, [loadMarketContext]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleHashChange = () => {
      setActiveSection(resolveInitialWorkspaceSection(window.location.hash));
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadReviewSessionFromApi().then((result) => {
      if (cancelled) return;

      if (result.status === "ready") {
        setReviewSession(saveReviewSessionState(result.state));
        setReviewStorageStatus(getReadyReviewStorageStatus(result.sourceMeta));
        return;
      }

      setReviewStorageStatus(getFallbackReviewStorageStatus(result));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const syncReviewSessionToApi = useCallback((state: ReviewSessionState) => {
    void saveReviewSessionToApi(state).then((result) => {
      if (result.status === "ready") {
        setReviewStorageStatus(getReadyReviewStorageStatus(result.sourceMeta));
        return;
      }

      setReviewStorageStatus(getFallbackReviewStorageStatus(result));
    });
  }, []);

  const handleWorkspaceSectionChange = useCallback((sectionId: WorkspaceSectionId) => {
    setActiveSection(sectionId);

    if (typeof window === "undefined") return;

    const nextHash = sectionToHash(sectionId);

    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }, []);

  const handleSourceChange = (source: DataSourceKey) => {
    setDataSource(source);
    loadData(source);
  };

  const handleSaveReview = useCallback((input: CandidateReviewInput) => {
    const nextState = saveReviewRecord(input);
    setReviewSession(nextState);
    syncReviewSessionToApi(nextState);
  }, [syncReviewSessionToApi]);

  const handleClearReview = useCallback((candidateId: string) => {
    const nextState = clearReviewRecord(candidateId);
    setReviewSession(nextState);
    syncReviewSessionToApi(nextState);
  }, [syncReviewSessionToApi]);

  const handleImportReviewSession = useCallback((nextState: ReviewSessionState) => {
    const savedState = saveReviewSessionState(nextState);
    setReviewSession(savedState);
    syncReviewSessionToApi(savedState);
  }, [syncReviewSessionToApi]);

  const handleResetReviewSession = useCallback(async (): Promise<ReviewSessionResetResult> => {
    const emptyState = saveReviewSessionState(createEmptyReviewSession());
    setReviewSession(emptyState);

    const result = await saveReviewSessionToApi(emptyState);

    if (result.status === "ready") {
      setReviewStorageStatus(getReadyReviewStorageStatus(result.sourceMeta));
      return {
        status: "ready",
        message: "Reset completed in browser storage and local API storage.",
      };
    }

    setReviewStorageStatus(getFallbackReviewStorageStatus(result));
    return {
      status: result.status,
      message: result.status === "unavailable"
        ? "Reset completed in browser storage. Local API storage was unavailable."
        : "Reset completed in browser storage. Local API storage returned an error.",
    };
  }, []);

  const handleOpenCandidate = useCallback((candidateId: string) => {
    setSelectedCandidateId(candidateId);
    handleWorkspaceSectionChange("candidate-detail");
  }, [handleWorkspaceSectionChange]);

  const handleOpenTokenLookup = useCallback((candidate?: MockCandidate) => {
    if (candidate) {
      setTokenLookupInput(formatTokenLookupInput(candidate));
    }

    handleWorkspaceSectionChange("token-lookup");
  }, [handleWorkspaceSectionChange]);

  const handleOpenExternalChecks = useCallback((candidate?: MockCandidate | null, tokenInput?: string) => {
    if (candidate) {
      setSelectedCandidateId(candidate.id);
      setExternalChecksCandidateId(candidate.id);
      setExternalChecksInput(formatTokenLookupInput(candidate));
    } else {
      setExternalChecksCandidateId(null);
      setExternalChecksInput(tokenInput ?? tokenLookupInput);
    }

    handleWorkspaceSectionChange("external-checks");
  }, [handleWorkspaceSectionChange, tokenLookupInput]);

  const renderLoadingSection = (sectionId: WorkspaceSectionId) => {
    const copy = SECTION_COPY[sectionId];

    return (
      <WorkspaceSection title={copy.title} description={copy.description}>
        <div className="flex items-center justify-center h-40">
          <span className="text-secondary text-sm">Loading data...</span>
        </div>
      </WorkspaceSection>
    );
  };

  const renderSection = () => {
    if (loading && activeSection !== "overview") {
      return renderLoadingSection(activeSection);
    }

    switch (activeSection) {
      case "overview":
        return (
          <WorkspaceSection {...SECTION_COPY.overview}>
            <WorkspaceOverview
              statCards={<StatCards summary={summary} />}
              marketContext={<MarketContextPanel state={marketContextState} />}
              workflowPanel={(
                <LocalMvpWorkflowPanel
                  scannerSourceText={sourceStatusText}
                  scannerFallbackReason={fallbackMsg}
                  contextSourceText={contextSourceStatus.text}
                  contextSourceDetail={contextSourceStatus.detail}
                  reviewStorageText={reviewStorageStatus.text}
                  reviewStorageDetail={reviewStorageStatus.detail}
                />
              )}
            />
          </WorkspaceSection>
        );
      case "control-center":
        return (
          <WorkspaceSection {...SECTION_COPY["control-center"]}>
            <ControlCenter
              candidateCount={candidates.length}
              resolvedScannerSource={resolvedSource}
              scannerSourceText={sourceStatusText}
              scannerFallbackReason={fallbackMsg}
              scannerGeneratedAt={scannerGeneratedAt}
              scannerMode={scannerMode}
              contextSourceText={contextSourceStatus.text}
              contextSourceDetail={contextSourceStatus.detail}
              marketContextState={marketContextState}
              reviewStorageStatus={reviewStorageStatus}
            />
          </WorkspaceSection>
        );
      case "candidate-results":
        return (
          <WorkspaceSection {...SECTION_COPY["candidate-results"]}>
            <CandidateResultsView
              candidates={candidates}
              reviewSession={reviewSession}
              onOpenCandidate={handleOpenCandidate}
              onOpenTokenLookup={handleOpenTokenLookup}
              onOpenExternalChecks={handleOpenExternalChecks}
            />
          </WorkspaceSection>
        );
      case "candidate-detail":
        return (
          <WorkspaceSection {...SECTION_COPY["candidate-detail"]}>
            <CandidateDetailView
              candidate={selectedDetailCandidate}
              reviewRecord={selectedDetailReviewRecord}
              onBackToResults={() => handleWorkspaceSectionChange("candidate-results")}
              onOpenTokenLookup={handleOpenTokenLookup}
              onOpenExternalChecks={handleOpenExternalChecks}
            />
          </WorkspaceSection>
        );
      case "token-lookup":
        return (
          <WorkspaceSection {...SECTION_COPY["token-lookup"]}>
            <TokenContractLookupView
              initialInput={tokenLookupInput}
              onOpenExternalChecks={(input) => handleOpenExternalChecks(null, input)}
            />
          </WorkspaceSection>
        );
      case "external-checks":
        return (
          <WorkspaceSection {...SECTION_COPY["external-checks"]}>
            <ExternalVerificationLinksView
              candidate={externalChecksCandidate}
              tokenInput={externalChecksInput}
            />
          </WorkspaceSection>
        );
      case "trusted-preview":
        return (
          <WorkspaceSection {...SECTION_COPY["trusted-preview"]}>
            <TrustedPreview />
          </WorkspaceSection>
        );
      case "feedback-notes":
        return (
          <WorkspaceSection {...SECTION_COPY["feedback-notes"]}>
            <FeedbackNotes />
          </WorkspaceSection>
        );
      case "webinar-teaser":
        return (
          <WorkspaceSection {...SECTION_COPY["webinar-teaser"]}>
            <WebinarTeaser />
          </WorkspaceSection>
        );
      case "scanner":
        return (
          <WorkspaceSection {...SECTION_COPY.scanner}>
            <ScannerRadar
              candidates={candidates}
              marketContextState={marketContextState}
              selectedCandidateId={selectedCandidateId}
              onCandidateSelected={setSelectedCandidateId}
              reviewSession={reviewSession}
              onSaveReview={handleSaveReview}
              onClearReview={handleClearReview}
            />
          </WorkspaceSection>
        );
      case "research":
        return (
          <WorkspaceSection {...SECTION_COPY.research}>
            <ResearchReview />
          </WorkspaceSection>
        );
      case "watchlist":
        return (
          <WorkspaceSection {...SECTION_COPY.watchlist}>
            <WatchlistTab
              candidates={candidates}
              reviewSession={reviewSession}
              reviewStorageStatus={reviewStorageStatus}
              onClearReview={handleClearReview}
              onOpenCandidate={handleOpenCandidate}
              onImportReviewSession={handleImportReviewSession}
              onResetReviewSession={handleResetReviewSession}
            />
          </WorkspaceSection>
        );
      case "risks":
        return (
          <WorkspaceSection {...SECTION_COPY.risks}>
            <RiskAlerts candidates={candidates} />
          </WorkspaceSection>
        );
      case "methodology":
        return (
          <WorkspaceSection {...SECTION_COPY.methodology}>
            <Methodology />
          </WorkspaceSection>
        );
    }
  };

  return (
    <WorkspaceShell
      navGroups={WORKSPACE_NAV_GROUPS}
      activeSection={activeSection}
      onSectionChange={handleWorkspaceSectionChange}
      dataSource={dataSource}
      dataSourceOptions={DATA_SOURCE_OPTIONS}
      onDataSourceChange={handleSourceChange}
      loading={loading}
      sourceStatusText={sourceStatusText}
      fallbackMsg={fallbackMsg}
      presentationMode={activeSection === "webinar-teaser"}
      trustedPreviewMode={activeSection === "trusted-preview" || activeSection === "feedback-notes"}
    >
      {renderSection()}
    </WorkspaceShell>
  );
}

function getReadyReviewStorageStatus(sourceMeta: ReviewSessionApiSourceMeta | null): ReviewStorageStatus {
  const providerText = formatReviewStorageProvider(sourceMeta?.source_kind);
  const detail = [
    sourceMeta?.storage_file,
    sourceMeta?.warning,
  ].filter((value): value is string => Boolean(value));

  if (sourceMeta?.warning) {
    return {
      tone: "warning",
      text: `Review storage: local API (${providerText}) warning`,
      detail: detail.join(" / "),
    };
  }

  return {
    tone: "ready",
    text: `Review storage: local API (${providerText})`,
    detail: detail.join(" / ") || undefined,
  };
}

function getFallbackReviewStorageStatus(result: Exclude<ReviewSessionApiResult, { status: "ready" }>): ReviewStorageStatus {
  if (result.status === "unavailable") {
    return {
      tone: "fallback",
      text: "Review storage: localStorage fallback",
      detail: result.error,
    };
  }

  return {
    tone: "error",
    text: "Review storage: local API error, using browser localStorage fallback",
    detail: result.error,
  };
}

function formatTokenLookupInput(candidate: MockCandidate): string {
  const contract = candidate.contract_address.trim();
  const chain = candidate.chain.trim();

  if (contract && chain) return `${chain}: ${contract}`;
  if (contract) return contract;
  return candidate.symbol || candidate.name || "";
}

function getContextSourceStatus(state: MarketContextPanelState): { text: string; detail?: string } {
  if (state.status === "loading") {
    return { text: "Source Freshness: loading local context" };
  }

  if (state.status === "error") {
    return {
      text: "Source Freshness: context unavailable",
      detail: state.message,
    };
  }

  return {
    text: `Source Freshness: ${formatContextSourceKind(state.context._source_meta.source_kind)}`,
    detail: state.message ?? state.context._source_meta.output_file ?? undefined,
  };
}

function formatContextSourceKind(sourceKind: string): string {
  if (sourceKind === "approved-sources-output") return "approved local context";
  if (sourceKind === "fixture-fallback") return "sample fallback";
  return sourceKind;
}

function formatReviewStorageProvider(sourceKind?: ReviewSessionApiSourceMeta["source_kind"]): string {
  if (sourceKind === "file-backed-review-session") return "file-backed JSON";
  if (sourceKind === "sqlite-review-session") return "SQLite";
  return "provider metadata unavailable";
}
