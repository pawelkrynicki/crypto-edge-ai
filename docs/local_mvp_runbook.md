# Local MVP Runbook

## Status

- Local MVP after 9B is operational for: scanner latest output, approved market context, local review storage, diagnostics, review export/import, and analyst report export.
- 10A Product Workflow Polish adds visible local workflow guidance in the UI without changing endpoints, labels, scoring, or storage behavior.
- 10B.1 starts UX2 with an information architecture and layout skeleton: Overview, Scanner Radar, Review Queue, Research Review, Risk Alerts, and Methodology.
- 10B.2 continues UX2 in the Scanner Radar and Candidate Detail workspace only, replacing the scanner table with candidate cards and reorganizing Candidate Detail sections.
- 10B.3 continues UX2 in the Review Queue and Analyst Report Workspace only, adding summary cards, review item cards, stored reviews not in current scan, storage/backup panels, and report command workspace copy.
- 10B.4 closes UX2 Visual QA / Polish for the local MVP UI pass, covering layout consistency, wrapping, readability, responsive fallback, and the manual checklist in `docs/ux2_visual_qa_checklist.md`.
- UX2 Product-grade Interface Redesign is complete at local MVP level.
- 10C Local MVP Release Candidate Stabilization v1 adds the local RC document and RC check script without adding features or changing product behavior.
- 10D Local MVP RC Manual Preview Notes / Known Issues v1 adds manual preview notes and known issues documentation only. It does not add features or change product behavior.
- Local RC-ready does not mean production-ready or final product-ready; production decisions remain deferred.
- 11A AI KINTEL Production MVP Definition documents the production direction as an AI KINTEL module, not a standalone SaaS. It does not change local RC behavior.
- Paid sources remain deferred but the production environment should be ready for later env/config/policy activation.

Release candidate notes:

- `docs/local_mvp_release_candidate.md`
- `docs/local_mvp_rc_manual_preview_notes.md`
- `docs/local_mvp_known_issues.md`

AI KINTEL 11A planning notes:

- `docs/ai_kintel_production_mvp_definition.md`
- `docs/ai_kintel_integration_decision_matrix.md`
- `docs/ai_kintel_paid_source_readiness_plan.md`
- `docs/ai_kintel_integration_blueprint.md`

## Fast Health Check

Release-candidate check:

```cmd
scripts\win\check-local-rc.cmd
```

This verifies required documents and scripts, then runs the local MVP verification stack. It does not check git cleanliness; before marking RC, confirm `git status` is clean separately.

Full local MVP check:

```cmd
scripts\win\check-local-mvp.cmd
```

This runs the local MVP verification stack and stops on the first failing check.

## Partial Checks

```cmd
scripts\win\check-data-poc.cmd
scripts\win\check-ui-mock.cmd
scripts\win\check-review-storage-modes.cmd
scripts\win\check-local-workflow-smoke.cmd
scripts\win\check-analyst-report.cmd
```

Use partial checks when working on a narrow area. Use `check-local-rc.cmd` and `check-local-mvp.cmd` before merge, freeze, or RC decisions.

## Local Preview

Standard preview:

```cmd
scripts\win\generate-live-context.cmd
scripts\win\dev-ui.cmd
```

SQLite Review Storage preview:

```cmd
scripts\win\dev-ui-sqlite.cmd
```

Ports:

- API: `5177`
- UI: `5173`

## Storage

- File-backed JSON is the default Review Storage provider.
- Default JSON file: `tools\ui-mock\.local\review-session.json`
- SQLite is optional through `CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER=sqlite`.
- Default SQLite file: `tools\ui-mock\.local\review-session.sqlite`
- There is no automatic JSON to SQLite migration.

Safe smoke files:

- `tools\ui-mock\.local\review-session-smoke.json`
- `tools\ui-mock\.local\review-session-smoke.sqlite`
- `tools\ui-mock\.local\local-workflow-smoke-review-session.json`
- `tools\ui-mock\.local\analyst-report-smoke-review-session.json`
- `tools\ui-mock\.local\reports-smoke\analyst-report-*.md`
- `tools\ui-mock\.local\reports-smoke\analyst-report-*.json`

Normal local files:

