# Project Brief: Crypto Edge AI

## Overview

Crypto Edge AI is a crypto trading intelligence module designed first in this standalone working repository, with a clear path for later integration into AIKINTEL.

It focuses on trader-facing decision support:

- Bias.
- Risk.
- Opportunity.
- Confidence.
- Narratives.
- Scam alerts.
- Setup review.
- Pre-trade checklist.

Market intelligence data is the backing layer for this module, not a separate product direction.

## Core Product Modes

Crypto Edge AI includes two primary modes:

- Research Review: manual user input for news, links, token descriptions, events, narratives, or observations.
- New Token Scanner: real-data token discovery and filtering with scam/rug/security/liquidity/distribution/social checks.

These modes share:

- Score.
- Risk.
- Bias.
- Confidence.
- Checklist.
- Decision labels.
- Disclaimer.

## Main V1/BETA Components

- Research Review.
- Discovery Radar / New Token Scanner.
- Deal Breaker Engine.
- Security Check.
- Rug Pull Risk Engine.
- On-Chain Distribution.
- Social & Narrative Check.
- Scorecard.
- Final Checklist.

## Owner Decisions

Current owner-side decisions:

- The working repo remains `pawelkrynicki/crypto-edge-ai`.
- Later AIKINTEL integration is possible after the module is refined and working.
- Existing AIKINTEL auth/users should be used if integrated.
- The module/menu name should be `Crypto Edge AI`.
- Existing AIKINTEL Market News with Crypto category should be reused or mapped when possible, not duplicated.
- Migration style remains open until access to the main AIKINTEL repo is confirmed.
- OpenAI helper integration remains open until the existing AIKINTEL helper can be reviewed.
- Camp v1 targets real users through a controlled module flow.

See `docs/owner_decisions_2026_06_18.md`.

## What Crypto Edge AI Is

- A decision-support module for crypto traders.
- A research workflow around market context, risk, bias, and checklist discipline.
- A module that can later integrate into AIKINTEL.
- A project that uses AIKINTEL-style architecture and market intelligence concepts.

## What Crypto Edge AI Is Not

- It is not a standalone platform competing with AIKINTEL.
- It is not a generic Crypto Market product.
- It is not a trading bot.
- It is not a buy/sell signal engine.
- It does not execute trades.
- It does not add MT4, exchange execution, Telegram, Discord, or payments.
- It does not duplicate AIKINTEL Market News / Crypto.

## Technical Direction

For future AIKINTEL integration, align with:

- React 19.
- Tailwind CSS 4.
- shadcn/ui.
- wouter.
- TanStack Query.
- Express.
- tRPC.
- MySQL / MariaDB.
- Drizzle ORM in webapp.
- `mysql2/promise` for scripts.
- Node.js 20.
- TypeScript.

## Camp v1 Goal

Camp v1 should provide a controlled Crypto Edge AI flow for real users:

- Research dashboard.
- Research Review.
- New Token Scanner on limited real data.
- Token/project context.
- Scam/risk alerts.
- Opportunities/narratives.
- Market summary.
- Setup review mock.
- Score, bias, confidence, risk, and checklist.

It must remain research support only.
