import React, { useState } from "react";
import { MOCK_CANDIDATES, type MockCandidate, type FinalLabel } from "../mockData";
import { LabelBadge } from "./LabelBadge";
import { CandidateDetail } from "./CandidateDetail";

const CHAIN_LABELS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bsc: "BSC",
  base: "BASE",
};

const FILTER_OPTIONS: { label: string; value: FinalLabel | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Watchlist", value: "WATCHLIST" },
  { label: "Critical Risk", value: "CRITICAL_RISK" },
  { label: "Needs Review", value: "NEEDS_MANUAL_VERIFICATION" },
  { label: "Rejected", value: "REJECT" },
];

function fmt(n: number | null, prefix = "", decimals = 0): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`;
  return `${prefix}${n.toFixed(decimals)}`;
}

function pct(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

const SecurityBadge: React.FC<{ label: string }> = ({ label }) => {
  const map: Record<string, string> = {
    SECURITY_PASSED: "text-[#3fb950]",
    CRITICAL_RISK: "text-[#f85149]",
    NEEDS_MANUAL_VERIFICATION: "text-[#e3b341]",
    NOT_CHECKED: "text-[#8b949e]",
  };
  const short: Record<string, string> = {
    SECURITY_PASSED: "Passed",
    CRITICAL_RISK: "Critical",
    NEEDS_MANUAL_VERIFICATION: "Partial",
    NOT_CHECKED: "—",
  };
  return <span className={`text-xs font-medium ${map[label] ?? "text-gray-400"}`}>{short[label] ?? label}</span>;
};

const BasicFilterBadge: React.FC<{ status: string }> = ({ status }) => {
  const passed = status === "passed_basic_filter";
  return (
    <span className={`text-xs font-medium ${passed ? "text-[#3fb950]" : "text-[#f85149]"}`}>
      {passed ? "Pass" : "Fail"}
    </span>
  );
};

export const ScannerRadar: React.FC = () => {
  const [selected, setSelected] = useState<MockCandidate | null>(MOCK_CANDIDATES[0]);
  const [filter, setFilter] = useState<FinalLabel | "ALL">("ALL");

  const filtered = filter === "ALL" ? MOCK_CANDIDATES : MOCK_CANDIDATES.filter((c) => c.final_label === filter);

  return (
    <div className="flex gap-4 h-full">
      {/* ── Left: table ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 items-center">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filter === opt.value
                  ? "bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/40"
                  : "bg-[#21262d] text-[#8b949e] border border-[#30363d] hover:text-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-[#8b949e]">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-[#30363d]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#21262d] text-[#8b949e] text-xs uppercase tracking-wide">
                {["Token", "Chain", "DEX", "Mkt Cap", "Liquidity", "24h Vol", "Vol/MC", "Age", "Filter", "Security", "Label", "Reason", ""].map(
                  (h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isActive = selected?.id === c.id;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={`border-t border-[#21262d] cursor-pointer transition-colors ${
                      isActive ? "bg-[#58a6ff]/10" : "hover:bg-[#21262d]"
                    }`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="font-semibold text-gray-100">{c.symbol}</div>
                      <div className="text-xs text-[#8b949e]">{c.name}</div>
                    </td>
                    <td className="px-3 py-2 text-[#8b949e] text-xs whitespace-nowrap">
                      {CHAIN_LABELS[c.chain] ?? c.chain.toUpperCase()}
                    </td>
                    <td className="px-3 py-2 text-[#8b949e] text-xs whitespace-nowrap">{c.dex}</td>
                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{fmt(c.market_cap_usd, "$")}</td>
                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{fmt(c.liquidity_usd, "$")}</td>
                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{fmt(c.volume_24h_usd, "$")}</td>
                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{pct(c.volume_market_cap_ratio)}</td>
                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{c.pair_age_days}d</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <BasicFilterBadge status={c.basic_filter_status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <SecurityBadge label={c.security_label} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <LabelBadge label={c.final_label} />
                    </td>
                    <td className="px-3 py-2 text-[#8b949e] text-xs max-w-[180px] truncate">
                      {c.final_reasons[0]}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        className="text-xs text-[#58a6ff] hover:underline whitespace-nowrap"
                        onClick={(e) => { e.stopPropagation(); setSelected(c); }}
                      >
                        Details →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Right: detail panel ─────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 hidden xl:block">
        {selected ? (
          <CandidateDetail candidate={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 text-center text-[#8b949e] text-sm">
            Select a token to view details
          </div>
        )}
      </div>
    </div>
  );
};
