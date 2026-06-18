import React, { useState } from "react";

const MOCK_RESULT = {
  category: "token_review",
  score: 72,
  bias: "neutral",
  confidence: "medium",
  main_risks: [
    "Unclear source — verify origin of information",
    "High volatility — price action may not reflect fundamentals",
    "Needs security verification — contract not independently confirmed",
  ],
  checklist: [
    "Verify contract address on GoPlus / Honeypot.is",
    "Check liquidity depth and lock status",
    "Check holder distribution (top wallets)",
    "Compare with broader market context",
  ],
};

export const ResearchReview: React.FC = () => {
  const [text, setText] = useState("");
  const [result, setResult] = useState<typeof MOCK_RESULT | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = () => {
    if (!text.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setResult(MOCK_RESULT);
      setLoading(false);
    }, 900);
  };

  const BIAS_COLOR: Record<string, string> = {
    neutral: "text-[#58a6ff]",
    speculative: "text-[#e3b341]",
    "risk-on": "text-[#f85149]",
    caution: "text-[#e3b341]",
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-100 mb-1">Research Review</h2>
        <p className="text-sm text-[#8b949e]">
          Paste a news snippet, token description, market event, link, or your own observation. The tool will categorise it and surface key risk considerations.
        </p>
      </div>

      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste news, token description, market event, link or your own observation…"
          rows={6}
          className="w-full bg-[#0d1117] border border-[#30363d] rounded text-sm text-gray-200 placeholder-[#8b949e] px-3 py-2 resize-none focus:outline-none focus:border-[#58a6ff]/60"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8b949e] italic">AI review mock — not connected to OpenAI yet.</span>
          <button
            onClick={handleAnalyze}
            disabled={!text.trim() || loading}
            className="px-4 py-2 rounded text-sm font-medium bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/40 hover:bg-[#58a6ff]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Analyzing…" : "Analyze topic"}
          </button>
        </div>
      </div>

      {result && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#21262d] pb-3">
            <span className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold">Mock Analysis Result</span>
            <span className="ml-auto text-xs text-[#8b949e] italic">AI review mock, not connected to OpenAI yet.</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetaCard label="Category" value={result.category} />
            <MetaCard label="Score" value={String(result.score)} highlight />
            <MetaCard label="Bias" value={result.bias} colorClass={BIAS_COLOR[result.bias]} />
            <MetaCard label="Confidence" value={result.confidence} />
          </div>

          <div>
            <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-2">Main Risks</div>
            <ul className="space-y-1">
              {result.main_risks.map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm text-[#f85149]/90">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs text-[#8b949e] uppercase tracking-widest font-semibold mb-2">Checklist</div>
            <ul className="space-y-1">
              {result.checklist.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="mt-0.5 text-[#58a6ff] shrink-0">→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-2 border-t border-[#21262d]">
            <p className="text-xs text-[#8b949e] italic">
              Crypto Edge AI is a research and risk review tool. It does not provide financial advice, trading signals, or investment recommendations.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const MetaCard: React.FC<{ label: string; value: string; highlight?: boolean; colorClass?: string }> = ({
  label, value, highlight, colorClass,
}) => (
  <div className="bg-[#21262d] rounded p-3">
    <div className="text-xs text-[#8b949e] uppercase tracking-widest mb-1">{label}</div>
    <div className={`text-sm font-semibold ${colorClass ?? (highlight ? "text-[#58a6ff]" : "text-gray-200")}`}>{value}</div>
  </div>
);
