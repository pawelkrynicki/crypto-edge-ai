import React from "react";
import { MOCK_CANDIDATES } from "../mockData";
import { LabelBadge } from "./LabelBadge";

const CHAIN_LABELS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bsc: "BSC",
  base: "BASE",
};

export const RiskAlerts: React.FC = () => {
  const critical = MOCK_CANDIDATES.filter((c) => c.final_label === "CRITICAL_RISK");
  const manual = MOCK_CANDIDATES.filter((c) => c.final_label === "NEEDS_MANUAL_VERIFICATION");

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Critical Risks */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[#f85149] text-lg">⚠</span>
          <h3 className="text-sm font-semibold text-[#f85149] uppercase tracking-wide">Critical Risks</h3>
          <span className="text-xs text-[#8b949e]">({critical.length})</span>
        </div>
        <div className="space-y-3">
          {critical.map((c) => (
            <AlertCard key={c.id} candidate={c} variant="critical" />
          ))}
        </div>
      </div>

      {/* Manual Verification */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[#e3b341] text-lg">?</span>
          <h3 className="text-sm font-semibold text-[#e3b341] uppercase tracking-wide">Manual Verification Required</h3>
          <span className="text-xs text-[#8b949e]">({manual.length})</span>
        </div>
        <div className="space-y-3">
          {manual.map((c) => (
            <AlertCard key={c.id} candidate={c} variant="manual" />
          ))}
        </div>
      </div>
    </div>
  );
};

interface AlertCardProps {
  candidate: (typeof MOCK_CANDIDATES)[0];
  variant: "critical" | "manual";
}

const AlertCard: React.FC<AlertCardProps> = ({ candidate: c, variant }) => {
  const borderClass = variant === "critical" ? "border-red-800/50" : "border-yellow-800/50";
  const bgClass = variant === "critical" ? "bg-red-900/10" : "bg-yellow-900/10";

  const flags = c.security?.risk_flags ?? [];
  const missing = c.security?.missing_data ?? [];

  return (
    <div className={`bg-[#161b22] border ${borderClass} ${bgClass} rounded-lg p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-100">{c.symbol}</span>
          <span className="text-xs text-[#8b949e] bg-[#21262d] px-2 py-0.5 rounded">
            {CHAIN_LABELS[c.chain] ?? c.chain.toUpperCase()} · {c.dex}
          </span>
        </div>
        <LabelBadge label={c.final_label} />
      </div>

      <div>
        <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-1">Reasons</div>
        <ul className="space-y-0.5">
          {c.final_reasons.map((r) => (
            <li key={r} className="text-xs text-gray-300">• {r}</li>
          ))}
        </ul>
      </div>

      {flags.length > 0 && (
        <div>
          <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-1">Risk Flags</div>
          <div className="flex flex-wrap gap-1">
            {flags.map((f) => (
              <span key={f} className="px-2 py-0.5 rounded text-xs bg-red-900/40 text-red-400 border border-red-700/40">{f}</span>
            ))}
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <div>
          <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-1">Missing Data</div>
          <div className="flex flex-wrap gap-1">
            {missing.map((m) => (
              <span key={m} className="px-2 py-0.5 rounded text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-700/40">{m}</span>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-[#8b949e]">Last checked: {new Date(c.last_checked).toLocaleString()}</div>
    </div>
  );
};
