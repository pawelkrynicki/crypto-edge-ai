# Codex Prompt: Schema and Router Design

You are working on the AIKINTEL Crypto Market Module.

Crypto Edge AI is the trader-facing decision-support layer inside AIKINTEL. Do not build a standalone application.

## Goal

Turn the current design documents into a safe implementation plan for database schema and the `cryptoMarket` tRPC router.

## Source Documents

Read first:

- `docs/database_schema_design.md`.
- `docs/trpc_router_design.md`.
- `docs/camp_v1_mock_data_plan.md`.
- `docs/open_questions_for_aikintel_owner.md`.
- `docs/aikintel_integration_plan.md`.

## Boundaries

Do not:

- Use FastAPI.
- Use SQLite.
- Create a standalone backend.
- Create a separate login system.
- Modify `_core`.
- Add API keys.
- Implement real AI provider calls.
- Implement auto-trading.
- Add MT4, exchange execution, Telegram, Discord, or payments.
- Build the full UI.
- Build production cron scripts.

## Expected Output

Prepare the next implementation plan for:

- MySQL/MariaDB migration approach.
- Must-have Camp v1 tables.
- Optional/later tables.
- `cryptoMarket` tRPC router procedures.
- Zod input schemas.
- Output shapes.
- Mock setup review response.
- Seed/mock data approach.
- Tests or validation checklist.

Keep the work aligned with AIKINTEL architecture and existing patterns.
