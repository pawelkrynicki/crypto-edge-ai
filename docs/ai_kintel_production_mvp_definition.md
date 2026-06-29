# AI KINTEL Production MVP Definition

## Status

- Stage: 11A - AI KINTEL Production MVP Definition.
- Planning date: 2026-06-29.
- The Local MVP Release Candidate is ready as a local RC baseline.
- Production MVP is not the final product.
- Production MVP is the first safe version of the Crypto Market module running inside AI KINTEL.
- This document is a definition and decision artifact only. It does not implement production code, new sources, paid API calls, auth, migrations, or endpoints.

## Product Positioning

- Crypto Market is an integral AI KINTEL module, not a standalone SaaS.
- User access should come through AI KINTEL and its subscription model.
- Any local or internal roles are subordinate to AI KINTEL access and subscription control.
- The module is research-only.
- The module does not execute trades.
- The module does not provide investment recommendations.
- `WATCHLIST` means further manual review only.
- Review status and analyst notes are organization workflow, not investment advice and not scanner-label changes.

## Production MVP Includes

- AI KINTEL route: `/crypto-market`.
- tRPC router: `cryptoMarket`.
- MySQL/MariaDB tables and reviewable migrations for `crypto_*` module data.
- Cron collection scripts under the AI KINTEL cron package.
- PM2 process definitions for scheduled collection.
- Source registry and source runtime policy adapted to AI KINTEL deployment.
- Free or approved API sources active first, such as Alternative.me and DefiLlama where policy permits.
- Paid source slots present in configuration but disabled until explicitly enabled.
- Review Queue and analyst workflow adapted from the local RC into the AI KINTEL architecture.
- Analyst Report or market summary workflow adapted as a research-only AI KINTEL workflow.
- Compliance copy and research-only boundaries visible in the module.
- Logs and health checks for cron and data collection.

## Production MVP Excludes

- Paid source activation.
- Public standalone SaaS billing.
- Full custom admin panel.
- Auto-trading.
- Investment signals.
- UI report generation if it requires a new production architecture.
- OpenAI or AI analysis as a decision layer.
- Production launch to all users without beta validation.
- New source adapters in this 11A phase.
- Scraping, HTML parsing, browser automation, undocumented endpoints, or direct frontend calls to external APIs.

## Ready For Production MVP

The module is ready for production MVP review when:

- DB migration exists and can be reviewed before execution.
- Cron scripts run without crashing.
- tRPC procedures return module data from AI KINTEL backend services.
- Frontend page builds inside the AI KINTEL webapp.
- Source config handles disabled paid vendors cleanly.
- Missing paid API keys do not break the module.
- Compliance text is visible in the module.
- Frontend makes no direct external API calls.
- Secrets are not hardcoded.
- Rate limits are documented for every enabled source.
- Deduplication works through stable hashes and database conflict handling.
- Data timestamps are stored and displayed in UTC.
- Local RC functionality is mapped to AI KINTEL architecture.
- Paid sources return disabled metadata when disabled rather than throwing user-facing failures.

## Not Final Product Yet

The production MVP is still not the final product because:

- Paid vendors are not active.
- Production monitoring is not final.
- Role and subscription logic may still need an AI KINTEL owner decision.
- UX may need feedback from internal beta users.
- Source coverage is intentionally limited.
- AI narrative summaries, if desired, remain a post-MVP or separately approved layer.
- Export/report generation may remain backend-only or internal until architecture is confirmed.

## Local RC Relationship

The local RC is the product and workflow baseline for porting. It proves the research workflow, scanner output handling, approved context bridge, local review queue, and analyst report export. It is not the production implementation.

Production AI KINTEL must replace local JSON/SQLite-only storage with AI KINTEL MySQL/MariaDB, replace local API bridges with Express/tRPC procedures, and replace local helper execution with AI KINTEL cron plus PM2.
