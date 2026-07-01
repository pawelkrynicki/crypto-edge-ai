# AI KINTEL Rollout / Rollback Plan

## Status

- Stage: 11G - rollout / rollback plan.
- This is documentation only.
- No deployment is performed.
- No staging environment, runtime code, PM2 config, migration, backend, frontend, tRPC router, endpoint, source adapter, provider call, source activation, dependency, `.env` file, or secret value is added.

## Recommended Rollout Order

1. Owner review.
2. DB review.
3. Source policy review.
4. Env placeholders in staging, names only in repo documentation.
5. DB migration dry review.
6. Backend/tRPC implementation in `aikintel-platform`.
7. Cron implementation with sources disabled.
8. Frontend implementation behind access gate.
9. Enable free/approved sources first.
10. Verify source runs.
11. Internal beta.
12. Paid source activation later, only after separate approval.

## Rollback Plan

- Disable source config.
- Stop PM2 process.
- Rollback frontend route/nav if needed.
- Rollback tRPC router exposure if needed.
- DB rollback only if safe and reviewed.
- Preserve data if possible.
- Never delete production data without DB owner approval.
- Keep paid providers disabled unless separately approved.
- Keep access gate closed if there is uncertainty.

## Emergency Rollback Triggers

- Secrets exposed.
- Provider called while disabled.
- Frontend provider call detected.
- DB migration corrupts data.
- tRPC returns raw provider payload or secrets.
- Compliance block missing.
- Access gate fails open.
- Paid source activation occurs without env/config/policy/vendor approval.
- Logs expose env values, provider keys, raw payloads, or stack traces.

## Post-Rollback Checks

- App health.
- PM2 status.
- Source runs.
- DB table state.
- Frontend route access.
- Logs contain no secrets.
- Paid providers were not called.
- `crypto_source_runs` status is accurate.
- Browser network tab has no external provider calls.
- Compliance copy and access gate behavior are intact.

## Rollback Ownership

- Operations owner controls PM2 and deployment rollback.
- DB owner controls schema/data rollback decisions.
- AI KINTEL owner controls route/access exposure.
- Source/compliance reviewer controls source activation approval.
