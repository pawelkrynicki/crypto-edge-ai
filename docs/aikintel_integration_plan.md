# AIKINTEL Integration Plan

## Goal

Integrate Crypto Edge AI as the trader-facing layer of the AIKINTEL Crypto Market Module.

The module must fit the AIKINTEL platform instead of becoming a second product.

## Integration Principles

- Follow AIKINTEL monorepo structure.
- Use existing webapp and cron patterns.
- Use tRPC for frontend/backend communication.
- Use MySQL / MariaDB.
- Use Drizzle ORM in webapp.
- Use `mysql2/promise` in cron scripts.
- Use PM2 for scheduled collection scripts.
- Do not modify `_core`.
- Do not add a standalone login system.
- Do not add a standalone backend.

## Target Files in AIKINTEL

Frontend:

```text
packages/webapp/client/src/pages/CryptoMarket.tsx
packages/webapp/client/src/components/CryptoMarket/
packages/webapp/client/src/App.tsx
packages/webapp/client/src/components/Sidebar.tsx
```

Backend:

```text
packages/webapp/server/routers/cryptoMarket.ts
packages/webapp/server/routers.ts
```

Cron:

```text
packages/cron/scripts/fetch-crypto-projects.ts
packages/cron/scripts/fetch-crypto-scam-alerts.ts
packages/cron/scripts/fetch-crypto-opportunities.ts
packages/cron/scripts/fetch-crypto-onchain.ts
packages/cron/scripts/generate-crypto-summary.ts
packages/cron/lib/db.ts
```

Docs:

```text
docs
vault
```

## Integration Order

1. Confirm database schema with AIKINTEL owner.
2. Use `docs/database_schema_design.md` as the schema design baseline.
3. Use `docs/trpc_router_design.md` as the `cryptoMarket` router design baseline.
4. Prepare migration for Camp v1 must-have crypto tables.
5. Add `/crypto-market` frontend page.
6. Add sidebar navigation.
7. Add PM2-ready cron script skeletons.
8. Add safe AI analysis JSON generation.
9. Run controlled camp v1 release.

## Camp v1 Technical Design Documents

The next implementation task should start from:

- `docs/database_schema_design.md`.
- `docs/trpc_router_design.md`.
- `docs/camp_v1_mock_data_plan.md`.
- `docs/open_questions_for_aikintel_owner.md`.

These documents define the schema, router contract, mock data plan, and open product/platform questions. They intentionally stop before implementation.

## Validation Checklist

- Builds inside AIKINTEL webapp.
- Uses tRPC, not direct frontend fetches.
- Uses existing DB connection patterns.
- Does not modify `_core`.
- Does not commit secrets.
- Does not implement trading execution.
- Includes disclaimer near AI analysis.
- Uses existing AIKINTEL auth/users unless owner approves otherwise.
- Keeps `setupReviewMock` as mock/design for Camp v1 until AI usage limits are approved.
