import React from "react";

const STAGES = [
  { step: "01", title: "Discovery", desc: "New token pairs are reviewed from the existing scanner data flow." },
  { step: "02", title: "Basic Filters", desc: "Market cap $300K-$10M, liquidity minimum $30K, 24h volume minimum $30K, Volume/MC ratio, and pair age." },
  { step: "03", title: "Security Review", desc: "Contract risk, tax risk, wallet concentration, and missing data are surfaced from the existing candidate source output." },
  { step: "04", title: "Final Label", desc: "WATCHLIST, CRITICAL_RISK, NEEDS_MANUAL_VERIFICATION, or REJECT based on the existing scanner logic." },
  { step: "05", title: "Analyst Review", desc: "The analyst uses local notes, status, and checklist items to organize further research." },
];

const BASIC_FILTERS = [
  "Market cap $300K - $10M",
  "Liquidity minimum $30K",
  "24h volume minimum $30K",
  "Volume/MC ratio reviewed",
  "Pair age reviewed",
];

const SECURITY_CHECKS = [
  "Honeypot status where available",
  "Tax thresholds",
  "Contract risk",
  "Mint, blacklist, whitelist, restriction, and proxy risks when available",
  "Missing data shown explicitly",
];

const LABELS = [
  { label: "WATCHLIST",                 color: "badge-watchlist", desc: "Watchlist Candidate. Manual Review Only." },
  { label: "CRITICAL_RISK",             color: "badge-critical",  desc: "Critical security flag detected. Manual investigation required." },
  { label: "NEEDS_MANUAL_VERIFICATION", color: "badge-manual",    desc: "Important security data is missing or unclear. Manual verification required." },
  { label: "REJECT",                    color: "badge-reject",    desc: "Failed basic market/liquidity filters. Not eligible for further review." },
];

export const Methodology: React.FC = () => (
  <div className="space-y-5 max-w-2xl">
    <div>
      <h2 className="text-sm font-semibold text-primary mb-0.5">Methodology</h2>
      <p className="text-xs text-secondary">
        Crypto Edge AI uses a staged review process to filter new tokens, detect risks, and surface candidates for further manual research.
      </p>
    </div>

    <div className="card p-4">
      <div className="section-label mb-4">Review Pipeline</div>
      <div className="relative">
        <div className="absolute left-[18px] top-0 bottom-0 w-px" style={{ background: "var(--border-sub)" }} />
        <div className="space-y-0">
          {STAGES.map((s, i) => (
            <div key={s.step} className="flex gap-4 relative">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 z-10"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border-sub)", color: "var(--accent)" }}>
                {s.step}
              </div>
              <div className={`pb-4 flex-1 ${i === STAGES.length - 1 ? "pb-0" : ""}`}>
                <div className="text-sm font-semibold text-primary leading-tight pt-1">{s.title}</div>
                <div className="text-xs text-secondary mt-0.5">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="card p-4">
        <div className="section-label mb-3">Basic Filters</div>
        <div className="space-y-1.5">
          {BASIC_FILTERS.map((f) => (
            <div key={f} className="flex items-center gap-2 text-xs text-secondary">
              <span className="text-[#32d184] shrink-0">OK</span>
              {f}
            </div>
          ))}
        </div>
      </div>
      <div className="card p-4">
        <div className="section-label mb-3">Security Checks</div>
        <div className="space-y-1.5">
          {SECURITY_CHECKS.map((f) => (
            <div key={f} className="flex items-center gap-2 text-xs text-secondary">
              <span className="text-accent shrink-0">&gt;</span>
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="card p-4">
      <div className="section-label mb-3">Decision Labels</div>
      <div className="space-y-2.5">
        {LABELS.map((l) => (
          <div key={l.label} className="flex items-start gap-3">
            <span className={`badge ${l.color} shrink-0 mt-0.5`}>{l.label.replace(/_/g, " ")}</span>
            <span className="text-xs text-secondary">{l.desc}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="rounded-md px-4 py-3 text-xs italic"
      style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
      Crypto Edge AI is a research and risk review tool. Human Manual Review Required. All decisions remain with the analyst.
    </div>
  </div>
);
