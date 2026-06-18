import React from "react";
import type { FinalLabel } from "../mockData";

interface LabelBadgeProps {
  label: FinalLabel | string;
  size?: "sm" | "md";
  showDot?: boolean;
}

const LABEL_CONFIG: Record<string, { cls: string; text: string; dot: string }> = {
  WATCHLIST: {
    cls: "badge badge-watchlist",
    text: "Further review only",
    dot: "bg-[#22c55e]",
  },
  CRITICAL_RISK: {
    cls: "badge badge-critical",
    text: "Critical risk",
    dot: "bg-[#ef4444]",
  },
  NEEDS_MANUAL_VERIFICATION: {
    cls: "badge badge-manual",
    text: "Manual check",
    dot: "bg-[#f59e0b]",
  },
  REJECT: {
    cls: "badge badge-reject",
    text: "Rejected",
    dot: "bg-[#64748b]",
  },
};

export const LabelBadge: React.FC<LabelBadgeProps> = ({ label, size = "sm", showDot = true }) => {
  const cfg = LABEL_CONFIG[label] ?? {
    cls: "badge badge-reject",
    text: label,
    dot: "bg-[#64748b]",
  };
  const sizeClass = size === "md" ? "px-3 py-1 text-xs" : "";
  return (
    <span className={`${cfg.cls} ${sizeClass}`}>
      {showDot && <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
      {cfg.text}
    </span>
  );
};
