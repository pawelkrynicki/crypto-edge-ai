# AI Scoring Model

## Purpose

The AI layer supports the full Crypto Edge AI product: Research Review, New Token Scanner, Risk Engine, Setup Review, and Final Checklist.

It must not provide buy or sell signals.

## Research Review Output

Research Review should return:

- `category`.
- `score`.
- `bias`.
- `confidence`.
- `risk_level`.
- `summary`.
- `reasoning`.
- `risk_factors`.
- `checklist`.
- `decision_label`.
- `disclaimer_note`.

Categories:

- `news_event`.
- `token_review`.
- `narrative`.
- `risk_alert`.
- `market_observation`.
- `setup_review`.
- `low_value_noise`.
- `scam_suspicious`.

## New Token Scanner Scorecard

Use a 100-point scorecard:

- Security: max 30.
- On-Chain: max 25.
- Social: max 25.
- Narrative: max 20.

Output:

- `security_score`.
- `onchain_score`.
- `social_score`.
- `narrative_score`.
- `total_score`.
- `decision_label`.
- `risk_level`.
- `confidence`.

## Decision Labels

- `REJECT`.
- `WATCHLIST`.
- `HIGH_CONVICTION_REVIEW`.
- `CRITICAL_RISK`.
- `NOT_ELIGIBLE_FOR_REVIEW`.

## AIKINTEL JSON Pattern

Every table with `ai_analysis` should follow this structure:

```json
{
  "model": "gpt-4o",
  "analyzed_at": "2026-06-16T12:00:00Z",
  "summary": "Brief 1-2 sentence summary",
  "key_points": ["point1", "point2", "point3"],
  "sentiment": "bullish|bearish|neutral",
  "confidence": 75,
  "risk_factors": ["factor1", "factor2"],
  "recommendation": "Short research-support recommendation",
  "raw_prompt_tokens": 1500,
  "raw_completion_tokens": 800
}
```

## Crypto Edge AI Extensions

For trader-facing views, the AIKINTEL output may be mapped to:

- `score`: 0-100 research priority or opportunity/risk relevance.
- `bias`: bullish, bearish, neutral.
- `confidence`: 0-100.
- `risk_factors`: risk review.
- `checklist`: things to verify before trading.
- `status`: optional personal observation status.

## Allowed AI Outputs

AI may return:

- Market context.
- Bias.
- Risk review.
- Checklist.
- Research summary.
- Decision support.
- Things to verify before trading.
- Data quality warnings.
- Scam or risk red flags.
- Eligible for review.
- Not eligible for review.
- Watchlist candidate.
- Critical risk.
- Requires manual verification.
- Research priority.

## Forbidden AI Outputs

AI must not return direct commands or promises such as:

- `buy`.
- `sell`.
- `enter now`.
- `ape in`.
- `guaranteed profit`.
- `sure setup`.
- `risk-free`.
- `financial advice`.
- `sure profit`.
- `easy money`.

## Sentiment and Bias

Allowed values:

- `bullish`.
- `bearish`.
- `neutral`.

Bias is not a trading instruction. It is a research label describing the current interpretation of available data.

## Confidence

Confidence is a 0-100 estimate of how reliable the analysis is based on available data quality, source consistency, and signal clarity.

Confidence is not a probability of profit.

## Score

Score is a 0-100 research-priority or opportunity/risk relevance value.

Suggested interpretation:

- 0-20: low value, noisy, or dangerous.
- 21-40: weak research priority.
- 41-60: mixed and requires verification.
- 61-80: worth deeper research.
- 81-100: high research priority, still not a trading signal.

## Recommendation Field Rule

The AIKINTEL `recommendation` field must be treated as research guidance only.

Acceptable examples:

- "Verify liquidity, token unlocks, and source quality before considering this topic further."
- "Monitor the narrative for confirmation across independent sources."
- "Treat as high risk until contract and team information are verified."

Unacceptable examples:

- "Buy now."
- "Sell immediately."
- "Enter with leverage."
- "This is a guaranteed setup."
