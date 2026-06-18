# Codex Prompt: AIKINTEL Backend Module Planning

You are working on Crypto Edge AI, now positioned as the trader-facing layer of the AIKINTEL Crypto Market Module.

Do not build a standalone FastAPI backend. Do not use SQLite as the primary database. Design for the existing AIKINTEL architecture.

## Target Stack

- Express.
- tRPC.
- MySQL / MariaDB.
- Drizzle ORM in `packages/webapp`.
- `mysql2/promise` in `packages/cron`.
- Node.js 20.
- TypeScript.
- PM2-managed cron scripts.

## Target Paths

- `packages/webapp/server/routers/cryptoMarket.ts`.
- `packages/cron/scripts/fetch-crypto-projects.ts`.
- `packages/cron/scripts/fetch-crypto-scam-alerts.ts`.
- `packages/cron/scripts/fetch-crypto-opportunities.ts`.
- `packages/cron/scripts/fetch-crypto-onchain.ts`.
- `packages/cron/scripts/generate-crypto-summary.ts`.
- `packages/cron/lib/db.ts`.

Do not modify `_core`.

## Required Tables

Plan for:

- `crypto_projects`.
- `crypto_scam_alerts`.
- `crypto_opportunities`.
- `crypto_onchain_metrics`.
- `crypto_market_summaries`.
- Existing `crypto_news` if available.

## Required Router Procedures

Design protected tRPC read procedures for:

- Projects.
- Scam alerts.
- Opportunities.
- Market summary.
- On-chain metrics.

Defer personal insight/status writes until the existing AIKINTEL user data model is confirmed.

## AI Rules

Use AIKINTEL `ai_analysis` JSON pattern:

- `model`.
- `analyzed_at`.
- `summary`.
- `key_points`.
- `sentiment`.
- `confidence`.
- `risk_factors`.
- `recommendation`.
- `raw_prompt_tokens`.
- `raw_completion_tokens`.

Do not implement full provider integration unless explicitly requested. Do not commit keys.

## Safety Boundaries

Do not build:

- Auto-buy.
- Auto-sell.
- Signal bot.
- Copy trading.
- MT4 integration.
- Exchange execution.
- Telegram/Discord integration.
- Payments.
