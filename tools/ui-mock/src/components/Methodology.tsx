import React from "react";

const STAGES = [
  { step: "1", title: "Discovery", desc: "New token pairs are discovered via DexScreener search across supported chains (Solana, Ethereum, BSC, Base)." },
  { step: "2", title: "Basic Filters", desc: "Candidates are filtered by market cap ($300K–$10M), liquidity (min $30K), 24h volume (min $30K), volume/MC ratio, and pair age." },
  { step: "3", title: "Security Enrichment", desc: "Passing candidates are checked against GoPlus and Honeypot.is for contract risk, tax risk, mint/blacklist/sell restriction risk, and wallet concentration." },
  { step: "4", title: "Final Label", desc: "Each candidate receives a final label: WATCHLIST, CRITICAL_RISK, NEEDS_MANUAL_VERIFICATION, or REJECT, based on combined filter and security results." },
  { step: "5", title: "Trader Checklist", desc: "The trader reviews the checklist for each watchlist candidate before making any independent research decision." },
];

const BASIC_FILTERS = [
  "Market cap $300K – $10M",
  "Liquidity minimum $30K",
  "24h volume minimum $30K",
  "Volume/MC ratio reviewed",
  "Pair age reviewed",
];

const SECURITY_CHECKS = [
  "GoPlus token security API",
  "Honeypot.is detection",
  "Contract risk (verified / unverified)",
  "Tax risk (buy/sell tax thresholds)",
  "Mint risk / blacklist risk / sell restriction risk",
  "Missing data shown explicitly — not hidden",
];

const LABELS = [
  { label: "WATCHLIST", color: "text-green-400", desc: "Passed basic filters and available security checks. Eligible for further review only." },
  { label: "CRITICAL_RISK", color: "text-red-400", desc: "Critical security flag detected. Do not proceed without manual investigation." },
  { label: "NEEDS_MANUAL_VERIFICATION", color: "text-yellow-400", desc: "Important security data is missing or unclear. Manual verification required." },
  { label: "REJECT", color: "text-gray-500", desc: "Failed basic market/liquidity filters. Not eligible for further review." },
];

export const Methodology: React.FC = () => (
  <div className="space-y-6 max-w-2xl">
    <div>
      <h2 className="text-base font-semibold text-gray-100 mb-1">Methodology</h2>
      <p className="text-sm text-[#8b949e]">
        Crypto Edge AI uses a staged review process to filter new tokens, detect risks, and surface candidates worth further manual research.
      </p>
    </div>

    {/* Pipeline */}
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 space-y-4">
      <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold">Review Pipeline</div>
      <div className="space-y-3">
        {STAGES.map((s) => (
          <div key={s.step} className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-[#58a6ff]/20 border border-[#58a6ff]/40 flex items-center justify-center text-xs font-bold text-[#58a6ff] shrink-0 mt-0.5">
              {s.step}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-200">{s.title}</div>
              <div className="text-xs text-[#8b949e] mt-0.5">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Basic Filters */}
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
      <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-3">Basic Filters</div>
      <ul className="space-y-1">
        {BASIC_FILTERS.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-[#3fb950] text-xs">✓</span>
            {f}
          </li>
        ))}
      </ul>
    </div>

    {/* Security Checks */}
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
      <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-3">Security Checks</div>
      <ul className="space-y-1">
        {SECURITY_CHECKS.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-[#58a6ff] text-xs">→</span>
            {f}
          </li>
        ))}
      </ul>
    </div>

    {/* Decision Labels */}
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
      <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-3">Decision Labels</div>
      <div className="space-y-3">
        {LABELS.map((l) => (
          <div key={l.label} className="flex gap-3">
            <span className={`text-xs font-bold uppercase tracking-wide shrink-0 w-40 ${l.color}`}>{l.label}</span>
            <span className="text-xs text-[#8b949e]">{l.desc}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Disclaimer */}
    <div className="bg-[#21262d] border border-[#30363d] rounded-lg px-4 py-3">
      <p className="text-xs text-[#8b949e] italic">
        Crypto Edge AI is a research and risk review tool. It does not provide financial advice, trading signals, or investment recommendations. All decisions remain with the trader.
      </p>
    </div>
  </div>
);
