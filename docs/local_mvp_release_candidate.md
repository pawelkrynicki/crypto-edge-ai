# Local MVP Release Candidate

## Status

- Local MVP Release Candidate Stabilization v1.
- Stage 11A adds AI KINTEL production MVP definition documents; it does not change local RC behavior.
- Stage 11B adds AI KINTEL database migration blueprint documents; it does not change local RC behavior.
- Stage 11C adds AI KINTEL source config/adapter contract documents; it does not change local RC behavior.
- Stage 11D adds AI KINTEL cron fetcher skeleton documents; it does not change local RC behavior.
- Stage 11E adds AI KINTEL tRPC router blueprint documents; it does not change local RC behavior.
- Stage 11F adds AI KINTEL frontend port planning documents; it does not change local RC behavior.
- The local MVP is RC-ready after `scripts\win\check-local-rc.cmd` passes.
- UX2 local MVP UI pass was completed in 10B.4.
- 10C stabilizes the local RC and does not add new product features.
- 10D adds manual preview notes and known issues documentation only; it does not add new product features.
- Local RC-ready still does not mean production-ready or final product-ready.
- Production direction is an AI KINTEL module, not a standalone SaaS.
- The local RC remains the porting baseline, not the production implementation.

11A production planning documents:

- `docs/ai_kintel_production_mvp_definition.md`
- `docs/ai_kintel_integration_decision_matrix.md`
- `docs/ai_kintel_paid_source_readiness_plan.md`
- `docs/ai_kintel_integration_blueprint.md`

11B database blueprint documents:

- `docs/ai_kintel_database_migration_blueprint.md`
- `docs/ai_kintel_crypto_tables_blueprint.sql`
- `docs/ai_kintel_database_mapping_matrix.md`

11C source contract documents:

- `docs/ai_kintel_source_config_contract.md`
- `docs/ai_kintel_source_adapter_contract.md`
- `docs/ai_kintel_source_status_error_model.md`
- `docs/ai_kintel_source_registry_blueprint.json`
- `docs/ai_kintel_source_adapter_test_plan.md`

11D cron skeleton documents:

- `docs/ai_kintel_cron_fetcher_skeletons.md`
- `docs/ai_kintel_cron_fetcher_types_matrix.md`
- `docs/ai_kintel_pm2_cron_blueprint.md`
- `docs/ai_kintel_cron_operational_runbook.md`
- `docs/ai_kintel_cron_fetcher_test_plan.md`

11E tRPC router blueprint documents:

- `docs/ai_kintel_trpc_router_blueprint.md`
- `docs/ai_kintel_trpc_procedure_contract.md`
- `docs/ai_kintel_trpc_query_matrix.md`
- `docs/ai_kintel_trpc_access_control_blueprint.md`
- `docs/ai_kintel_trpc_error_status_model.md`
- `docs/ai_kintel_trpc_router_pseudocode.md`

11F frontend port planning documents:

- `docs/ai_kintel_frontend_port_plan.md`
- `docs/ai_kintel_frontend_component_map.md`
- `docs/ai_kintel_frontend_data_contract.md`
- `docs/ai_kintel_frontend_state_model.md`
- `docs/ai_kintel_frontend_compliance_copy_guide.md`
- `docs/ai_kintel_frontend_port_checklist.md`

11B is review-only documentation. It does not execute a migration, add a production database, add source adapters, add backend/auth/endpoints, change UI/CSS, change scanner scoring, change `final_label`, or change `WATCHLIST` meaning. Paid sources remain disabled/deferred, and the real migration belongs to a future AI KINTEL repo integration stage.

11C is review-only source contract documentation. It does not implement adapters, activate sources, add provider calls, add endpoint/backend/auth code, add cron implementations, change UI/CSS, change scanner scoring, change `final_label`, or change `WATCHLIST` meaning. Paid sources remain disabled/deferred, future adapters must run backend/cron only, disabled paid vendors must not call providers, and frontend access remains tRPC/backend-only.

