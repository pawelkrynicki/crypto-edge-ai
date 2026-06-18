# Codex Prompt: New Token Scanner Real Data Plan

You are working on Crypto Edge AI.

Crypto Edge AI is a web tool for crypto traders. It supports Research Review and New Token Scanner, with shared risk, score, confidence, checklist, and decision labels.

## Goal

Prepare a safe implementation plan for the Camp BETA real-data pipeline for New Token Scanner.

Do not implement code yet.

## Read First

- `docs/product_modes_research_and_scanner.md`.
- `docs/new_token_scanner_scope.md`.
- `docs/data_sources_v1.md`.
- `docs/rug_pull_risk_engine.md`.
- `docs/token_scorecard_model.md`.
- `docs/camp_beta_real_data_plan.md`.
- `docs/database_schema_design.md`.
- `docs/trpc_router_design.md`.

## Required Planning Areas

- DexScreener discovery.
- GoPlus Security.
- Honeypot.is.
- CoinGecko context.
- Fear & Greed sentiment.
- AIKINTEL Market News / Crypto mapping if accessible.
- Scorecard.
- Final checklist.
- Deal breaker behavior.

## Boundaries

Do not implement:

- Production cron scripts.
- Real API keys.
- Full UI.
- Auth.
- DB migrations.
- OpenAI calls.
- Trading signals.
- MT4.
- Exchange execution.
- Telegram.
- Discord.
- Payments.

## Safety Language

Allowed:

- Eligible for review.
- Not eligible for review.
- Watchlist candidate.
- Critical risk.
- Requires manual verification.
- Research priority.
- Risk review.

Forbidden:

- Buy.
- Sell.
- Enter now.
- Ape in.
- Guaranteed.
- Risk-free.
- Financial advice.
- Sure profit.
- Easy money.
