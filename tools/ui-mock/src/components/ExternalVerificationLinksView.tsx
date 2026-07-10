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
          <span className="external-checks-eyebrow">external checks</span>
          <h3>External Verification Links</h3>
          <p>
            manual external check only. Links open outside the app by user click, and every security,
            liquidity and source freshness state remains not verified until manual review.
          </p>
        </div>
        <div className="external-checks-boundary">
          <strong>not verified</strong>
          <span>manual verification required</span>
        </div>
      </section>

      <section className="external-checks-summary-grid" aria-label="external checks summary">
        <ExternalCheckMetric
          label="token input"
          value={displayName}
          detail={normalizedInput.contractAddress ? "copy contract" : "copy token input"}
        />
        <ExternalCheckMetric
          label="contract address"
          value={normalizedInput.contractAddress ? "not verified" : "contract required"}
          detail={normalizedInput.contractAddress || "manual verification required"}
          tone="manual"
        />
        <ExternalCheckMetric
          label="chain"
          value={normalizedInput.chain || "chain unknown"}
          detail={normalizedInput.chain ? "not verified" : "chain unknown / verify manually"}
          tone="manual"
        />
        <ExternalCheckMetric
          label="next review step"
          value="external check required"
          detail="manual review only"
          tone="manual"
        />
      </section>

      <ProductStateNotice
        variant={hasContract && hasChain ? "partial" : "error"}
        title="external check required"
        status="external check required"
        detail="data gap: external checks are link-only, security not verified and liquidity unknown remain manual review only, and missing contract or chain keeps checks not verified."
        nextReviewStep={hasContract && hasChain
          ? "open the user-clicked external checks and record manual verification separately"
          : "add contract and chain manually before relying on any external check"}
        items={[
          { label: "contract", value: hasContract ? "not verified" : "contract required", detail: "manual verification required" },
          { label: "chain", value: hasChain ? normalizedInput.chain : "chain unknown", detail: "not verified" },
          { label: "security", value: "security not verified", detail: "cannot infer safety" },
          { label: "liquidity", value: "liquidity unknown", detail: "source freshness unknown" },
        ]}
      />

      <ManualVerificationFallback
        title="Manual verification fallback"
        gaps={fallbackGaps}
      />

      <ResearchActionPanel
        candidate={candidate}
        tokenInput={tokenInput}
      />

      <section className="external-checks-list" aria-label="manual external check list">
        {targets.map((target) => (
          <ExternalCheckCard key={target.id} target={target} />
        ))}
      </section>

      <section className="external-checks-review-panel">
        <div>
          <span className="external-checks-eyebrow">next review step</span>
          <h3>manual external check</h3>
          <p>
            security not verified. liquidity unknown. source freshness unknown. WATCHLIST remains manual review only.
          </p>
        </div>
        <div className="external-checks-review-grid">
          <ExternalCheckMetric
            label="security"
            value="security not verified"
            detail="manual verification required"
            tone="manual"
          />
          <ExternalCheckMetric
            label="liquidity"
            value="liquidity unknown"
            detail="manual external check"
            tone="manual"
          />
          <ExternalCheckMetric
            label="source freshness"
            value="source freshness unknown"
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
        <span>not verified</span>
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
            Open external check
          </a>
        ) : (
          <span className="external-check-disabled" aria-disabled="true">
            manual external check
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
