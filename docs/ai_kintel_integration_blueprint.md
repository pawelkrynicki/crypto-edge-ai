# AI KINTEL Integration Blueprint

## Status

- Stage: 11A - AI KINTEL integration blueprint.
- This is a planning artifact for moving from local RC to AI KINTEL production MVP.
- It does not implement production backend, production database, migrations, auth, UI, source adapters, cron jobs, endpoints, dependencies, or paid integrations.

## Target Repo Structure

```text
aikintel-platform/
  packages/
    webapp/
    cron/
  docs/
  vault/
```

Primary integration target:

- `aikintel-platform/packages/webapp`
- `aikintel-platform/packages/cron`
- `aikintel-platform/docs`
- `aikintel-platform/vault`

## Files To Create Later In AI KINTEL

- `packages/webapp/server/routers/cryptoMarket.ts`
- `packages/webapp/client/src/pages/CryptoMarket.tsx`
- `packages/cron/scripts/fetch-crypto-*.ts`
- `packages/cron/ecosystem.crypto.config.cjs`
- Migration file for `crypto_*` tables.
- Setup documentation under AI KINTEL docs.
- `.env.example` entries with names only, no values.

## Suggested Phases

- 11B Database Migration Blueprint.
- 11C Source Config / Adapter Contract.
- 11D Cron Fetcher Skeletons.
- 11E tRPC Router Blueprint.
- 11F AI KINTEL Frontend Port Plan.
- 11G Staging/Deployment Checklist.

## Mapping Local RC To AI KINTEL

| Local RC Area | AI KINTEL Production MVP Mapping | Notes |
|---|---|---|
| Local scanner latest | Cron-collected DB records | Use normalized records and stable dedup keys. |
| Local context latest | `crypto_market_summaries` | Alternative.me and DefiLlama are active candidates where policy permits. |
| Review Queue | Production decision needed for user-specific review storage | Keep review status separate from scanner labels. |
| Analyst Report | Backend-generated research summary or admin/internal export | Do not make it an investment recommendation. |
| Local checks | Staging checks, PM2 logs, build verification | Replace local-only helpers with production deployment checks. |
| Local JSON/SQLite | Dev/local only | Production uses AI KINTEL MySQL/MariaDB. |
| Local API bridge | AI KINTEL Express/tRPC | Frontend calls backend only. |

## Integration Rules

- Frontend only uses tRPC/backend.
- All external API calls run only in cron/backend.
- No direct browser external API calls.
- No hardcoded secrets.
- Use existing AI KINTEL DB connection helpers.
- Match existing AI KINTEL page and UI component patterns.
- Do not change `_core`.
- Use MySQL/MariaDB and Drizzle conventions already present in AI KINTEL.
- Deduplicate via stable hash and `ON DUPLICATE KEY UPDATE` where appropriate.
- Validate JSON before insert.
- Store timestamps in UTC.
- Respect rate limits.
- Keep paid sources disabled until explicitly enabled.

## Route And Module Shape

- Route: `/crypto-market`.
- Router: `cryptoMarket`.
- Frontend page: `packages/webapp/client/src/pages/CryptoMarket.tsx`.
- Backend router: `packages/webapp/server/routers/cryptoMarket.ts`.
- Sidebar navigation should add a Crypto Market entry during the frontend port phase.

## Production MVP Flow

```text
cron fetcher -> normalized records -> MySQL/MariaDB -> tRPC router -> /crypto-market page
```

The production MVP should preserve the local RC boundary:

- Scanner label remains scanner output.
- Review status remains analyst workflow.
- Market context is research context only.
- `WATCHLIST` means further manual review only.
- Paid vendors stay disabled until the activation checklist is complete.

## Deferred Until Later Phases

- Real production migrations.
- Source adapter implementations.
- tRPC procedures.
- Frontend route implementation.
- Subscription/auth gate implementation.
- PM2 deployment config.
- Paid vendor activation.
- AI narrative analysis.
