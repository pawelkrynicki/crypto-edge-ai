import React from "react";
import { MOCK_CANDIDATES } from "../mockData";
import { LabelBadge } from "./LabelBadge";

const CHAIN_LABELS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bsc: "BSC",
  base: "BASE",
};

export const WatchlistTab: React.FC = () => {
  const watchlist = MOCK_CANDIDATES.filter((c) => c.final_label === "WATCHLIST");

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[#21262d] border border-[#30363d] rounded-lg px-4 py-3 flex items-start gap-3">
        <span className="text-[#3fb950] text-lg mt-0.5">ℹ</span>
        <p className="text-sm text-[#8b949e]">
          <strong className="text-gray-300">Watchlist</strong> means the token is eligible for further research. It is{" "}
          <strong className="text-yellow-400">not a recommendation</strong> and does not constitute a buy signal. The trader must conduct independent due diligence before any decision.
        </p>
      </div>

      <div className="space-y-3">
        {watchlist.map((c) => (
          <div key={c.id} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div>
                  <span className="font-bold text-gray-100">{c.symbol}</span>
                  <span className="text-[#8b949e] text-xs ml-2">{c.name}</span>
                </div>
                <span className="text-xs text-[#8b949e] bg-[#21262d] px-2 py-0.5 rounded">
                  {CHAIN_LABELS[c.chain] ?? c.chain.toUpperCase()} · {c.dex}
                </span>
              </div>
              <LabelBadge label={c.final_label} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <Stat label="Market Cap" value={`$${(c.market_cap_usd / 1_000_000).toFixed(2)}M`} />
              <Stat label="Liquidity" value={`$${(c.liquidity_usd / 1_000).toFixed(0)}K`} />
              <Stat label="24h Volume" value={`$${(c.volume_24h_usd / 1_000).toFixed(0)}K`} />
              <Stat label="Pair Age" value={`${c.pair_age_days} days`} />
            </div>

            <div>
              <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-1">Why Watchlist</div>
              <p className="text-xs text-gray-300">{c.final_reasons.join(" · ")}</p>
            </div>

            {c.security && c.security.missing_data.length > 0 && (
              <div>
                <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-1">Missing Manual Checks</div>
                <div className="flex flex-wrap gap-1">
                  {c.security.missing_data.map((m) => (
                    <span key={m} className="px-2 py-0.5 rounded text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-700/30">{m}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-[#8b949e]">
              <span>Last checked: {new Date(c.last_checked).toLocaleString()}</span>
              <span className="italic text-yellow-400/80">Further review only, not a buy signal.</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-[#21262d] rounded p-2">
    <div className="text-[#8b949e] uppercase tracking-widest text-xs mb-0.5">{label}</div>
    <div className="text-gray-200 font-semibold">{value}</div>
  </div>
);
