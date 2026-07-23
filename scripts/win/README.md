# Windows Helper Scripts

These scripts are developer tooling for Windows CMD. Run them from the repo root or any other current directory; each script resolves the repo root from its own location.

## Owner Established Promotion Flow

Dedykowany offline check używa injected product data i temporary universe/follow-up stores:

```cmd
scripts\win\check-owner-established-promotion.cmd
```

Bezpieczny owner review otwiera Candidate Detail w `INTERNAL_BETA + REVIEW_SAFE`:

```cmd
scripts\win\start-established-promotion-review.cmd
```

Review pozwala odczytać status i plan, ale POST pozostaje zablokowany. Nie istnieje launcher `ENABLED`. Skrypty nie tworzą sztucznego Candidate, nie dotykają prawdziwego local universe, nie uruchamiają collectora ani providerów i nie zmieniają VPS, Cloudflare lub Task Scheduler. Pełny kontrakt: `docs/owner_established_promotion_flow.md`.

## Maturing / Follow-up Basket

Offline check całego kontraktu Follow-up:

```cmd
scripts\win\check-follow-up-basket.cmd
```

Dry-run bootstrap istniejącego poprawnego scanner snapshotu, zawsze 0 provider calls i bez zapisu:

```cmd
scripts\win\follow-up-bootstrap-preview.cmd
```

Jedna komenda owner review trzech warstw Radaru, EN/PL, checkpointów, Candidate copy i Control Center:

```cmd
scripts\win\start-follow-up-basket-review.cmd
```

Owner review nie wymaga `--apply` i nie powtarza testów technicznych. Skrypty nie wdrażają VPS, nie zmieniają Cloudflare, nie aktywują Task Scheduler i nie dodają tokenów do Established. Runbook: `docs/maturing_follow_up_basket.md`.

## Established universe owner workflow

Read-only commands:

```cmd
scripts\win\established-universe-list.cmd --json
scripts\win\established-universe-validate.cmd --json
scripts\win\established-universe-history.cmd --json
```

State-changing helpers print the plan and remain dry-run without `--apply`:

```cmd
scripts\win\established-universe-add.cmd --chain base --contract 0x1111111111111111111111111111111111111111 --display-name "Projekt"
scripts\win\established-universe-disable.cmd --chain base --contract 0x1111111111111111111111111111111111111111
scripts\win\established-universe-enable.cmd --chain base --contract 0x1111111111111111111111111111111111111111
scripts\win\established-universe-remove.cmd --chain base --contract 0x1111111111111111111111111111111111111111
```

Po review powtórz wybraną komendę z `--apply`. Pełny check offline: `scripts\win\check-established-universe.cmd`. Skrypty ustawiają `ALLOW_LIVE_PROVIDER_CALLS=0`, nie uruchamiają collectora, nie publikują snapshotu, nie zmieniają VPS, Cloudflare ani Task Scheduler. Runbook: `docs/established_universe_management.md`.

## VPS product runtime and automation guard

Canonical owner commands from the repository root:

```cmd
scripts\win\build-product-vps.cmd
scripts\win\check-product-vps-runtime.cmd
scripts\win\check-automation-single-flight.cmd
scripts\win\start-product-vps.cmd
scripts\win\check-central-scheduler.cmd
scripts\win\check-automation-status-api.cmd
scripts\win\preview-central-automation-task.cmd
```

`build-product-vps.cmd` synchronizes only the `tools/ui-mock` locked dependencies and builds the fixture-free `INTERNAL_BETA` surface. `start-product-vps.cmd` serves the UI and the existing `/api/*` contract from one Node process on `127.0.0.1:4180`; it does not start the collector, configure Cloudflare, or create a Scheduled Task. `check-product-vps-runtime.cmd` uses a dedicated random high port and always closes its server. `check-automation-single-flight.cmd` runs only offline lock/coordinator tests against isolated temporary files.

