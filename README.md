# Crypto Edge AI

Crypto Edge AI is a web tool for crypto traders. It helps with research, market-topic selection, risk review, scam filtering, and decision process structure.

It uses AIKINTEL-style market intelligence concepts and should use existing AIKINTEL auth/users if integrated into the main platform. The module focuses on trader-facing decision support: bias, risk, opportunity, confidence, narratives, scam alerts, setup review, and pre-trade checklist.

The product combines five major components:

- Research Review.
- New Token Scanner.
- Risk Engine.
- Setup Review.
- Final Checklist.

New Token Scanner is one key module, but it does not replace the whole product.

Crypto Edge AI is the module name and the intended menu name. The project should not be renamed to Crypto Market.

## Strategic Direction

Current direction:

- Develop conceptually and technically in this working repo: `pawelkrynicki/crypto-edge-ai`.
- Keep the architecture compatible with AIKINTEL.
- Integrate into AIKINTEL later if the module works and the main repo integration is approved.
- Use existing AIKINTEL auth/users when integrated.
- Reuse or map to existing AIKINTEL Market News / Crypto data where possible.

This repo is not a second platform beside AIKINTEL. It is a working space for the Crypto Edge AI module before integration.

## What Crypto Edge AI Is

- A trader-facing crypto intelligence module.
- A research and decision-support workflow for crypto traders.
- A module that combines market intelligence with setup review, risk, confidence, and checklist discipline.
- A future AIKINTEL-compatible module, not a competing platform.
- A tool for deciding whether a topic or token deserves further analysis.

## What Crypto Edge AI Is Not

- It is not a trading bot.
- It is not a buy/sell signal system.
- It does not execute trades.
- It does not integrate MT4, exchanges, Telegram, Discord, or payments in this stage.
- It does not promise profit.
- It does not provide financial advice.
- It does not duplicate AIKINTEL Market News / Crypto.

## Data Backing

Crypto market intelligence is the data backing for Crypto Edge AI. It may include:

- Project/token evaluations.
- Opportunities and narratives.
- Scam and risk alerts.
- Market summaries.
- Sentiment and bias context.
- On-chain analytics later if useful.
- Existing AIKINTEL Market News / Crypto when accessible.

## AIKINTEL-Compatible Stack Direction

If integrated into AIKINTEL, the expected stack remains:

- Frontend: React 19, Tailwind CSS 4, shadcn/ui, wouter, TanStack Query.
- Backend: Express and tRPC.
- Database: MySQL / MariaDB.
- Webapp database layer: Drizzle ORM.
- Cron/script database layer: `mysql2/promise`.
- Runtime: Node.js 20 and TypeScript.
- Process manager: PM2 for later collection scripts.
- AI: existing AIKINTEL OpenAI helper if available, otherwise to be decided later.

Do not use FastAPI or SQLite as the target architecture for this module.

## Camp v1 Direction

Camp BETA should be a controlled Crypto Edge AI module for real users, starting with limited and safe functionality on real data where stable access is confirmed.

It should focus on:

- Crypto Edge AI dashboard/page.
- Research Review manual input.
- New Token Scanner real-data pipeline.
- Project/token research list.
- Scam and risk alerts.
- Opportunities/narratives.
- Market summary context.
- Score 0-100.
- Bias: bullish, bearish, neutral.
- Confidence 0-100.
- Risk factors.
- Trader checklist.
- Setup review mock.
- Disclaimer and safety boundaries.

Minimum viable real-data pipeline:

- DexScreener discovery.
- GoPlus/Honeypot security check.
- CoinGecko context.
- Fear & Greed market sentiment.
- AIKINTEL Market News / Crypto mapping if accessible.
- Scorecard.
- Final checklist.

## Data Source Direction

Prefer credible open-source or public API sources where legally and technically suitable:

- CoinGecko.
- CryptoCompare.
- DefiLlama.
- CoinMarketCap only if access and value justify it.
- Dune / public dashboards if useful.
- GDELT or existing AIKINTEL Market News if accessible.
- Fear & Greed Index.
- Token Unlocks only if legal API access is available.
- Public CEX/DEX data without violating terms.

## Current Stage

This repository currently contains planning and technical design documents. It does not implement the app, migrations, auth, production cron scripts, real API fetchers, or OpenAI calls yet.

## Windows Helper Scripts

Developer-only Windows CMD helpers live in `scripts/win/`. See `scripts/win/README.md` for the one-command post-merge check, live context generation, local preview startup, and local port cleanup.

## Next Step

Refine source selection and the data model around Crypto Edge AI, then prepare mock/seed module data for a safe Camp v1 flow.
