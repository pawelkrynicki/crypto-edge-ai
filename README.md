# Crypto Edge AI

Crypto Edge AI is a web-based research and decision-support tool for crypto traders. It helps users organize market observations, crypto topics, narratives, news, token ideas, risks, and pre-trade checklists before making their own trading decisions.

This project is intended for real use by participants of a trading camp. It is not a demo, signal bot, automated trading system, or investment advice product.

## What Crypto Edge AI Is

- A research assistant for crypto traders.
- A structured workspace for market topics and narratives.
- A tool for scoring and categorizing research ideas.
- A checklist and risk review layer before a user makes a trading decision.
- A future AI-assisted analysis system accessed through the backend.

## What Crypto Edge AI Is Not

- It is not a trading bot.
- It is not a buy/sell signal system.
- It does not execute trades.
- It does not connect to exchanges, MT4, Telegram, Discord, or payments in the initial stages.
- It does not promise profit.
- It does not replace trader judgment.
- It does not provide investment advice.

## MVP v1 Goal

The first usable version is designed for a trading camp environment. It should support:

- User login.
- Admin and user roles.
- User-specific data.
- Adding crypto research topics.
- AI or mock AI analysis.
- Topic categories.
- Score from 0 to 100.
- Summary and reasoning.
- Risk list.
- Checklist.
- Topic statuses.
- Analysis history.
- Basic admin panel.
- Usage limits.
- Clear disclaimer.

## Recommended Stack

- Frontend: React, Vite, TypeScript.
- Backend: FastAPI, Python.
- Database: SQLite for MVP, with a later path to PostgreSQL.
- AI: Backend-mediated provider integration in the future, initially mock/stub only.

## Repository Structure

```text
backend/
frontend/
docs/
prompts/
  codex/
  manus/
  claude/
```

## Current Stage

Stage 1 focuses on repository foundations, project documentation, architecture, scope, and planning. No full AI functionality, exchange integrations, automated trading, or external API keys are included at this stage.

## Next Step

Proceed to Stage 2: backend MVP skeleton with authentication model, topic model, analysis model, mock scoring endpoint, and local SQLite persistence.
