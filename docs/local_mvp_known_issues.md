# Local MVP Known Issues

## Status

Known Issues / Accepted Limitations for Local MVP RC.

## No Known RC Blockers

No known RC blockers after automated checks.

This statement depends on the automated validation stack remaining green. If any required RC check fails later, replace this section with the failing check and the observed blocker.

## Accepted Local Limitations

- Local-only.
- No auth/users.
- No production hosting.
- No production backend.
- No production database.
- No production cron.
- No paid integrations.
- Limited source coverage.
- Report generated from CMD.
- No report generation from UI.
- Review status is not a recommendation.
- `WATCHLIST` means further manual review only.
- Missing security/context data means manual verification is required.

## Operational Notes

If the `gh` token expires, refresh auth with:

```cmd
gh auth logout -h github.com -u pawelkrynicki
gh auth login -h github.com --git-protocol https --web
```

Windows may ask for network permission during existing local/API checks.

If Windows or `pnpm` hits an `EPERM` issue, use the existing helpers under:

```cmd
scripts\win\*.cmd
```

SQLite is optional. File-backed JSON remains the default local review storage provider.

`.local` files are local-only and ignored by git.

## Future Production Decisions

- Hosting.
- Auth/users.
- Production backend.
- Production storage/database.
- Monitoring/logging.
- Paid data integrations.
- Release/deployment process.
- Production security review.

## Blocker Definition

Treat any of these as an RC blocker:

- `scripts\win\check-local-rc.cmd` fails.
- `scripts\win\check-local-mvp.cmd` fails.
- Report smoke fails.
- Scanner/context latest cannot load through the approved local flow.
- Review storage fails with the file-backed JSON default.
- UI build fails.
- Compliance copy is missing from main areas.

## Deferred By Design

These are not RC blockers for the local MVP because they belong to future production stages:

- Production hosting.
- Auth/users.
- Production backend.
- Production database.
- Production cron.
- Paid data integrations.
- New data sources.
- Report generation from UI.
