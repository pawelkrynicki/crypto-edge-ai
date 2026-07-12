import React from "react";
import type { FinalLabel, MockCandidate } from "../mockData";
import type { CandidateReviewRecord } from "../types/reviewSessionTypes";
import { formatReasonText, formatSecurityFlag } from "../utils/displayText";
import { ReviewStatusBadge } from "./CandidateReviewControls";
import {
  ManualVerificationFallback,
  buildCandidateVerificationGaps,
} from "./ManualVerificationFallback";
import { ProductStateNotice, type ProductStateNoticeItem } from "./ProductStateNotice";
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
    label: "Watchlist Candidate",
    detail: "WATCHLIST is Manual Review Only",
    tone: "manual",
  },
  CRITICAL_RISK: {
    label: "Risk Flags Priority",
    detail: "Manual Review required before any Next Review Step",
    tone: "risk",
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
          <span className="candidate-detail-eyebrow">Candidate Detail</span>
          <h3>No research candidate selected</h3>
          <p>Manual Verification Required before any token to verify is treated as reviewed.</p>
          {onBackToResults && (
            <button type="button" className="candidate-detail-secondary-button" onClick={onBackToResults}>
              Back to Candidate Results
            </button>
          )}
        </section>
        <ProductStateNotice
          variant="empty"
          title="No Candidates Found"
          status="No Candidates Found"
          detail="Data Gap: Candidate Detail has no selected Research Candidate, so Source Freshness Unknown and Cannot Infer Safety remain visible."
          nextReviewStep="Return to Candidate Results and select a candidate for Manual Review Only"
          items={[
            { label: "Source Coverage", value: "Partial Source Coverage", detail: "Not Verified" },
            { label: "Contract", value: "Contract Required", detail: "Chain Unknown" },
            { label: "External Check", value: "External Check Required", detail: "Manual Verification Required" },
          ]}
        />
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
          <span className="candidate-detail-eyebrow">Candidate Detail</span>
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
          <span>Manual Review Only</span>
        </div>
      </section>

      <section className="candidate-detail-grid" aria-label="Candidate Detail snapshot">
        <DetailMetric label="Symbol" value={candidate.symbol || "unknown"} detail="Token to Verify" />
        <DetailMetric label="Chain / Network" value={chainState.value} detail={chainState.detail} tone={chainState.tone} />
        <DetailMetric label="Contract Address" value={contractState.value} detail={contractState.detail} tone={contractState.tone} />
        <DetailMetric label="Research Priority" value={priority.label} detail={priority.detail} tone={priority.tone} />
      </section>

      <ProductStateNotice
        variant="partial"
        title="Partial Source Coverage"
        status={sourceFreshness.value === "Source Freshness Unknown" ? "Source Freshness Unknown" : "Partial Source Coverage"}
        detail="Data Gap: Candidate Detail can show local candidate context, but Security Not Verified, Liquidity Unknown, and Source Freshness Unknown fields stay Not Verified until manual checks are complete."
        nextReviewStep={nextReviewStep}
        items={buildDetailStateItems(candidate, sourceFreshness, securityNotes, liquidityContext)}
      />

      <section className="candidate-detail-main-grid">
        <article className="candidate-detail-section">
          <SectionTitle label="Research Reason" />
          <p>{getRadarReason(candidate)}</p>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="Candidate Summary" />
          <p>{getCandidateSummary(candidate)}</p>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="Source Freshness" meta={sourceFreshness.value} tone={sourceFreshness.tone} />
          <p>{sourceFreshness.detail}</p>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="Source Coverage" />
          <div className="candidate-detail-chip-list">
            {getSourceCoverage(candidate).map((item) => (
              <span key={item.text} className={`candidate-detail-chip ${item.tone}`}>
                {item.text}
              </span>
            ))}
          </div>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="Risk Flags" meta={riskFlags.meta} tone={riskFlags.tone} />
          <div className="candidate-detail-chip-list">
            {riskFlags.items.map((item) => (
              <span key={item} className={`candidate-detail-chip ${riskFlags.tone}`}>
                {item}
              </span>
            ))}
          </div>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="Security Notes" meta={securityNotes.value} tone={securityNotes.tone} />
          <p>{securityNotes.detail}</p>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="Liquidity / Market Context" meta={liquidityContext.value} tone={liquidityContext.tone} />
          <p>{liquidityContext.detail}</p>
        </article>

        <article className="candidate-detail-section">
          <SectionTitle label="Open Questions" />
          <ul className="candidate-detail-question-list">
            {openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </article>
      </section>

      <ManualVerificationFallback
        title="Manual Verification Required"
        gaps={buildCandidateVerificationGaps(candidate)}
      />

      <ResearchActionPanel
        candidate={candidate}
        onOpenTokenLookup={onOpenTokenLookup ? () => onOpenTokenLookup(candidate) : undefined}
        onOpenExternalChecks={onOpenExternalChecks ? () => onOpenExternalChecks(candidate) : undefined}
      />

      <section className="candidate-detail-review-panel">
        <div>
          <span className="candidate-detail-eyebrow">Manual Review</span>
          <h3>Next Review Step</h3>
          <p>{nextReviewStep}</p>
        </div>
        <div className="candidate-detail-review-status">
          <span>Manual Review Status</span>
          <ReviewStatusBadge status={reviewRecord?.status ?? "not_reviewed"} />
        </div>
        {onBackToResults && (
          <button type="button" className="candidate-detail-secondary-button" onClick={onBackToResults}>
            Back to Candidate Results
          </button>
        )}
        {onOpenTokenLookup && (
          <button type="button" className="candidate-detail-secondary-button" onClick={() => onOpenTokenLookup(candidate)}>
            Open Token Lookup
          </button>
        )}
        {onOpenExternalChecks && (
          <button type="button" className="candidate-detail-secondary-button" onClick={() => onOpenExternalChecks(candidate)}>
            Open External Checks
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
    label: "Manual Review",
    detail: "Unknown - Manual Verification Required",
    tone: "manual",
  };
}

function getRadarReason(candidate: MockCandidate): string {
  const reason = candidate.final_reasons[0];
  if (!reason) return "Manual Verification Required because the Research Reason is unknown.";
  return formatReasonText(reason);
}

function getCandidateSummary(candidate: MockCandidate): string {
  const projectName = candidate.name || candidate.symbol || "This token to verify";
  if (candidate.final_label === "WATCHLIST") {
    return `${projectName} is a Watchlist Candidate from the current Research Candidate set. WATCHLIST is Manual Review Only.`;
  }

  if (candidate.final_label === "CRITICAL_RISK") {
    return `${projectName} is a Research Candidate with Risk Flags that require Manual Review.`;
  }

  if (candidate.final_label === "NEEDS_MANUAL_VERIFICATION") {
    return `${projectName} is a Token to Verify with Manual Verification Required.`;
  }

  return `${projectName} is a Research Candidate kept for context, with Manual Review Only if scope changes.`;
}

function getSourceFreshness(candidate: MockCandidate): { value: string; detail: string; tone: DetailTone } {
  if (!candidate.last_checked || Number.isNaN(new Date(candidate.last_checked).getTime())) {
    return {
      value: "Source Freshness Unknown",
      detail: "Source Freshness Unknown - Manual Verification Required",
      tone: "manual",
    };
  }

  return {
    value: "Last Local Check",
    detail: `Last checked ${new Date(candidate.last_checked).toISOString().slice(0, 10)}; Source Freshness still requires Manual Review`,
    tone: "neutral",
  };
}

function getContractState(candidate: MockCandidate): { value: string; detail: string; tone: DetailTone } {
  const contract = candidate.contract_address.trim();
  if (!contract) {
    return {
      value: "Contract Required",
      detail: "Contract Required for External Checks and security checks",
      tone: "manual",
    };
  }

  return {
    value: contract,
    detail: "Not Verified - Manual Verification Required",
    tone: "manual",
  };
}

function getChainState(candidate: MockCandidate): { value: string; detail: string; tone: DetailTone } {
  if (!candidate.chain.trim()) {
    return {
      value: "Chain Unknown",
      detail: "Chain Unknown / verify manually",
      tone: "manual",
    };
  }

  return {
    value: candidate.chain.toUpperCase(),
    detail: candidate.dex ? `${candidate.dex} context, Not Verified` : "Network context Not Verified",
    tone: "neutral",
  };
}

function getSourceCoverage(candidate: MockCandidate): Array<{ text: string; tone: DetailTone }> {
  return [
    {
      text: "Candidate Snapshot",
      tone: "neutral",
    },
    {
      text: candidate.source_url ? "Source reference present - External Checks still manual" : "Source reference unknown",
      tone: candidate.source_url ? "neutral" : "manual",
    },
    {
      text: candidate.security ? "Security data present - Not Verified" : "Security Not Verified",
      tone: "manual",
    },
    {
      text: candidate.liquidity_usd === null ? "Liquidity Unknown" : "Liquidity context Not Verified",
      tone: candidate.liquidity_usd === null ? "manual" : "neutral",
    },
  ];
}

function getRiskFlags(candidate: MockCandidate): { items: string[]; meta: string; tone: DetailTone } {
  if (!candidate.security) {
    return {
      items: ["Security Not Verified", "Manual Verification Required", "Cannot Infer Safety"],
      meta: "Not Verified",
      tone: "manual",
    };
  }

  const riskFlags = candidate.security.risk_flags.map(formatSecurityFlag);
  const missingData = candidate.security.missing_data.map((item) => `unknown: ${formatSecurityFlag(item)}`);
  const items = [...riskFlags, ...missingData];

  if (items.length === 0) {
    return {
      items: ["Risk Flags Not Verified"],
      meta: "Manual Verification Required",
      tone: "manual",
    };
  }

  return {
    items,
    meta: "Manual Review",
    tone: "manual",
  };
}

function getSecurityNotes(candidate: MockCandidate): { value: string; detail: string; tone: DetailTone } {
  if (!candidate.security) {
    return {
      value: "Security Not Verified",
      detail: "Security Not Verified - Manual Verification Required before External Checks or security checks are treated as complete",
      tone: "manual",
    };
  }

  if (candidate.security.contract_verified === false) {
    return {
      value: "Not Verified",
      detail: "Contract state is Not Verified and must remain in Manual Review",
      tone: "manual",
    };
  }

  if (candidate.security.missing_data.length > 0) {
    return {
      value: "Manual Verification Required",
      detail: "Security data has unknown fields; missing data cannot be treated as a positive security status",
      tone: "manual",
    };
  }

  return {
    value: "Not Verified",
    detail: "Security data is present, but this candidate still requires Manual Review",
    tone: "manual",
  };
}

function getLiquidityContext(candidate: MockCandidate): { value: string; detail: string; tone: DetailTone } {
  if (candidate.liquidity_usd === null || candidate.volume_24h_usd === null || candidate.market_cap_usd === null) {
    return {
      value: "Liquidity Unknown",
      detail: "Liquidity Unknown / Market Context Not Verified",
      tone: "manual",
    };
  }

  return {
    value: "Not Verified",
    detail: `Liquidity ${formatUsd(candidate.liquidity_usd)}, 24h volume ${formatUsd(candidate.volume_24h_usd)}, Market Context still requires Manual Review`,
    tone: "neutral",
  };
}

function getOpenQuestions(candidate: MockCandidate): string[] {
  const questions = [
    "Confirm project identity and Source Freshness.",
    "Check whether Security Notes are complete enough for Manual Review.",
  ];

  if (!candidate.contract_address.trim()) {
    questions.push("Add Contract Address before External Checks and security checks.");
  }

  if (!candidate.chain.trim()) {
    questions.push("Verify Chain / Network manually.");
  }

  if (!candidate.security) {
    questions.push("Security Not Verified.");
  }

  if (candidate.liquidity_usd === null) {
    questions.push("Liquidity Unknown.");
  }

  return questions;
}

function buildDetailStateItems(
  candidate: MockCandidate,
  sourceFreshness: { value: string; detail: string; tone: DetailTone },
  securityNotes: { value: string; detail: string; tone: DetailTone },
  liquidityContext: { value: string; detail: string; tone: DetailTone },
): ProductStateNoticeItem[] {
  return [
    {
      label: "Contract",
      value: candidate.contract_address.trim() ? "Not Verified" : "Contract Required",
      detail: "External Check Required",
    },
    {
      label: "Chain",
      value: candidate.chain.trim() ? candidate.chain.toUpperCase() : "Chain Unknown",
      detail: "Manual Verification Required",
    },
    {
      label: "Source Freshness",
      value: sourceFreshness.value,
      detail: sourceFreshness.detail,
    },
    {
      label: "Security",
      value: securityNotes.value,
      detail: securityNotes.detail,
    },
    {
      label: "Liquidity",
      value: liquidityContext.value,
      detail: liquidityContext.detail,
    },
  ];
}

function getNextReviewStep(candidate: MockCandidate, reviewRecord?: CandidateReviewRecord | null): string {
  if (reviewRecord?.status === "waiting_for_more_data") {
    return "Wait for more data, then continue Manual Review.";
  }

  if (!candidate.contract_address.trim()) {
    return "Add Contract Address before External Checks and security checks.";
  }

  if (!candidate.chain.trim()) {
    return "Verify chain / network manually.";
  }

  if (!candidate.security) {
    return "Manual Verification Required: Security Not Verified.";
  }

  if (candidate.final_label === "WATCHLIST") {
    return "Review Candidate manually; WATCHLIST is Manual Review Only.";
  }

  if (candidate.final_label === "CRITICAL_RISK") {
    return "Review Candidate Risk Flags manually before any follow-up.";
  }

  if (candidate.final_label === "NEEDS_MANUAL_VERIFICATION") {
    return "Complete manual verification for unknown fields.";
  }

  return "Manual Review Only if this candidate returns to scope.";
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
