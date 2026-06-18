# Crypto Edge AI / AIKINTEL Crypto Market Module

Crypto Edge AI is the working name for the trader-facing decision-support layer inside the AIKINTEL Crypto Market Module.

The strategic direction has changed: this project is no longer planned as a standalone FastAPI + SQLite web application. It should be designed as a crypto intelligence module that fits into the existing AIKINTEL Market Intelligence platform technically, visually, and product-wise.

## Product Positioning

AIKINTEL Crypto Market Module is the platform-level market intelligence layer for crypto data:

- Project evaluations.
- Opportunities and narratives.
- Scam and risk alerts.
- Market sentiment.
- On-chain analytics.
- AI-generated market summaries.
- Crypto news when available in AIKINTEL.

Crypto Edge AI remains the working name for the trader-facing layer:

- Bias.
- Score.
- Risk.
- Confidence.
- Checklist.
- Setup review.
- Personal insights.
- Observation status.
- AI decision-support commentary.

Crypto Edge AI must not provide buy or sell recommendations.

## What This Project Is

- A crypto intelligence module for AIKINTEL.
- A research and decision-support layer for traders.
- A structured way to review crypto projects, alerts, narratives, and market summaries.
- A future AI-assisted analysis layer accessed through AIKINTEL backend patterns.

## What This Project Is Not

- It is not a separate platform beside AIKINTEL.
- It is not a trading bot.
- It is not a buy/sell signal system.
- It does not execute trades.
- It does not integrate MT4, exchanges, Telegram, Discord, or payments in this stage.
- It does not promise profit.
- It does not provide financial advice.

## AIKINTEL-Compatible Stack

Frontend:

- React 19.
- Tailwind CSS 4.
- shadcn/ui.
- wouter.
- TanStack Query.

Backend:

- Express.
- tRPC.

Database:

- MySQL / MariaDB.
- Drizzle ORM in `packages/webapp`.
- `mysql2/promise` in `packages/cron`.

Runtime and operations:

- Node.js 20.
- TypeScript.
- PM2 for cron scripts.

AI:

- OpenAI API through AIKINTEL internal helper/pattern.
- No committed API keys.
- Mock or documented AI schema only at this stage.

## Target AIKINTEL Structure

The module should align with:

```text
packages/webapp/client/src/pages
packages/webapp/client/src/components
packages/webapp/server/routers
packages/cron/scripts
packages/cron/lib/db.ts
docs
vault
```

Do not modify `_core`.

## Current Repository Stage

This repository currently contains documentation and planning artifacts for aligning Crypto Edge AI with the AIKINTEL Crypto Market Module architecture.

No full application implementation is included yet.

## Camp v1 MVP Direction

The camp version should be a controlled, limited AIKINTEL-compatible module, not a standalone product. MVP should include:

- Crypto Market / Crypto Edge page aligned with AIKINTEL UI.
- Crypto intelligence dashboard.
- Project/token list.
- Scam and risk alerts.
- Opportunities and narratives.
- Market summary.
- AI analysis JSON following AIKINTEL pattern.
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

## Next Step

Define the AIKINTEL database schema mapping and tRPC router design for `cryptoMarket`, then prepare a narrow mock-data implementation plan for camp v1.
