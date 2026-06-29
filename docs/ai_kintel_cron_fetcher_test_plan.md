# AI KINTEL Cron Fetcher Test Plan

## Status

- Stage: 11D - future cron fetcher test plan.
- This is a future test plan, not implementation.
- It does not add tests in 11D.
- It does not create runtime cron scripts.
- It does not create `packages/cron`.
- It does not call providers or activate sources.
- It does not change Local RC behavior.

## Future Test Cases

Future cron fetcher tests should cover:

- Disabled source does not call provider.
- Disabled paid source missing env is not an error.
- Enabled paid source missing env returns `env_missing`.
- Policy blocked prevents provider call.
- Provider timeout returns error and does not crash the batch.
- Rate limit returns warning or `rate_limited`.
- Malformed JSON is rejected safely.
- Duplicate hash is deduped.
- Source run row is produced.
- No secrets are written to logs.
- UTC timestamp is written.
- No frontend provider calls are introduced.
- Normalized records are produced before insert.
- One source failure does not crash the whole cron batch.

## Dry-Run Requirement

- Future adapters should support `dry_run` where possible.
- `dry_run` should not insert normalized records unless explicitly configured.
- `dry_run` may still write safe source-run metadata if approved.
- `dry_run` must not weaken source config, env, policy, rate-limit, or disabled-source gates.

## Non-Goals

- No tests implemented in 11D.
- No provider calls in 11D.
- No runtime cron setup in 11D.
- No source adapter implementation in 11D.
- No paid source activation in 11D.
- No endpoint, backend, auth, UI, CSS, dependency, migration, scanner scoring, `final_label`, or `WATCHLIST` behavior change in 11D.