- `tools\ui-mock\.local\review-session.json`
- `tools\ui-mock\.local\review-session.sqlite`
- `tools\ui-mock\.local\reports\analyst-report-*.md`
- `tools\ui-mock\.local\reports\analyst-report-*.json`

## Analyst Workflow

1. `GET /api/scanner/latest` loads scanner latest output.
2. UI candidates are built through the existing scanner adapter.
3. `GET /api/context/latest` loads approved market context or fixture fallback.
4. `GET /api/review-session` loads local review status and notes.
5. Review Queue separates scanner `WATCHLIST` from local review status.
6. Diagnostics use `GET /api/review-session/diagnostics`.
7. Reset clears only local review state through the existing local workflow.
8. Export/import backs up only the local review session.
9. Analyst report exports the current local workflow snapshot.

Review status does not change scanner labels, scoring, `final_label`, or `WATCHLIST` meaning.

10A UI polish mirrors this path in the dashboard:

```text
Scanner latest -> Market context -> Candidate detail -> Local review -> Review queue -> Analyst report -> Local MVP health check
```

Keep these layers separate:

- Scanner label: read-only scanner output, including `final_label`.
- Local review status: local analyst organization and notes only.
- Analyst report: generated from CMD with `scripts\win\generate-analyst-report.cmd`.
- Local MVP health check: run with `scripts\win\check-local-mvp.cmd`.

10B.1 moves Market Context, Local MVP workflow status, and scanner stat cards into the new Overview workspace. 10B.2 makes Scanner Radar and Candidate Detail easier to scan while keeping scanner output read-only and local review separate from scanner labels. 10B.3 makes Review Queue, stored reviews, storage/backup/diagnostics/reset, and Analyst Report Workspace easier to scan while keeping all review/import/export/reset/diagnostics/report behavior unchanged. 10B.4 completes the visual QA / polish pass for spacing, wrapping, section separation, selected candidate state, command blocks, and responsive fallback.

10B.1 through 10B.4 change no endpoints, scanner scoring, `final_label`, `WATCHLIST` meaning, review storage behavior, review import/export/reset behavior, diagnostics behavior, or analyst report generation.

Visual QA checklist:

- `docs/ux2_visual_qa_checklist.md`

This is not a buy/sell signal. UX2 is complete for the local MVP UI pass; 10C Local MVP Release Candidate Stabilization keeps the current scope stable, and 10D adds manual preview / known-issues documentation without changing product behavior.

## Analyst Report

Generate a normal report:

```cmd
scripts\win\generate-analyst-report.cmd
```

Report output:

```text
tools\ui-mock\.local\reports
```

Smoke check:

```cmd
scripts\win\check-analyst-report.cmd
```

The report is Markdown plus JSON. It is a local research workflow export only. It does not change scanner output or market data. This is not a buy/sell signal.

## Troubleshooting

If ports are busy:

```cmd
scripts\win\kill-local-ports.cmd
```

If `gh` loses its token:

```cmd
gh auth logout -h github.com -u pawelkrynicki
gh auth login -h github.com --git-protocol https --web
gh auth status -h github.com
gh api user --jq .login
```

If Windows or `pnpm` hits an `EPERM` issue, prefer the existing `scripts\win\*.cmd` helpers. They call direct local binaries where the project already needs that workaround.

## Do Not Do During 10C / 10D

- Do not rebuild the frontend or change the completed local MVP UI flow.
- Do not add a production backend.
- Do not add auth.
- Do not add new data sources.
- Do not change scanner scoring.
- Do not change `final_label`.
- Do not change `WATCHLIST` meaning.
- Do not add paid integrations, production deployment, or monitoring until those future product decisions are made.

After 10D, prefer freeze/light mode unless a real blocker appears.

## AI KINTEL Production MVP Planning

Stage 11A keeps the local RC as the baseline for porting, but production implementation belongs in AI KINTEL: Express/tRPC webapp, MySQL/MariaDB, cron scripts under `packages/cron/scripts`, PM2, and a `/crypto-market` module route.

11A is documentation/decision work only. It adds no endpoint, source adapter, dependency, auth implementation, production backend, production database, executable production migration, UI/CSS change, scanner scoring change, `final_label` change, or `WATCHLIST` meaning change.
