# AI KINTEL Monitoring / Observability Plan

## Status

- Stage: 11G - monitoring / observability plan.
- This is documentation only.
- No monitoring is implemented.
- No runtime code, PM2 config, backend, tRPC router, frontend, provider call, source adapter, dependency, `.env` file, secret value, or deployment is added.

## What To Monitor

- PM2 process status.
- Cron run success/warning/error/disabled.
- `crypto_source_runs`.
- Source freshness.
- Data freshness per table.
- tRPC error rates.
- Frontend access denied/error states.
- DB insert/update counts.
- Duplicate hash counts.
- Rate limit warnings.
- Stale data warnings.
- Secrets in logs: must be zero.
- Disabled/deferred paid source behavior.
- Browser network behavior during staging QA.

## Suggested Observability Sources

- `crypto_source_runs`.
- PM2 logs.
- AI KINTEL webapp logs.
- DB row counts.
- tRPC sanitized error logs.
- Manual staging QA.
- Browser network inspection during QA.
- Future AI KINTEL operations dashboard if available.

## Alert Candidates

- All market context sources unavailable.
- Enabled source fails repeatedly.
- Paid source called while disabled.
- Env missing for enabled source.
- Frontend provider call detected.
- Stale data exceeds threshold.
- DB unavailable.
- Secrets/raw payload detected in logs.
- Access gate fails open.
- tRPC compliance block missing.
- Source run logging missing for enabled source.

## Dashboard Ideas

- Source status summary.
- Latest runs.
- Stale tables.
- Disabled/deferred paid sources.
- Cron health.
- tRPC health.
- Frontend access/error state summary.
- DB write/read freshness.
- Manual QA status.

## Logging Rules

- Log source id, run type, status, counts, timestamps, and sanitized errors.
- Do not log secrets, env values, provider keys, auth headers, raw provider payloads, or user-sensitive access data.
- Treat any secret/raw-payload log as a release blocker and rollback trigger.
