# AI KINTEL Source Status / Error Model

## Status

- Stage: 11C - Source Status / Error Model.
- This is a documentation-only model for future source adapter status reporting.
- It does not implement source adapters, runtime config, cron jobs, backend endpoints, UI changes, or production tables.

## Status Model

Future source status values:

- `disabled`
- `configured`
- `running`
- `success`
- `warning`
- `error`
- `env_missing`
- `policy_blocked`
- `rate_limited`
- `degraded`

## Mapping To `crypto_source_runs.status`

The 11B SQL blueprint defines `crypto_source_runs.status` as `success`, `warning`, `error`, or `disabled`. Future adapter statuses should map as follows:

| Adapter/source status | `crypto_source_runs.status` | Notes |
|---|---|---|
| `success` | `success` | Source completed normally. |
| `warning` | `warning` | Source completed with non-fatal issues. |
| `degraded` | `warning` | Partial data or reduced provider health. |
| `rate_limited` | `warning` | Provider throttled the run; retry policy should be controlled. |
| `error` | `error` | Enabled source failed after gates passed. |
| `env_missing` | `error` or `disabled` | Use `error` when the source is enabled; use `disabled` when source remains disabled/deferred. |
| `policy_blocked` | `error` or `disabled` | Use `error` when an enabled required source is unexpectedly blocked; use `disabled` when intentionally deferred/blocked. |
| `disabled` | `disabled` | Disabled source is not a failure. |

## UI-Facing Status

Future UI-facing status should stay neutral and non-decisional:

| Condition | UI-facing wording |
|---|---|
| Active/free source unavailable | `temporarily unavailable` |
| Paid deferred source | `deferred / not configured` |
| Env missing for enabled source | `configuration required` |
| Policy blocked | `disabled by source policy` |
| Rate limited | `delayed by provider rate limit` |

## Important Rules

- Disabled paid source is not an error.
- Missing env for disabled source is not an error.
- Missing env for enabled source is a configuration warning/error.
- Policy blocked source must not call the provider.
- Frontend must never call external providers directly.
- Missing data means manual verification, not positive context.
- Source status must not change scanner scoring, `final_label`, or `WATCHLIST` meaning.

## Blocker Definitions

Future production source work is blocked if any of these occurs:

- An enabled required MVP source cannot run.
- The source health table or equivalent source-run observability is unavailable.
- All market context sources are unavailable.
- A provider call happens while the source is disabled.
- A frontend direct provider call is introduced.
- A paid source is called without explicit enablement.
