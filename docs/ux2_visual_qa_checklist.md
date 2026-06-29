# UX2 Visual QA Checklist

## Status

- 10B.1 done: UX2 Information Architecture + Layout Skeleton.
- 10B.2 done: Scanner / Candidate Detail Redesign.
- 10B.3 done: Review Queue + Report Workspace.
- 10B.4 done: visual QA / polish for layout, readability, wrapping, contrast, and responsive fallback.
- UX2 local MVP UI pass is complete.
- 10C Local MVP Release Candidate Stabilization keeps the UI flow stable and adds RC documentation/DX only.

Release candidate notes:

- `docs/local_mvp_release_candidate.md`

## Local Check

```cmd
scripts\win\check-local-rc.cmd
scripts\win\check-local-mvp.cmd
```

`check-local-rc.cmd` verifies required RC documents and scripts, then runs `check-local-mvp.cmd`. Confirm clean `git status` separately before declaring RC.

## Manual Preview

```cmd
scripts\win\generate-live-context.cmd
scripts\win\dev-ui.cmd
```

## Click Through

- Overview.
- Scanner Radar.
- Review Queue.
- Research Review.
- Risk Alerts.
- Methodology.

## Visual Checks

- No overlapping text.
- Command and path wrapping stays inside panels.
- Selected candidate state is clear.
- Review Queue sections are visually separated.
- Analyst Report Workspace command block stays contained.
- Storage diagnostics are readable.
- Reset panel is readable and scoped to local review state.
- Responsive layout stacks cleanly.
- Compliance copy is visible without dominating the UI.

## Do Not Change In Visual Polish

- New endpoints.
- New sources.
- Scoring.
- `final_label`.
- `WATCHLIST` meaning.
- Report generation from UI.
- Auth or production backend.
- Hosting, paid data integrations, deployment, or monitoring decisions.
