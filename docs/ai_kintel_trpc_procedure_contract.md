# AI KINTEL tRPC Procedure Contract

## Status

- Stage: 11E - tRPC procedure contract.
- This is documentation only.
- It does not create runtime tRPC procedures.
- It does not add backend code, endpoints, SQL query code, auth, migrations, UI, CSS, source adapters, provider calls, OpenAI calls, or dependencies.

## Input Contract Examples

Future procedure inputs should be explicit, validated, and parameterized. The field names below are planning examples only.

### Pagination

- `limit`
- `cursor`
- `offset`

Use either cursor pagination or offset pagination per procedure, not both by default. The final choice should match existing AI KINTEL tRPC conventions.

### Filters

- `symbol`
- `chain`
- `category`
- `scanner_label`
- `security_label`
- `severity`
- `source`
- `timeframe`
- `date_from`
- `date_to`

Filters should be optional unless the procedure has a clear single-record purpose, such as `projectById`.

### Sort

- `created_at`
- `updated_at`
- `risk_score`
- `research_score`
- `market_cap_usd`
- `published_at`

Sort direction should be explicit and constrained to safe values such as `asc` or `desc`.

## Output Contract

Future procedure outputs should use a stable envelope where possible:

| Field | Contract |
|---|---|
| `items` | Result rows for list queries. |
| `item` | Single result for detail queries where appropriate. |
| `next_cursor` | Cursor for cursor-based pagination, or `null` when no next page exists. |
| `pagination` | Offset/page metadata when offset pagination is used. |
| `source_status` | Safe source status or aggregate source health derived from `crypto_source_runs` and approved config metadata. |
| `generated_at` | UTC timestamp for the response generation time. |
| `warnings` | Non-fatal warnings safe for UI display. |
| `compliance` | Standard compliance block for research-only behavior. |
| `data_freshness` | Source/table freshness metadata, such as last successful run and stale threshold result. |

## Compliance Output Block

Every future procedure should expose or inherit:

```json
{
  "research_only": true,
  "not_investment_advice": true,
  "watchlist_means": "manual_review_only",
  "missing_data_means": "manual_verification_required",
  "scanner_label_is_read_only": true
}
```

Compliance fields are output metadata. They must not mutate scanner labels, scoring, `final_label`, review state, or source policy.

## Error And Warning Contract

Future procedures should distinguish fatal errors from recoverable warnings.

| Condition | Preferred behavior |
|---|---|
| Source unavailable | Return warning when DB data can still be shown; include source status. |
| Source deferred | Return disabled/deferred metadata; do not treat as runtime failure. |
| Source disabled | Return disabled metadata; do not require env and do not call provider. |
| Env missing | Warning/config issue only when source is enabled; no secret values in response. |
| Stale data | Return data with `stale_data` warning when possible. |
| Partial data | Return available rows with `partial_data` warning when possible. |
| No data | Return empty result plus `no_data` warning and manual verification note. |
| DB unavailable | Return sanitized fatal error for core reads. |

Warnings should be safe to show in the UI and should not expose secrets, env values, raw provider payloads, or stack traces.

## No Disallowed Wording In API Shape

Future API shapes should not expose a field named:

- `recommendation`

Use neutral field names instead:

- `research_summary`
- `next_review_step`
- `manual_verification_note`
- `analyst_context`

Any wording related to automated decisions, trading instructions, or investment advice should remain outside the procedure contract.

## Request Path Rule

- Future tRPC read procedures should read DB records populated by cron.
- Frontend should call only `trpc.cryptoMarket.*`.
- Frontend must not call external providers directly.
- Read queries must not call external providers unless a separate owner-approved architecture decision explicitly allows it.
- Paid sources remain disabled/deferred until explicit activation approval.
