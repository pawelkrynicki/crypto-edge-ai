# Windows Helper Scripts

These scripts are developer tooling for Windows CMD. Run them from the repo root or any other current directory; each script resolves the repo root from its own location.

## After Every Merge

```cmd
scripts\win\post-merge-check.cmd
```

This syncs `main`, checks that the working tree is clean, runs the data POC checks, and runs the UI mock checks.

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

## Free Local Preview Ports

```cmd
scripts\win\kill-local-ports.cmd
```

This finds listeners on ports `5173` and `5177` and stops them.

## UI Mock Check Note

`check-ui-mock.cmd` uses direct binaries from `tools\ui-mock\node_modules\.bin` instead of `pnpm` because Windows can hit a known `node_modules` / `pnpm` `EPERM` issue in this repo.
