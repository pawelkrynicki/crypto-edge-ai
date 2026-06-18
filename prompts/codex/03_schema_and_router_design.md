# Codex Prompt: Crypto Edge AI Schema and Router Design

You are working on Crypto Edge AI.

Crypto Edge AI is a crypto trading intelligence module developed in `pawelkrynicki/crypto-edge-ai` first, with a clear path for later integration into AIKINTEL. It is not being renamed to Crypto Market.

## Goal

Use the current design documents to prepare a safe implementation plan for the data model and `cryptoMarket` tRPC router that will power the Crypto Edge AI module.

## Source Documents

Read first:

- `docs/owner_decisions_2026_06_18.md`.
- `docs/database_schema_design.md`.
- `docs/trpc_router_design.md`.
- `docs/camp_v1_mock_data_plan.md`.
- `docs/open_questions_for_aikintel_owner.md`.
- `docs/aikintel_integration_plan.md`.

## Owner Decisions

- Working repo remains separate for now.
- Later AIKINTEL integration is possible after the module is working.
- Use existing AIKINTEL auth/users when integrated.
- Module/menu name is `Crypto Edge AI`.
- Do not duplicate AIKINTEL Market News / Crypto.
- OpenAI helper status is open.
- Data sources must be credible and preferably open-source/public API.

## Boundaries

Do not:

- Use FastAPI.
- Use SQLite.
- Create a standalone backend.
- Create a separate login system.
- Modify `_core`.
- Add API keys.
- Implement real AI provider calls.
- Implement real API fetchers.
- Implement production cron scripts.
- Implement auto-trading.
- Add MT4, exchange execution, Telegram, Discord, or payments.
- Build the full UI.

## Expected Output

Prepare the next implementation plan for:

- Source selection and data model refinement.
- Must-have Camp v1 tables.
- Optional/later tables.
- `cryptoMarket` tRPC router procedures.
- Zod input schemas.
- Output shapes.
- Mock setup review response.
- Seed/mock data approach.
- Validation checklist.

Keep the work aligned with Crypto Edge AI as the module and AIKINTEL as the future integration ecosystem.
