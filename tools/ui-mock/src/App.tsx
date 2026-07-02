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
import { TrustedPreview } from "./components/TrustedPreview";
import { FeedbackNotes } from "./components/FeedbackNotes";
import { WebinarTeaser } from "./components/WebinarTeaser";
import {
  WorkspaceSection,
  WorkspaceShell,
  type WorkspaceNavItem,
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

const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  { id: "overview",    label: "Overview",        icon: "OV", description: "Status and health" },
  { id: "control-center", label: "Control Center", icon: "CC", description: "Preview readiness" },
  { id: "trusted-preview", label: "Trusted Preview", icon: "TP", description: "Guided reviewer path" },
  { id: "feedback-notes", label: "Feedback Notes", icon: "FN", description: "Session notes worksheet" },
  { id: "webinar-teaser", label: "Webinar Teaser", icon: "WT", description: "Demo-safe screenshots" },
  { id: "scanner",     label: "Scanner Radar",   icon: "SR", description: "Read-only scanner output" },
  { id: "watchlist",   label: "Review Queue",    icon: "RQ", description: "Local analyst queue" },
  { id: "research",    label: "Research Review", icon: "RR", description: "Mock categorization" },
  { id: "risks",       label: "Risk Alerts",     icon: "RA", description: "Critical and manual checks" },
  { id: "methodology", label: "Methodology",     icon: "M",  description: "Scanner and review layers" },
];

const SECTION_COPY: Record<WorkspaceSectionId, { title: string; description: string }> = {
  overview: {
    title: "Local MVP Overview",
    description: "Current local workflow status and health commands.",
  },
  "control-center": {
    title: "Control Center",
    description: "Standalone preview readiness, source freshness, review flow, reports and tester preparation.",
  },
  "trusted-preview": {
    title: "Trusted Preview",
    description: "Guided standalone preview path for a trusted external reviewer.",
  },
  "feedback-notes": {
    title: "Feedback Notes",
    description: "Structured session notes for a trusted preview review.",
  },
  "webinar-teaser": {
    title: "Webinar Teaser",
    description: "Demo-safe screenshot mode for showing the product concept with controlled demo content.",
  },
  scanner: {
    title: "Scanner Radar",
    description: "Scanner output is read-only. WATCHLIST means eligible for further manual review only.",
  },
  watchlist: {
    title: "Review Queue",
    description: "Local analyst status and notes. This does not change scanner labels.",
  },
  research: {
    title: "Research Review",
    description: "Mock research categorization workspace. It is not an external AI call.",
  },
  risks: {
    title: "Risk Alerts",
    description: "Critical and manual-verification candidates from current scanner output.",
  },
  methodology: {
    title: "Methodology",
    description: "How local scanner labels, context and review layers fit together.",
  },
};

const DATA_SOURCE_OPTIONS: { key: DataSourceKey; label: string }[] = [
  { key: "fixture",     label: "Fixture" },
  { key: "static-json", label: "Static JSON" },
  { key: "api",         label: "API / latest" },
];

const SOURCE_STATUS_TEXT: Record<ResolvedScannerSource, string> = {
  "built-in-fixture": "Scanner source: built-in fixture",
  "static-json": "Scanner source: static-json fixture",
  "real-output": "Scanner source: real-output",
  "fixture-fallback": "Scanner source: fixture-fallback",
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
  const [reviewSession, setReviewSession] = useState<ReviewSessionState>(() => loadReviewSession());
  const [reviewStorageStatus, setReviewStorageStatus] = useState<ReviewStorageStatus>(INITIAL_REVIEW_STORAGE_STATUS);
  const [marketContextState, setMarketContextState] = useState<MarketContextPanelState>({
    status: "loading",
    context: null,
  });

  const summary = buildSummary(candidates);
  const sourceStatusText = SOURCE_STATUS_TEXT[resolvedSource];
  const contextSourceStatus = getContextSourceStatus(marketContextState);

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
    handleWorkspaceSectionChange("scanner");
  }, [handleWorkspaceSectionChange]);

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
      navItems={WORKSPACE_NAV_ITEMS}
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

function getContextSourceStatus(state: MarketContextPanelState): { text: string; detail?: string } {
  if (state.status === "loading") {
    return { text: "Context source: loading local API" };
  }

  if (state.status === "error") {
    return {
      text: "Context source: unavailable",
      detail: state.message,
    };
  }

  return {
    text: `Context source: ${state.context._source_meta.source_kind}`,
    detail: state.message ?? state.context._source_meta.output_file ?? undefined,
  };
}

function formatReviewStorageProvider(sourceKind?: ReviewSessionApiSourceMeta["source_kind"]): string {
  if (sourceKind === "file-backed-review-session") return "file-backed JSON";
  if (sourceKind === "sqlite-review-session") return "SQLite";
  return "provider metadata unavailable";
}
