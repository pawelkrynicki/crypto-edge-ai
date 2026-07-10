import React from "react";
import type { MockCandidate } from "../mockData";
import {
  buildExternalVerificationTargets,
  normalizeExternalVerificationInput,
  type ExternalVerificationInput,
  type ExternalVerificationTarget,
} from "../externalVerificationTargets";
import {
  ManualVerificationFallback,
  buildExternalVerificationGaps,
} from "./ManualVerificationFallback";
import { ProductStateNotice } from "./ProductStateNotice";
import { ResearchActionPanel } from "./ResearchActionPanel";

interface ExternalVerificationLinksViewProps {
  candidate?: MockCandidate | null;
  tokenInput?: string;
}

type ExternalCheckTone = "neutral" | "manual";

export const ExternalVerificationLinksView: React.FC<ExternalVerificationLinksViewProps> = ({
  candidate,
  tokenInput = "",
}) => {
  const input = buildInput(candidate, tokenInput);
  const normalizedInput = normalizeExternalVerificationInput(input);
  const targets = buildExternalVerificationTargets(input);
  const displayName =
    candidate?.name ||
    candidate?.symbol ||
    normalizedInput.tokenInput ||
    "token input";
  const fallbackGaps = buildExternalVerificationGaps({
    hasContract: Boolean(normalizedInput.contractAddress),
    hasChain: Boolean(normalizedInput.chain),
    isWatchlist: candidate?.final_label === "WATCHLIST",
  });
  const hasContract = Boolean(normalizedInput.contractAddress);
  const hasChain = Boolean(normalizedInput.chain);

  return (
    <div className="external-checks-view">
      <section className="external-checks-hero">
        <div className="external-checks-hero-copy">
          <span className="external-checks-eyebrow">External Checks</span>
          <h3>External Checks</h3>
          <p>
            Manual External Check only. Links open outside the app by user click, and every security,
            liquidity and Source Freshness state remains Not Verified until Manual Review.
          </p>
        </div>
        <div className="external-checks-boundary">
          <strong>Not Verified</strong>
          <span>Manual Verification Required</span>
        </div>
      </section>

      <section className="external-checks-summary-grid" aria-label="External Checks summary">
        <ExternalCheckMetric
          label="Token Input"
          value={displayName}
          detail={normalizedInput.contractAddress ? "Copy Contract" : "Copy Token Input"}
        />
        <ExternalCheckMetric
          label="Contract Address"
          value={normalizedInput.contractAddress ? "Not Verified" : "Contract Required"}
          detail={normalizedInput.contractAddress || "Manual Verification Required"}
          tone="manual"
        />
        <ExternalCheckMetric
          label="Chain"
          value={normalizedInput.chain || "Chain Unknown"}
          detail={normalizedInput.chain ? "Not Verified" : "Chain Unknown / verify manually"}
          tone="manual"
        />
        <ExternalCheckMetric
          label="Next Review Step"
          value="External Check Required"
          detail="Manual Review Only"
          tone="manual"
        />
      </section>

      <ProductStateNotice
        variant={hasContract && hasChain ? "partial" : "error"}
        title="External Check Required"
        status="External Check Required"
        detail="Data Gap: External Checks are link-only, Security Not Verified and Liquidity Unknown remain Manual Review Only, and missing contract or chain keeps checks Not Verified."
        nextReviewStep={hasContract && hasChain
          ? "Open the user-clicked External Checks and record Manual Verification separately"
          : "Add contract and chain manually before relying on any External Check"}
        items={[
          { label: "Contract", value: hasContract ? "Not Verified" : "Contract Required", detail: "Manual Verification Required" },
          { label: "Chain", value: hasChain ? normalizedInput.chain : "Chain Unknown", detail: "Not Verified" },
          { label: "Security", value: "Security Not Verified", detail: "Cannot Infer Safety" },
          { label: "Liquidity", value: "Liquidity Unknown", detail: "Source Freshness Unknown" },
        ]}
      />

      <ManualVerificationFallback
        title="Manual Verification Required"
        gaps={fallbackGaps}
      />

      <ResearchActionPanel
        candidate={candidate}
        tokenInput={tokenInput}
      />

      <section className="external-checks-list" aria-label="Manual External Check list">
        {targets.map((target) => (
          <ExternalCheckCard key={target.id} target={target} />
        ))}
      </section>

      <section className="external-checks-review-panel">
        <div>
          <span className="external-checks-eyebrow">Next Review Step</span>
          <h3>Manual External Check</h3>
          <p>
            Security Not Verified. Liquidity Unknown. Source Freshness Unknown. WATCHLIST remains Manual Review Only.
          </p>
        </div>
        <div className="external-checks-review-grid">
          <ExternalCheckMetric
            label="Security"
            value="Security Not Verified"
            detail="Manual Verification Required"
            tone="manual"
          />
          <ExternalCheckMetric
            label="Liquidity"
            value="Liquidity Unknown"
            detail="Manual External Check"
            tone="manual"
          />
          <ExternalCheckMetric
            label="Source Freshness"
            value="Source Freshness Unknown"
            detail="source URL not fetched"
            tone="manual"
          />
        </div>
      </section>
    </div>
  );
};

function ExternalCheckCard({ target }: { target: ExternalVerificationTarget }) {
  return (
    <article className={`external-check-card ${target.state === "manual" ? "manual" : ""}`}>
      <div className="external-check-card-main">
        <span className="external-checks-eyebrow">{target.label}</span>
        <h4>{target.title}</h4>
        <p>{target.detail}</p>
      </div>

      <div className="external-check-card-status">
        <span>Not Verified</span>
        <strong>{target.status}</strong>
        {target.reason && <p>{target.reason}</p>}
      </div>

      <div className="external-check-actions">
        {target.href ? (
          <a
            className="external-check-link"
            href={target.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open External Check
          </a>
        ) : (
          <span className="external-check-disabled" aria-disabled="true">
            Manual External Check
          </span>
        )}
        {target.copyValue && (
          <button
            type="button"
            className="external-check-copy-button"
            onClick={() => copyManualValue(target.copyValue ?? "")}
          >
            {target.copyLabel}
          </button>
        )}
      </div>
    </article>
  );
}

function ExternalCheckMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: ExternalCheckTone;
}) {
  return (
    <div className={`external-check-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function buildInput(candidate: MockCandidate | null | undefined, tokenInput: string): ExternalVerificationInput {
  if (!candidate) {
    return { tokenInput };
  }

  return {
    symbol: candidate.symbol,
    projectName: candidate.name,
    chain: candidate.chain,
    contractAddress: candidate.contract_address,
    pairAddress: candidate.pair_address,
    sourceUrl: candidate.source_url,
    tokenInput: tokenInput || candidate.symbol || candidate.name,
  };
}

function copyManualValue(value: string): void {
  if (!value) return;
  if (typeof navigator === "undefined" || !navigator.clipboard) return;

  void navigator.clipboard.writeText(value);
}
