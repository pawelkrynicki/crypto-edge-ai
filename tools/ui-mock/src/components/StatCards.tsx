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
  <div className="card px-4 py-3 flex flex-col gap-1.5 min-w-0">
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="section-label">{label}</span>
    </div>
    <div className={`text-2xl font-bold tabular-nums leading-none ${valueColor}`}>{value}</div>
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
      valueColor: "text-[#22c55e]",
      dotColor: "bg-[#22c55e]",
      sub: "eligible for further review",
    },
    {
      label: "Critical Risk",
      value: summary.critical_risk,
      valueColor: "text-[#ef4444]",
      dotColor: "bg-[#ef4444]",
      sub: "critical flag detected",
    },
    {
      label: "Needs Manual Check",
      value: summary.needs_manual_verification,
      valueColor: "text-[#f59e0b]",
      dotColor: "bg-[#f59e0b]",
      sub: "missing or unclear data",
    },
    {
      label: "Rejected",
      value: summary.rejected,
      valueColor: "text-[#64748b]",
      dotColor: "bg-[#64748b]",
      sub: "failed basic filters",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {stats.map((s) => (
        <StatCard key={s.label} {...s} />
      ))}
    </div>
  );
};
