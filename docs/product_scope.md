# Product Scope

## Product Layers

The project has two related layers.

## 1. AIKINTEL Crypto Market Module

This is the platform-level crypto intelligence layer.

It should cover:

- Project evaluations.
- Crypto opportunities.
- Scam alerts.
- Market sentiment.
- On-chain analytics.
- AI-generated market summaries.
- Crypto news if it already exists in AIKINTEL.

Primary tables:

- `crypto_projects`.
- `crypto_scam_alerts`.
- `crypto_opportunities`.
- `crypto_onchain_metrics`.
- `crypto_market_summaries`.
- `crypto_news` if already available.

## 2. Crypto Edge AI

This is the trader-facing decision-support layer.

It should cover:

- Bias.
- Score.
- Risk.
- Confidence.
- Checklist.
- Setup review.
- Personal insights.
- Observation status.
- Decision-support AI commentary.

It must not recommend buying or selling.

## Camp v1 Scope

Camp v1 should include:

- Crypto Market / Crypto Edge page in AIKINTEL style.
- Crypto intelligence dashboard.
- Project/token list.
- Scam/risk alerts.
- Opportunities and narratives.
- Market summary.
- AI analysis JSON aligned with AIKINTEL guidelines.
- Score 0-100.
- Sentiment/bias: bullish, bearish, neutral.
- Confidence 0-100.
- Risk factors.
- Trader checklist.
- User status or personal insights if compatible with existing AIKINTEL architecture.
- tRPC router pattern.
- Cron script pattern.
- PM2-ready collection scripts.
- MySQL table conventions.

## Out of Scope

The following remain out of scope:

- Standalone FastAPI backend as the main backend.
- SQLite as the main database.
- Separate login system outside AIKINTEL.
- MT4 integration.
- Exchange integration.
- Telegram integration.
- Discord integration.
- Payments.
- Automated trading.
- Auto-buy or auto-sell.
- Signal bot.
- Copy trading.
- Hardcoded or committed API keys.

## Topic and Insight Statuses

For the trader-facing layer, user-specific statuses may include:

- `new`.
- `to_review`.
- `watching`.
- `rejected`.
- `played`.
- `archived`.

These should be introduced only if they fit the existing AIKINTEL user data architecture.
