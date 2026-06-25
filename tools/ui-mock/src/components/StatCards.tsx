import React from "react";

export interface ScanSummary {
  total_candidates:          number;
  watchlist:                 number;
  critical_risk:             number;
  needs_manual_verification: number;
  rejected:                  number;
}

interface StatCardProps {
  label: string;
  value: number;
  valueColor: string;
  dotColor: string;
  sub: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, valueColor, dotColor, sub }) => (
  <div className="stat-card flex flex-col gap-1">
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="section-label">{label}</span>
    </div>
    <div className={`text-xl font-bold tabular-nums leading-none ${valueColor}`}>{value}</div>
    <div className="text-[10px] text-muted leading-none">{sub}</div>
  </div>
);

interface Props {
  summary: ScanSummary;
}

export const StatCards: React.FC<Props> = ({ summary }) => {
  const stats: StatCardProps[] = [
    {
      label: "Total Candidates",
      value: summary.total_candidates,
      valueColor: "text-primary",
      dotColor: "bg-accent",
      sub: "in current scan",
    },
    {
      label: "Watchlist",
      value: summary.watchlist,
      valueColor: "text-[#32d184]",
      dotColor: "bg-[#32d184]",
      sub: "eligible for further review",
    },
    {
      label: "Critical Risk",
      value: summary.critical_risk,
      valueColor: "text-[#ff6575]",
      dotColor: "bg-[#ff6575]",
      sub: "critical flag detected",
    },
    {
      label: "Needs Manual Check",
      value: summary.needs_manual_verification,
      valueColor: "text-[#f5b84b]",
      dotColor: "bg-[#f5b84b]",
      sub: "missing or unclear data",
    },
    {
      label: "Rejected",
      value: summary.rejected,
      valueColor: "text-[#8fa0ad]",
      dotColor: "bg-[#8fa0ad]",
      sub: "failed basic filters",
    },
  ];

  return (
    <div className="stat-strip">
      {stats.map((s) => (
        <StatCard key={s.label} {...s} />
      ))}
    </div>
  );
};