`check-central-scheduler.cmd` uses injected clocks/runners and includes cadence, decision, lock, coordinator and Task Scheduler source checks offline. `check-automation-status-api.cmd` starts the same-origin product runtime on a random local port, performs 100 read-only status requests, verifies unchanged state and zero runner/provider calls, then closes the process. `preview-central-automation-task.cmd` prints the fixed task plan without changing Windows.

Source schedule:

| Source | Cadence | SLA | Run mode |
| --- | --- | --- | --- |
| DexScreener | 15 min | 30 min | `scanner_and_context` |
| GoPlus | candidate-scoped | 30 min | `scanner_and_context` |
| Alternative.me | 6 h | 30 h | `context_only` or `scanner_and_context` |
| DefiLlama | 2 h | 6 h | `context_only` or `scanner_and_context` |
| Honeypot.is | manual only | n/a | never scheduled |

The planned task wakes every five minutes, while the source-aware decision layer performs at most one due run. User count and Refresh view never affect provider calls. One collector publishes one shared snapshot.

Dry-run is the default:

```cmd
scripts\win\register-central-automation-task.cmd
scripts\win\unregister-central-automation-task.cmd
```

Future explicit owner-only changes require `--apply`:

```cmd
scripts\win\register-central-automation-task.cmd --apply
scripts\win\unregister-central-automation-task.cmd --apply
```

Neither `--apply` command is part of automated validation. Full contract and runbook: `docs/vps_deployment_automation.md`. VPS deployment, Cloudflare changes, Task Scheduler activation, live provider calls, port `4173`, `PUBLIC_BETA`, and external tester access remain outside this sprint. Local checks do not require VPS access.

## Product Radar owner review

Kanoniczny launcher lokalnej oceny ownera:

```cmd
scripts\win\start-product-radar-review.cmd
```

Uruchamia Scanner API na `127.0.0.1:5177` i UI `INTERNAL_BETA` na `127.0.0.1:5173`, po uprzednim zwolnieniu wyłącznie tych portów. Dedykowany `start-product-radar-api.cmd` ustawia `CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA` i `SCANNER_API_PORT=5177` we własnym procesie przed startem serwera. Otwiera `#candidate-results`, nie uruchamia `DEVELOPMENT_DEMO`, nie używa fixture i nie modyfikuje VPS. Brak scanner output jest wykrywany i zgłaszany; aplikacja pokazuje wtedy fail-closed error state.

Rzeczywisty runtime smoke (start API, bounded wait do 20 sekund, health/readiness/scanner i cleanup portów):

```cmd
scripts\win\start-product-radar-review.cmd --check
```

Można go również wywołać bezpośrednio:

```cmd
scripts\win\check-product-radar-review.cmd
```

Zatrzymanie sesji: `scripts\win\kill-local-ports.cmd`. Flow i checklista akceptacji: `docs\product_radar_owner_review.md`. Następny etap po jawnym owner `ACCEPT`: **VPS Deployment & Automation**.

## 12R.4 Manual Collector and Offline Validation

12R.4 adds no scheduler or automatic launcher. Run the single controlled smoke manually from `tools\data-poc` only after offline tests pass:

```powershell
$env:CRYPTO_EDGE_DATA_ENV = "INTERNAL_BETA"
$env:CRYPTO_EDGE_RUNTIME_MODE = "INTERNAL_BETA"
$env:ALLOW_LIVE_PROVIDER_CALLS = "1"
npm run collect:internal-beta -- --seed-limit 10 --security-limit 3
npm run snapshot:validate:latest
```

The collector is bounded and never calls Honeypot.is. Do not repeat `check-live-sources-strict.cmd`; strict live checking belongs only to the single authorized smoke. Normal validation helpers remain offline by default.

No 12R.4 script changes VPS, installs a scheduler, performs retention cleanup, enables AI KINTEL or deploys publicly. Next: **12R.5 — Product Radar Redesign & Local Owner Review**.

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

