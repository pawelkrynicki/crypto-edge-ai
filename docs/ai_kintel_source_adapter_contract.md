# AI KINTEL Source Adapter Contract

## Status

- Stage: 11C - Source Adapter Contract.
- Stage 11D adds documentation-only cron fetcher skeletons that must follow this contract.
- Stage 11E adds documentation-only tRPC router/query blueprints that read adapter/cron results from DB.
- This is a contract for future adapters, not an implementation.
- Source adapters should be created in later stages after 11D; 11D adds only cron-fetcher documentation skeletons.
- This document does not add any provider calls, backend routes, tRPC procedures, cron jobs, dependencies, or runtime configuration.

## Adapter Responsibility

Future source adapters must:

- Run only in backend/cron.
- Check source config before any provider work.
- Check env availability only when the source is enabled and requires an env key.
- Check runtime policy before any provider call.
- Respect rate limits.
- Fetch provider data only after config, env, and policy gates pass.
- Normalize provider data into stable module records.
- Deduplicate records by hash or logical key.
- Validate JSON before storage.
- Write only through the backend/DB layer.
- Report the run result to `crypto_source_runs`.

## Adapter Input Contract

Future adapter inputs should include:

- Source config.
- Run context.
- Env availability.
- Policy gate result.
- `dry_run` flag.
- Optional `since` and `until` timestamps.

## Adapter Output Contract

Future adapter outputs should include:

| Field | Contract |
|---|---|
| `source_id` | Stable source identifier. |
| `status` | One of `success`, `warning`, `error`, `disabled`, `policy_blocked`, `env_missing`, or `rate_limited`. |
| `records_seen` | Count of records observed in the provider response or fixture. |
| `records_inserted` | Count of normalized records inserted. |
| `records_updated` | Count of normalized records updated. |
| `warnings` | Non-fatal warnings safe to log without secrets. |
| `error_message` | Sanitized error summary, never including secrets or raw credentials. |
| `rate_limit_remaining` | Remaining provider quota when available, otherwise `null`. |
| `metadata` | Safe run metadata suitable for `crypto_source_runs.metadata`. |
| `normalized_records` | Validated normalized records for later DB-layer handling or dry-run inspection. |

## Disabled Behavior

If `enabled=false`:

- The adapter must not call the provider.
- The adapter returns status `disabled`.
- The adapter records or logs disabled metadata.
- The adapter does not require the env key.
- The adapter does not crash.

## Env Missing Behavior

If a paid or freemium source requires env and is enabled, but env is missing:

- Return status `env_missing`.
- Do not call the provider.
- Emit a warning/log without secrets.
- Do not crash.

Missing env for a disabled source is not an error.

## Policy Blocked Behavior

If runtime policy does not allow the action:

- Return status `policy_blocked`.
- Do not call the provider.
- Emit a warning/log without secrets.
- Do not crash.

## Provider Failure Behavior

For timeout, provider error, malformed response, or rate-limit failure:

- Use guarded error handling.
- Return status `error` or `rate_limited`.
- Log sanitized error details without secrets.
- Prevent one failing source from crashing the entire cron process.

## Normalized Record Rules

Normalized records must use:

- Stable `source`.
- Stable `source_id`.
- Stable `hash` where repeated data can occur.
- UTC timestamps.
- Explicit missing-data fields.
- No invented missing data.
- Missing data means manual verification.
- No investment recommendation fields.

## 11D Cron Fetcher Relationship

11D cron skeleton artifacts:

- `docs/ai_kintel_cron_fetcher_skeletons.md`
- `docs/ai_kintel_cron_fetcher_types_matrix.md`
- `docs/ai_kintel_pm2_cron_blueprint.md`
- `docs/ai_kintel_cron_operational_runbook.md`
- `docs/ai_kintel_cron_fetcher_test_plan.md`

Future cron fetchers must:

- Use this 11C source adapter contract before any provider work.
- Respect source config, policy, env, and rate-limit gates.
- Avoid provider calls while a source is disabled or deferred.
- Keep paid sources disabled/deferred until explicit approval.
- Report run status to `crypto_source_runs`.
- Avoid frontend provider calls.

11D does not create `packages/cron`, runtime cron scripts, source adapters, endpoints, provider calls, or Local RC behavior changes.

## 11E tRPC Router Relationship

11E tRPC blueprint artifacts:

- `docs/ai_kintel_trpc_router_blueprint.md`
- `docs/ai_kintel_trpc_procedure_contract.md`
- `docs/ai_kintel_trpc_query_matrix.md`
- `docs/ai_kintel_trpc_access_control_blueprint.md`
- `docs/ai_kintel_trpc_error_status_model.md`
- `docs/ai_kintel_trpc_router_pseudocode.md`

Future tRPC queries should:

- Read normalized DB records populated by cron/source layer.
- Read source health and disabled/deferred metadata from `crypto_source_runs`.
- Expose safe source status to `/crypto-market` through `trpc.cryptoMarket.*`.
- Avoid external provider calls from the frontend or read query path unless separately approved.
- Keep paid sources disabled/deferred until explicit activation approval.

11E does not create `packages/webapp`, `packages/webapp/server/routers/cryptoMarket.ts`, runtime tRPC procedures, backend code, endpoints, provider calls, or Local RC behavior changes.

## Pseudocode Only

```ts
async function runSourceAdapter(config, context) {
  if (!config.enabled) {
    return disabledResult(config);
  }

  if (!policyAllows(config)) {
    return policyBlockedResult(config);
  }

  if (config.env_key && !hasEnv(config.env_key)) {
    return envMissingResult(config);
  }

  try {
    const raw = await fetchProviderData(config);
    const normalized = normalize(raw);
    return successResult(config, normalized);
  } catch (error) {
    return errorResult(config, error);
  }
}
```

This pseudocode is illustrative only. It is not an adapter implementation and must not be wired into runtime.
