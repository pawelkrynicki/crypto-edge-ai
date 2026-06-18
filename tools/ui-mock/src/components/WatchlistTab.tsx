import React from "react";
import { MOCK_CANDIDATES } from "../mockData";
import { LabelBadge } from "./LabelBadge";

const CHAIN_LABELS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bsc: "BSC",
  base: "BASE",
};

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

export const WatchlistTab: React.FC = () => {
  const watchlist = MOCK_CANDIDATES.filter((c) => c.final_label === "WATCHLIST");

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Disclaimer banner */}
      <div className="rounded-md px-4 py-2.5 flex items-start gap-2.5"
        style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)" }}>
        <span className="text-accent text-sm mt-0.5 shrink-0">ℹ</span>
        <p className="text-xs text-secondary">
          <strong className="text-primary">Watchlist</strong> means the token is eligible for further research only. It is{" "}
          <strong className="text-[#f59e0b]">not a recommendation</strong> and does not constitute a buy signal. Independent due diligence is required before any decision.
        </p>
      </div>

      {/* Token cards */}
      <div className="space-y-2.5">
        {watchlist.map((c) => (
          <div key={c.id} className="card p-4 space-y-3">
            {/* Top row */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div>
                  <span className="font-bold text-primary text-sm">{c.symbol}</span>
                  <span className="text-secondary text-xs ml-2">{c.name}</span>
                </div>
                <span className="text-[10px] text-secondary px-2 py-0.5 rounded"
                  style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
                  {CHAIN_LABELS[c.chain] ?? c.chain.toUpperCase()} · {c.dex}
                </span>
              </div>
              <LabelBadge label={c.final_label} />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Market Cap", value: fmtUsd(c.market_cap_usd) },
                { label: "Liquidity", value: fmtUsd(c.liquidity_usd) },
                { label: "24h Volume", value: fmtUsd(c.volume_24h_usd) },
                { label: "Pair Age", value: `${c.pair_age_days}d` },
              ].map((s) => (
                <div key={s.label} className="rounded px-2.5 py-2"
                  style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
                  <div className="section-label mb-0.5">{s.label}</div>
                  <div className="text-sm font-semibold text-primary">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Why watchlist */}
            <div>
              <div className="section-label mb-1">Why Watchlist</div>
              <p className="text-xs text-secondary">{c.final_reasons.join(" · ")}</p>
            </div>

            {/* Missing checks */}
            {c.security && c.security.missing_data.length > 0 && (
              <div>
                <div className="section-label mb-1">Missing Manual Checks</div>
                <div className="flex flex-wrap gap-1">
                  {c.security.missing_data.map((m) => (
                    <span key={m} className="badge badge-manual text-[10px]">{m}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-[10px]"
              style={{ color: "var(--text-muted)" }}>
              <span>Last checked: {new Date(c.last_checked).toLocaleString()}</span>
              <span className="italic text-[#f59e0b]/70">Further review only, not a buy signal.</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
