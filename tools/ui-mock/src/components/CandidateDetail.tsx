import React, { useState } from "react";
import type { MockCandidate } from "../mockData";
import { LabelBadge } from "./LabelBadge";
import { CandidateResearchContext } from "./CandidateResearchContext";
import { CandidateReviewControls, ReviewStatusBadge } from "./CandidateReviewControls";
import type { MarketContextPanelState } from "./MarketContextPanel";
import type { CandidateReviewInput, CandidateReviewRecord } from "../types/reviewSessionTypes";
import { formatReasonText, formatSecurityFlag } from "../utils/displayText";

interface Props {
  candidate: MockCandidate;
  onClose?: () => void;
  marketContextState?: MarketContextPanelState;
  reviewRecord?: CandidateReviewRecord | null;
  onSaveReview?: (input: CandidateReviewInput) => void;
  onClearReview?: (candidateId: string) => void;
}

function fmtUsd(n: number | null, decimals = 0): string {
  if (n === null) return "--";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(decimals)}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "--";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtDays(n: number | null): string {
  return n === null ? "--" : `${n}d`;
}

const BoolVal: React.FC<{ v: boolean | null }> = ({ v }) => {
  if (v === null) return <MissingTag />;
  return v
    ? <span className="text-[#32d184] text-xs">Yes</span>
    : <span className="text-[#ff6575] text-xs">No</span>;
};

const RiskVal: React.FC<{ v: boolean | null }> = ({ v }) => {
  if (v === null) return <MissingTag />;
  return v
    ? <span className="text-[#ff6575] text-xs font-semibold">Detected</span>
    : <span className="text-[#32d184] text-xs">None</span>;
};

const MissingTag: React.FC = () => (
  <span
    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md"
    style={{
      background: "var(--amber-dim)",
      color: "var(--amber)",
      border: "1px solid var(--amber-border)",
    }}
  >
    Missing
  </span>
);

const DECISION_COPY: Record<string, { explanation: string; nextStep: string }> = {
  WATCHLIST: {
    explanation: "Passed basic filters and available security checks. Eligible for further review only.",
    nextStep: "Complete manual community, narrative, and chart review before any independent decision.",
  },
  CRITICAL_RISK: {
    explanation: "Critical security flag detected. Manual investigation is required before any further assessment.",
    nextStep: "Review every flagged risk manually and keep the candidate out of the follow-up path unless resolved.",
  },
  NEEDS_MANUAL_VERIFICATION: {
    explanation: "Important security data is missing or unclear. Manual verification is required.",
    nextStep: "Verify every missing data point before making any assessment.",
  },
  REJECT: {
    explanation: "Failed basic market or liquidity filters. Not eligible for further review.",
    nextStep: "No follow-up in this scanner review path.",
  },
};

const CHECKLIST_ITEMS = {
  Security: [
    { key: "honeypot", label: "Honeypot check passed" },
    { key: "tax", label: "Tax below threshold" },
    { key: "contract", label: "Contract verification reviewed" },
  ],
  Distribution: [
    { key: "topWallet", label: "Top wallet concentration checked" },
    { key: "top10", label: "Top 10 wallet concentration checked" },
  ],
  Liquidity: [
    { key: "liqMin", label: "Liquidity above minimum" },
    { key: "volMc", label: "Volume/MC ratio reviewed" },
  ],
  Social: [
    { key: "community", label: "Community quality - manual review needed" },
    { key: "narrative", label: "Narrative - manual review needed" },
  ],
  "Personal Risk": [
    { key: "notSignal", label: "I understand this is research only" },
    { key: "mayFail", label: "I accept that token may still fail after review" },
    { key: "riskRules", label: "I have personal risk rules before any decision" },
  ],
};

type CheckedState = Record<string, boolean>;

const SectionTitle: React.FC<{ children: React.ReactNode; meta?: React.ReactNode }> = ({ children, meta }) => (
  <div className="detail-section-title">
    <div className="section-label">{children}</div>
    {meta}
  </div>
);

const DR: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="detail-row">
    <span className="detail-label">{label}</span>
    <span className="detail-value">{value}</span>
  </div>
);

const MetaPill: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <span className="research-context-chip">
    <span style={{ color: "var(--text-muted)" }}>{label}</span>
    <span>{value}</span>
  </span>
);

const SnapshotMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="detail-kpi">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

