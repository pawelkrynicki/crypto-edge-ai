import React, { useState } from "react";
import type { MockCandidate } from "../mockData";
import { LabelBadge } from "./LabelBadge";

interface Props {
  candidate: MockCandidate;
  onClose?: () => void;
}

function fmtUsd(n: number | null, decimals = 0): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(decimals)}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

const BoolVal: React.FC<{ v: boolean | null }> = ({ v }) => {
  if (v === null) return <MissingTag />;
  return v
    ? <span className="text-[#22c55e] text-xs">Yes</span>
    : <span className="text-[#ef4444] text-xs">No</span>;
};

const RiskVal: React.FC<{ v: boolean | null }> = ({ v }) => {
  if (v === null) return <MissingTag />;
  return v
    ? <span className="text-[#ef4444] text-xs font-semibold">Detected</span>
    : <span className="text-[#22c55e] text-xs">None</span>;
};

const MissingTag: React.FC = () => (
  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
    style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}>
    Missing
  </span>
);

const DECISION_COPY: Record<string, { explanation: string; nextStep: string }> = {
  WATCHLIST: {
    explanation: "Passed basic filters and available security checks. Eligible for further review only.",
    nextStep: "Conduct manual community, narrative, and chart review before any decision.",
  },
  CRITICAL_RISK: {
    explanation: "Critical security flag detected. Do not proceed without manual investigation.",
    nextStep: "Investigate all flagged risks manually before any further assessment.",
  },
  NEEDS_MANUAL_VERIFICATION: {
    explanation: "Important security data is missing or unclear. Manual verification required.",
    nextStep: "Manually verify all missing data points before making any assessment.",
  },
  REJECT: {
    explanation: "Failed basic market/liquidity filters. Not eligible for further review.",
    nextStep: "No further action recommended at this stage.",
  },
};

const CHECKLIST_ITEMS = {
  Security: [
    { key: "honeypot", label: "Honeypot check passed" },
    { key: "tax", label: "Buy/sell tax below threshold" },
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
    { key: "community", label: "Community quality — manual review needed" },
    { key: "narrative", label: "Narrative — manual review needed" },
  ],
  "Personal Risk": [
    { key: "notSignal", label: "I understand this is not a buy signal" },
    { key: "mayFail", label: "I accept that token may still fail after review" },
    { key: "riskRules", label: "I have position risk rules before any decision" },
  ],
};

type CheckedState = Record<string, boolean>;

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="section-label border-b pb-1 mb-2" style={{ borderColor: "var(--border)" }}>
    {children}
  </div>
);

const DR: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="detail-row">
    <span className="detail-label">{label}</span>
    <span className="detail-value">{value}</span>
  </div>
);

