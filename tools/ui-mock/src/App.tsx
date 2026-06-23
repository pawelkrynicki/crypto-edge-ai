import { useState, useEffect, useCallback } from "react";
import { StatCards } from "./components/StatCards";
import { ScannerRadar } from "./components/ScannerRadar";
import { ResearchReview } from "./components/ResearchReview";
import { WatchlistTab } from "./components/WatchlistTab";
import { RiskAlerts } from "./components/RiskAlerts";
import { Methodology } from "./components/Methodology";
import {
  loadScannerDataSourceResult,
  type DataSourceKey,
  type ResolvedScannerSource,
  type ScannerDataSourceResult,
} from "./services/scannerDataSource";
import { mapPersistableScannerOutputToUiCandidates } from "./adapters/scannerOutputAdapter";
import { toMockCandidate, type MockCandidate } from "./mockData";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "scanner" | "research" | "watchlist" | "risks" | "methodology";

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: "scanner",     label: "Scanner Radar",   icon: "◈" },
  { id: "research",    label: "Research Review", icon: "⊡" },
  { id: "watchlist",   label: "Watchlist",       icon: "✓" },
  { id: "risks",       label: "Risk Alerts",     icon: "▲" },
  { id: "methodology", label: "Methodology",     icon: "≡" },
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

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab,   setActiveTab]   = useState<TabId>("scanner");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Data source state
  const [dataSource,   setDataSource]   = useState<DataSourceKey>("fixture");
  const [resolvedSource, setResolvedSource] = useState<ResolvedScannerSource>("built-in-fixture");
  const [candidates,   setCandidates]   = useState<MockCandidate[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [fallbackMsg,  setFallbackMsg]  = useState<string | null>(null);

  const summary = buildSummary(candidates);
  const sourceStatusText = SOURCE_STATUS_TEXT[resolvedSource];

  // Load data whenever source changes
  const loadData = useCallback(async (source: DataSourceKey) => {
    setLoading(true);
    setFallbackMsg(null);
    try {
      const result = await loadScannerDataSourceResult(source);
      const built  = buildMockCandidates(result);
      setCandidates(built);
      setResolvedSource(result.resolvedSource);
      if (result.usedFallback && result.fallbackReason) {
        setFallbackMsg(result.fallbackReason);
      }
    } catch (err) {
      // Should not happen — loadScannerDataSourceResult never rejects
      const msg = err instanceof Error ? err.message : String(err);
      setResolvedSource("built-in-fixture");
      setFallbackMsg(`Unexpected error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    loadData("fixture");
  }, [loadData]);

  const handleSourceChange = (source: DataSourceKey) => {
    setDataSource(source);
    loadData(source);
  };

  const renderTab = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-40">
          <span className="text-secondary text-sm">Loading data…</span>
        </div>
      );
    }
    switch (activeTab) {
      case "scanner":     return <ScannerRadar candidates={candidates} />;
      case "research":    return <ResearchReview />;
      case "watchlist":   return <WatchlistTab candidates={candidates} />;
      case "risks":       return <RiskAlerts candidates={candidates} />;
      case "methodology": return <Methodology />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className="flex flex-col shrink-0 transition-all duration-200"
        style={{
          width: sidebarOpen ? "196px" : "52px",
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 py-3.5 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0"
            style={{
              background: "var(--accent-dim)",
              border: "1px solid var(--accent-border)",
              color: "var(--accent)",
            }}>
            CE
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <div className="text-xs font-semibold leading-tight truncate" style={{ color: "var(--text-primary)" }}>
                Crypto Edge AI
              </div>
              <div className="text-[10px] leading-tight truncate" style={{ color: "var(--text-muted)" }}>
                Camp BETA
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`nav-item ${active ? "active" : ""} ${sidebarOpen ? "" : "justify-center"}`}
                title={!sidebarOpen ? t.label : undefined}
              >
                <span className="text-sm shrink-0">{t.icon}</span>
                {sidebarOpen && <span className="truncate">{t.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Mock notice */}
        {sidebarOpen && (
          <div className="px-3 py-2 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>
              {sourceStatusText}
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="nav-item justify-center py-2.5 shrink-0"
          style={{ borderTop: "1px solid var(--border)", borderRadius: 0 }}
        >
          <span className="text-xs">{sidebarOpen ? "◀" : "▶"}</span>
        </button>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
          <div>
            <h1 className="text-md font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
              Crypto Edge AI
            </h1>
            <p className="text-[11px] leading-tight" style={{ color: "var(--text-muted)" }}>
              Research radar &amp; risk scanner for crypto traders
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Data source selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium shrink-0" style={{ color: "var(--text-muted)" }}>
                Data source:
              </span>
              <div className="flex items-center rounded overflow-hidden"
                style={{ border: "1px solid var(--border)", background: "var(--bg-raised)" }}>
                {DATA_SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => handleSourceChange(opt.key)}
                    className="text-[10px] px-2 py-1 transition-colors"
                    style={{
                      background: dataSource === opt.key ? "var(--accent-dim)" : "transparent",
                      color: dataSource === opt.key ? "var(--accent)" : "var(--text-secondary)",
                      borderRight: "1px solid var(--border)",
                      fontWeight: dataSource === opt.key ? 600 : 400,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {loading && (
                <span className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>loading…</span>
              )}
            </div>
            <span className="badge badge-watchlist">Camp BETA</span>
            <span className="text-[10px] px-2 py-0.5 rounded"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}>
              {sourceStatusText}
            </span>
          </div>
        </header>

        {/* Fallback notice */}
        {fallbackMsg && (
          <div className="px-5 py-1.5 shrink-0 flex items-center gap-2"
            style={{ background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.2)" }}>
            <span className="text-[10px] font-semibold" style={{ color: "#f59e0b" }}>⚠</span>
            <span className="text-[10px]" style={{ color: "#f59e0b" }}>
              Using fixture fallback. — {fallbackMsg}
            </span>
          </div>
        )}

        {/* Stat cards strip */}
        <div className="px-5 pt-4 pb-3 shrink-0">
          <StatCards summary={summary} />
        </div>

        {/* Tab bar */}
        <div className="flex items-center px-5 shrink-0 overflow-x-auto"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`tab-item ${active ? "active" : ""}`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-5 py-4">
          {renderTab()}
        </main>

        {/* Footer */}
        <footer className="px-5 py-2 shrink-0 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-surface)" }}>
          <p className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>
            Crypto Edge AI is a research and risk review tool. It does not provide financial advice, trading signals, or investment recommendations.
          </p>
          <span className="badge badge-reject shrink-0">WATCHLIST is research only</span>
        </footer>

      </div>
    </div>
  );
}
