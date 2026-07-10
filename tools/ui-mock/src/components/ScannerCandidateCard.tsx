import React from "react";
import type { MockCandidate } from "../mockData";
import type { CandidateReviewRecord } from "../types/reviewSessionTypes";
import { formatReasonText } from "../utils/displayText";
import { ReviewStatusBadge } from "./CandidateReviewControls";
import { LabelBadge } from "./LabelBadge";

interface ScannerCandidateCardProps {
  candidate: MockCandidate;
  selected: boolean;
  reviewRecord?: CandidateReviewRecord | null;
  onSelect: () => void;
}

const CHAIN_LABELS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bsc: "BSC",
  base: "BASE",
};

const SECURITY_LABELS: Record<string, { text: string; cls: string }> = {
  SECURITY_PASSED: {
    text: "Security data present",
    cls: "research-context-chip available",
  },
  CRITICAL_RISK: {
    text: "Critical security",
    cls: "research-context-chip critical",
  },
  NEEDS_MANUAL_VERIFICATION: {
    text: "Manual Verification Required",
    cls: "research-context-chip pending",
  },
  NOT_CHECKED: {
    text: "Security Not Verified",
    cls: "research-context-chip unavailable",
  },
};

function fmtUsd(n: number | null): string {
  if (n === null) return "--";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtAge(n: number | null): string {
  return n === null ? "--" : `${n}d`;
}

function getChainClass(chain: string): string {
  if (chain === "solana" || chain === "ethereum" || chain === "bsc" || chain === "base") {
    return chain;
  }

  return "unknown";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="scanner-card-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SecurityBadge({ label }: { label: string }) {
  const cfg = SECURITY_LABELS[label] ?? {
    text: label,
    cls: "research-context-chip unavailable",
  };

  return <span className={cfg.cls}>{cfg.text}</span>;
}

export const ScannerCandidateCard: React.FC<ScannerCandidateCardProps> = ({
  candidate,
  selected,
  reviewRecord,
  onSelect,
}) => {
  const firstReason = candidate.final_reasons[0]
    ? formatReasonText(candidate.final_reasons[0])
    : "No source reason available.";

  return (
    <button
      type="button"
      className={`scanner-candidate-card ${selected ? "selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="scanner-card-topline">
        <span className="scanner-card-token">
          <strong>{candidate.symbol}</strong>
          <span>{candidate.name}</span>
        </span>
        <span className="scanner-card-badges">
          {selected && <span className="scanner-card-selected-indicator">Selected</span>}
          <LabelBadge label={candidate.final_label} />
          <ReviewStatusBadge status={reviewRecord?.status ?? "not_reviewed"} short />
        </span>
      </span>

      <span className="scanner-card-meta">
        <span className={`scanner-chain-badge ${getChainClass(candidate.chain)}`}>
          {CHAIN_LABELS[candidate.chain] ?? candidate.chain.toUpperCase()}
        </span>
        <span>{candidate.dex || "--"}</span>
        <SecurityBadge label={candidate.security_label} />
      </span>

      <span className="scanner-card-metrics">
        <Metric label="Market cap" value={fmtUsd(candidate.market_cap_usd)} />
        <Metric label="Liquidity" value={fmtUsd(candidate.liquidity_usd)} />
        <Metric label="24h volume" value={fmtUsd(candidate.volume_24h_usd)} />
        <Metric label="Age" value={fmtAge(candidate.pair_age_days)} />
      </span>

      <span className="scanner-card-reason">{firstReason}</span>
      <span className="scanner-card-action">Open Candidate Detail</span>
    </button>
  );
};
