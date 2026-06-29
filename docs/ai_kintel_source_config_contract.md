# AI KINTEL Source Config Contract

## Status

- Stage: 11C - Source Config Contract.
- This is a documentation-only contract, not runtime configuration.
- It does not activate sources.
- It does not add source adapters.
- It does not change the Local MVP Release Candidate.

## Goals

- Sources should be configurable in the future AI KINTEL Crypto Market implementation.
- Paid sources should remain disabled/deferred but environment-ready.
- A missing env key must not crash the module.
- A disabled provider must not be called.
- Runtime status should map cleanly to the future `crypto_source_runs` table.
- The frontend must not call external providers directly; provider access belongs in backend/cron only.

## Source Lifecycle

Future source configuration and operations may use these lifecycle states:

- `candidate`
- `approved_for_mvp`
- `deferred`
- `needs_approval`
- `disabled`
- `enabled`
- `running`
- `degraded`
- `blocked_by_policy`

These states describe source readiness and runtime handling. They are not scanner labels, analyst review states, or investment-decision fields.

## Source Config Fields

Future AI KINTEL source configuration should follow this documentation-only contract:

| Field | Contract |
|---|---|
| `id` | Stable source identifier used by config, adapter output, logs, and `crypto_source_runs`. |
| `display_name` | Human-readable provider/source name. |
| `tier` | One of `free`, `freemium`, `paid`, or `internal`. |
| `category` | One of `market_context`, `project_data`, `security`, `onchain`, `sentiment`, `narrative`, or `ai_layer`. |
| `mvp_status` | One of `active_candidate`, `deferred`, `disabled`, `needs_approval`, `local_poc_only`, or `blocked`. |
| `enabled` | Explicit runtime enable flag. Disabled sources must not call providers. |
| `env_key` | Env var name only, or `null` when no key is required. Never store secret values. |
| `requires_commercial_approval` | Whether vendor/commercial review is required before activation. |
| `requires_attribution` | Whether the source requires attribution in UI, reports, or documentation. |
| `rate_limit` | Documented rate-limit profile or `null` until reviewed. |
| `runtime_policy_status` | Policy gate status such as `allowed`, `disabled_until_enabled`, `blocked_by_policy`, or `needs_review`. |
| `disabled_behavior` | Required behavior when disabled, normally `return disabled metadata; do not call provider`. |
| `output_tables` | Future normalized target tables, for example `crypto_market_summaries` or `crypto_source_runs`. |
| `source_run_type` | Future `crypto_source_runs.run_type` value. |
| `notes` | Operational, vendor, attribution, cost, or approval notes. |

## Documentation-Only Example

```ts
{
  id: "coingecko",
  display_name: "CoinGecko",
  tier: "paid",
  category: "project_data",
  mvp_status: "deferred",
  enabled: false,
  env_key: "COINGECKO_API_KEY",
  requires_commercial_approval: true,
  requires_attribution: true,
  runtime_policy_status: "disabled_until_enabled",
  disabled_behavior: "return disabled metadata; do not call provider",
  output_tables: ["crypto_projects", "crypto_market_summaries", "crypto_source_runs"],
  source_run_type: "project_market_data",
  notes: "Paid/commercial decision deferred."
}
```

This example is not runtime configuration and must not be imported by application code.

## Non-Negotiable Rules

- No scraping.
- No undocumented endpoints.
- No browser automation.
- No frontend provider calls.
- No hardcoded keys.
- No silent paid API calls.
- No provider call while disabled.

## AI KINTEL Boundary

- All external data collection must run through AI KINTEL backend/cron.
- Frontend access remains backend/tRPC-only.
- Disabled paid vendors should report disabled metadata to future observability instead of throwing user-facing failures.
- Missing data means manual verification, not positive context.
- `WATCHLIST` remains further manual review only.
