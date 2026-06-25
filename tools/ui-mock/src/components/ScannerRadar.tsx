import React, { useState } from "react";
import type { MockCandidate, FinalLabel } from "../mockData";
import { LabelBadge } from "./LabelBadge";
import { CandidateDetail } from "./CandidateDetail";
import { ReviewStatusBadge } from "./CandidateReviewControls";
import type { MarketContextPanelState } from "./MarketContextPanel";
import type { CandidateReviewInput, ReviewSessionState } from "../types/reviewSessionTypes";
import { getCandidateReview } from "../services/reviewSessionStore";
import { formatReasonText } from "../utils/displayText";

interface Props {
  candidates: MockCandidate[];
  marketContextState?: MarketContextPanelState;
  reviewSession: ReviewSessionState;
  onSaveReview: (input: CandidateReviewInput) => void;
  onClearReview: (candidateId: string) => void;
}

const CHAIN_LABELS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bsc: "BSC",
  base: "BASE",
};

type ScannerFilter = FinalLabel | "ALL" | "FOLLOW_UP";

const FILTER_OPTIONS: { label: string; value: ScannerFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Watchlist", value: "WATCHLIST" },
  { label: "Critical Risk", value: "CRITICAL_RISK" },
  { label: "Manual Check", value: "NEEDS_MANUAL_VERIFICATION" },
  { label: "Rejected", value: "REJECT" },
  { label: "Follow-up", value: "FOLLOW_UP" },
];

function fmtUsd(n: number | null): string {
  if (n === null) return "--";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "--";
  return `${(n * 100).toFixed(1)}%`;
}

const ChainBadge: React.FC<{ chain: string }> = ({ chain }) => {
  const colors: Record<string, string> = {
    solana: "text-[#32d184] bg-[#32d184]/10 border-[#32d184]/25",
    ethereum: "text-[#5aa7ff] bg-[#5aa7ff]/10 border-[#5aa7ff]/25",
    bsc: "text-[#f5b84b] bg-[#f5b84b]/10 border-[#f5b84b]/25",
    base: "text-[#8fa0ad] bg-[#8fa0ad]/10 border-[#8fa0ad]/25",
  };
  const cls = colors[chain] ?? "text-secondary bg-raised border-border";
  return (
    <span className={`chain-badge ${cls}`}>
      {CHAIN_LABELS[chain] ?? chain.toUpperCase()}
    </span>
  );
};

const SecurityCell: React.FC<{ label: string }> = ({ label }) => {
  const map: Record<string, { text: string; cls: string }> = {
    SECURITY_PASSED:           { text: "Passed",   cls: "research-context-chip available" },
    CRITICAL_RISK:             { text: "Critical", cls: "research-context-chip critical" },
    NEEDS_MANUAL_VERIFICATION: { text: "Partial",  cls: "research-context-chip pending" },
    NOT_CHECKED:               { text: "Not checked", cls: "research-context-chip unavailable" },
  };
  const cfg = map[label] ?? { text: label, cls: "research-context-chip unavailable" };
  return <span className={cfg.cls}>{cfg.text}</span>;
};

const FilterCell: React.FC<{ status: string }> = ({ status }) => {
  const passed = status === "passed_basic_filter";
  return (
    <span className={`research-context-chip ${passed ? "available" : "critical"}`}>
      {passed ? "Pass" : "Fail"}
    </span>
  );
};

export const ScannerRadar: React.FC<Props> = ({
  candidates,
  marketContextState,
  reviewSession,
  onSaveReview,
  onClearReview,
}) => {
  const [selected, setSelected] = useState<MockCandidate | null>(candidates[0] ?? null);
  const [filter, setFilter] = useState<ScannerFilter>("ALL");

  React.useEffect(() => {
    setSelected(candidates[0] ?? null);
    setFilter("ALL");
  }, [candidates]);

  const filtered = filter === "ALL"
    ? candidates
    : filter === "FOLLOW_UP"
      ? candidates.filter((c) => getCandidateReview(c.id, reviewSession)?.status === "saved_for_follow_up")
      : candidates.filter((c) => c.final_label === filter);

  return (
    <div className="scanner-workbench">
      <section className="scanner-main">
        <div className="scanner-toolbar">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`pill ${filter === opt.value ? "pill-active" : ""}`}
            >
              {opt.label}
            </button>
          ))}
          <span className="scanner-result-count">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="card scanner-table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Market</th>
                <th>Activity</th>
                <th>Checks</th>
                <th>Review status</th>
                <th>Scanner label</th>
                <th>Reason</th>
                <th aria-label="Open details" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isActive = selected?.id === c.id;
                const reviewRecord = getCandidateReview(c.id, reviewSession);
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={`cursor-pointer ${isActive ? "row-active" : ""}`}
                  >
                    <td>
                      <div className="scanner-token">
                        <strong>{c.symbol}</strong>
                        <span>{c.name}</span>
                        <div className="chain-line">
                          <ChainBadge chain={c.chain} />
                          <span>{c.dex || "--"}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="scanner-metric-stack">
                        <div><span>Mkt cap</span><span>{fmtUsd(c.market_cap_usd)}</span></div>
                        <div><span>Liquidity</span><span>{fmtUsd(c.liquidity_usd)}</span></div>
                      </div>
                    </td>
                    <td>
                      <div className="scanner-metric-stack">
                        <div><span>24h vol</span><span>{fmtUsd(c.volume_24h_usd)}</span></div>
                        <div><span>Vol/MC</span><span>{fmtPct(c.volume_market_cap_ratio)}</span></div>
                        <div><span>Age</span><span>{c.pair_age_days === null ? "--" : `${c.pair_age_days}d`}</span></div>
                      </div>
                    </td>
                    <td>
                      <div className="scanner-check-stack">
                        <FilterCell status={c.basic_filter_status} />
                        <SecurityCell label={c.security_label} />
                      </div>
                    </td>
                    <td>
                      <ReviewStatusBadge status={reviewRecord?.status ?? "not_reviewed"} short />
                    </td>
                    <td>
                      <LabelBadge label={c.final_label} />
                    </td>
                    <td>
                      <p className="scanner-reason">{c.final_reasons[0] ? formatReasonText(c.final_reasons[0]) : "No reason available."}</p>
                    </td>
                    <td>
                      <button
                        className="details-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(c);
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <aside>
        {selected ? (
          <CandidateDetail
            candidate={selected}
            marketContextState={marketContextState}
            reviewRecord={getCandidateReview(selected.id, reviewSession)}
            onSaveReview={onSaveReview}
            onClearReview={onClearReview}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div className="card p-6 text-center text-secondary text-sm">
            Select a token to view details.
          </div>
        )}
      </aside>
    </div>
  );
};
