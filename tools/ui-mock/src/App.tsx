import { useState, useEffect, useCallback } from "react";
import { StatCards } from "./components/StatCards";
import { ScannerRadar } from "./components/ScannerRadar";
import { ResearchReview } from "./components/ResearchReview";
import { WatchlistTab } from "./components/WatchlistTab";
import { RiskAlerts } from "./components/RiskAlerts";
import { Methodology } from "./components/Methodology";
import { MarketContextPanel, type MarketContextPanelState } from "./components/MarketContextPanel";
import { LocalMvpWorkflowPanel } from "./components/LocalMvpWorkflowPanel";
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

type TabId = "scanner" | "research" | "watchlist" | "risks" | "methodology";

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: "scanner",     label: "Scanner Radar",   icon: "SR" },
  { id: "research",    label: "Research Review", icon: "RR" },
  { id: "watchlist",   label: "Review Queue",    icon: "RQ" },
  { id: "risks",       label: "Risk Alerts",     icon: "RA" },
  { id: "methodology", label: "Methodology",     icon: "M" },
];

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
  const [activeTab, setActiveTab] = useState<TabId>("scanner");

  const [dataSource, setDataSource] = useState<DataSourceKey>("fixture");
  const [resolvedSource, setResolvedSource] = useState<ResolvedScannerSource>("built-in-fixture");
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
      if (result.usedFallback && result.fallbackReason) {
        setFallbackMsg(result.fallbackReason);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResolvedSource("built-in-fixture");
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
    setActiveTab("scanner");
  }, []);

  const renderTab = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-40">
          <span className="text-secondary text-sm">Loading data...</span>
        </div>
      );
    }

    switch (activeTab) {
      case "scanner":
        return (
          <ScannerRadar
            candidates={candidates}
            marketContextState={marketContextState}
            selectedCandidateId={selectedCandidateId}
            onCandidateSelected={setSelectedCandidateId}
            reviewSession={reviewSession}
            onSaveReview={handleSaveReview}
            onClearReview={handleClearReview}
          />
        );
      case "research":
        return <ResearchReview />;
      case "watchlist":
        return (
          <WatchlistTab
            candidates={candidates}
            reviewSession={reviewSession}
            reviewStorageStatus={reviewStorageStatus}
            onClearReview={handleClearReview}
            onOpenCandidate={handleOpenCandidate}
            onImportReviewSession={handleImportReviewSession}
            onResetReviewSession={handleResetReviewSession}
          />
        );
      case "risks":
        return <RiskAlerts candidates={candidates} />;
      case "methodology":
        return <Methodology />;
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="product-mark">
          <div className="product-logo">CE</div>
          <div className="min-w-0">
            <h1>Crypto Edge AI</h1>
            <p>Professional research radar for scanner candidates and market context.</p>
          </div>
        </div>

        <div className="header-actions">
          <div className="source-control" aria-label="Data source">
            <span>Data source</span>
            <div className="source-segment">
              {DATA_SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => handleSourceChange(opt.key)}
                  className={dataSource === opt.key ? "active" : ""}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {loading && <em>loading...</em>}
          </div>
          <span className="badge badge-context">Camp BETA</span>
          <span className="source-status">{sourceStatusText}</span>
        </div>
      </header>

      {fallbackMsg && (
        <div className="app-notice">
          <span>Scanner fixture fallback</span>
          <p>{fallbackMsg}</p>
        </div>
      )}

      <div className="dashboard-scroll">
        <section className="dashboard-band">
          <MarketContextPanel state={marketContextState} />
        </section>

        <section className="dashboard-band compact">
          <LocalMvpWorkflowPanel
            scannerSourceText={sourceStatusText}
            scannerFallbackReason={fallbackMsg}
            contextSourceText={contextSourceStatus.text}
            contextSourceDetail={contextSourceStatus.detail}
            reviewStorageText={reviewStorageStatus.text}
            reviewStorageDetail={reviewStorageStatus.detail}
          />
        </section>

        <section className="dashboard-band compact">
          <StatCards summary={summary} />
        </section>

        <nav className="top-tabs" aria-label="Dashboard views">
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`tab-item ${active ? "active" : ""}`}
              >
                <span className="tab-icon">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="dashboard-content">
          {renderTab()}
        </main>
      </div>

      <footer className="app-footer">
        <p>Research workspace only. Scanner context and local review do not change labels or scoring.</p>
        <span>This is not a buy/sell signal.</span>
      </footer>
    </div>
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
