# AI KINTEL Cron Fetcher Skeletons

## Status

- Stage: 11D - AI KINTEL Cron Fetcher Skeletons.
- Stage 11E adds documentation-only tRPC router/query blueprints for future readers of cron-populated DB records.
- This is a documentation-only skeleton for future cron fetchers, not an implementation.
- It does not create `packages/cron`.
- It does not call providers.
- It does not activate sources.
- It does not change the Local MVP Release Candidate.
- It does not add runtime cron scripts, source adapters, tRPC procedures, endpoints, dependencies, backend code, auth, migrations, UI, or CSS.
- 11E does not create `packages/webapp`, `packages/webapp/server/routers/cryptoMarket.ts`, runtime tRPC procedures, backend code, endpoints, provider calls, or change Local RC behavior.

11E tRPC router blueprint artifacts:

- `docs/ai_kintel_trpc_router_blueprint.md`
- `docs/ai_kintel_trpc_procedure_contract.md`
- `docs/ai_kintel_trpc_query_matrix.md`
- `docs/ai_kintel_trpc_access_control_blueprint.md`
- `docs/ai_kintel_trpc_error_status_model.md`
- `docs/ai_kintel_trpc_router_pseudocode.md`

## Target AI KINTEL Location

Future AI KINTEL integration target:

- Future repo: `aikintel-platform`
- Future package: `packages/cron`

Future scripts:

- `packages/cron/scripts/fetch-crypto-market-context.ts`
- `packages/cron/scripts/fetch-crypto-projects.ts`
- `packages/cron/scripts/fetch-crypto-security.ts`
- `packages/cron/scripts/fetch-crypto-onchain.ts`
- `packages/cron/scripts/generate-crypto-market-summary.ts`

These paths are target planning paths only. They are not created in this repo during 11D.

## Skeleton Rules

Future cron fetchers should follow these rules:

- Import env through the existing AI KINTEL pattern.
- Use the existing `packages/cron/lib/db.ts`.
- Do not create a new DB connection helper.
- Check source config before any provider call.
- Check runtime policy before any provider call.
- Check env only when a source is enabled and requires env.
- Return disabled metadata for disabled sources.
- Do not require env for disabled or deferred paid sources.
- Do not call providers for disabled or deferred sources.
- Prevent one source failure from crashing the whole cron batch.
- Normalize records before insert.
- Deduplicate by hash or logical key.
- Store timestamps in UTC.
- Write source run status to `crypto_source_runs`.
- Run provider access through backend/cron only.
- Do not add frontend provider calls.
- Future tRPC queries should read DB records populated by these cron/source flows.
- Future tRPC read queries should not call providers unless separately approved.
- Keep paid sources disabled/deferred until explicit env, config, policy, and owner approval are complete.
- Follow the 11C source config, adapter, status/error, registry, and test-plan contracts.

## Documentation-Only TypeScript Skeleton

The following example is pseudocode for future AI KINTEL implementation work. Do not create it as a runtime `.ts` file in this repo.

