# Local MVP Runbook

## Status

- Local MVP after 9B is operational for: scanner latest output, approved market context, local review storage, diagnostics, review export/import, and analyst report export.
- 10A Product Workflow Polish adds visible local workflow guidance in the UI without changing endpoints, labels, scoring, or storage behavior.
- 10B.1 starts UX2 with an information architecture and layout skeleton: Overview, Scanner Radar, Review Queue, Research Review, Risk Alerts, and Methodology.
- The current frontend is a functional working prototype, not the final product interface.
- Full UX2 Product-grade Interface Redesign remains in progress before a final production-grade interface.

## Fast Health Check

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

Use partial checks when working on a narrow area. Use `check-local-mvp.cmd` before merge or freeze decisions.

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

10B.1 moves Market Context, Local MVP workflow status, and scanner stat cards into the new Overview workspace. It does not change endpoints, scanner scoring, `final_label`, `WATCHLIST` meaning, review storage behavior, or analyst report generation.

Next UX2 steps:

- 10B.2 Scanner / Candidate Detail Redesign
- 10B.3 Review Queue + Report Workspace
- 10B.4 Visual QA / Polish

This is not a buy/sell signal. Full UX2 Product-grade Interface Redesign remains in progress.

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

## Do Not Do Before UX2

- Do not rebuild the frontend as a final interface.
- Do not add a production backend.
- Do not add auth.
- Do not add new data sources.
- Do not change scanner scoring.
- Do not change `final_label`.
- Do not change `WATCHLIST` meaning.
