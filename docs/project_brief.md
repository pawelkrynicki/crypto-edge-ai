# Project Brief: AIKINTEL Crypto Market Module

## Overview

Crypto Edge AI is now positioned as the working name for the trader-facing decision-support layer inside the AIKINTEL Crypto Market Module.

The target product is not a separate web application. It is a crypto intelligence module for the existing AIKINTEL Market Intelligence platform.

## Strategic Change

Previous direction:

- Standalone web app.
- React + Vite frontend.
- FastAPI backend.
- SQLite MVP database.

New direction:

- AIKINTEL-compatible module.
- React 19 frontend inside `packages/webapp`.
- Express + tRPC backend inside `packages/webapp`.
- MySQL / MariaDB database.
- Drizzle ORM for webapp access.
- `mysql2/promise` for cron scripts.
- PM2-managed data collection scripts.

## AIKINTEL Crypto Market Module

The module should aggregate and expose crypto market intelligence:

- `crypto_projects`.
- `crypto_scam_alerts`.
- `crypto_opportunities`.
- `crypto_onchain_metrics`.
- `crypto_market_summaries`.
- `crypto_news` if available in AIKINTEL.

This is the data and market intelligence layer.

## Crypto Edge AI Layer

Crypto Edge AI is the user-facing trading research layer:

- Bias.
- Score.
- Risk.
- Confidence.
- Checklist.
- Setup review.
- Personal insights.
- Observation status.
- AI decision-support commentary.

This layer supports research and decision preparation. It must not produce buy/sell instructions.

## Core Goal

Deliver a limited, useful camp v1 module that fits AIKINTEL technically, visually, and product-wise.

## Non-Goals

The project must not:

- Build a second platform beside AIKINTEL.
- Build a trading bot.
- Build an automated signal engine.
- Execute trades.
- Integrate exchanges.
- Integrate MT4.
- Integrate Telegram or Discord.
- Add payments.
- Commit external API keys.
- Modify AIKINTEL `_core`.
