import React from "react";
import { MOCK_SUMMARY } from "../mockData";

interface StatCardProps {
  label: string;
  value: number;
  colorClass: string;
  icon: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, colorClass, icon }) => (
  <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 flex flex-col gap-2 min-w-0">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-widest text-[#8b949e]">{label}</span>
      <span className="text-lg">{icon}</span>
    </div>
    <span className={`text-3xl font-bold tabular-nums ${colorClass}`}>{value}</span>
  </div>
);

export const StatCards: React.FC = () => {
  const stats: StatCardProps[] = [
    { label: "Total Candidates", value: MOCK_SUMMARY.total_candidates, colorClass: "text-[#58a6ff]", icon: "◈" },
    { label: "Watchlist", value: MOCK_SUMMARY.watchlist, colorClass: "text-[#3fb950]", icon: "✓" },
    { label: "Critical Risk", value: MOCK_SUMMARY.critical_risk, colorClass: "text-[#f85149]", icon: "⚠" },
    { label: "Needs Manual Review", value: MOCK_SUMMARY.needs_manual_verification, colorClass: "text-[#e3b341]", icon: "?" },
    { label: "Rejected", value: MOCK_SUMMARY.rejected, colorClass: "text-[#8b949e]", icon: "✕" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map((s) => (
        <StatCard key={s.label} {...s} />
      ))}
    </div>
  );
};
