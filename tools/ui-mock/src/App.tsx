import { useState, useEffect, useCallback } from "react";
import { StatCards } from "./components/StatCards";
import { ScannerRadar } from "./components/ScannerRadar";
import { ResearchReview } from "./components/ResearchReview";
import { WatchlistTab } from "./components/WatchlistTab";
import { RiskAlerts } from "./components/RiskAlerts";
import { Methodology } from "./components/Methodology";
import { MarketContextPanel, type MarketContextPanelState } from "./components/MarketContextPanel";
import {
  loadScannerDataSourceResult,
  type DataSourceKey,
  type ResolvedScannerSource,
  type ScannerDataSourceResult,
} from "./services/scannerDataSource";
import { loadLatestMarketContext } from "./services/contextDataSource";
import {
  clearReviewRecord,
  loadReviewSession,
  saveReviewRecord,
  saveReviewSessionState,
} from "./services/reviewSessionStore";
import {
  loadReviewSessionFromApi,
  saveReviewSessionToApi,
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
  "built-in-fixture": "Built-in fixture data",
  "static-json": "Static JSON fixture",
  "real-output": "Real scanner output",
  "fixture-fallback": "API fallback to fixture",
};

type ReviewStorageStatus = {
  tone: "ready" | "fallback" | "warning" | "error";
  text: string;
  detail?: string;
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
          <span>Fixture fallback</span>
          <p>{fallbackMsg}</p>
        </div>
      )}

      <div className="dashboard-scroll">
        <section className="dashboard-band">
          <MarketContextPanel state={marketContextState} />
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
  if (sourceMeta?.warning) {
    return {
      tone: "warning",
      text: "Review storage: local API warning",
      detail: sourceMeta.warning,
    };
  }

  return {
    tone: "ready",
    text: "Review storage: local API",
  };
}

function getFallbackReviewStorageStatus(result: Exclude<ReviewSessionApiResult, { status: "ready" }>): ReviewStorageStatus {
  if (result.status === "unavailable") {
    return {
      tone: "fallback",
      text: "Review storage: API unavailable, using browser localStorage",
      detail: result.error,
    };
  }

  return {
    tone: "error",
    text: "Review storage: API error, using browser localStorage",
    detail: result.error,
  };
}
