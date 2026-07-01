# AI KINTEL Implementation Entry Checklist

## Status

- Stage: 11G - implementation entry checklist.
- This is documentation only.
- It defines readiness inputs for a future AI KINTEL implementation stage.
- Stage 12A strategic correction: AI KINTEL implementation is deferred until after standalone trusted tester preview feedback.
- 11A-11G are now a compatibility/planning package for later integration, not the immediate implementation target.
- The nearest product priority is a standalone private preview for Pawel Gradziuk.
- It does not create runtime code, staging deployment, frontend, backend, tRPC router, cron scripts, PM2 config, migrations, endpoints, source adapters, provider calls, OpenAI calls, dependencies, `.env` files, secret values, or source activation.

12A standalone trusted tester documents:

- `docs/standalone_product_gap_audit.md`
- `docs/trusted_tester_preview_path.md`
- `docs/standalone_product_definition_of_done.md`
- `docs/standalone_roadmap_to_trusted_tester.md`

Local MVP RC remains the technical baseline, but it is not yet an external standalone preview. 12A changes no runtime, UI, CSS, backend, frontend, deployment, provider calls, source adapters, source activation, scanner scoring, `final_label`, or `WATCHLIST` meaning.

## Entry Criteria

- Standalone trusted tester feedback has been captured and triaged.
- Owner confirms that AI KINTEL integration should proceed after standalone preview review.
- 11A-11G merged and still relevant after standalone preview feedback.
- Owner accepts Production MVP scope.
- DB blueprint reviewed.
- Source config/adapter contract accepted.
- Cron skeleton/runbook accepted.
- tRPC blueprint accepted.
- Frontend port plan accepted.
- Staging/deployment checklist accepted.
- Open decisions listed and assigned.
- Paid sources confirmed disabled/deferred for MVP unless separately approved.
- Local RC remains unchanged as porting baseline.

## Open Decisions Before Implementation

- Review notes storage ownership.
- Exact subscription gate.
- First free/approved sources to enable.
- Paid source order after MVP.
- Analyst report UI/export scope.
- Source diagnostics visibility.
- Retention policy.
- Raw payload storage policy.
- Staging branch/release process in `aikintel-platform`.
- Rollback owner for route, tRPC, cron, and DB changes.

## Recommended First Real Implementation Sequence

Do not start this sequence until the standalone trusted tester preview has produced owner-reviewed feedback.

1. Create DB migration branch in `aikintel-platform`.
2. Implement source config disabled registry.
3. Implement DB-backed read models.
4. Implement cron skeleton with disabled-source behavior.
5. Implement tRPC read router.
6. Implement frontend page.
7. Run staging QA.
8. Only then enable approved/free sources.
9. Keep paid sources for later.

## Explicit Non-Entry

- Do not start paid source integration before source policy/vendor review.
- Do not add provider calls before disabled behavior tests exist.
- Do not expose frontend before access gate is checked.
- Do not merge DB migration without owner/DB review.
- Do not ship without rollback path.
- Do not commit env values or secrets.
- Do not allow browser provider calls.
- Do not change scanner scoring, `final_label`, or `WATCHLIST` meaning.

## Handoff Package

The implementation owner should begin with:

- `docs/ai_kintel_production_mvp_definition.md`
- `docs/ai_kintel_database_migration_blueprint.md`
- `docs/ai_kintel_source_config_contract.md`
- `docs/ai_kintel_cron_fetcher_skeletons.md`
- `docs/ai_kintel_trpc_router_blueprint.md`
- `docs/ai_kintel_frontend_port_plan.md`
- `docs/ai_kintel_staging_deployment_checklist.md`
- `docs/ai_kintel_release_readiness_matrix.md`
- `docs/ai_kintel_rollout_rollback_plan.md`
