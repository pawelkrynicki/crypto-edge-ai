# Standalone Product Gap Audit

## Status

- Stage 12A.
- Documentation-only product gap audit.
- This document does not implement UI, deployment, backend, frontend, source calls, scoring changes, or AI KINTEL integration.
- AI KINTEL remains the future final integration direction, but it is not the next implementation step.

## Current Baseline

- Local MVP is release-candidate-ready from a technical local workflow perspective.
- UX2 product-grade local UI pass is complete.
- Review storage exists with file-backed JSON as default and optional SQLite.
- Analyst report Markdown and JSON export exists.
- SQLite and file storage paths exist for local review storage.
- Source status, source compliance, approved context, fixture fallback, and freshness concepts exist in the local workflow.
- AI KINTEL planning stages 11A-11G are complete as a compatibility and planning package, but are deferred for later integration.

## Repository Review Notes

The 12A review used the current repository state, including roadmap, local MVP RC notes, runbook/freeze notes, compliance policy, UI mock README, data POC package scripts, UI package scripts, and Windows helper scripts.

Some requested review paths were not present under the exact names listed in the 12A brief:

- `docs/local_mvp_user_manual.md`
- `docs/local_mvp_freeze_checklist.md`
- `docs/local_mvp_manual_preview_notes.md`
- `docs/analyst_report_workflow.md`
- `docs/review_session_workflow.md`
- `docs/source_compliance_policy.md`
- `docs/free_source_integration_plan.md`

Closest existing equivalents reviewed:

- `docs/local_mvp_runbook.md`
- `docs/pre_holiday_freeze_checklist.md`
- `docs/local_mvp_rc_manual_preview_notes.md`
- `docs/local_mvp_known_issues.md`
- `docs/compliance/data_source_policy.md`
- `docs/camp_beta_real_data_plan.md`
- `tools/ui-mock/README.md`
- `scripts/win/README.md`

## Definition: Uzytkowo Funkcjonalne Standalone

Crypto Edge AI is "uzytkowo funkcjonalne standalone" when a trusted external tester can use the product preview without developer mediation.

Required user-facing properties:

- The user can launch or open the product without Codex, GitHub, CMD, or repository access.
- The dashboard is understandable within a few minutes.
- Data freshness is visible.
- Source status is visible.
- Candidates/projects are visible.
- Project detail is useful for research review.
- Review state is usable and clearly separate from scanner output.
- Reports or report previews are accessible.
- Feedback path is available.
- There is no confusion between scanner `WATCHLIST` and an action instruction.
- Research-only copy is clear.
- Private access is safe for a trusted tester and not public/open.

## Gap Matrix

| Area | Current state | Gap | Severity | Needed before trusted tester? | Suggested stage | Notes |
|---|---|---|---|---|---|---|
| Launch / no-CMD usage | Local launch exists through `scripts/win/dev-ui.cmd` and `scripts/win/dev-ui-sqlite.cmd`. | Tester still needs a developer-style command or someone to start local services. | P0 | Yes | 12B | Replace or hide CMD workflow behind a control center or private URL. |
| Control center | Overview and workflow panels exist in `tools/ui-mock`. | No standalone operator surface for refresh, health, report, and preview status. | P0 | Yes | 12B | Should make local operations visible without command copying. |
| Data refresh | Approved source generation and scanner/data checks exist through scripts. | Refresh is not a tester-facing action and freshness is not enough as a preview-level status model. | P0 | Yes | 12B | Must show last refresh, source mode, stale state, and fallback state. |
| Source health | Local source diagnostics exist for scanner/context/review storage. | Source health is scattered across developer diagnostics and UI status copy. | P0 | Yes | 12B | Needs a concise dashboard-level source health panel. |
| Review workflow | Local review status, notes, queue, diagnostics, reset, export/import exist. | Review purpose needs to be obvious to a non-developer tester and not confused with scanner output. | P0 | Yes | 12C | Keep review state visibly separate from scanner labels. |
| Report library | Analyst report generator writes local Markdown and JSON. | No user-facing report library or easy report history view. | P1 | Helpful | 12D | Preview can start with one accessible report preview; richer library can follow. |
| Report generation UX | Report generation exists through `scripts/win/generate-analyst-report.cmd`. | Report creation is still CMD-based. | P0 | Yes | 12C/12D | Tester needs an in-preview report preview or a simple report action. |
| Trusted tester access | Local preview exists on `127.0.0.1`. | No private remote access path for Pawel Gradziuk. | P0 | Yes | 12C/12E | Needs a controlled private preview path. |
| Feedback collection | No dedicated feedback mechanism in current local MVP. | Tester feedback would be external and unstructured. | P0 | Yes | 12D | Add a simple feedback form/path or structured feedback packet. |
| Private preview hosting | Not implemented. | No recommended preview environment or turn-off procedure. | P0 | Yes | 12E | Lightweight gated preview is the preferred path. |
| Basic access gate | Not implemented for external preview. | Public URL would be unsafe; local-only is not enough for external click-through. | P0 | Yes | 12E | Use a simple private access gate; avoid public open URL. |
| Data freshness/stale states | Source status and fallback metadata exist in local API/UI. | Need stronger stale/partial/error communication at product level. | P0 | Yes | 12B/12C | Make `real-output`, `fixture-fallback`, and stale data obvious. |
| Empty/partial/error states | Some local fallback behavior exists. | Need trusted-tester-friendly empty, partial, and error states. | P1 | Helpful | 12C | Avoid requiring explanation when a source is missing. |
| Compliance copy | Research-only and `WATCHLIST` semantics are already documented and visible. | Copy must remain clear but not overwhelming in preview. | P0 | Yes | 12C | Keep scanner label, local review, and report language neutral. |
| User onboarding/instructions | Runbook and README exist for developers. | No short tester onboarding path. | P1 | Helpful | 12C | A 2-3 minute orientation should be enough. |
| Manual QA | RC automated checks and manual preview checklist exist. | Manual click-through status remains `NOT RUN`; no external tester script exists. | P0 | Yes | 12C/12F | Use the trusted tester script before owner decision. |
| AI KINTEL deferral | 11A-11G planning exists. | Docs still describe AI KINTEL as the next implementation direction in places. | P0 | Yes | 12A | 12A corrects the strategy: AI KINTEL integration later. |

## P0 Before Trusted Tester

- One simple launch path or private URL.
- No CMD requirement for the tester.
- Clear dashboard.
- Basic project/candidate list and detail.
- Visible data freshness and source status.
- Review and `WATCHLIST` semantics visible and separate.
- Report or report preview accessible.
- Feedback mechanism.
- Access is not public/open.
- No secrets in the client or repository.
- No provider calls from browser.
- No paid source activation.

## P1 Nice-to-Have

- Richer report library.
- Better visual polish after the control center path is clear.
- Onboarding screen or short tester intro.
- Export/download history.
- Tester session checklist inside the preview packet.
- Source health detail beyond the simple dashboard status.

## P2 / Post-Preview

- AI KINTEL port.
- Paid sources.
- Advanced analytics.
- AI narrative.
- Full auth/subscription.

## Key Conclusion

The local MVP is a solid technical baseline, but it is not yet a standalone trusted tester preview. The biggest product gap is not scanner logic or data modeling; it is removing developer workflow from the tester path and making status, freshness, review semantics, reports, and feedback self-explanatory behind private access.