Since 12R.3 this aggregate is offline by default. `check-data-poc.cmd` runs fixture generation, tests and typechecks but skips every live provider call unless an operator separately sets `CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=1`. Do not set that opt-in during 12R.3 validation.

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

The local RC path is offline by default. Historical degraded handling for an explicitly authorized live-source run remains in the adapter POC, but `check-local-rc.cmd` does not invoke it during 12R.3.

It does not check `git status --porcelain`, because development branches are expected to have changes before commit. Before marking a release candidate, confirm a clean working tree separately with `git status`.

Policy denial, unauthorized source activation, forbidden provider calls, UI tests, typecheck, build, application errors, and other local checks still hard-fail.

## Strict Live Source Check

```cmd
scripts\win\check-live-sources-strict.cmd
```

This runs the approved live source context with `CRYPTO_EDGE_DATA_ENV=PUBLIC_BETA` and `STRICT_LIVE_SOURCES=1`. Use it when live source availability itself must hard-fail the run, including transient `fetch failed` responses from allowed external APIs.

This command performs real provider calls and is explicitly outside the 12R.3 offline validation path.

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

The helper explicitly sets `CRYPTO_EDGE_RUNTIME_MODE=DEVELOPMENT_DEMO` in both processes. Localhost itself never selects demo mode.

Record real click-through results in `docs\local_mvp_rc_manual_preview_notes.md`. Do not mark any area as `PASS` unless the preview was actually opened and clicked through.

## 12B.1 Control Center owner review

The canonical Control Center is part of the fail-closed `INTERNAL_BETA` Product Radar. Start the current local Product Radar and open the Control Center directly with one command:

```cmd
scripts\win\start-product-radar-review.cmd --control-center
```

This starts only the existing local read-only product/API view. It does not start the collector, enable automation, activate Windows Task Scheduler, call providers, deploy to VPS, or change Cloudflare. The screen must keep overall trusted tester readiness at `NOT_READY` until the external preview gates are completed.

Run its dedicated offline contract check with:

```cmd
scripts\win\check-control-center.cmd
```

The check covers the canonical four-status resolver, EN/PL semantic parity, the read-only aggregate endpoint, 100 concurrent reads with no state changes and zero provider calls, absence of Control Center mutation routes, and absence of mutating UI actions. See `docs\control_center_shell.md` for the complete contract.

## 12B.4 Owner No-CMD refresh review

Open the existing Control Center with the owner operations panel in canonical `REVIEW_SAFE` mode:

```cmd
scripts\win\start-product-radar-review.cmd --control-center --owner-operations-review
```

This mode shows status and allows only the read-only preflight. The real one-time refresh is disabled, the browser does not contact providers, and the launcher does not change automation state or snapshots. The session secret is generated inside the local API process and is never printed or passed on the command line. There is intentionally no `ENABLED` launcher in this stage.

Run the dedicated offline check with:

```cmd
scripts\win\check-owner-no-cmd-refresh.cmd
```

The check covers default/tester invisibility, `REVIEW_SAFE`, canonical cadence reuse, zero-write/zero-provider preflight, strict POST gates, occupied lock behavior, last-known-good preservation and 100 concurrent attempts with at most one accepted injected run. It does not run the real collector or make live provider calls. VPS, Cloudflare, Task Scheduler, `PUBLIC_BETA`, external tester access and overall `NOT_READY` remain unchanged. See `docs\owner_no_cmd_refresh.md`.

## Local production preview

```cmd
scripts\win\build-ui-preview.cmd
scripts\win\serve-ui-preview.cmd trusted-preview
scripts\win\serve-ui-preview.cmd feedback-notes
scripts\win\serve-ui-preview.cmd webinar-teaser
scripts\win\serve-ui-preview.cmd control-center
```

