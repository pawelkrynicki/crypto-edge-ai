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
  { label: "Manual Check", value: "NEEDS_MANUAL_VERIFICATION" },
  { label: "Rejected", value: "REJECT" },
];

function fmtUsd(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

const ChainBadge: React.FC<{ chain: string }> = ({ chain }) => {
  const colors: Record<string, string> = {
    solana: "text-[#9945ff] bg-[#9945ff]/10 border-[#9945ff]/25",
    ethereum: "text-[#627eea] bg-[#627eea]/10 border-[#627eea]/25",
    bsc: "text-[#f3ba2f] bg-[#f3ba2f]/10 border-[#f3ba2f]/25",
    base: "text-[#0052ff] bg-[#0052ff]/10 border-[#0052ff]/25",
  };
  const cls = colors[chain] ?? "text-secondary bg-raised border-border";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
      {CHAIN_LABELS[chain] ?? chain.toUpperCase()}
    </span>
  );
};

const SecurityCell: React.FC<{ label: string }> = ({ label }) => {
  const map: Record<string, { text: string; cls: string }> = {
    SECURITY_PASSED:          { text: "Passed",   cls: "text-[#22c55e]" },
    CRITICAL_RISK:            { text: "Critical", cls: "text-[#ef4444]" },
    NEEDS_MANUAL_VERIFICATION:{ text: "Partial",  cls: "text-[#f59e0b]" },
    NOT_CHECKED:              { text: "—",        cls: "text-muted" },
  };
  const cfg = map[label] ?? { text: label, cls: "text-secondary" };
  return <span className={`text-xs font-medium ${cfg.cls}`}>{cfg.text}</span>;
};

const FilterCell: React.FC<{ status: string }> = ({ status }) => {
  const passed = status === "passed_basic_filter";
  return (
    <span className={`text-xs font-medium ${passed ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
      {passed ? "Pass" : "Fail"}
    </span>
  );
};

export const ScannerRadar: React.FC = () => {
  const [selected, setSelected] = useState<MockCandidate | null>(MOCK_CANDIDATES[0]);
  const [filter, setFilter] = useState<FinalLabel | "ALL">("ALL");

  const filtered = filter === "ALL"
    ? MOCK_CANDIDATES
    : MOCK_CANDIDATES.filter((c) => c.final_label === filter);

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* ── Left: table ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`pill ${filter === opt.value ? "pill-active" : ""}`}
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {["Token", "Chain", "DEX", "Mkt Cap", "Liquidity", "24h Vol", "Vol/MC", "Age", "Filter", "Security", "Label", "Reason", ""].map(
                  (h) => <th key={h}>{h}</th>
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
                    className={`cursor-pointer ${isActive ? "row-active" : ""}`}
                  >
                    <td>
                      <div className="font-semibold text-primary text-sm leading-tight">{c.symbol}</div>
                      <div className="text-[10px] text-muted leading-tight">{c.name}</div>
                    </td>
                    <td><ChainBadge chain={c.chain} /></td>
                    <td className="text-secondary text-xs">{c.dex}</td>
                    <td className="text-primary">{fmtUsd(c.market_cap_usd)}</td>
                    <td className="text-primary">{fmtUsd(c.liquidity_usd)}</td>
                    <td className="text-primary">{fmtUsd(c.volume_24h_usd)}</td>
                    <td className="text-primary">{fmtPct(c.volume_market_cap_ratio)}</td>
                    <td className="text-secondary">{c.pair_age_days}d</td>
                    <td><FilterCell status={c.basic_filter_status} /></td>
                    <td><SecurityCell label={c.security_label} /></td>
                    <td><LabelBadge label={c.final_label} /></td>
                    <td className="text-secondary max-w-[160px] truncate text-xs">
                      {c.final_reasons[0]}
                    </td>
                    <td>
                      <button
                        className="text-[11px] text-accent hover:underline whitespace-nowrap"
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

      {/* ── Right: detail panel ─────────────────────────────── */}
      <div className="w-[320px] flex-shrink-0 hidden xl:block">
        {selected ? (
          <CandidateDetail candidate={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="card p-6 text-center text-secondary text-sm">
            Select a token to view details
          </div>
        )}
      </div>
    </div>
  );
};
