# Pre-Holiday Freeze Checklist

## DONE

- 8E Review Storage Mode DX / Smoke Scripts
- 9A Local End-to-End Workflow Smoke
- 9B Analyst Report / Review Export
- 9C Local MVP Runbook + Freeze Checklist

## Freeze Scope

- Storage and DX workflow are closed for the local MVP checkpoint.
- Local API endpoint paths are closed.
- Source registry and compliance rules are closed.
- Local review workflow is closed for the current MVP scope.
- Analyst report export works locally.
- UX2 Product-grade Interface Redesign remains a future required stage.

## Allowed During Holiday

- Small bugfixes.
- Documentation updates.
- Running existing checks.
- Merge only after green:

```cmd
scripts\win\check-local-mvp.cmd
```

## Avoid During Holiday

- UX2.
- Larger frontend redesign.
- New data sources.
- Production backend work.
- Auth.
- Storage migrations.
- Scanner scoring changes.
- `final_label` changes.
- `WATCHLIST` meaning changes.

## Post-Holiday Next Stages

- 10A - Product Workflow Polish
- 10B - UX2 Product-grade Interface Redesign
- 10C - Local MVP Release Candidate Stabilization

## Safe Local MVP State

A safe local MVP state means:

- `scripts\win\check-local-mvp.cmd` passes.
- `scripts\win\post-merge-check.cmd` passes after merge.
- Working tree is clean.
- Analyst report generates locally.
- Local workflow smoke passes on real-output or fixture fallback.

## Freeze Notes

- Do not add new endpoints.
- Do not change UI workflow.
- Do not add npm dependencies.
- Do not add auth.
- Do not add a production backend.
- Do not add new sources.
- Do not use review status as investment advice.
- This is not a buy/sell signal.
