# Local MVP RC Manual Preview Notes

## Status

- Local MVP RC Manual Preview Notes v1.
- After 10C, the local MVP is RC-ready after automated checks pass.
- This document is for manual click-through and preview notes after the automated RC checks.
- 10D is documentation/QA only. It adds no product features, endpoints, UI changes, source changes, scoring changes, label changes, or report logic changes.

## Environment

- Planning date: 2026-06-29.
- Manual preview date: NOT RUN - fill this only after a real local preview is opened and clicked through.
- Branch: `codex/local-mvp-rc-manual-preview-notes`.
- Base main HEAD: `6e446d7339368b81bf3fa7d19de46c3d58f2ec1b`.
- UI: `http://127.0.0.1:5173/`.
- API: `http://127.0.0.1:5177/`.
- RC check command: `scripts\win\check-local-rc.cmd`.

## Commands

```cmd
scripts\win\check-local-rc.cmd
scripts\win\check-local-mvp.cmd
scripts\win\generate-live-context.cmd
scripts\win\dev-ui.cmd
```

## Manual Click-through Checklist

- Overview.
- Scanner Radar.
- Candidate Detail.
- Review Queue.
- Analyst Report Workspace.
- Research Review.
- Risk Alerts.
- Methodology.

## What To Check

- No horizontal overflow.
- No overlapping text.
- Commands wrap correctly.
- Source status is visible.
- Selected candidate state is visible.
- Review status does not look like a recommendation.
- Analyst report remains CMD-only.
- Compliance copy is visible but not dominant.

## Result Table

| Area | Status | Notes | Follow-up owner |
|---|---|---|---|
| Overview | NOT RUN | Requires real local preview click-through. | Manual reviewer |
| Scanner Radar | NOT RUN | Requires real local preview click-through. | Manual reviewer |
| Candidate Detail | NOT RUN | Requires real local preview click-through. | Manual reviewer |
| Review Queue | NOT RUN | Requires real local preview click-through. | Manual reviewer |
| Analyst Report Workspace | NOT RUN | Requires real local preview click-through. | Manual reviewer |
| Research Review | NOT RUN | Requires real local preview click-through. | Manual reviewer |
| Risk Alerts | NOT RUN | Requires real local preview click-through. | Manual reviewer |
| Methodology | NOT RUN | Requires real local preview click-through. | Manual reviewer |

Allowed statuses:

- `PASS`: real preview was opened, clicked through, and no blocker was found.
- `WATCH`: usable, but note a limitation or follow-up.
- `BLOCKED`: cannot treat the local RC as ready until resolved.
- `NOT RUN`: preview was not actually opened and clicked through.

## Important Rule

Do not enter `PASS` unless the preview was actually opened and clicked through.

If Codex or another reviewer cannot actually run and inspect the local UI preview, leave the status as `NOT RUN` and state that preview requires manual user review. For this 10D documentation pass, no real UI preview was opened or clicked through, so every result row remains `NOT RUN`.

## Resume Rules

- Start from `scripts\win\check-local-rc.cmd`.
- If automated checks pass, run `scripts\win\generate-live-context.cmd` and `scripts\win\dev-ui.cmd`.
- Open `http://127.0.0.1:5173/` and click through every area in the checklist.
- Record only observed results in the table above.
- If a blocker is found, also update `docs/local_mvp_known_issues.md`.
- After 10D, prefer freeze/light mode unless a real blocker appears.
