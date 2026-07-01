# AI KINTEL tRPC Router Pseudocode

## Status

- Stage: 11E - tRPC router pseudocode.
- This is pseudocode only.
- This is not a runtime file.
- It does not create `cryptoMarket.ts`.
- It does not create `packages/webapp`.
- It does not add real imports, real tRPC procedures, endpoint wiring, SQL runtime query code, backend code, auth, migrations, UI, CSS, source adapters, provider calls, OpenAI calls, or dependencies.

## Purpose

This document shows the intended structure pattern for a future AI KINTEL router. The real implementation belongs later in:

```text
aikintel-platform/packages/webapp/server/routers/cryptoMarket.ts
```

The future frontend should consume:

```text
trpc.cryptoMarket.*
```

The future frontend must not call external providers directly. Data should come from DB rows populated by cron/source layer.

## Documentation-Only Pseudocode

```ts
// PSEUDOCODE ONLY.
// Do not copy into runtime without AI KINTEL owner/backend review.
// Data reads below represent DB reads from tables populated by cron.
// No external provider calls happen in this request/response path.

type ComplianceBlock = {
  research_only: true;
  not_investment_advice: true;
  watchlist_means: "manual_review_only";
  missing_data_means: "manual_verification_required";
  scanner_label_is_read_only: true;
};

type ProcedureWarning = {
  code:
    | "no_data"
    | "partial_data"
    | "stale_data"
    | "source_disabled"
    | "source_deferred"
    | "source_policy_blocked"
    | "source_env_missing";
  message: string;
};

function buildComplianceBlock(): ComplianceBlock {
  return {
    research_only: true,
    not_investment_advice: true,
    watchlist_means: "manual_review_only",
    missing_data_means: "manual_verification_required",
    scanner_label_is_read_only: true,
  };
}

function sanitizeError(error: unknown): { code: string; message: string } {
  // Keep secrets, env values, stack traces, and raw provider payloads out of responses.
  return {
    code: "internal_error",
    message: "sanitized error",
  };
}

function buildSourceStatusWarnings(sourceStatus: unknown): ProcedureWarning[] {
  // Build warnings from crypto_source_runs and safe config metadata only.
  // Disabled/deferred paid sources are represented as status metadata.
  return [];
}

export const cryptoMarketRouter = router({
  marketSummary: protectedProcedure.query(async ({ ctx }) => {
    const summary = await ctx.db.crypto_market_summaries.findLatest({
      timeframe: "daily",
    });
    const sourceStatus = await ctx.db.crypto_source_runs.findLatestForModule({
      module: "crypto_market",
      runTypes: ["market_sentiment", "market_onchain_context"],
    });

    return {
      item: summary,
      source_status: sourceStatus,
      generated_at: new Date().toISOString(),
      warnings: buildSourceStatusWarnings(sourceStatus),
      compliance: buildComplianceBlock(),
      data_freshness: {
        source: "crypto_source_runs",
        checked_at: new Date().toISOString(),
      },
    };
  }),

  projects: protectedProcedure
    .input(projectsInputSchema)
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.crypto_projects.findManyParameterized({
        limit: input.limit,
        cursor: input.cursor,
        filters: {
          symbol: input.symbol,
          chain: input.chain,
          category: input.category,
          scanner_label: input.scanner_label,
          security_label: input.security_label,
        },
        sort: input.sort,
      });
      const sourceStatus = await ctx.db.crypto_source_runs.findLatestForModule({
        module: "crypto_market",
        runTypes: ["project_market_data"],
      });

      return {
        items: result.items,
        next_cursor: result.next_cursor,
        source_status: sourceStatus,
        generated_at: new Date().toISOString(),
        warnings: buildSourceStatusWarnings(sourceStatus),
        compliance: buildComplianceBlock(),
        data_freshness: result.data_freshness,
      };
    }),

  sourceStatus: protectedProcedure.query(async ({ ctx }) => {
    const sourceStatus = await ctx.db.crypto_source_runs.findLatestBySource({
      module: "crypto_market",
    });

    return {
      items: sourceStatus,
      generated_at: new Date().toISOString(),
      warnings: buildSourceStatusWarnings(sourceStatus),
      compliance: buildComplianceBlock(),
    };
  }),
});
```

## Pseudocode Rules

- No real connection strings.
- No real local imports.
- No external provider calls.
- No OpenAI calls.
- No field named `recommendation`.
- Data comes from DB tables populated by cron.
- Source status comes from `crypto_source_runs`.
- Disabled/deferred paid source metadata is safe to expose only when sanitized.
- Review status, if added later, must not mutate scanner label, scoring, `final_label`, or `WATCHLIST` meaning.
