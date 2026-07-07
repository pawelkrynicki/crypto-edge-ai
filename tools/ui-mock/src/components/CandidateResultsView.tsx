import React from "react";
import type { FinalLabel, MockCandidate } from "../mockData";
import { getCandidateReview } from "../services/reviewSessionStore";
import type { CandidateReviewRecord, ReviewSessionState } from "../types/reviewSessionTypes";
import { formatReasonText, formatSecurityFlag } from "../utils/displayText";
import { ReviewStatusBadge } from "./CandidateReviewControls";
import { LabelBadge } from "./LabelBadge";

interface CandidateResultsViewProps {
  candidates: MockCandidate[];
  reviewSession: ReviewSessionState;
  onOpenCandidate?: (candidateId: string) => void;
}

type CandidateTone = "review" | "manual" | "critical" | "neutral";

const CHAIN_LABELS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bsc: "BSC",
  base: "BASE",
};

const PRIORITY_COPY: Record<FinalLabel, { label: string; detail: string; tone: CandidateTone }> = {
  WATCHLIST: {
    label: "Review candidate",
    detail: "watchlist candidate - manual review only",
    tone: "review",
  },
  CRITICAL_RISK: {
    label: "Risk flag priority",
    detail: "manual review before any next step",
    tone: "critical",
  },
  NEEDS_MANUAL_VERIFICATION: {
    label: "Manual verification priority",
    detail: "manual verification required",
    tone: "manual",
  },
  REJECT: {
    label: "Lower research priority",
    detail: "manual review only if scope changes",
    tone: "neutral",
  },
};

