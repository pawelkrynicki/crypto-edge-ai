import React from "react";
import type { MockCandidate } from "../mockData";

export type VerificationGapStatus =
  | "manual verification required"
  | "not verified"
  | "contract required"
  | "chain unknown"
  | "security not verified"
  | "liquidity unknown"
  | "source freshness unknown"
  | "external check required"
  | "manual review only"
  | "cannot infer safety";

export interface VerificationGap {
  status: VerificationGapStatus;
  detail: string;
  nextReviewStep: string;
}

interface ManualVerificationFallbackProps {
  title?: string;
  gaps: VerificationGap[];
  compact?: boolean;
}

export const FALLBACKS: Record<VerificationGapStatus, VerificationGap> = {
  "manual verification required": {
    status: "manual verification required",
    detail: "system did not complete this verification",
    nextReviewStep: "review the missing fields manually",
  },
  "not verified": {
    status: "not verified",
    detail: "present data is not an automated verdict",
    nextReviewStep: "treat this as manual review only",
  },
  "contract required": {
    status: "contract required",
    detail: "contract address is missing or not usable for checks",
    nextReviewStep: "find the contract address before external checks",
  },
  "chain unknown": {
    status: "chain unknown",
    detail: "network context is missing or not confirmed",
    nextReviewStep: "verify chain manually before opening external checks",
  },
  "security not verified": {
    status: "security not verified",
    detail: "security context is missing, partial, or not confirmed",
    nextReviewStep: "complete a manual security review",
  },
  "liquidity unknown": {
    status: "liquidity unknown",
    detail: "liquidity or market context is missing or partial",
    nextReviewStep: "check liquidity context manually",
  },
  "source freshness unknown": {
    status: "source freshness unknown",
    detail: "source recency is missing or not confirmed",
    nextReviewStep: "check source freshness manually",
  },
  "external check required": {
    status: "external check required",
    detail: "external checks require user-clicked manual review",
    nextReviewStep: "open or copy the target and check it outside the app",
  },
  "manual review only": {
    status: "manual review only",
    detail: "WATCHLIST stays human review only",
    nextReviewStep: "continue as human review only",
  },
  "cannot infer safety": {
    status: "cannot infer safety",
    detail: "missing data is a data gap, not a positive status",
    nextReviewStep: "keep the item in manual verification",
  },
};

const BASE_GAPS: VerificationGap[] = [
  FALLBACKS["manual verification required"],
  FALLBACKS["not verified"],
  FALLBACKS["external check required"],
  FALLBACKS["cannot infer safety"],
];

export const ManualVerificationFallback: React.FC<ManualVerificationFallbackProps> = ({
  title = "Manual verification fallback",
  gaps,
  compact = false,
}) => {
  const visibleGaps = uniqueGaps(gaps.length > 0 ? gaps : BASE_GAPS);

  return (
    <section
      className={`manual-verification-fallback ${compact ? "compact" : ""}`}
      aria-label="manual verification fallback"
    >
      <div className="manual-verification-fallback-header">
        <span className="manual-verification-eyebrow">data gap</span>
        <h4>{title}</h4>
        <p>
          Missing data stays not verified. Data gaps require manual verification and cannot infer safety.
        </p>
      </div>

      <div className="manual-verification-gap-grid">
        {visibleGaps.map((gap) => (
          <article key={gap.status} className="manual-verification-gap">
            <span>{gap.status}</span>
            <p>{gap.detail}</p>
            <small>next review step: {gap.nextReviewStep}</small>
          </article>
        ))}
      </div>
    </section>
  );
};

export function buildCandidateVerificationGaps(candidate: MockCandidate): VerificationGap[] {
  const gaps: VerificationGap[] = [...BASE_GAPS];

  if (!candidate.contract_address.trim()) {
    gaps.push(FALLBACKS["contract required"]);
  }

  if (!candidate.chain.trim()) {
    gaps.push(FALLBACKS["chain unknown"]);
  }

  if (!candidate.security || candidate.security.missing_data.length > 0 || candidate.security.contract_verified !== true) {
    gaps.push(FALLBACKS["security not verified"]);
  }

  if (
    candidate.liquidity_usd === null ||
    candidate.volume_24h_usd === null ||
    candidate.market_cap_usd === null
  ) {
    gaps.push(FALLBACKS["liquidity unknown"]);
  }

  if (!hasKnownSourceFreshness(candidate)) {
    gaps.push(FALLBACKS["source freshness unknown"]);
  }

  if (candidate.final_label === "WATCHLIST") {
    gaps.push(FALLBACKS["manual review only"]);
  }

  return uniqueGaps(gaps);
}

export function buildLookupVerificationGaps(hasContract: boolean): VerificationGap[] {
  const gaps = [
    ...BASE_GAPS,
    FALLBACKS["chain unknown"],
    FALLBACKS["security not verified"],
    FALLBACKS["liquidity unknown"],
    FALLBACKS["source freshness unknown"],
    FALLBACKS["manual review only"],
  ];

  if (!hasContract) {
    gaps.push(FALLBACKS["contract required"]);
  }

  return uniqueGaps(gaps);
}

export function buildExternalVerificationGaps(input: {
  hasContract: boolean;
  hasChain: boolean;
  isWatchlist?: boolean;
}): VerificationGap[] {
  const gaps = [
    ...BASE_GAPS,
    FALLBACKS["security not verified"],
    FALLBACKS["liquidity unknown"],
    FALLBACKS["source freshness unknown"],
  ];

  if (!input.hasContract) {
    gaps.push(FALLBACKS["contract required"]);
  }

  if (!input.hasChain) {
    gaps.push(FALLBACKS["chain unknown"]);
  }

  if (input.isWatchlist) {
    gaps.push(FALLBACKS["manual review only"]);
  }

  return uniqueGaps(gaps);
}

function hasKnownSourceFreshness(candidate: MockCandidate): boolean {
  if (!candidate.source_url.trim() || !candidate.last_checked.trim()) return false;
  return !Number.isNaN(new Date(candidate.last_checked).getTime());
}

function uniqueGaps(gaps: VerificationGap[]): VerificationGap[] {
  const seen = new Set<VerificationGapStatus>();

  return gaps.filter((gap) => {
    if (seen.has(gap.status)) return false;
    seen.add(gap.status);
    return true;
  });
}
