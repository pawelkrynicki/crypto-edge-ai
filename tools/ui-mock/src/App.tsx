import { useState } from "react";
import { StatCards } from "./components/StatCards";
import { ScannerRadar } from "./components/ScannerRadar";
import { ResearchReview } from "./components/ResearchReview";
import { WatchlistTab } from "./components/WatchlistTab";
import { RiskAlerts } from "./components/RiskAlerts";
import { Methodology } from "./components/Methodology";

type TabId = "scanner" | "research" | "watchlist" | "risks" | "methodology";

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: "scanner", label: "Scanner Radar", icon: "◈" },
  { id: "research", label: "Research Review", icon: "⊡" },
  { id: "watchlist", label: "Watchlist", icon: "✓" },
  { id: "risks", label: "Risk Alerts", icon: "⚠" },
  { id: "methodology", label: "Methodology", icon: "≡" },
];

const NAV_ITEMS = [
  { icon: "◈", label: "Scanner Radar", tab: "scanner" as TabId },
  { icon: "⊡", label: "Research Review", tab: "research" as TabId },
  { icon: "✓", label: "Watchlist", tab: "watchlist" as TabId },
  { icon: "⚠", label: "Risk Alerts", tab: "risks" as TabId },
  { icon: "≡", label: "Methodology", tab: "methodology" as TabId },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("scanner");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const renderTab = () => {
    switch (activeTab) {
      case "scanner":    return <ScannerRadar />;
      case "research":   return <ResearchReview />;
      case "watchlist":  return <WatchlistTab />;
      case "risks":      return <RiskAlerts />;
      case "methodology":return <Methodology />;
    }
  };

  return (
    <div className="flex h-screen bg-[#0d1117] text-gray-100 overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`flex flex-col bg-[#161b22] border-r border-[#30363d] transition-all duration-200 ${
          sidebarOpen ? "w-52" : "w-14"
        } shrink-0`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 py-4 border-b border-[#30363d]">
          <div className="w-7 h-7 rounded bg-[#58a6ff]/20 border border-[#58a6ff]/40 flex items-center justify-center text-[#58a6ff] font-bold text-sm shrink-0">
            CE
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-100 truncate">Crypto Edge AI</div>
              <div className="text-xs text-[#8b949e] truncate">Camp BETA</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                onClick={() => setActiveTab(item.tab)}
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded text-sm transition-colors ${
                  active
                    ? "bg-[#58a6ff]/15 text-[#58a6ff] border border-[#58a6ff]/30"
                    : "text-[#8b949e] hover:text-gray-200 hover:bg-[#21262d]"
                }`}
                title={!sidebarOpen ? item.label : undefined}
              >
                <span className="text-base shrink-0">{item.icon}</span>
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Mock data notice */}
        {sidebarOpen && (
          <div className="px-3 py-3 border-t border-[#30363d]">
            <div className="text-xs text-[#8b949e] italic">
              Mock data only — no live API
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="flex items-center justify-center py-3 border-t border-[#30363d] text-[#8b949e] hover:text-gray-200 transition-colors"
        >
          <span className="text-sm">{sidebarOpen ? "◀" : "▶"}</span>
        </button>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-[#161b22] border-b border-[#30363d] px-6 py-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-100 tracking-tight">Crypto Edge AI</h1>
              <p className="text-sm text-[#8b949e] mt-0.5">Research radar i scanner ryzyka dla traderów crypto</p>
              <p className="text-xs text-[#8b949e] mt-1 max-w-xl">
                Narzędzie pomaga filtrować nowe tokeny, wykrywać ryzyka, porządkować research i decydować, które tematy zasługują na dalszą analizę.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#58a6ff]/15 text-[#58a6ff] border border-[#58a6ff]/30 uppercase tracking-wide">
                Camp BETA
              </span>
              <span className="text-xs text-[#8b949e] italic">UI Mock — mock data only</span>
            </div>
          </div>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">
            {/* Stat cards */}
            <StatCards />

            {/* Tabs */}
            <div>
              <div className="flex gap-1 border-b border-[#30363d] overflow-x-auto">
                {TABS.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                        active
                          ? "text-[#58a6ff] border-[#58a6ff]"
                          : "text-[#8b949e] border-transparent hover:text-gray-200 hover:border-[#30363d]"
                      }`}
                    >
                      <span>{tab.icon}</span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div className="pt-5">{renderTab()}</div>
            </div>
          </div>
        </div>

        {/* Footer disclaimer */}
        <footer className="bg-[#161b22] border-t border-[#30363d] px-6 py-2 shrink-0">
          <p className="text-xs text-[#8b949e] italic text-center">
            Crypto Edge AI is a research and risk review tool. It does not provide financial advice, trading signals, or investment recommendations. WATCHLIST is not a buy signal.
          </p>
        </footer>
      </div>
    </div>
  );
}
