# AIKINTEL Integration Plan

## Goal

Develop Crypto Edge AI in this standalone working repository first, while keeping a clear and practical path for later AIKINTEL integration.

Crypto Edge AI is the main module. Crypto market intelligence tables and data sources are its backing layer.

## Owner Decisions Applied

- Working repo remains `pawelkrynicki/crypto-edge-ai`.
- The module name and menu name should be `Crypto Edge AI`.
- Later integration into AIKINTEL is possible after the module is working.
- Existing AIKINTEL auth/users are the preferred model when integrated.
- AIKINTEL Market News / Crypto should be reused or mapped where possible, not duplicated.
- Migration approach should be the easiest safe path compatible with AIKINTEL, pending main repo access.
- OpenAI helper usage is deferred until the existing AIKINTEL helper can be reviewed.

## Integration Principles

- Do not build a second platform beside AIKINTEL.
- Do not rename the module to Crypto Market.
- Keep data model compatible with AIKINTEL conventions.
- Use existing AIKINTEL auth/users when integrated.
- Avoid duplicate general crypto news storage if AIKINTEL Market News already covers it.
- Do not modify `_core`.
- Do not commit secrets.
- Do not implement trading execution.

## Target Paths if Integrated

Frontend:

```text
packages/webapp/client/src/pages/CryptoEdgeAI.tsx
packages/webapp/client/src/components/CryptoEdgeAI/
packages/webapp/client/src/App.tsx
packages/webapp/client/src/components/Sidebar.tsx
```

Backend:

```text
packages/webapp/server/routers/cryptoMarket.ts
packages/webapp/server/routers.ts
```

The router may still be named `cryptoMarket` technically because it serves market intelligence data, while the UI/module name is `Crypto Edge AI`.

Docs:

```text
docs
vault
```

## Integration Order

1. Confirm access to the main AIKINTEL repo.
2. Confirm exact Market News / Crypto schema and whether `crypto_news` exists.
3. Confirm migration mechanism: Drizzle migration, raw SQL, or deployment script.
4. Confirm OpenAI helper availability and usage pattern.
5. Refine source selection and data model.
6. Prepare mock/seed Crypto Edge AI module data.
7. Prepare read-only `cryptoMarket` router skeleton.
8. Prepare AIKINTEL-style UI mock using screenshots or existing pages.
9. Decide when to move from this working repo into the main AIKINTEL repo.

## Technical Design Documents

Use:

- `docs/database_schema_design.md`.
- `docs/trpc_router_design.md`.
- `docs/camp_v1_mock_data_plan.md`.
- `docs/open_questions_for_aikintel_owner.md`.
- `docs/owner_decisions_2026_06_18.md`.

These documents intentionally stop before application implementation.

## Validation Checklist

- Module remains named Crypto Edge AI.
- Does not duplicate general Market News / Crypto.
- Uses tRPC design and AIKINTEL-compatible data conventions.
- Uses existing AIKINTEL users/auth when integrated.
- Does not modify `_core`.
- Does not commit secrets.
- Does not implement trading execution.
- Includes disclaimer near AI analysis.
