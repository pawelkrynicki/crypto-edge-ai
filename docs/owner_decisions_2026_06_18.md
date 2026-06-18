# Owner Decisions: 2026-06-18

## Summary

This document records owner-side decisions for the Crypto Edge AI project after the AIKINTEL integration discussion.

## Decisions

## Working Repository

Crypto Edge AI remains in the separate working repository for now:

```text
pawelkrynicki/crypto-edge-ai
```

This repo is used for concept, documentation, planning, and safe technical design before integration.

## Later AIKINTEL Integration

Crypto Edge AI may be connected or deployed into AIKINTEL later, after it works and is ready for integration.

The project should remain compatible with AIKINTEL architecture, but implementation does not move into the main AIKINTEL repo until that decision is made.

## Auth and Users

If integrated into AIKINTEL, Crypto Edge AI should use existing AIKINTEL auth/users.

Do not design or implement a separate login system.

## Module Name

The module name and preferred menu label is:

```text
Crypto Edge AI
```

Do not rename the product direction to Crypto Market.

## Market News / Crypto

AIKINTEL already has Market News with:

- Crypto category.
- Sentiment filters.
- AI Analysis.

Crypto Edge AI should not duplicate the general Market News section. It should later use, link, summarize, or map to that data if access is available.

## Migration Direction

Prepare migrations/tables in the easiest practical way for later AIKINTEL integration.

The preferred mechanism is not final until the main AIKINTEL repo and its conventions are confirmed.

Options remain:

- Drizzle migration.
- Raw SQL.
- Separate deployment script.

## AI Helper

OpenAI helper / AI integration is deferred.

If access to the existing AIKINTEL helper is possible, Crypto Edge AI should follow that pattern. Do not add standalone OpenAI calls yet.

## Camp v1 Users

Camp v1 should ultimately be for real users, similar to AIKINTEL, but it can begin as a controlled module version.

## Data Sources

Data sources should be credible and, where possible, open-source or public API sources.

Sources to consider:

- CoinGecko.
- CryptoCompare.
- DefiLlama.
- CoinMarketCap only if useful and accessible.
- Dune / public dashboards if useful.
- GDELT.
- Existing AIKINTEL Market News if accessible.
- Fear & Greed Index.
- Token Unlocks only if legal API access is available.
- Public CEX/DEX data without violating terms.

## Product Direction

Crypto Edge AI remains the main module direction.

Best current description:

Crypto Edge AI is a crypto trading intelligence module designed as a standalone working repository first, with a clear path for later integration into the AIKINTEL platform. It uses AIKINTEL-style market intelligence concepts, existing auth/users when integrated, and focuses on trader-facing decision support: bias, risk, opportunity, confidence, narratives, scam alerts, setup review, and pre-trade checklist.

Additional product clarification:

- Crypto Edge AI is a web tool for crypto traders.
- It helps with research, market-topic selection, risk assessment, scam filtering, and decision process structure.
- It has two primary modes: Research Review and New Token Scanner.
- New Token Scanner is a key module, but it does not replace the entire product.
- Camp BETA should aim for a working tool on real data in a limited stable pipeline.

## Explicit Non-Goals

Do not implement:

- Real API fetchers yet.
- Production cron scripts yet.
- Full UI yet.
- Auth yet.
- DB migrations yet.
- OpenAI calls yet.
- Trading signals.
- MT4.
- Exchange execution.
- Telegram.
- Discord.
- Payments.