export function getMissingSecurityText(candidate: Pick<MockCandidate, "basic_filter_status">): string {
  if (candidate.basic_filter_status === "rejected_basic_filter") {
    return "Security check not performed because the candidate failed the basic filter.";
  }

  return "Security data is unavailable. Manual verification is required.";
}

export const CandidateDetail: React.FC<Props> = ({
  candidate: c,
  onClose,
  marketContextState,
  reviewRecord,
  onSaveReview,
  onClearReview,
}) => {
  const [checked, setChecked] = useState<CheckedState>({});
  const sec = c.security;
  const decision = DECISION_COPY[c.final_label] ?? {
    explanation: "Scanner output is available for manual review.",
    nextStep: "Review all fields before making any assessment.",
  };
  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="detail-panel">
      <header className="detail-header">
        <div className="detail-header-top">
          <div className="detail-title">
            <strong>{c.symbol}</strong>
            <span>{c.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <LabelBadge label={c.final_label} />
            {onClose && (
              <button onClick={onClose} className="detail-close" aria-label="Close candidate detail">
                x
              </button>
            )}
          </div>
        </div>

        <div className="detail-header-summary">
          <span>Scanner output is read-only.</span>
          <span>Local review status is an analyst note layer and does not change scanner label.</span>
          <span>This is not a buy/sell signal.</span>
        </div>

        <div className="detail-header-meta">
          <MetaPill label="Chain" value={c.chain.toUpperCase()} />
          <MetaPill label="DEX" value={c.dex || "--"} />
          <MetaPill label="Review" value={<ReviewStatusBadge status={reviewRecord?.status ?? "not_reviewed"} short />} />
          {c.source_url && (
            <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="research-context-chip available">
              DexScreener
            </a>
          )}
        </div>
      </header>

      <div className="detail-body">
        <section className="detail-section">
          <SectionTitle
            meta={<ReviewStatusBadge status={reviewRecord?.status ?? "not_reviewed"} />}
          >
            Local Review Session
          </SectionTitle>
          <p className="detail-section-note">
            Local-only analyst notes help organize follow-up work. They do not change the scanner label, scoring, or report data.
          </p>
          <CandidateReviewControls
            candidateId={c.id}
            reviewRecord={reviewRecord ?? null}
            onSaveReview={onSaveReview}
            onClearReview={onClearReview}
          />
        </section>

        <section className="detail-section">
          <SectionTitle>Scanner Label vs Local Review</SectionTitle>
          <div className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            <p>
              <code>final_label</code> comes from scanner latest output and remains separate from the local review status.
            </p>
            <p>
              Saving a review status records a local analyst note only; it does not change scanner scoring or label.
            </p>
            <p>
              WATCHLIST means eligible for further manual review only. Missing security or context data means manual verification is required, not a positive assessment.
            </p>
            <p>This is not a buy/sell signal.</p>
          </div>
        </section>

        <section className="detail-section">
          <SectionTitle>Quick Snapshot</SectionTitle>
          <div className="detail-kpi-grid">
            <SnapshotMetric label="Price" value={c.price_usd !== null ? `$${c.price_usd.toFixed(6)}` : "--"} />
            <SnapshotMetric label="Liquidity" value={fmtUsd(c.liquidity_usd)} />
            <SnapshotMetric label="24h Volume" value={fmtUsd(c.volume_24h_usd)} />
            <SnapshotMetric label="Market Cap" value={fmtUsd(c.market_cap_usd)} />
            <SnapshotMetric label="FDV" value={fmtUsd(c.fdv_usd)} />
            <SnapshotMetric label="Age" value={fmtDays(c.pair_age_days)} />
          </div>
          <div className="mt-3">
            <DR label="Volume/MC" value={fmtPct(c.volume_market_cap_ratio)} />
            <DR label="Contract" value={<code className="text-[10px] text-secondary break-all">{c.contract_address.slice(0, 24) || "--"}</code>} />
          </div>
        </section>

        <section className="detail-section">
          <SectionTitle>Security &amp; Manual Verification</SectionTitle>
          <p className="detail-section-note">
            Missing security or context data requires manual verification.
          </p>
          {sec ? (
            <>
              <div className="detail-two-col">
                <DR label="Honeypot" value={
                  sec.honeypot_status === "passed" ? <span className="text-[#32d184]">Passed</span>
                    : sec.honeypot_status === "failed" ? <span className="text-[#ff6575] font-semibold">Detected</span>
                    : <span className="text-[#f5b84b]">Unknown</span>
                } />
                <DR label="In Tax" value={sec.buy_tax !== null ? `${sec.buy_tax}%` : <MissingTag />} />
                <DR label="Out Tax" value={sec.sell_tax !== null ? `${sec.sell_tax}%` : <MissingTag />} />
                <DR label="Contract" value={<BoolVal v={sec.contract_verified} />} />
                <DR label="Ownership" value={
                  sec.ownership_status === "renounced" ? <span className="text-[#32d184]">Renounced</span>
                    : sec.ownership_status === "active" ? <span className="text-[#ff6575]">Active</span>
                    : <span className="text-[#f5b84b]">Unknown</span>
                } />
                <DR label="Liq. Locked" value={<BoolVal v={sec.liquidity_locked} />} />
                <DR label="Mint Risk" value={<RiskVal v={sec.mint_risk} />} />
                <DR label="Blacklist" value={<RiskVal v={sec.blacklist_risk} />} />
                <DR label="Whitelist" value={<RiskVal v={sec.whitelist_risk} />} />
                <DR label="Exit Restrict" value={<RiskVal v={sec.sell_restriction_risk} />} />
                <DR label="Proxy Risk" value={<RiskVal v={sec.proxy_risk} />} />
                <DR label="Top Wallet" value={sec.top_wallet_pct !== null ? `${sec.top_wallet_pct}%` : <MissingTag />} />
                <DR label="Top 10 Wallets" value={sec.top_10_wallets_pct !== null ? `${sec.top_10_wallets_pct}%` : <MissingTag />} />
              </div>

              {sec.risk_flags.length > 0 && (
                <div className="mt-3">
                  <div className="section-label mb-1">Risk Flags</div>
                  <div className="flex flex-wrap gap-1">
                    {sec.risk_flags.map((f) => (
                      <span key={f} className="badge badge-critical">{formatSecurityFlag(f)}</span>
                    ))}
                  </div>
                </div>
              )}

              {sec.missing_data.length > 0 && (
                <div className="mt-3">
                  <div className="section-label mb-1">Missing Data</div>
                  <div className="flex flex-wrap gap-1">
                    {sec.missing_data.map((f) => (
                      <span key={f} className="badge badge-manual">{formatSecurityFlag(f)}</span>
                    ))}
                  </div>
                  <div className="detail-warning-note">
                    Missing security data requires manual verification before any follow-up assessment.
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-secondary text-xs italic">{getMissingSecurityText(c)}</p>
          )}
        </section>

        <section className="detail-section">
          <SectionTitle>Data Coverage &amp; Context</SectionTitle>
          <p className="detail-section-note">
            Market context can frame research, but it does not change scanner labels.
          </p>
          <CandidateResearchContext candidate={c} marketContextState={marketContextState} />
        </section>

        <section className="detail-section">
          <SectionTitle>Scanner Label / Reasons</SectionTitle>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <LabelBadge label={c.final_label} size="md" />
              <span className="research-context-chip">This is not a buy/sell signal.</span>
            </div>
            <p className="text-secondary text-xs">{decision.explanation}</p>
            <div>
              <div className="section-label mb-0.5">Next Step</div>
              <p className="text-secondary text-xs">{decision.nextStep}</p>
            </div>
            {c.final_reasons.length > 0 && (
              <div>
                <div className="section-label mb-1">Reasons</div>
                <div className="space-y-1">
                  {c.final_reasons.map((r) => (
                    <div key={r} className="text-xs text-secondary">- {formatReasonText(r)}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="detail-section">
          <SectionTitle>Reasoning Checklist</SectionTitle>
          <div className="reasoning-checklist-grid">
            {Object.entries(CHECKLIST_ITEMS).map(([category, items]) => (
              <div key={category} className="reasoning-checklist-category">
                <div className="reasoning-checklist-title">
                  {category}
                </div>
                <div className="reasoning-checklist-items">
                  {items.map((item) => (
                    <label key={item.key} className="reasoning-checklist-item group">
                      <input
                        type="checkbox"
                        checked={!!checked[item.key]}
                        onChange={() => toggle(item.key)}
                        className="reasoning-checklist-checkbox accent-accent"
                      />
                      <span className={`text-xs transition-colors ${
                        checked[item.key]
                          ? "text-[#32d184] line-through opacity-70"
                          : "text-secondary group-hover:text-primary"
                      }`}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
