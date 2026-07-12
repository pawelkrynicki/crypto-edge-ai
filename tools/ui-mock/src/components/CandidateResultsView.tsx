import React from "react";
import type { FinalLabel, MockCandidate } from "../mockData";
import { getCandidateReview } from "../services/reviewSessionStore";
import type { CandidateReviewRecord, ReviewSessionState } from "../types/reviewSessionTypes";
import { formatReasonText, formatSecurityFlag } from "../utils/displayText";
import { ReviewStatusBadge } from "./CandidateReviewControls";
import { LabelBadge } from "./LabelBadge";
import {
  ManualVerificationFallback,
  buildCandidateVerificationGaps,
} from "./ManualVerificationFallback";
import { ProductStateNotice, type ProductStateNoticeItem } from "./ProductStateNotice";
import { ResearchActionPanel } from "./ResearchActionPanel";

interface CandidateResultsViewProps {
  candidates: MockCandidate[];
  reviewSession: ReviewSessionState;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenTokenLookup?: (candidate: MockCandidate) => void;
  onOpenExternalChecks?: (candidate: MockCandidate) => void;
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
    label: "Watchlist Candidate",
    detail: "Watchlist Candidate - Manual Review Only",
    tone: "review",
  },
  CRITICAL_RISK: {
    label: "Risk Flags Priority",
    detail: "Manual Review before any Next Review Step",
    tone: "critical",
  },
  NEEDS_MANUAL_VERIFICATION: {
    label: "Manual Verification Required",
    detail: "Manual Verification Required",
    tone: "manual",
  },
  REJECT: {
    label: "Lower Research Priority",
    detail: "Manual Review only if scope changes",
    tone: "neutral",
  },
};

export const CandidateResultsView: React.FC<CandidateResultsViewProps> = ({
  candidates,
  reviewSession,
  onOpenCandidate,
  onOpenTokenLookup,
  onOpenExternalChecks,
}) => {
  const manualReviewCount = candidates.filter((candidate) => requiresManualReview(candidate)).length;
  const missingFreshnessCount = candidates.filter((candidate) => !hasKnownFreshness(candidate)).length;
  const riskFlagCount = candidates.reduce((total, candidate) => total + countRiskItems(candidate), 0);

  return (
    <div className="candidate-results-view">
      <section className="candidate-results-hero">
        <div className="candidate-results-hero-copy">
          <span className="candidate-results-eyebrow">Research Candidate</span>
          <h3>Candidate Results</h3>
          <p>
            Token to verify list for Manual Review. WATCHLIST is shown as Manual Review Only and missing data stays a Data Gap until checked.
          </p>
        </div>
        <div className="candidate-results-boundary">
          <strong>Manual Review</strong>
          <span>External Checks and Source Freshness remain human-controlled.</span>
        </div>
      </section>

      <section className="candidate-results-summary-grid" aria-label="Candidate Results summary">
        <SummaryCard label="Research Candidate" value={String(candidates.length)} detail="Tokens to Verify" />
        <SummaryCard label="Manual Review" value={String(manualReviewCount)} detail="Need review or verification" />
        <SummaryCard label="Source Freshness" value={missingFreshnessCount === 0 ? "Not Verified" : "Source Freshness Unknown"} detail="Manual Verification Required" />
        <SummaryCard label="Risk Flags" value={String(riskFlagCount)} detail="Flags or missing checks surfaced" />
      </section>

      {candidates.length > 0 && (
        <ProductStateNotice
          variant="partial"
          title="Partial Source Coverage"
          status="Partial Source Coverage"
          detail="Data Gap: Source Freshness unknown, security not verified, liquidity unknown, and External Check Required states remain Manual Review Only until a human verifies them."
          nextReviewStep="Open Candidate Detail, then keep Manual Verification Required for every Not Verified field"
          items={buildCandidateResultsStateItems(missingFreshnessCount, riskFlagCount)}
        />
      )}

      <section className="candidate-results-list" aria-label="Research Candidate list">
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
                  <span className="candidate-results-eyebrow">Research Candidate</span>
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
                  label="Chain / Network"
                  value={formatChain(candidate.chain)}
                  detail={candidate.dex || "unknown"}
                />
                <CandidateField
                  label="Research Priority"
                  value={priority.label}
                  detail={priority.detail}
                  tone={priority.tone}
                />
                <CandidateField
                  label="Source Freshness"
                  value={sourceFreshness.value}
                  detail={sourceFreshness.detail}
                  tone={sourceFreshness.tone}
                />
                <CandidateField
                  label="External Check"
                  value={candidate.security ? "External Check Required" : "Security Not Verified"}
                  detail={candidate.security ? "Manual Review Only" : "Cannot Infer Safety"}
                  tone="manual"
                />
              </div>

              <section className="candidate-result-reason">
                <span>Research Reason</span>
                <p>{getRadarReason(candidate)}</p>
              </section>

              <section className="candidate-result-risk-panel">
                <div className="candidate-result-section-title">
                  <span>Risk Flags</span>
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

              <ManualVerificationFallback
                compact
                title="Manual Verification Required"
                gaps={buildCandidateVerificationGaps(candidate)}
              />

              <ResearchActionPanel
                variant="compact"
                candidate={candidate}
                onOpenCandidateDetail={onOpenCandidate ? () => onOpenCandidate(candidate.id) : undefined}
                onOpenTokenLookup={onOpenTokenLookup ? () => onOpenTokenLookup(candidate) : undefined}
                onOpenExternalChecks={onOpenExternalChecks ? () => onOpenExternalChecks(candidate) : undefined}
              />

              <footer className="candidate-result-footer">
                <div className="candidate-result-review-state">
                  <span>Manual Review Status</span>
                  <ReviewStatusBadge status={reviewRecord?.status ?? "not_reviewed"} />
                </div>
                <div className="candidate-result-next-step">
                  <span>Next Review Step</span>
                  <strong>{nextReviewStep}</strong>
                </div>
                {onOpenCandidate && (
                  <button
                    type="button"
                    className="candidate-result-review-button"
                    onClick={() => onOpenCandidate(candidate.id)}
                  >
                    Open Candidate Detail
                  </button>
                )}
              </footer>
            </article>
          );
        }) : (
          <ProductStateNotice
            variant="empty"
            title="No Candidates Found"
            status="No Candidates Found"
            detail="Data Gap: no Research Candidate rows are present, so the UI Cannot Infer Safety and cannot mark anything as reviewed."
            nextReviewStep="Confirm Source Freshness, then continue Manual Review Only when candidates exist"
            items={[
              { label: "Source Coverage", value: "Partial Source Coverage", detail: "Source Freshness Unknown" },
              { label: "Contract", value: "Contract Required", detail: "Chain Unknown / External Check Required" },
              { label: "Security", value: "Security Not Verified", detail: "Liquidity Unknown" },
            ]}
          />
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
    label: "Manual Review",
    detail: "Unknown - Manual Verification Required",
    tone: "manual",
  };
}

