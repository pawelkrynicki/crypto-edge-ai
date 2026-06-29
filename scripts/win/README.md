# Windows Helper Scripts

These scripts are developer tooling for Windows CMD. Run them from the repo root or any other current directory; each script resolves the repo root from its own location.

## After Every Merge

```cmd
scripts\win\post-merge-check.cmd
```

This syncs `main`, checks that the working tree is clean, runs the data POC checks, and runs the UI mock checks.

## Local MVP Check

```cmd
scripts\win\check-local-mvp.cmd
```

This is the pre-holiday local MVP health check. It runs the existing checks in order:

- `scripts\win\check-data-poc.cmd`
- `scripts\win\check-review-storage-modes.cmd`
- `scripts\win\check-local-workflow-smoke.cmd`
- `scripts\win\check-analyst-report.cmd`
- `scripts\win\check-ui-mock.cmd`

It does not start the dev preview or open a browser. It stops on the first failing check and prints `LOCAL MVP CHECK OK` when the local MVP stack is healthy.

Runbook and freeze notes:

- `docs\local_mvp_runbook.md`
- `docs\pre_holiday_freeze_checklist.md`
- `docs\local_mvp_release_candidate.md`
- `docs\local_mvp_rc_manual_preview_notes.md`
- `docs\local_mvp_known_issues.md`

UX2 Product-grade Interface Redesign is complete for the local MVP UI pass through 10B.4. 10C Local MVP Release Candidate Stabilization is documentation/DX stabilization only and adds no new feature scope. 10D adds manual preview notes and known issues documentation only; it does not add features or change product behavior.

Final product readiness still requires future decisions for hosting, auth, production backend, data/paid integrations, deployment, and monitoring.

After 10D, prefer freeze/light mode unless a real blocker appears.

## Local MVP RC Check

```cmd
scripts\win\check-local-rc.cmd
```

This is the 10C local release-candidate checkpoint. It verifies the required runbook/checklist documents and core local MVP scripts are present, then runs `scripts\win\check-local-mvp.cmd`.

It does not check `git status --porcelain`, because development branches are expected to have changes before commit. Before marking a release candidate, confirm a clean working tree separately with `git status`.

## Generate Live Context

```cmd
scripts\win\generate-live-context.cmd
```

This generates the approved live source context with `CRYPTO_EDGE_DATA_ENV=PUBLIC_BETA`, then clears the environment variable before exiting.

## Start Local Preview

```cmd
scripts\win\dev-ui.cmd
```

This starts the local API on port `5177` and the frontend on port `5173` in separate CMD windows.

Record real click-through results in `docs\local_mvp_rc_manual_preview_notes.md`. Do not mark any area as `PASS` unless the preview was actually opened and clicked through.

SQLite Review Storage preview:

```cmd
scripts\win\dev-ui-sqlite.cmd
```

This starts the same local API/frontend preview, but the API uses the optional SQLite Review Storage provider through `CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER=sqlite` and stores the database under `tools\ui-mock\.local\review-session.sqlite`.

File-backed JSON remains the default provider when using `dev-ui.cmd`.

## Review Storage Mode Checks

```cmd
scripts\win\check-review-storage-file.cmd
scripts\win\check-review-storage-sqlite.cmd
scripts\win\check-review-storage-modes.cmd
```

These scripts run a lightweight local smoke test for the existing Review Storage endpoints:

- `GET /api/review-session`
- `PUT /api/review-session`
- `GET /api/review-session/diagnostics`

`check-review-storage-file.cmd` verifies the default file-backed JSON provider. `check-review-storage-sqlite.cmd` verifies the optional SQLite provider with `CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER=sqlite` and a safe `.local` database path. `check-review-storage-modes.cmd` runs both checks.

The smoke runner uses only local loopback HTTP and dedicated smoke files under `tools\ui-mock\.local`: `review-session-smoke.json` and `review-session-smoke.sqlite`. It does not touch the normal `review-session.json` or `review-session.sqlite` files. It also does not touch scanner output, market data, external networks, data sources, endpoint paths, UI workflow, scoring, `final_label`, or `WATCHLIST` meaning. SQLite is optional and there is no automatic JSON-to-SQLite migration.

## Local Workflow Smoke Check

```cmd
scripts\win\check-local-workflow-smoke.cmd
```

This runs `tools\ui-mock\scripts\localWorkflowSmoke.ts` through `node_modules\.bin\tsx.cmd`.

The local workflow smoke starts the existing local API on a random `127.0.0.1` port and verifies the basic local MVP path:

- scanner latest output through `GET /api/scanner/latest` and the existing UI adapter
- scanner source diagnostics through `GET /api/scanner/sources`
- market context through `GET /api/context/latest` and the existing context parser
- review session `GET`, valid `PUT`, diagnostics, invalid `PUT` rejection, and non-overwrite behavior
- review session export/import helpers
- server-render smoke coverage for Market Context, Candidate Detail, and Review Queue UI paths

The runner uses a dedicated file under `tools\ui-mock\.local\local-workflow-smoke-review-session.json` and has a cleanup guard so it cannot remove the normal `review-session.json` or `review-session.sqlite`. It uses only local API calls and local real-output or fixture fallback files. It does not call external networks, change scanner output, change market data, add data sources, change endpoint paths, change UI workflow, change scoring, change `final_label`, or change `WATCHLIST` meaning. UX2 Product-grade Interface Redesign is complete for the local MVP UI pass; 10C keeps this as stabilization scope.

## Analyst Report Export

```cmd
scripts\win\generate-analyst-report.cmd
scripts\win\check-analyst-report.cmd
```

`generate-analyst-report.cmd` runs the local analyst report export and writes Markdown plus JSON under:

```text
tools\ui-mock\.local\reports
```

`check-analyst-report.cmd` runs the same generator in `--smoke` mode with dedicated temporary review storage and guarded smoke report files under `tools\ui-mock\.local\reports-smoke`.

The report is a local research workflow export only. It reads the existing local API path from scanner latest output, UI candidates, approved market context, review session storage, and review diagnostics. It does not call external networks, add data sources, change scanner output, change market data, change scoring, change `final_label`, change `WATCHLIST` meaning, add auth, add a production backend, or change the completed UX2 local MVP UI pass. The compliance copy remains clear that it is not a recommendation and `This is not a buy/sell signal.`

## Free Local Preview Ports

```cmd
scripts\win\kill-local-ports.cmd
```

This finds listeners on ports `5173` and `5177` and stops them.

## UI Mock Check Note

`check-ui-mock.cmd` uses direct binaries from `tools\ui-mock\node_modules\.bin` instead of `pnpm` because Windows can hit a known `node_modules` / `pnpm` `EPERM` issue in this repo.
