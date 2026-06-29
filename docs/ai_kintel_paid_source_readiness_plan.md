# AI KINTEL Paid Source Readiness Plan

## Status

- Stage: 11A - paid-source readiness only.
- Stage 11B adds database blueprint references for source-run observability.
- Paid sources are deferred.
- The production environment must be paid-source-ready.
- No paid source is called until explicitly enabled.
- This document does not add source adapters, dependencies, endpoints, cron jobs, auth, backend code, or production database changes.
- 11B does not execute a migration; the real migration belongs to a future AI KINTEL repo integration stage.

11B database blueprint artifacts:

- `docs/ai_kintel_database_migration_blueprint.md`
- `docs/ai_kintel_crypto_tables_blueprint.sql`
- `docs/ai_kintel_database_mapping_matrix.md`

## Required Pattern For Every Paid Source

Every paid or approval-gated source must have:

- Env var placeholder.
- Config flag.
- Adapter status.
- Disabled fallback.
- Rate-limit config.
- Cost notes.
- License and commercial approval notes.
- Test mode or dry run if possible.
- Attribution requirement notes where applicable.
- Rollback rule for disabling the source without DB/API/UI rebuild.

## Documentation-Only Config Shape

```ts
{
  id: "coingecko",
  status: "disabled",
  tier: "paid",
  envKey: "COINGECKO_API_KEY",
  enabled: false,
  requiresCommercialApproval: true,
  runtimeBehaviorWhenDisabled: "return disabled metadata, do not call API"
}
```

This shape is illustrative only. It is not a production config implementation.

## Env Placeholders

- `COINGECKO_API_KEY`
- `CRYPTOCOMPARE_API_KEY`
- `TOKENSNIFFER_API_KEY`
- `TOKENOMIST_API_KEY`
- `GOPLUS_API_KEY`
- `BUBBLEMAPS_API_KEY`
- `ARKHAM_API_KEY`

## Activation Checklist

- Vendor selected.
- Pricing accepted.
- Terms and commercial use reviewed.
- Attribution requirements documented.
- Env key added to production.
- Source config changed to enabled.
- Source policy changed to allow the required runtime actions.
- Cron tested manually.
- Rate limits observed.
- Frontend confirmed to have no direct provider call.
- Logs checked.
- Rollback plan exists.

## Runtime Behavior

When a paid source is disabled:

- Do not call the provider.
- Do not require the env key.
- Do not fail module startup.
- Return disabled source metadata.
- In the future AI KINTEL implementation, record disabled/config metadata in `crypto_source_runs` or equivalent source config observability.
- Show `not configured` or `deferred` in UI-facing status.
- Keep schema/API/UI stable so the source can be enabled later through env/config/policy only.

When a paid source is enabled:

- Require the env key.
- Use backend or cron only.
- Respect rate limits.
- Validate JSON before insert.
- Store normalized records only unless raw storage is explicitly approved.
- Use UTC timestamps.
- Deduplicate by stable hash or logical key.
- Log success, warnings, and failures without exposing secrets.

## Non-Negotiable Rules

- No scraping.
- No undocumented endpoints.
- No bypassing rate limits.
- No browser automation.
- No hardcoded keys.
- No silent paid API calls.
- No frontend direct calls to paid providers.
- No paid-source activation without explicit env, config, and policy changes.
