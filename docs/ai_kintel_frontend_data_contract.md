# AI KINTEL Frontend Data Contract

## Status

- Stage: 11F - frontend data contract.
- This is documentation only.
- It does not create runtime tRPC procedures, frontend code, backend code, endpoints, provider calls, OpenAI calls, dependencies, source adapters, source activation, UI/CSS, route registration, or sidebar navigation.

## tRPC Usage

Future frontend calls:

- `trpc.cryptoMarket.marketSummary`
- `trpc.cryptoMarket.projects`
- `trpc.cryptoMarket.projectById`
- `trpc.cryptoMarket.scamAlerts`
- `trpc.cryptoMarket.opportunities`
- `trpc.cryptoMarket.onchainMetrics`
- `trpc.cryptoMarket.sourceStatus`
- Optional: `trpc.cryptoMarket.moduleHealth`

The browser must not call external APIs directly. External source calls belong in backend/cron/source-layer code only, and future frontend data should come from MySQL/MariaDB records exposed through tRPC.

## Required Response Metadata

Future procedure responses should include or inherit:

| Field | Frontend purpose |
|---|---|
| `generated_at` | Shows when the response was generated. |
| `source_status` | Shows source availability, disabled/deferred state, and safe health metadata. |
| `data_freshness` | Shows last successful run/table freshness and stale state. |
| `warnings` | Shows recoverable warning states without exposing secrets or raw payloads. |
| `compliance` | Shows the research-only and manual verification boundary. |

## Expected Compliance Block

The frontend expects a stable compliance block:

```json
{
  "research_only": true,
  "not_investment_advice": true,
  "watchlist_means": "manual_review_only",
  "missing_data_means": "manual_verification_required",
  "scanner_label_is_read_only": true
}
```

Meaning:

- `research_only`: the module is for research workflow only.
- `not_investment_advice`: copy must not imply investment advice.
- `watchlist_means`: `WATCHLIST` means further manual review only.
- `missing_data_means`: missing data requires manual verification.
- `scanner_label_is_read_only`: review/status UI must not mutate scanner label, scanner scoring, or `final_label`.

## UI Rendering Expectations

| Condition | UI behavior |
|---|---|
| Disabled/deferred source | Render an informational state. Do not show it as a broken integration. |
| Stale data | Render warning copy and keep available data visible when possible. |
| Partial data | Render warning copy and keep available rows/sections visible. |
| Missing data | Render manual verification copy. Do not imply positive context. |
| Access denied | Render AI KINTEL subscription/role message. Do not call alternate data sources from the browser. |
| Empty result | Render empty state plus manual verification or no-data context. |
| Fatal error | Render sanitized error state. Do not expose stack traces, env values, secrets, or raw provider payloads. |

## Forbidden Frontend Behavior

- No provider URLs in browser code.
- No provider keys in browser code.
- No direct `fetch`/XHR calls from browser to external provider APIs.
- No scraping, HTML parsing, browser automation, or undocumented endpoints.
- No buy/sell/entry/signal CTAs.
- No rendering of a `recommendation` field as product behavior.
- No fallback that bypasses `trpc.cryptoMarket.*`.
- No mutation of scanner label, scanner scoring, `final_label`, or `WATCHLIST` meaning.

## Data Ownership Boundary

- Future tRPC reads should be DB-backed.
- Cron/source layer is responsible for external collection and normalization.
- tRPC is responsible for sanitized read envelopes, access control, source status, warnings, and compliance metadata.
- Frontend is responsible for rendering the state honestly without inventing missing data or calling providers.