export const CandidateDetail: React.FC<Props> = ({ candidate: c, onClose }) => {
  const [checked, setChecked] = useState<CheckedState>({});
  const sec = c.security;
  const decision = DECISION_COPY[c.final_label];
  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="card flex flex-col overflow-hidden" style={{ maxHeight: "calc(100vh - 180px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-raised)" }}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-primary text-sm">{c.symbol}</span>
          <span className="text-secondary text-xs">{c.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <LabelBadge label={c.final_label} />
          {onClose && (
            <button onClick={onClose} className="text-muted hover:text-primary text-base leading-none ml-1">×</button>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4 text-xs">

        {/* Token meta */}
        <div>
          <SectionTitle>Token Info</SectionTitle>
          <DR label="Chain" value={c.chain.toUpperCase()} />
          <DR label="DEX" value={c.dex} />
          <DR label="Contract" value={
            <code className="text-[10px] text-secondary break-all">{c.contract_address.slice(0, 18)}…</code>
          } />
          <DR label="Source" value={
            <a href={c.source_url} target="_blank" rel="noopener noreferrer"
              className="text-accent hover:underline text-xs">DexScreener ↗</a>
          } />
        </div>

        {/* A. Market Snapshot */}
        <div>
          <SectionTitle>A. Market Snapshot</SectionTitle>
          <div className="grid grid-cols-2 gap-x-3">
            <DR label="Price" value={c.price_usd !== null ? `$${c.price_usd.toFixed(6)}` : "—"} />
            <DR label="Market Cap" value={fmtUsd(c.market_cap_usd)} />
            <DR label="FDV" value={fmtUsd(c.fdv_usd)} />
            <DR label="Liquidity" value={fmtUsd(c.liquidity_usd)} />
            <DR label="24h Volume" value={fmtUsd(c.volume_24h_usd)} />
            <DR label="Volume/MC" value={fmtPct(c.volume_market_cap_ratio)} />
            <DR label="Pair Age" value={`${c.pair_age_days}d`} />
          </div>
        </div>

        {/* B. Security Check */}
        <div>
          <SectionTitle>B. Security Check</SectionTitle>
          {sec ? (
            <>
              <div className="grid grid-cols-2 gap-x-3">
                <DR label="Honeypot" value={
                  sec.honeypot_status === "passed" ? <span className="text-[#22c55e]">Passed</span>
                    : sec.honeypot_status === "failed" ? <span className="text-[#ef4444] font-semibold">DETECTED</span>
                    : <span className="text-[#f59e0b]">Unknown</span>
                } />
                <DR label="Buy Tax" value={sec.buy_tax !== null ? `${sec.buy_tax}%` : <MissingTag />} />
                <DR label="Sell Tax" value={sec.sell_tax !== null ? `${sec.sell_tax}%` : <MissingTag />} />
                <DR label="Contract" value={<BoolVal v={sec.contract_verified} />} />
                <DR label="Ownership" value={
                  sec.ownership_status === "renounced" ? <span className="text-[#22c55e]">Renounced</span>
                    : sec.ownership_status === "active" ? <span className="text-[#ef4444]">Active</span>
                    : <span className="text-[#f59e0b]">Unknown</span>
                } />
                <DR label="Liq. Locked" value={<BoolVal v={sec.liquidity_locked} />} />
                <DR label="Mint Risk" value={<RiskVal v={sec.mint_risk} />} />
                <DR label="Blacklist" value={<RiskVal v={sec.blacklist_risk} />} />
                <DR label="Sell Restrict" value={<RiskVal v={sec.sell_restriction_risk} />} />
                <DR label="Top Wallet" value={sec.top_wallet_pct !== null ? `${sec.top_wallet_pct}%` : <MissingTag />} />
                <DR label="Top 10 Wallets" value={sec.top_10_wallets_pct !== null ? `${sec.top_10_wallets_pct}%` : <MissingTag />} />
              </div>
              {sec.risk_flags.length > 0 && (
                <div className="mt-2">
                  <div className="section-label mb-1">Risk Flags</div>
                  <div className="flex flex-wrap gap-1">
                    {sec.risk_flags.map((f) => (
                      <span key={f} className="badge badge-critical text-[10px]">{f}</span>
                    ))}
                  </div>
                </div>
              )}
              {sec.missing_data.length > 0 && (
                <div className="mt-2">
                  <div className="section-label mb-1">Missing Data</div>
                  <div className="flex flex-wrap gap-1">
                    {sec.missing_data.map((f) => (
                      <span key={f} className="badge badge-manual text-[10px]">{f}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-secondary text-xs italic">
              Security check not performed — token rejected at basic filter stage.
            </p>
          )}
        </div>

        {/* C. Decision */}
        <div>
          <SectionTitle>C. Decision</SectionTitle>
          <div className="rounded-md p-3 space-y-2" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-sub)" }}>
            <div className="flex items-center gap-2">
              <LabelBadge label={c.final_label} size="md" />
              {c.final_label === "WATCHLIST" && (
                <span className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>
                  Not a buy signal
                </span>
              )}
            </div>
            <p className="text-secondary text-xs">{decision.explanation}</p>
            <div>
              <div className="section-label mb-0.5">Next Step</div>
              <p className="text-secondary text-xs">{decision.nextStep}</p>
            </div>
            {c.final_reasons.length > 0 && (
              <div>
                <div className="section-label mb-0.5">Reasons</div>
                {c.final_reasons.map((r) => (
                  <div key={r} className="text-xs text-secondary">• {r}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* D. Final Checklist */}
        <div>
          <SectionTitle>D. Final Checklist</SectionTitle>
          <div className="space-y-3">
            {Object.entries(CHECKLIST_ITEMS).map(([category, items]) => (
              <div key={category}>
                <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
                  style={{ color: "var(--text-muted)" }}>
                  {category}
                </div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <label key={item.key} className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={!!checked[item.key]}
                        onChange={() => toggle(item.key)}
                        className="mt-0.5 accent-accent"
                      />
                      <span className={`text-xs transition-colors ${
                        checked[item.key]
                          ? "text-[#22c55e] line-through opacity-70"
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
        </div>

      </div>
    </div>
  );
};
