# Pre-Holiday Freeze Checklist

## DONE

- 8E Review Storage Mode DX / Smoke Scripts
- 9A Local End-to-End Workflow Smoke
- 9B Analyst Report / Review Export
- 9C Local MVP Runbook + Freeze Checklist
- 10A Product Workflow Polish
- 10B.1 UX2 Information Architecture + Layout Skeleton
- 10B.2 UX2 Scanner / Candidate Detail Redesign

## Freeze Scope

- Storage and DX workflow are closed for the local MVP checkpoint.
- Local API endpoint paths are closed.
- Source registry and compliance rules are closed.
- Local review workflow is closed for the current MVP scope.
- Analyst report export works locally.
- The UI now shows the local workflow guide and clearer scanner/context/review/report/health status copy.
- UX2 has started with the 10B.1 information architecture shell and continued with 10B.2 Scanner Radar / Candidate Detail redesign. Full UX2 visual/product redesign remains in progress.
- 10B.1 and 10B.2 do not change endpoints, scoring, `final_label`, `WATCHLIST` meaning, review/report logic, source rules, npm dependencies, auth, or production backend scope.

## Allowed During Holiday

- Small bugfixes.
- Documentation updates.
- Running existing checks.
- Merge only after green:

```cmd
scripts\win\check-local-mvp.cmd
```

## Avoid During Holiday

- Completing full UX2 in one pass.
- Larger frontend visual redesign beyond the 10B.2 Scanner / Candidate Detail scope.
- New data sources.
- Production backend work.
- Auth.
- Storage migrations.
- Scanner scoring changes.
- `final_label` changes.
- `WATCHLIST` meaning changes.

## Post-Holiday Next Stages

- 10B.3 - Review Queue + Report Workspace
- 10B.4 - Visual QA / Polish
- 10C - Local MVP Release Candidate Stabilization

## Safe Local MVP State

A safe local MVP state means:

- `scripts\win\check-local-mvp.cmd` passes.
- `scripts\win\post-merge-check.cmd` passes after merge.
- Working tree is clean.
- Analyst report generates locally.
- Local workflow smoke passes on real-output or fixture fallback.
- The 10B.1 Overview keeps Market Context, Local MVP workflow status, stat cards, analyst report command, and local MVP health command visibly separate from Scanner Radar and Review Queue.
- The 10B.2 Scanner Radar / Candidate Detail redesign keeps scanner labels, local review, security/manual verification, context, and reasoning checklist visibly separate without changing scanner or review logic.

## Freeze Notes

- Do not add new endpoints.
- Do not change UI workflow.
- Do not add npm dependencies.
- Do not add auth.
- Do not add a production backend.
- Do not add new sources.
- Do not use review status as investment advice.
- This is not a buy/sell signal.
