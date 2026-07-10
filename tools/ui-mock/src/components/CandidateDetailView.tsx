import React from "react";
import type { FinalLabel, MockCandidate } from "../mockData";
import type { CandidateReviewRecord } from "../types/reviewSessionTypes";
import { formatReasonText, formatSecurityFlag } from "../utils/displayText";
import { ReviewStatusBadge } from "./CandidateReviewControls";
import {
  ManualVerificationFallback,
  buildCandidateVerificationGaps,
} from "./ManualVerificationFallback";
import { ResearchActionPanel } from "./ResearchActionPanel";

interface CandidateDetailViewProps {
  candidate: MockCandidate | null;
  reviewRecord?: CandidateReviewRecord | null;
  onBackToResults?: () => void;
  onOpenTokenLookup?: (candidate: MockCandidate) => void;
  onOpenExternalChecks?: (candidate: MockCandidate) => void;
}

type DetailTone = "neutral" | "manual" | "risk";

const PRIORITY_COPY: Record<FinalLabel, { label: string; detail: string; tone: DetailTone }> = {
  WATCHLIST: {
    label: "Watchlist candidate",
    detail: "WATCHLIST is manual review only",
    tone: "manual",
  },
  CRITICAL_RISK: {
    label: "Risk flag priority",
    detail: "manual review required before any next review step",
    tone: "risk",
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

export const CandidateDetailView: React.FC<CandidateDetailViewProps> = ({
  candidate,
  reviewRecord,
  onBackToResults,
  onOpenTokenLookup,
  onOpenExternalChecks,
}) => {
  if (!candidate) {
    return (
      <div className="candidate-detail-view">
        <section className="candidate-detail-empty">
          <span className="candidate-detail-eyebrow">candidate detail</span>
          <h3>No research candidate selected</h3>
          <p>manual verification required before any token to verify is treated as reviewed.</p>
          {onBackToResults && (
            <button type="button" className="candidate-detail-secondary-button" onClick={onBackToResults}>
              Back to candidate results
            </button>
          )}
        </section>
      </div>
    );
  }

  const priority = getResearchPriority(candidate);
  const sourceFreshness = getSourceFreshness(candidate);
  const contractState = getContractState(candidate);
  const chainState = getChainState(candidate);
  const securityNotes = getSecurityNotes(candidate);
  const liquidityContext = getLiquidityContext(candidate);
  const riskFlags = getRiskFlags(candidate);
  const openQuestions = getOpenQuestions(candidate);
  const nextReviewStep = getNextReviewStep(candidate, reviewRecord);

  return (
    <div className="candidate-detail-view">
      <section className="candidate-detail-hero">
        <div className="candidate-detail-hero-copy">
          <span className="candidate-detail-eyebrow">candidate detail</span>
          <h3>{candidate.name || "unknown project"}</h3>
          <div className="candidate-detail-token-line">
            <strong>{candidate.symbol || "unknown"}</strong>
            <span>{chainState.value}</span>
            <span>{priority.label}</span>
          </div>
          <p>{getCandidateSummary(candidate)}</p>
        </div>
        <div className="candidate-detail-boundary">
          <strong>WATCHLIST</strong>
          <span>manual review only</span>
        </div>
      </section>

      <section className="candidate-detail-grid" aria-label="candidate detail snapshot">
        <DetailMetric label="symbol" value={candidate.symbol || "unknown"} detail="token to verify" />
        <DetailMetric label="chain / network" value={chainState.value} detail={chainState.detail} tone={chainState.tone} />
        <DetailMetric label="contract address" value={contractState.value} detail={contractState.detail} tone={contractState.tone} />
        <DetailMetric label="research priority" value={priority.label} detail={priority.detail} tone={priority.tone} />
      </section>

      <section className="candidate-detail-main-grid">
        <article className="candidate-detail-section">
          <SectionTitle label="reason on radar" />
          <p>{getRadarReason(candidate)}</p>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="candidate summary" />
          <p>{getCandidateSummary(candidate)}</p>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="source freshness" meta={sourceFreshness.value} tone={sourceFreshness.tone} />
          <p>{sourceFreshness.detail}</p>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="source coverage" />
          <div className="candidate-detail-chip-list">
            {getSourceCoverage(candidate).map((item) => (
              <span key={item.text} className={`candidate-detail-chip ${item.tone}`}>
                {item.text}
              </span>
            ))}
          </div>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="risk flags" meta={riskFlags.meta} tone={riskFlags.tone} />
          <div className="candidate-detail-chip-list">
            {riskFlags.items.map((item) => (
              <span key={item} className={`candidate-detail-chip ${riskFlags.tone}`}>
                {item}
              </span>
            ))}
          </div>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="security notes" meta={securityNotes.value} tone={securityNotes.tone} />
          <p>{securityNotes.detail}</p>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="liquidity / market context" meta={liquidityContext.value} tone={liquidityContext.tone} />
          <p>{liquidityContext.detail}</p>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="open questions" />
          <ul className="candidate-detail-question-list">
            {openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </article>
      </section>

      <ManualVerificationFallback
        title="Manual verification fallback"
        gaps={buildCandidateVerificationGaps(candidate)}
      />

      <ResearchActionPanel
        candidate={candidate}
        onOpenTokenLookup={onOpenTokenLookup ? () => onOpenTokenLookup(candidate) : undefined}
        onOpenExternalChecks={onOpenExternalChecks ? () => onOpenExternalChecks(candidate) : undefined}
      />

      <section className="candidate-detail-review-panel">
        <div>
          <span className="candidate-detail-eyebrow">manual review</span>
          <h3>Next review step</h3>
          <p>{nextReviewStep}</p>
        </div>
        <div className="candidate-detail-review-status">
          <span>manual review status</span>
          <ReviewStatusBadge status={reviewRecord?.status ?? "not_reviewed"} />
        </div>
        {onBackToResults && (
          <button type="button" className="candidate-detail-secondary-button" onClick={onBackToResults}>
            Back to candidate results
          </button>
        )}
        {onOpenTokenLookup && (
          <button type="button" className="candidate-detail-secondary-button" onClick={() => onOpenTokenLookup(candidate)}>
            Open token lookup
          </button>
        )}
        {onOpenExternalChecks && (
          <button type="button" className="candidate-detail-secondary-button" onClick={() => onOpenExternalChecks(candidate)}>
            Open external checks
          </button>
        )}
      </section>
    </div>
  );
};

function DetailMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: DetailTone;
}) {
  return (
    <div className={`candidate-detail-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function SectionTitle({
  label,
  meta,
  tone = "neutral",
}: {
  label: string;
  meta?: string;
  tone?: DetailTone;
}) {
  return (
    <div className="candidate-detail-section-title">
      <span>{label}</span>
      {meta && <small className={tone}>{meta}</small>}
    </div>
  );
}

function getResearchPriority(candidate: MockCandidate): { label: string; detail: string; tone: DetailTone } {
  return PRIORITY_COPY[candidate.final_label] ?? {
    label: "Manual review",
    detail: "unknown - manual verification required",
    tone: "manual",
  };
}

function getRadarReason(candidate: MockCandidate): string {
  const reason = candidate.final_reasons[0];
  if (!reason) return "manual verification required because the reason on radar is unknown.";
  return formatReasonText(reason);
}

function getCandidateSummary(candidate: MockCandidate): string {
  const projectName = candidate.name || candidate.symbol || "This token to verify";
  if (candidate.final_label === "WATCHLIST") {
    return `${projectName} is a watchlist candidate from the current research candidate set. WATCHLIST is manual review only.`;
  }

  if (candidate.final_label === "CRITICAL_RISK") {
    return `${projectName} is a research candidate with risk flags that require manual review.`;
  }

  if (candidate.final_label === "NEEDS_MANUAL_VERIFICATION") {
    return `${projectName} is a token to verify with manual verification required.`;
  }

  return `${projectName} is a research candidate kept for context, with manual review only if scope changes.`;
}

function getSourceFreshness(candidate: MockCandidate): { value: string; detail: string; tone: DetailTone } {
  if (!candidate.last_checked || Number.isNaN(new Date(candidate.last_checked).getTime())) {
    return {
      value: "source freshness unknown",
      detail: "source freshness unknown - manual verification required",
      tone: "manual",
    };
  }

  return {
    value: "last scanner check",
    detail: `last checked ${new Date(candidate.last_checked).toISOString().slice(0, 10)}; source freshness still requires manual review`,
    tone: "neutral",
  };
}

function getContractState(candidate: MockCandidate): { value: string; detail: string; tone: DetailTone } {
  const contract = candidate.contract_address.trim();
  if (!contract) {
    return {
      value: "contract required",
      detail: "contract required for external/security checks",
      tone: "manual",
    };
  }

  return {
    value: contract,
    detail: "not verified - manual verification required",
    tone: "manual",
  };
}

function getChainState(candidate: MockCandidate): { value: string; detail: string; tone: DetailTone } {
  if (!candidate.chain.trim()) {
    return {
      value: "chain unknown",
      detail: "chain unknown / verify manually",
      tone: "manual",
    };
  }

  return {
    value: candidate.chain.toUpperCase(),
    detail: candidate.dex ? `${candidate.dex} context, not verified` : "network context not verified",
    tone: "neutral",
  };
}

function getSourceCoverage(candidate: MockCandidate): Array<{ text: string; tone: DetailTone }> {
  return [
    {
      text: "scanner candidate snapshot",
      tone: "neutral",
    },
    {
      text: candidate.source_url ? "source reference present - external check still manual" : "source reference unknown",
      tone: candidate.source_url ? "neutral" : "manual",
    },
    {
      text: candidate.security ? "security data present - not verified" : "security not verified",
      tone: "manual",
    },
    {
      text: candidate.liquidity_usd === null ? "liquidity unknown" : "liquidity context not verified",
      tone: candidate.liquidity_usd === null ? "manual" : "neutral",
    },
  ];
}

function getRiskFlags(candidate: MockCandidate): { items: string[]; meta: string; tone: DetailTone } {
  if (!candidate.security) {
    return {
      items: ["security not verified", "manual verification required", "cannot infer safety"],
      meta: "not verified",
      tone: "manual",
    };
  }

  const riskFlags = candidate.security.risk_flags.map(formatSecurityFlag);
  const missingData = candidate.security.missing_data.map((item) => `unknown: ${formatSecurityFlag(item)}`);
  const items = [...riskFlags, ...missingData];

  if (items.length === 0) {
    return {
      items: ["unknown - manual verification required"],
      meta: "unknown",
      tone: "manual",
    };
  }

  return {
    items,
    meta: "manual review",
    tone: "manual",
  };
}

function getSecurityNotes(candidate: MockCandidate): { value: string; detail: string; tone: DetailTone } {
  if (!candidate.security) {
    return {
      value: "security not verified",
      detail: "security not verified - manual verification required before external/security checks are treated as complete",
      tone: "manual",
    };
  }

  if (candidate.security.contract_verified === false) {
    return {
      value: "not verified",
      detail: "contract state is not verified and must remain in manual review",
      tone: "manual",
    };
  }

  if (candidate.security.missing_data.length > 0) {
    return {
      value: "manual verification required",
      detail: "security data has unknown fields; missing data cannot be treated as a positive security status",
      tone: "manual",
    };
  }

  return {
    value: "not verified",
    detail: "security data is present, but this candidate still requires manual review",
    tone: "manual",
  };
}

function getLiquidityContext(candidate: MockCandidate): { value: string; detail: string; tone: DetailTone } {
  if (candidate.liquidity_usd === null || candidate.volume_24h_usd === null || candidate.market_cap_usd === null) {
    return {
      value: "liquidity unknown",
      detail: "liquidity unknown / market context not verified",
      tone: "manual",
    };
  }

  return {
    value: "not verified",
    detail: `liquidity ${formatUsd(candidate.liquidity_usd)}, 24h volume ${formatUsd(candidate.volume_24h_usd)}, market context still requires manual review`,
    tone: "neutral",
  };
}

function getOpenQuestions(candidate: MockCandidate): string[] {
  const questions = [
    "Confirm project identity and source freshness.",
    "Check whether security notes are complete enough for manual review.",
  ];

  if (!candidate.contract_address.trim()) {
    questions.push("Add contract address before external/security checks.");
  }

  if (!candidate.chain.trim()) {
    questions.push("Verify chain / network manually.");
  }

  if (!candidate.security) {
    questions.push("Security not verified.");
  }

  if (candidate.liquidity_usd === null) {
    questions.push("Liquidity unknown.");
  }

  return questions;
}

function getNextReviewStep(candidate: MockCandidate, reviewRecord?: CandidateReviewRecord | null): string {
  if (reviewRecord?.status === "waiting_for_more_data") {
    return "Wait for more data, then continue manual review.";
  }

  if (!candidate.contract_address.trim()) {
    return "Add contract address before external/security checks.";
  }

  if (!candidate.chain.trim()) {
    return "Verify chain / network manually.";
  }

  if (!candidate.security) {
    return "Manual verification required: security not verified.";
  }

  if (candidate.final_label === "WATCHLIST") {
    return "Review candidate manually; WATCHLIST is manual review only.";
  }

  if (candidate.final_label === "CRITICAL_RISK") {
    return "Review candidate risk flags manually before any follow-up.";
  }

  if (candidate.final_label === "NEEDS_MANUAL_VERIFICATION") {
    return "Complete manual verification for unknown fields.";
  }

  return "Manual review only if this candidate returns to scope.";
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
