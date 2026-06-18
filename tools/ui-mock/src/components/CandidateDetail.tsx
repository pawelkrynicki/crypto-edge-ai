import React, { useState } from "react";
import type { MockCandidate } from "../mockData";
import { LabelBadge } from "./LabelBadge";

interface Props {
  candidate: MockCandidate;
  onClose?: () => void;
}

function fmt(n: number | null, prefix = "", decimals = 0): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`;
  return `${prefix}${n.toFixed(decimals)}`;
}

function pct(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function boolDisplay(v: boolean | null): React.ReactNode {
  if (v === null) return <span className="text-yellow-400 text-xs">Missing / manual verification required</span>;
  return v ? (
    <span className="text-green-400 text-xs">Yes</span>
  ) : (
    <span className="text-red-400 text-xs">No</span>
  );
}

function riskDisplay(v: boolean | null, riskIfTrue = true): React.ReactNode {
  if (v === null) return <span className="text-yellow-400 text-xs">Missing / manual verification required</span>;
  const isRisk = riskIfTrue ? v : !v;
  return isRisk ? (
    <span className="text-red-400 text-xs">Detected</span>
  ) : (
    <span className="text-green-400 text-xs">Not detected</span>
  );
}

const DECISION_COPY: Record<string, { explanation: string; nextStep: string }> = {
  WATCHLIST: {
    explanation: "Passed basic filters and available security checks. Eligible for further review only.",
    nextStep: "Add to personal watchlist. Conduct manual community, narrative, and chart review before any decision.",
  },
  CRITICAL_RISK: {
    explanation: "Critical security flag detected. Do not proceed to setup review without manual investigation.",
    nextStep: "Investigate flagged risks manually. Do not proceed without resolving all critical flags.",
  },
  NEEDS_MANUAL_VERIFICATION: {
    explanation: "Important security data is missing or unclear. Manual verification required.",
    nextStep: "Manually verify missing data points before making any further assessment.",
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
    { key: "community", label: "Community quality — manual review still needed" },
    { key: "narrative", label: "Narrative — manual review still needed" },
  ],
  "Personal Risk": [
    { key: "notSignal", label: "I understand this is not a buy signal" },
    { key: "mayFail", label: "I accept that token may still fail after review" },
    { key: "riskRules", label: "I have position risk rules before any decision" },
  ],
};

type CheckedState = Record<string, boolean>;

export const CandidateDetail: React.FC<Props> = ({ candidate: c, onClose }) => {
  const [checked, setChecked] = useState<CheckedState>({});
  const sec = c.security;
  const decision = DECISION_COPY[c.final_label];

  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-y-auto max-h-[calc(100vh-200px)] text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] sticky top-0 bg-[#161b22] z-10">
        <div>
          <span className="font-bold text-gray-100 text-base">{c.symbol}</span>
          <span className="text-[#8b949e] ml-2 text-xs">{c.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <LabelBadge label={c.final_label} />
          {onClose && (
            <button onClick={onClose} className="text-[#8b949e] hover:text-gray-200 text-lg leading-none">×</button>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-5">
        {/* Meta */}
        <div className="space-y-1">
          <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-1">Token Info</div>
          <Row label="Chain" value={c.chain.toUpperCase()} />
          <Row label="DEX" value={c.dex} />
          <Row label="Contract" value={<code className="text-xs text-[#8b949e] break-all">{c.contract_address}</code>} />
          <Row label="Pair" value={<code className="text-xs text-[#8b949e] break-all">{c.pair_address}</code>} />
          <Row
            label="Source"
            value={
              <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="text-[#58a6ff] hover:underline text-xs truncate block max-w-[180px]">
                DexScreener ↗
              </a>
            }
          />
        </div>

        {/* A. Market Snapshot */}
        <Section title="A. Market Snapshot">
          <Row label="Price" value={c.price_usd !== null ? `$${c.price_usd.toFixed(6)}` : "—"} />
          <Row label="Market Cap" value={fmt(c.market_cap_usd, "$")} />
          <Row label="FDV" value={fmt(c.fdv_usd, "$")} />
          <Row label="Liquidity" value={fmt(c.liquidity_usd, "$")} />
          <Row label="24h Volume" value={fmt(c.volume_24h_usd, "$")} />
          <Row label="Volume/MC" value={pct(c.volume_market_cap_ratio)} />
          <Row label="Pair Age" value={`${c.pair_age_days} days`} />
        </Section>

        {/* B. Security Check */}
        <Section title="B. Security Check">
          {sec ? (
            <>
              <Row label="Honeypot" value={
                sec.honeypot_status === "passed" ? <span className="text-green-400 text-xs">Passed</span>
                  : sec.honeypot_status === "failed" ? <span className="text-red-400 text-xs">DETECTED</span>
                  : <span className="text-yellow-400 text-xs">Unknown</span>
              } />
              <Row label="Buy Tax" value={sec.buy_tax !== null ? `${sec.buy_tax}%` : "—"} />
              <Row label="Sell Tax" value={sec.sell_tax !== null ? `${sec.sell_tax}%` : "—"} />
              <Row label="Contract Verified" value={boolDisplay(sec.contract_verified)} />
              <Row label="Ownership" value={
                sec.ownership_status === "renounced" ? <span className="text-green-400 text-xs">Renounced</span>
                  : sec.ownership_status === "active" ? <span className="text-red-400 text-xs">Active</span>
                  : <span className="text-yellow-400 text-xs">Unknown</span>
              } />
              <Row label="Liquidity Locked" value={boolDisplay(sec.liquidity_locked)} />
              <Row label="Mint Risk" value={riskDisplay(sec.mint_risk)} />
              <Row label="Blacklist Risk" value={riskDisplay(sec.blacklist_risk)} />
              <Row label="Sell Restriction" value={riskDisplay(sec.sell_restriction_risk)} />
              <Row label="Top Wallet %" value={sec.top_wallet_pct !== null ? `${sec.top_wallet_pct}%` : <span className="text-yellow-400 text-xs">Missing / manual verification required</span>} />
              <Row label="Top 10 Wallets %" value={sec.top_10_wallets_pct !== null ? `${sec.top_10_wallets_pct}%` : <span className="text-yellow-400 text-xs">Missing / manual verification required</span>} />
              {sec.risk_flags.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-[#8b949e] mb-1">Risk Flags</div>
                  <div className="flex flex-wrap gap-1">
                    {sec.risk_flags.map((f) => (
                      <span key={f} className="px-2 py-0.5 rounded text-xs bg-red-900/40 text-red-400 border border-red-700/40">{f}</span>
                    ))}
                  </div>
                </div>
              )}
              {sec.missing_data.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-[#8b949e] mb-1">Missing Data</div>
                  <div className="flex flex-wrap gap-1">
                    {sec.missing_data.map((f) => (
                      <span key={f} className="px-2 py-0.5 rounded text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-700/40">{f}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-[#8b949e] text-xs italic">Security check not performed — token rejected at basic filter stage.</p>
          )}
        </Section>

        {/* C. Decision Box */}
        <Section title="C. Decision Box">
          <div className="mb-2">
            <LabelBadge label={c.final_label} size="md" />
          </div>
          {c.final_label === "WATCHLIST" && (
            <p className="text-xs text-green-400/70 italic mb-2">Further review only, not a buy signal.</p>
          )}
          <p className="text-gray-300 text-xs mb-2">{decision.explanation}</p>
          <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-1">Trader Next Step</div>
          <p className="text-gray-400 text-xs">{decision.nextStep}</p>
          {c.final_reasons.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-1">Reasons</div>
              <ul className="space-y-0.5">
                {c.final_reasons.map((r) => (
                  <li key={r} className="text-xs text-gray-400">• {r}</li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* D. Final Checklist */}
        <Section title="D. Final Checklist">
          {Object.entries(CHECKLIST_ITEMS).map(([category, items]) => (
            <div key={category} className="mb-3">
              <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-1">{category}</div>
              <div className="space-y-1">
                {items.map((item) => (
                  <label key={item.key} className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!checked[item.key]}
                      onChange={() => toggle(item.key)}
                      className="mt-0.5 accent-[#58a6ff]"
                    />
                    <span className={`text-xs ${checked[item.key] ? "text-green-400 line-through" : "text-gray-300 group-hover:text-gray-100"}`}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-2 border-b border-[#21262d] pb-1">{title}</div>
    <div className="space-y-1">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-2">
    <span className="text-[#8b949e] text-xs shrink-0">{label}</span>
    <span className="text-gray-300 text-xs text-right">{value}</span>
  </div>
);
