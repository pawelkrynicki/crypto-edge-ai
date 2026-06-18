import React from "react";
import type { FinalLabel } from "../mockData";

interface LabelBadgeProps {
  label: FinalLabel | string;
  size?: "sm" | "md";
}

const LABEL_CONFIG: Record<string, { cls: string; text: string }> = {
  WATCHLIST: {
    cls: "bg-green-900/60 text-green-400 border border-green-700/50",
    text: "WATCHLIST",
  },
  CRITICAL_RISK: {
    cls: "bg-red-900/60 text-red-400 border border-red-700/50",
    text: "CRITICAL RISK",
  },
  NEEDS_MANUAL_VERIFICATION: {
    cls: "bg-yellow-900/60 text-yellow-400 border border-yellow-700/50",
    text: "NEEDS REVIEW",
  },
  REJECT: {
    cls: "bg-gray-800 text-gray-500 border border-gray-700/50",
    text: "REJECT",
  },
};

export const LabelBadge: React.FC<LabelBadgeProps> = ({ label, size = "sm" }) => {
  const cfg = LABEL_CONFIG[label] ?? {
    cls: "bg-gray-800 text-gray-400 border border-gray-700",
    text: label,
  };
  const sizeClass = size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded font-semibold uppercase tracking-wide ${sizeClass} ${cfg.cls}`}
    >
      {cfg.text}
    </span>
  );
};
