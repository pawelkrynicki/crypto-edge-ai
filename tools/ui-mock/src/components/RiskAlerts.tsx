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
  const manual   = MOCK_CANDIDATES.filter((c) => c.final_label === "NEEDS_MANUAL_VERIFICATION");

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Critical Risks */}
      <Section
        icon="▲"
        iconColor="text-[#ef4444]"
        title="Critical Risks"
        count={critical.length}
        borderColor="rgba(239,68,68,0.2)"
        bgColor="rgba(239,68,68,0.04)"
      >
        {critical.map((c) => (
          <AlertCard key={c.id} candidate={c} />
        ))}
      </Section>

      {/* Manual Verification */}
      <Section
        icon="?"
        iconColor="text-[#f59e0b]"
        title="Manual Verification Required"
        count={manual.length}
        borderColor="rgba(245,158,11,0.2)"
        bgColor="rgba(245,158,11,0.04)"
      >
        {manual.map((c) => (
          <AlertCard key={c.id} candidate={c} />
        ))}
      </Section>
    </div>
  );
};

const Section: React.FC<{
  icon: string; iconColor: string; title: string; count: number;
  borderColor: string; bgColor: string; children: React.ReactNode;
}> = ({ icon, iconColor, title, count, borderColor, bgColor, children }) => (
  <div>
    <div className="flex items-center gap-2 mb-3">
      <span className={`text-sm font-bold ${iconColor}`}>{icon}</span>
      <span className="text-sm font-semibold text-primary">{title}</span>
      <span className="text-xs text-secondary ml-1">({count})</span>
    </div>
    <div className="space-y-2.5">
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<AlertCardProps>, { borderColor, bgColor })
          : child
      )}
    </div>
  </div>
);

interface AlertCardProps {
  candidate: (typeof MOCK_CANDIDATES)[0];
  borderColor?: string;
  bgColor?: string;
}

const AlertCard: React.FC<AlertCardProps> = ({ candidate: c, borderColor, bgColor }) => {
  const flags   = c.security?.risk_flags ?? [];
  const missing = c.security?.missing_data ?? [];

  return (
    <div className="rounded-lg p-4 space-y-3"
      style={{
        background: bgColor ?? "var(--bg-card)",
        border: `1px solid ${borderColor ?? "var(--border)"}`,
      }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-bold text-primary text-sm">{c.symbol}</span>
          <span className="text-[10px] text-secondary px-2 py-0.5 rounded"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
            {CHAIN_LABELS[c.chain] ?? c.chain.toUpperCase()} · {c.dex}
          </span>
        </div>
        <LabelBadge label={c.final_label} />
      </div>

      <div>
        <div className="section-label mb-1">Reasons</div>
        {c.final_reasons.map((r) => (
          <div key={r} className="text-xs text-secondary">• {r}</div>
        ))}
      </div>

      {flags.length > 0 && (
        <div>
          <div className="section-label mb-1">Risk Flags</div>
          <div className="flex flex-wrap gap-1">
            {flags.map((f) => <span key={f} className="badge badge-critical text-[10px]">{f}</span>)}
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <div>
          <div className="section-label mb-1">Missing Data</div>
          <div className="flex flex-wrap gap-1">
            {missing.map((m) => <span key={m} className="badge badge-manual text-[10px]">{m}</span>)}
          </div>
        </div>
      )}

      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Last checked: {new Date(c.last_checked).toLocaleString()}
      </div>
    </div>
  );
};