11D is review-only cron fetcher skeleton documentation. It does not create `packages/cron`, runtime cron scripts, source adapters, provider calls, endpoint/backend/auth code, dependencies, migrations, UI/CSS changes, scanner scoring changes, `final_label` changes, or `WATCHLIST` meaning changes. Future cron fetchers must follow the 11C source adapter contract, paid sources remain disabled/deferred, and disabled paid vendors must not call providers.

11E is review-only tRPC router blueprint documentation. It does not create `packages/webapp`, `packages/webapp/server/routers/cryptoMarket.ts`, runtime tRPC procedures, endpoint/backend/auth code, dependencies, migrations, source adapters, provider calls, OpenAI calls, UI/CSS changes, scanner scoring changes, `final_label` changes, or `WATCHLIST` meaning changes. Future frontend access remains tRPC-only through `trpc.cryptoMarket.*`, future queries read DB records populated by cron/source layer, and paid sources remain disabled/deferred.

11F is review-only frontend port planning documentation. It does not create `packages/webapp`, `CryptoMarket.tsx`, route `/crypto-market`, sidebar navigation, React components, Tailwind/shadcn runtime code, endpoint/backend/auth code, runtime tRPC procedures, dependencies, migrations, source adapters, provider calls, OpenAI calls, UI/CSS changes, scanner scoring changes, `final_label` changes, or `WATCHLIST` meaning changes. Future frontend access remains tRPC-only through `trpc.cryptoMarket.*`, future UI reads DB-backed tRPC responses populated by cron/source layer, paid sources remain disabled/deferred, and no provider call is allowed in the browser.

## Included In Local MVP

- Local scanner latest flow.
- Approved market context.
- Review Queue.
- Local review storage: JSON default and SQLite optional.
- Diagnostics and reset.
- Export/import review JSON.
- Analyst report Markdown and JSON.
- Local workflow smoke.
- Local MVP checks.
- UX2 local MVP UI.

## Not Included / Deferred

- Production backend.
- Auth/users.
- Hosting.
- Production database.
- Production cron.
- Paid data integrations.
- New data sources.
- OpenAI calls.
- Report generation from UI.
- Auto-trading.
- Investment recommendations or trading signals.
- AI KINTEL production implementation.
- Paid sources remain deferred but the production environment should be ready for later env/config/policy activation.

## RC Verification

```cmd
scripts\win\check-local-rc.cmd
scripts\win\check-local-mvp.cmd
scripts\win\check-analyst-report.cmd
scripts\win\check-local-workflow-smoke.cmd
scripts\win\check-review-storage-modes.cmd
scripts\win\check-data-poc.cmd
scripts\win\check-ui-mock.cmd
```

Before marking an RC, confirm the working tree is clean separately with `git status`.

## Manual Preview

```cmd
scripts\win\generate-live-context.cmd
scripts\win\dev-ui.cmd
```

Manual preview notes:

- `docs/local_mvp_rc_manual_preview_notes.md`

Do not mark any manual preview area as `PASS` unless the local UI was actually opened and clicked through.

## Local Storage

- File-backed JSON is the default local review storage provider.
- SQLite is optional.
- `.local` files are local-only.
- There is no automatic JSON to SQLite migration.

## Release Candidate Definition

- All checks pass.
- Working tree is clean.
- Current branch is merged to `main`.
- `scripts\win\post-merge-check.cmd` passes after merge.
- `scripts\win\check-local-rc.cmd` passes.
- Analyst report generates locally.
- No new endpoint, source, scoring, or label changes are included.

## Known Limitations

- Local-only.
- No auth.
- No production hosting.
- No paid/live third-party integrations beyond the allowed local approved source flow.
- Source coverage is intentionally limited.
- Report is generated from CMD.
- Review status is not a recommendation.
- `WATCHLIST` remains further manual review only.

Known issues and accepted limitations:

- `docs/local_mvp_known_issues.md`

After 10D, prefer freeze/light mode unless a real blocker appears.