function getRadarReason(candidate: MockCandidate): string {
  const reason = candidate.final_reasons[0];

  if (!reason) {
    return "Manual Verification Required because the Research Reason is unknown.";
  }

  return formatReasonText(reason);
}

function getSourceFreshness(candidate: MockCandidate): { value: string; detail: string; tone: CandidateTone } {
  if (!candidate.source_url || !candidate.last_checked) {
    return {
      value: "Source Freshness Unknown",
      detail: "Manual Verification Required",
      tone: "manual",
    };
  }

  const date = new Date(candidate.last_checked);

  if (Number.isNaN(date.getTime())) {
    return {
      value: "Source Freshness Unknown",
      detail: "Manual Verification Required",
      tone: "manual",
    };
  }

  return {
    value: "Last Local Check",
    detail: date.toISOString().slice(0, 10),
    tone: "neutral",
  };
}

function getRiskState(candidate: MockCandidate): { items: string[]; detail: string; tone: CandidateTone } {
  if (!candidate.security) {
    return {
      items: ["Security Not Verified", "Manual Verification Required", "Cannot Infer Safety"],
      detail: "Not Verified",
      tone: "manual",
    };
  }

  const riskFlags = candidate.security.risk_flags.map(formatSecurityFlag);
  const missingData = candidate.security.missing_data.map((item) => `unknown: ${formatReasonText(item)}`);
  const items = [...riskFlags, ...missingData].slice(0, 4);

  if (items.length === 0) {
    return {
      items: ["Risk Flags Not Verified"],
      detail: "Manual Verification Required",
      tone: "manual",
    };
  }

  return {
    items,
    detail: "Review Candidate before External Checks",
    tone: "neutral",
  };
}

function getNextReviewStep(candidate: MockCandidate, reviewRecord?: CandidateReviewRecord | null): string {
  if (reviewRecord?.status === "waiting_for_more_data") {
    return "Wait for more data, then Manual Review";
  }

  if (!candidate.contract_address || !candidate.security) {
    return "Manual Verification Required";
  }

  if (candidate.final_label === "WATCHLIST") {
    return "Manual Review";
  }

  if (candidate.final_label === "CRITICAL_RISK") {
    return "Review Candidate Risk Flags";
  }

  if (candidate.final_label === "NEEDS_MANUAL_VERIFICATION") {
    return "Manual Verification Required";
  }

  return "Manual Review Only if revisited";
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

function buildCandidateResultsStateItems(missingFreshnessCount: number, riskFlagCount: number): ProductStateNoticeItem[] {
  return [
    {
      label: "Source Freshness",
      value: missingFreshnessCount > 0 ? "Source Freshness Unknown" : "Not Verified",
      detail: "Manual Verification Required",
    },
    {
      label: "External Check",
      value: "External Check Required",
      detail: "Manual Review Only",
    },
    {
      label: "Risk Flags",
      value: riskFlagCount > 0 ? "Security Not Verified" : "Cannot Infer Safety",
      detail: "Missing data stays a Data Gap",
    },
    {
      label: "Market Context",
      value: "Liquidity Unknown",
      detail: "Not Verified",
    },
  ];
}

function formatChain(chain: string): string {
  if (!chain) return "chain unknown";
  return CHAIN_LABELS[chain] ?? chain.toUpperCase();
}

function getChainClass(chain: string): string {
  if (chain === "solana" || chain === "ethereum" || chain === "bsc" || chain === "base") {
    return chain;
  }

  return "unknown";
}
