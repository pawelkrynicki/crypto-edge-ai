import React from "react";
import type { MockCandidate } from "../mockData";
import { LabelBadge } from "./LabelBadge";
import { formatReasonText, formatSecurityFlag } from "../utils/displayText";

interface Props {
  candidates: MockCandidate[];
}

const CHAIN_LABELS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bsc: "BSC",
  base: "BASE",
};

export const RiskAlerts: React.FC<Props> = ({ candidates }) => {
  const critical = candidates.filter((c) => c.final_label === "CRITICAL_RISK");
  const manual = candidates.filter((c) => c.final_label === "NEEDS_MANUAL_VERIFICATION");

  return (
    <div className="space-y-6 max-w-3xl">
      <Section
        icon="!"
        iconColor="text-[#ff6575]"
        title="Critical Risks"
        count={critical.length}
        borderColor="rgba(255,101,117,0.24)"
        bgColor="rgba(255,101,117,0.05)"
      >
        {critical.map((c) => (
          <AlertCard key={c.id} candidate={c} />
        ))}
      </Section>

      <Section
        icon="?"
        iconColor="text-[#f5b84b]"
        title="Manual Verification Required"
        count={manual.length}
        borderColor="rgba(245,184,75,0.24)"
        bgColor="rgba(245,184,75,0.05)"
      >
        {manual.map((c) => (
          <AlertCard key={c.id} candidate={c} />
        ))}
      </Section>
    </div>
  );
};

const Section: React.FC<{
  icon: string;
  iconColor: string;
  title: string;
  count: number;
  borderColor: string;
  bgColor: string;
  children: React.ReactNode;
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
  candidate: MockCandidate;
  borderColor?: string;
  bgColor?: string;
}

const AlertCard: React.FC<AlertCardProps> = ({ candidate: c, borderColor, bgColor }) => {
  const flags = c.security?.risk_flags ?? [];
  const missing = c.security?.missing_data ?? [];

  return (
    <div className="rounded-md p-4 space-y-3"
      style={{
        background: bgColor ?? "var(--bg-card)",
        border: `1px solid ${borderColor ?? "var(--border)"}`,
      }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-bold text-primary text-sm">{c.symbol}</span>
          <span className="text-[10px] text-secondary px-2 py-0.5 rounded-md"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
            {CHAIN_LABELS[c.chain] ?? c.chain.toUpperCase()} - {c.dex}
          </span>
        </div>
        <LabelBadge label={c.final_label} />
      </div>

      <div>
        <div className="section-label mb-1">Reasons</div>
        {c.final_reasons.map((r) => (
          <div key={r} className="text-xs text-secondary">- {formatReasonText(r)}</div>
        ))}
      </div>

      {flags.length > 0 && (
        <div>
          <div className="section-label mb-1">Risk Flags</div>
          <div className="flex flex-wrap gap-1">
            {flags.map((f) => <span key={f} className="badge badge-critical text-[10px]">{formatSecurityFlag(f)}</span>)}
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <div>
          <div className="section-label mb-1">Missing Data</div>
          <div className="flex flex-wrap gap-1">
            {missing.map((m) => <span key={m} className="badge badge-manual text-[10px]">{formatSecurityFlag(m)}</span>)}
          </div>
        </div>
      )}

      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Last checked: {new Date(c.last_checked).toLocaleString()}
      </div>
    </div>
  );
};
