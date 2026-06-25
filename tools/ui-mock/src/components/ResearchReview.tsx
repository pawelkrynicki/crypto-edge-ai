import React, { useState } from "react";

const MOCK_RESULT = {
  category: "token_review",
  score: 72,
  bias: "neutral",
  confidence: "medium",
  main_risks: [
    "Unclear source - verify origin of information",
    "High volatility - price action may not reflect fundamentals",
    "Needs security verification - contract not independently confirmed",
  ],
  checklist: [
    "Verify contract address and visible security fields",
    "Check liquidity depth and lock status",
    "Check holder distribution where data is available",
    "Compare with broader market context",
  ],
};

const BIAS_COLOR: Record<string, string> = {
  neutral:     "text-accent",
  speculative: "text-[#f5b84b]",
  "risk-on":   "text-[#ff6575]",
  caution:     "text-[#f5b84b]",
};

const SCORE_COLOR = (s: number) =>
  s >= 70 ? "text-[#32d184]" : s >= 50 ? "text-[#f5b84b]" : "text-[#ff6575]";

export const ResearchReview: React.FC = () => {
  const [text, setText] = useState("");
  const [result, setResult] = useState<typeof MOCK_RESULT | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = () => {
    if (!text.trim()) return;
    setLoading(true);
    setTimeout(() => { setResult(MOCK_RESULT); setLoading(false); }, 900);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-5xl">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-primary mb-0.5">Research Review</h2>
          <p className="text-xs text-secondary">
            Paste a news snippet, token description, market event, link, or your own observation to surface key risk considerations.
          </p>
        </div>
        <div className="card p-4 flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste news, token description, market event, link or your own observation..."
            rows={8}
            className="ai-input"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>
              Mock review only. External model connection is not enabled in this preview.
            </span>
            <button
              onClick={handleAnalyze}
              disabled={!text.trim() || loading}
              className="btn-primary"
            >
              {loading ? "Analyzing..." : "Analyze topic"}
            </button>
          </div>
        </div>
      </div>

      <div>
        {result ? (
          <div className="card p-4 space-y-4">
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--border)" }}>
              <span className="section-label">Analysis Result</span>
              <span className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>
                Mock review only.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MetaCard label="Category" value={result.category} />
              <MetaCard label="Score" value={String(result.score)} valueClass={SCORE_COLOR(result.score)} />
              <MetaCard label="Bias" value={result.bias} valueClass={BIAS_COLOR[result.bias]} />
              <MetaCard label="Confidence" value={result.confidence} />
            </div>

            <div>
              <div className="section-label mb-2">Main Risks</div>
              <div className="space-y-1.5">
                {result.main_risks.map((r) => (
                  <div key={r} className="flex items-start gap-2 text-xs"
                    style={{ color: "var(--text-secondary)" }}>
                    <span className="text-[#ff6575] shrink-0 mt-0.5">!</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="section-label mb-2">Checklist</div>
              <div className="space-y-1.5">
                {result.checklist.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-xs"
                    style={{ color: "var(--text-secondary)" }}>
                    <span className="text-accent shrink-0 mt-0.5">&gt;</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t text-[10px] italic" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              Crypto Edge AI is a research and risk review tool. This is not a buy/sell signal.
            </div>
          </div>
        ) : (
          <div className="card p-6 flex flex-col items-center justify-center h-full min-h-[200px] text-center gap-2">
            <div className="text-2xl opacity-20">RR</div>
            <p className="text-secondary text-xs">Enter text on the left and click Analyze topic to see a mock review.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const MetaCard: React.FC<{ label: string; value: string; valueClass?: string }> = ({ label, value, valueClass }) => (
  <div className="rounded-md px-3 py-2.5" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
    <div className="section-label mb-1">{label}</div>
    <div className={`text-sm font-semibold ${valueClass ?? "text-primary"}`}>{value}</div>
  </div>
);
