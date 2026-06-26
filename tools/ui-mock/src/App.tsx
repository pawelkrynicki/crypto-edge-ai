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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("scanner");

  const [dataSource, setDataSource] = useState<DataSourceKey>("fixture");
  const [resolvedSource, setResolvedSource] = useState<ResolvedScannerSource>("built-in-fixture");
  const [candidates, setCandidates] = useState<MockCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null | undefined>(undefined);
  const [reviewSession, setReviewSession] = useState<ReviewSessionState>(() => loadReviewSession());
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

  const handleSourceChange = (source: DataSourceKey) => {
    setDataSource(source);
    loadData(source);
  };

  const handleSaveReview = useCallback((input: CandidateReviewInput) => {
    setReviewSession(saveReviewRecord(input));
  }, []);

  const handleClearReview = useCallback((candidateId: string) => {
    setReviewSession(clearReviewRecord(candidateId));
  }, []);

  const handleImportReviewSession = useCallback((nextState: ReviewSessionState) => {
    setReviewSession(saveReviewSessionState(nextState));
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
