# AI KINTEL Cron Operational Runbook

## Status

- Stage: 11D - future AI KINTEL cron operational runbook.
- Stage 11E adds documentation-only tRPC router/query blueprints for future readers of cron-populated DB records.
- This is documentation only.
- It does not create runtime cron scripts.
- It does not create `packages/cron`.
- It does not activate sources or call providers.
- It does not change Local RC behavior.
- It does not create `packages/webapp`, runtime tRPC procedures, backend code, endpoints, auth, UI, CSS, or dependencies.

11E tRPC router blueprint artifacts:

- `docs/ai_kintel_trpc_router_blueprint.md`
- `docs/ai_kintel_trpc_procedure_contract.md`
- `docs/ai_kintel_trpc_query_matrix.md`
- `docs/ai_kintel_trpc_access_control_blueprint.md`
- `docs/ai_kintel_trpc_error_status_model.md`
- `docs/ai_kintel_trpc_router_pseudocode.md`

## Manual Run Checklist

Before a future owner-approved manual cron run:

- Check env names, not values.
- Confirm disabled/deferred paid sources are still disabled unless explicitly approved.
- Run one script manually with `tsx`.
- Confirm a `crypto_source_runs` row is produced where approved.
- Confirm no secrets appear in logs.
- Confirm no provider calls happen while sources are disabled.
- Confirm only normalized rows are inserted.
- Confirm UTC timestamps.
- Confirm dedup uses hash or logical key.
- Confirm frontend access remains backend/tRPC-only.
- Confirm future tRPC queries read DB records populated by cron/source layer.
- Confirm no provider calls are introduced in the frontend or read query path.

## Failure Handling

| Failure condition | Future expected behavior |
|---|---|
| Env missing for disabled source | Return disabled metadata; do not call provider; do not crash. |
| Env missing for enabled source | Return `env_missing`; do not call provider; write safe source-run status. |
| Policy blocked | Return `policy_blocked`; do not call provider; write safe source-run status. |
| Provider timeout | Return error status for that source; continue the batch. |
| Rate limited | Return warning or `rate_limited`; respect retry policy; continue the batch. |
| Malformed JSON | Reject safely; log sanitized error; do not insert malformed records. |
| DB insert failure | Return error status; log safe counts and sanitized details; keep schema stable. |
| Duplicate hash | Deduplicate or update by approved logical key; avoid duplicate rows. |
| One source fails while batch continues | Mark that source error; continue other sources when safe. |

## Logs

Future cron logs should include safe operational metadata only:

- source id
- status
- run type
- counts
- started/finished timestamps
- sanitized error
- dry-run marker where applicable

Future cron logs must not include:

- secrets
- raw credentials
- full env values
- raw provider payloads unless separately approved
- user-facing investment-decision language

## Rollback

Future rollback should prefer reversible configuration changes:

- Disable the source config.
- Stop the PM2 process.
- Keep DB schema stable.
- Leave source run status as `disabled` or `error`.
- Keep normalized records already written unless owner-approved cleanup is required.
- Keep paid sources disabled/deferred until the activation checklist is complete.

## Blockers

Future cron work is blocked if any of these occurs:

- An enabled required source cannot run.
- A paid source is called while disabled.
- A frontend direct provider call is introduced.
- Data is inserted without hash or approved dedup key.
- Secrets appear in logs.
- Compliance boundaries are missing.
- Runtime policy is bypassed.
- Source-run observability is unavailable for enabled source runs.
- Future tRPC read path calls providers without separate approval.
- Future tRPC output omits the research-only compliance block.