`build-ui-preview.cmd` runs the explicit `DEVELOPMENT_DEMO` build from `tools/ui-mock`. `serve-ui-preview.cmd` serves the built `dist` directory on `127.0.0.1:4173` and prints the direct hash URL. The fail-closed product build is `pnpm run build:internal-beta` and is not used by the demo preview launchers.

## Trusted preview session starters

```cmd
scripts\win\start-trusted-preview-session.cmd
scripts\win\start-feedback-notes-session.cmd
```

These starter scripts run `scripts\win\check-preview-launchers.cmd` first and stop if the check fails. When the check passes, they print the target URL and start the existing production-like preview through `scripts\win\serve-ui-preview.cmd`.

- `scripts\win\start-trusted-preview-session.cmd` prints `http://127.0.0.1:4173/#trusted-preview`
- `scripts\win\start-feedback-notes-session.cmd` prints `http://127.0.0.1:4173/#feedback-notes`

## Preview launch shortcuts

```cmd
scripts\win\dev-trusted-preview.cmd
scripts\win\dev-feedback-notes.cmd
scripts\win\dev-webinar-teaser.cmd
scripts\win\dev-control-center.cmd
scripts\win\preview-trusted-preview.cmd
scripts\win\preview-feedback-notes.cmd
scripts\win\preview-webinar-teaser.cmd
scripts\win\preview-control-center.cmd
```

## Preview launcher smoke check

```cmd
scripts\win\check-preview-launchers.cmd
```

This verifies that the development preview launcher scripts exist, confirms `tools\ui-mock\package.json`, runs the explicit `DEVELOPMENT_DEMO` build, checks `tools\ui-mock\dist\index.html`, and prints the expected deep-link preview URLs. It is not the `INTERNAL_BETA` product build.

It does not start `vite preview`, run network checks, call providers, require review storage, require a backend, or use AI KINTEL.

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

## Read-Only Reports Library

```cmd
scripts\win\check-reports-library.cmd
scripts\win\start-product-radar-review.cmd --reports
```

`check-reports-library.cmd` runs the offline Reports Library index, API, filesystem-security, UI escaping and 100-concurrent-read tests against injected temporary directories. It performs no live provider calls and does not touch the normal reports directory.

`start-product-radar-review.cmd --reports` starts the ordinary fixture-free `INTERNAL_BETA` Product Radar and opens `#reports`. It does not run `generate-analyst-report.cmd`, does not create a sample report, does not call providers and does not mutate review, automation, Established Universe or snapshots. If no real report exists, the owner reviews the valid empty state.

The canonical root remains `tools\ui-mock\.local\reports`, JSON `report_version = 1` is the UI data source, and Markdown remains an unparsed companion export. Full contract: `docs\read_only_reports_library.md`.

## Free Local Preview Ports

```cmd
scripts\win\kill-local-ports.cmd
```

This finds listeners on ports `5173` and `5177` and stops them.

## UI Mock Check Note

`check-ui-mock.cmd` uses direct binaries from `tools\ui-mock\node_modules\.bin` instead of `pnpm` because Windows can hit a known `node_modules` / `pnpm` `EPERM` issue in this repo.

## Persistent Feedback Loop

Offline validation uses temporary feedback storage and disables provider calls, collector and automation:

```cmd
scripts\win\check-persistent-feedback-loop.cmd
```

Owner review builds and opens the same-origin `INTERNAL_BETA + REVIEW_SAFE` product at `#feedback`. It uses only `tools\ui-mock\.local\feedback-loop-review.sqlite`, never the future canonical VPS store or manual Review Storage:

```cmd
scripts\win\start-feedback-loop-review.cmd
```

After closing that runtime, one idempotent cleanup command removes only the isolated review database and its SQLite companions:

```cmd
scripts\win\clear-feedback-loop-review.cmd
```

These scripts do not deploy to VPS, change Cloudflare or Task Scheduler, call providers, start the collector, mutate snapshots, Follow-up, Established Universe, automation state or analyst reviews. The technical and product contract is in `docs/persistent_feedback_loop.md`.
