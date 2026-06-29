# AI KINTEL Source Adapter Test Plan

## Status

- Stage: 11C - future source adapter test plan.
- This is a future test plan, not implementation.
- It does not add source adapters, provider calls, cron jobs, backend endpoints, UI changes, dependencies, or paid source activation.

## Test Categories

Future source adapter tests should cover:

- Disabled source does not call provider.
- Missing env for disabled source does not error.
- Missing env for enabled source returns `env_missing`.
- Policy blocked source does not call provider.
- Rate limit returns `warning` or `rate_limited`.
- Malformed JSON is rejected safely.
- Duplicate source records are deduped by hash.
- Timestamps are UTC.
- Secrets are not written to logs.
- Frontend never calls external providers directly.

## Required Checks Before Enabling A Paid Source

Before any paid source is enabled in a future stage:

- Dry run completed.
- Env key present in deployment environment.
- Runtime policy explicitly enabled.
- Vendor terms reviewed.
- Cost approved.
- Rate limits set.
- Rollback plan documented.
- Attribution requirements documented where applicable.
- Source-run observability confirmed through `crypto_source_runs` or an equivalent table.

## Non-Goals

- No source implementation in 11C.
- No provider calls in 11C.
- No paid source activation in 11C.
- No production backend in 11C.
- No endpoint additions in 11C.
- No UI/CSS changes in 11C.
