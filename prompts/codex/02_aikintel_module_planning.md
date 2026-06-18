# Codex Prompt: AIKINTEL Crypto Market Module Planning

You are planning the AIKINTEL Crypto Market Module.

Crypto Edge AI is the trader-facing layer, but the technical implementation must fit AIKINTEL.

## Task

Create an implementation plan for the module without writing full production code yet.

Cover:

- MySQL/MariaDB schema.
- Drizzle mapping considerations.
- `cryptoMarket` tRPC router.
- Frontend `/crypto-market` page.
- Cron scripts.
- PM2 process entries.
- AI analysis JSON pattern.
- Camp v1 release boundaries.

## Required Tables

- `crypto_projects`.
- `crypto_scam_alerts`.
- `crypto_opportunities`.
- `crypto_onchain_metrics`.
- `crypto_market_summaries`.

Use `crypto_news` only if it already exists in AIKINTEL.

## Rules

- Do not modify `_core`.
- Do not add hardcoded credentials.
- Do not use frontend external fetches.
- Do not build standalone auth.
- Do not implement trading execution.
- Do not create buy/sell signals.