export const CandidateResultsView: React.FC<CandidateResultsViewProps> = ({
  candidates,
  reviewSession,
  onOpenCandidate,
}) => {
  const manualReviewCount = candidates.filter((candidate) => requiresManualReview(candidate)).length;
  const missingFreshnessCount = candidates.filter((candidate) => !hasKnownFreshness(candidate)).length;
  const riskFlagCount = candidates.reduce((total, candidate) => total + countRiskItems(candidate), 0);

  return (
    <div className="candidate-results-view">
      <section className="candidate-results-hero">
        <div className="candidate-results-hero-copy">
          <span className="candidate-results-eyebrow">research candidate</span>
          <h3>Candidate Results</h3>
          <p>
            Token to verify list for manual review. WATCHLIST is shown as manual review only and missing data stays unknown until checked.
          </p>
        </div>
        <div className="candidate-results-boundary">
          <strong>manual review</strong>
          <span>External check and source freshness remain human-controlled.</span>
        </div>
      </section>

      <section className="candidate-results-summary-grid" aria-label="Candidate results summary">
        <SummaryCard label="research candidate" value={String(candidates.length)} detail="tokens to verify" />
        <SummaryCard label="manual review" value={String(manualReviewCount)} detail="need review or verification" />
        <SummaryCard label="source freshness" value={missingFreshnessCount === 0 ? "known" : "unknown"} detail="unknown requires manual verification" />
        <SummaryCard label="risk flags" value={String(riskFlagCount)} detail="flags or missing checks surfaced" />
      </section>

      <section className="candidate-results-list" aria-label="research candidate list">
        {candidates.length > 0 ? candidates.map((candidate) => {
          const reviewRecord = getCandidateReview(candidate.id, reviewSession);
          const priority = getResearchPriority(candidate);
          const riskState = getRiskState(candidate);
          const sourceFreshness = getSourceFreshness(candidate);
          const nextReviewStep = getNextReviewStep(candidate, reviewRecord);

          return (
            <article key={candidate.id} className={`candidate-result-card ${priority.tone}`}>
              <header className="candidate-result-topline">
                <div className="candidate-result-token">
                  <span className="candidate-results-eyebrow">research candidate</span>
                  <strong>{candidate.symbol}</strong>
                  <span>{candidate.name || "unknown project"}</span>
                </div>
                <div className="candidate-result-badges">
                  <span className={`scanner-chain-badge ${getChainClass(candidate.chain)}`}>
                    {formatChain(candidate.chain)}
                  </span>
                  <LabelBadge label={candidate.final_label} />
                </div>
              </header>

              <div className="candidate-result-grid">
                <CandidateField
                  label="chain / network"
                  value={formatChain(candidate.chain)}
                  detail={candidate.dex || "unknown"}
                />
                <CandidateField
                  label="research priority"
                  value={priority.label}
                  detail={priority.detail}
                  tone={priority.tone}
                />
                <CandidateField
                  label="source freshness"
                  value={sourceFreshness.value}
                  detail={sourceFreshness.detail}
                  tone={sourceFreshness.tone}
                />
                <CandidateField
                  label="external check"
                  value={candidate.security ? "manual review" : "not verified"}
                  detail={candidate.security ? "review candidate risk flags" : "manual verification required"}
                  tone={candidate.security ? "neutral" : "manual"}
                />
              </div>

              <section className="candidate-result-reason">
                <span>reason on radar</span>
                <p>{getRadarReason(candidate)}</p>
              </section>

              <section className="candidate-result-risk-panel">
                <div className="candidate-result-section-title">
                  <span>risk flags</span>
                  <small>{riskState.detail}</small>
                </div>
                <div className="candidate-result-chip-list">
                  {riskState.items.map((item) => (
                    <span key={item} className={`candidate-results-chip ${riskState.tone}`}>
                      {item}
                    </span>
                  ))}
                </div>
              </section>

              <footer className="candidate-result-footer">
                <div className="candidate-result-review-state">
                  <span>manual review status</span>
                  <ReviewStatusBadge status={reviewRecord?.status ?? "not_reviewed"} />
                </div>
                <div className="candidate-result-next-step">
                  <span>next review step</span>
                  <strong>{nextReviewStep}</strong>
                </div>
                {onOpenCandidate && (
                  <button
                    type="button"
                    className="candidate-result-review-button"
                    onClick={() => onOpenCandidate(candidate.id)}
                  >
                    Open candidate detail
                  </button>
                )}
              </footer>
            </article>
          );
        }) : (
          <div className="candidate-results-empty">
            No research candidate rows available. Manual verification required before any token to verify is treated as reviewed.
          </div>
        )}
      </section>
    </div>
  );
};

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="candidate-results-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function CandidateField({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: CandidateTone;
}) {
  return (
    <div className={`candidate-result-field ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function getResearchPriority(candidate: MockCandidate): { label: string; detail: string; tone: CandidateTone } {
  return PRIORITY_COPY[candidate.final_label] ?? {
    label: "Manual review",
    detail: "unknown - manual verification required",
    tone: "manual",
  };
}

function getRadarReason(candidate: MockCandidate): string {
  const reason = candidate.final_reasons[0];

  if (!reason) {
    return "manual verification required because the radar reason is unknown.";
  }

  return formatReasonText(reason);
}

function getSourceFreshness(candidate: MockCandidate): { value: string; detail: string; tone: CandidateTone } {
  if (!candidate.source_url || !candidate.last_checked) {
    return {
      value: "unknown",
      detail: "manual verification required",
      tone: "manual",
    };
  }

  const date = new Date(candidate.last_checked);

  if (Number.isNaN(date.getTime())) {
    return {
      value: "unknown",
      detail: "manual verification required",
      tone: "manual",
    };
  }

  return {
    value: "last scanner check",
    detail: date.toISOString().slice(0, 10),
    tone: "neutral",
  };
}

function getRiskState(candidate: MockCandidate): { items: string[]; detail: string; tone: CandidateTone } {
  if (!candidate.security) {
    return {
      items: ["not verified", "manual verification required"],
      detail: "not verified",
      tone: "manual",
    };
  }

  const riskFlags = candidate.security.risk_flags.map(formatSecurityFlag);
  const missingData = candidate.security.missing_data.map((item) => `unknown: ${formatReasonText(item)}`);
  const items = [...riskFlags, ...missingData].slice(0, 4);

  if (items.length === 0) {
    return {
      items: ["unknown - manual verification required"],
      detail: "no risk flags returned",
      tone: "manual",
    };
  }

  return {
    items,
    detail: "review candidate before external check",
    tone: "neutral",
  };
}

function getNextReviewStep(candidate: MockCandidate, reviewRecord?: CandidateReviewRecord | null): string {
  if (reviewRecord?.status === "waiting_for_more_data") {
    return "wait for more data, then manual review";
  }

  if (!candidate.contract_address || !candidate.security) {
    return "manual verification required";
  }

  if (candidate.final_label === "WATCHLIST") {
    return "manual review";
  }

  if (candidate.final_label === "CRITICAL_RISK") {
    return "review candidate risk flags";
  }

  if (candidate.final_label === "NEEDS_MANUAL_VERIFICATION") {
    return "manual verification required";
  }

  return "manual review only if revisited";
}

function requiresManualReview(candidate: MockCandidate): boolean {
  return candidate.final_label !== "REJECT" || !candidate.security || !candidate.contract_address;
}

function hasKnownFreshness(candidate: MockCandidate): boolean {
  if (!candidate.source_url || !candidate.last_checked) return false;
  return !Number.isNaN(new Date(candidate.last_checked).getTime());
}

function countRiskItems(candidate: MockCandidate): number {
  if (!candidate.security) return 1;
  return Math.max(1, candidate.security.risk_flags.length + candidate.security.missing_data.length);
}

function formatChain(chain: string): string {
  if (!chain) return "unknown";
  return CHAIN_LABELS[chain] ?? chain.toUpperCase();
}

function getChainClass(chain: string): string {
  if (chain === "solana" || chain === "ethereum" || chain === "bsc" || chain === "base") {
    return chain;
  }

  return "unknown";
}