```ts
type SourceConfig = {
  id: string;
  displayName: string;
  enabled: boolean;
  tier: "free" | "freemium" | "paid" | "internal";
  category: string;
  envKey?: string | null;
  sourceRunType: string;
};

type RunContext = {
  dryRun: boolean;
  startedAtUtc: string;
  db: unknown;
  logger: {
    info: (metadata: Record<string, unknown>) => void;
    warn: (metadata: Record<string, unknown>) => void;
    error: (metadata: Record<string, unknown>) => void;
  };
};

type SourceRunResult = {
  sourceId: string;
  status: "success" | "warning" | "error" | "disabled";
  sourceStatus:
    | "success"
    | "warning"
    | "error"
    | "disabled"
    | "policy_blocked"
    | "env_missing"
    | "rate_limited";
  recordsSeen: number;
  recordsInserted: number;
  recordsUpdated: number;
  metadata: Record<string, unknown>;
};

async function main() {
  const context = createRunContextPlaceholder();
  const sourceConfigs = await loadSourceConfigsPlaceholder("crypto_market");

  for (const sourceConfig of sourceConfigs) {
    const result = await runSource(sourceConfig, context);

    context.logger.info({
      source_id: result.sourceId,
      status: result.status,
      source_status: result.sourceStatus,
      records_seen: result.recordsSeen,
      records_inserted: result.recordsInserted,
      records_updated: result.recordsUpdated,
    });
  }
}

async function runSource(
  sourceConfig: SourceConfig,
  context: RunContext,
): Promise<SourceRunResult> {
  const startedAtUtc = new Date().toISOString();

  if (!sourceConfig.enabled) {
    return writeCryptoSourceRunPlaceholder({
      sourceConfig,
      context,
      startedAtUtc,
      finishedAtUtc: new Date().toISOString(),
      status: "disabled",
      sourceStatus: "disabled",
      recordsSeen: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      metadata: {
        reason: "source_disabled",
        provider_called: false,
        env_required: false,
      },
    });
  }

  const policyGate = checkRuntimePolicyPlaceholder(sourceConfig, context);

  if (!policyGate.allowed) {
    return writeCryptoSourceRunPlaceholder({
      sourceConfig,
      context,
      startedAtUtc,
      finishedAtUtc: new Date().toISOString(),
      status: policyGate.intentionalDisable ? "disabled" : "error",
      sourceStatus: "policy_blocked",
      recordsSeen: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      metadata: {
        reason: "policy_blocked",
        policy_status: policyGate.status,
        provider_called: false,
      },
    });
  }

  if (sourceConfig.envKey && !hasEnvPlaceholder(sourceConfig.envKey)) {
    return writeCryptoSourceRunPlaceholder({
      sourceConfig,
      context,
      startedAtUtc,
      finishedAtUtc: new Date().toISOString(),
      status: "error",
      sourceStatus: "env_missing",
      recordsSeen: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      metadata: {
        reason: "env_missing",
        env_key: sourceConfig.envKey,
        provider_called: false,
      },
    });
  }

  try {
    const providerData = await fetchProviderDataPlaceholder(sourceConfig, context);
    const normalizedRecords = normalizeProviderDataPlaceholder(
      sourceConfig,
      providerData,
      {
        timestampMode: "utc",
        dedupeMode: "hash_or_logical_key",
      },
    );

    const persistResult = context.dryRun
      ? { inserted: 0, updated: 0 }
      : await persistNormalizedRecordsPlaceholder(context.db, normalizedRecords);

    return writeCryptoSourceRunPlaceholder({
      sourceConfig,
      context,
      startedAtUtc,
      finishedAtUtc: new Date().toISOString(),
      status: "success",
      sourceStatus: "success",
      recordsSeen: normalizedRecords.length,
      recordsInserted: persistResult.inserted,
      recordsUpdated: persistResult.updated,
      metadata: {
        dry_run: context.dryRun,
        provider_called: true,
        normalized_before_insert: true,
        dedupe: "hash_or_logical_key",
      },
    });
  } catch (error) {
    context.logger.error({
      source_id: sourceConfig.id,
      status: "error",
      error_message: sanitizeErrorPlaceholder(error),
    });

    return writeCryptoSourceRunPlaceholder({
      sourceConfig,
      context,
      startedAtUtc,
      finishedAtUtc: new Date().toISOString(),
      status: "error",
      sourceStatus: "error",
      recordsSeen: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      metadata: {
        provider_called: true,
        error_message: sanitizeErrorPlaceholder(error),
      },
    });
  }
}
```

## Source Run Requirements

Future writes to `crypto_source_runs` should include:

- `source_id`
- `source_name`
- `run_type`
- `status`
- `started_at`
- `finished_at`
- `records_seen`
- `records_inserted`
- `records_updated`
- safe `metadata`
- sanitized `error_message`

Disabled/deferred paid sources should write disabled metadata only when approved by the AI KINTEL owner and should never call providers while disabled.

## Non-Goals

- No runtime cron scripts in 11D.
- No `packages/cron` directory in this repo.
- No source adapter implementation.
- No provider calls.
- No source activation.
- No endpoint changes.
- No local RC behavior change.
