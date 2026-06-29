# Pre-Holiday Freeze Checklist

## DONE

- 8E Review Storage Mode DX / Smoke Scripts
- 9A Local End-to-End Workflow Smoke
- 9B Analyst Report / Review Export
- 9C Local MVP Runbook + Freeze Checklist
- 10A Product Workflow Polish
- 10B.1 UX2 Information Architecture + Layout Skeleton
- 10B.2 UX2 Scanner / Candidate Detail Redesign
- 10B.3 UX2 Review Queue + Report Workspace Redesign
- 10B.4 UX2 Visual QA / Polish
- 10C Local MVP Release Candidate Stabilization v1
- 10D Local MVP RC Manual Preview Notes / Known Issues v1

## Freeze Scope

- Storage and DX workflow are closed for the local MVP checkpoint.
- Local API endpoint paths are closed.
- Source registry and compliance rules are closed.
- Local review workflow is closed for the current MVP scope.
- Analyst report export works locally.
- The UI now shows the local workflow guide and clearer scanner/context/review/report/health status copy.
- UX2 has completed the local MVP UI pass through 10B.1 information architecture shell, 10B.2 Scanner Radar / Candidate Detail redesign, 10B.3 Review Queue + Report Workspace redesign, and 10B.4 Visual QA / Polish.
- 10C stabilizes the local release-candidate checkpoint without adding new product features.
- 10D documents the manual preview path, accepted limitations, known issues, and resume rules without adding new product features.
- 10B.1 through 10B.4 do not change endpoints, scoring, `final_label`, `WATCHLIST` meaning, review/import/export/reset/diagnostics/report logic, source rules, npm dependencies, auth, or production backend scope.
- The Visual QA checklist is `docs/ux2_visual_qa_checklist.md`.
- The release candidate document is `docs/local_mvp_release_candidate.md`.
- Manual preview notes are `docs/local_mvp_rc_manual_preview_notes.md`.
- Known issues and accepted limitations are `docs/local_mvp_known_issues.md`.
- RC-ready local MVP does not mean production-ready or final product-ready.

## Allowed During Holiday

- Small bugfixes.
- Documentation updates.
- Running existing checks.
- Merge only after green:

```cmd
scripts\win\check-local-rc.cmd
scripts\win\check-local-mvp.cmd
```

`check-local-rc.cmd` does not check git cleanliness. Confirm `git status` is clean separately before declaring RC.

After 10D, prefer freeze/light mode unless a real blocker appears.

## Avoid During Holiday

- Larger frontend visual redesign beyond the 10B.4 local MVP polish scope.
- New UX2 feature scope before 10C stabilization.
- New data sources.
- Production backend work.
- Auth.
- Storage migrations.
- Scanner scoring changes.
- `final_label` changes.
- `WATCHLIST` meaning changes.

## Post-Holiday Next Stages

- Future production decisions: hosting, auth, production backend, data/paid integrations, deployment, and monitoring.

## Safe Local MVP State

A safe local MVP state means:

- `scripts\win\check-local-mvp.cmd` passes.
- `scripts\win\check-local-rc.cmd` passes.
- `scripts\win\post-merge-check.cmd` passes after merge.
- Working tree is clean.
- Analyst report generates locally.
- Local workflow smoke passes on real-output or fixture fallback.
- The 10B.1 Overview keeps Market Context, Local MVP workflow status, stat cards, analyst report command, and local MVP health command visibly separate from Scanner Radar and Review Queue.
- The 10B.2 Scanner Radar / Candidate Detail redesign keeps scanner labels, local review, security/manual verification, context, and reasoning checklist visibly separate without changing scanner or review logic.
- The 10B.3 Review Queue + Report Workspace redesign keeps local review status, stored reviews, scanner WATCHLIST candidates, backup/import/export, diagnostics/reset, and CMD report generation visibly separate without changing review/report logic.
- The 10B.4 Visual QA / Polish pass keeps command/path wrapping, selected candidate state, section spacing, report command blocks, storage diagnostics, reset panel, compliance copy, and responsive layout visually checked without changing product logic.
- The 10D manual preview notes keep real click-through status separate from automated RC readiness and do not allow `PASS` unless preview was actually run.

## Freeze Notes

- Do not add new endpoints.
- Do not change UI workflow.
- Do not add npm dependencies.
- Do not add auth.
- Do not add a production backend.
- Do not add new sources.
- Do not use review status as investment advice.
- This is not a buy/sell signal.
