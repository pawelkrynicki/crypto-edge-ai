# AI KINTEL tRPC Error / Status Model

## Status

- Stage: 11E - tRPC error/status model.
- This is documentation only.
- It does not implement runtime errors, endpoints, backend code, auth, migrations, UI, CSS, source adapters, provider calls, OpenAI calls, or dependencies.

## Error Categories

Future tRPC procedures should use stable error/warning categories:

- `db_unavailable`
- `no_data`
- `partial_data`
- `stale_data`
- `source_disabled`
- `source_deferred`
- `source_policy_blocked`
- `source_env_missing`
- `access_denied`
- `invalid_filter`
- `internal_error`

These categories should be returned as sanitized procedure metadata or mapped to existing AI KINTEL error handling conventions.

## UI-Facing Wording

| Category | UI-facing wording |
|---|---|
| `source_deferred` | `source deferred / not configured` |
| `stale_data` | `data may be stale` |
| `partial_data` | `partial data available` |
| `no_data` | `no data available yet` |
| `access_denied` | `subscription or role access required` |

UI-facing wording should stay neutral and should not imply a positive assessment when data is missing.

## Behavior Rules

- Disabled paid source is not an error.
- Missing env for disabled source is not an error.
- Missing env for enabled source is a configuration issue.
- Source deferred should return safe disabled/deferred metadata.
- Source disabled should return safe disabled metadata.
- Stale data should return a warning when possible, not crash the page.
- Partial data should return available records with a warning when possible.
- No data should return an empty result plus manual verification context when possible.
- DB unavailable for core reads may be a fatal procedure error.
- Errors must not expose secrets, env values, stack traces, or raw provider payloads.
- Frontend must not recover by calling providers directly.

## Blockers

Future tRPC/backend work is blocked if any of these occurs:

- DB unavailable for core reads.
- Source health unavailable.
- Frontend direct provider call introduced.
- Paid source called by query path without explicit enablement.
- Compliance block missing from procedure output.
- Secrets, env values, or raw provider payloads exposed in a response.
- Review mutation changes scanner label, scanner scoring, `final_label`, or `WATCHLIST` meaning.

## Source Status Relationship

The 11E model should align with 11C and 11D:

- Source adapters and cron fetchers report run state to `crypto_source_runs`.
- tRPC reads source health from `crypto_source_runs`.
- Disabled/deferred paid sources can be represented as status metadata.
- tRPC read procedures do not activate sources.
- tRPC read procedures do not call providers by default.

## Compliance Status

Future procedure outputs should preserve:

- `research_only: true`
- `not_investment_advice: true`
- `watchlist_means: "manual_review_only"`
- `missing_data_means: "manual_verification_required"`
- `scanner_label_is_read_only: true`
