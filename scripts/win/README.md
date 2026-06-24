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

## Free Local Preview Ports

```cmd
scripts\win\kill-local-ports.cmd
```

This finds listeners on ports `5173` and `5177` and stops them.

## UI Mock Check Note

`check-ui-mock.cmd` uses direct binaries from `tools\ui-mock\node_modules\.bin` instead of `pnpm` because Windows can hit a known `node_modules` / `pnpm` `EPERM` issue in this repo.
