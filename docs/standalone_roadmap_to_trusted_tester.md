# Standalone Roadmap To Trusted Tester

## Status

- Stage 12C.1.
- Roadmap after strategic correction.
- AI KINTEL is moved to the final integration stage after standalone preview feedback.

## Timing Context

- 2026-07-02 is the planning date.
- Vacation: 2026-07-04 to 2026-07-25.
- Before vacation, do not start large implementation.
- Use 2026-07-01 to 2026-07-03 for 12A and possibly narrow 12B planning only.
- Main execution should happen after vacation.

## Proposed Timeline

| Stage | Dates | Focus |
|---|---|---|
| 12A | Before vacation | Standalone Product Gap Audit + Trusted Tester Path. |
| 12B.2 | Before vacation | Webinar Teaser Screenshot Mode. |
| 12B.3 | Before vacation | Webinar Screenshot Capture Kit. |
| 12C.1 | Before vacation | Trusted Tester Preview Shell. |
| 12B | 2026-07-26 to 2026-08-02 | Standalone Control Center / No-CMD Workflow. |
| 12C | 2026-08-03 to 2026-08-09 | Trusted Tester Preview Mode. |
| 12D | 2026-08-10 to 2026-08-16 | Reports Library + Feedback Loop. |
| 12E | 2026-08-17 to 2026-08-23 | Lightweight Private Preview Deployment. |
| 12F | 2026-08-24 to 2026-08-31 | Pawel Gradziuk Test Session / Feedback Fixes. |
| 13A | After standalone preview feedback | AI KINTEL Owner Review Packet. |
| 13B+ | Later | AI KINTEL integration. |

## 12A - Standalone Product Gap Audit + Trusted Tester Path

Goal:

- Clarify what is missing before Crypto Edge AI can be shown as a standalone trusted tester preview.

Deliverables:

- `docs/standalone_product_gap_audit.md`
- `docs/trusted_tester_preview_path.md`
- `docs/standalone_product_definition_of_done.md`
- `docs/standalone_roadmap_to_trusted_tester.md`
- Minimal cross-links from current planning docs.

Not in scope:

- UI implementation.
- Deployment.
- Runtime code.
- AI KINTEL implementation.
- Source activation.

Acceptance criteria:

- Gaps, P0s, preview path, definition of done, and 12B-12F roadmap are documented.
- AI KINTEL deferral is clear.
- Local MVP RC remains unchanged.

## 12B - Standalone Control Center / No-CMD Workflow

Goal:

- Move normal local preview operations out of tester-visible CMD workflow.

Deliverables:

- Control center concept for launch/status/refresh/report readiness.
- No-CMD operator path for the preview owner.
- Clear status model for local API, scanner latest, context latest, review storage, and reports.

Not in scope:

- Public deployment.
- AI KINTEL port.
- Paid sources.
- Scoring changes.

Acceptance criteria:

- Owner can prepare or verify preview state without explaining scripts to the tester.
- Tester path does not require CMD.
- Status/freshness is visible and understandable.

### 12B.1 - Standalone Control Center Shell

Goal:

- Add a safe UI shell/status hub that starts hiding developer workflow details behind product-readable status.

Deliverables:

- `Control Center` tab in the existing standalone UI mock.
- Trusted tester P0 readiness checklist with conservative `Ready`, `Partial`, `Not ready`, and `Manual check required` states.
- Data/source freshness, review/report, safety/compliance, and next-build-step sections.
- Explicit note that `Research-only` and `WATCHLIST means manual review only`.

Not in scope:

- Refresh actions.
- Command execution from the UI.
- Deployment.
- Access gate.
- Feedback capture.
- AI KINTEL implementation.
- Provider calls, source adapters, source activation, or paid sources.

Acceptance criteria:

- Control Center makes preview readiness understandable without requiring a tester to inspect CMD, GitHub, Codex, or the repo.
- Trusted tester preview remains `Not ready` because access, feedback, and deployment are not complete.
- AI KINTEL remains a later integration stage, not the next implementation target.
- Scanner scoring, `final_label`, review semantics, and `WATCHLIST` meaning remain unchanged.

### 12B.2 - Webinar Teaser Screenshot Mode

Goal:

- Add a demo-safe `Webinar Teaser` tab for controlled screenshots before the 2026-07-13 webinar.

Deliverables:

- `Webinar Teaser` tab in the existing standalone UI mock.
- 4-6 screenshot-ready sections: Radar Overview, Project Research Snapshot, Source Confidence Layer, Research Report Preview, Review Flow, and Product Teaser / Closing Screen.
- Controlled demo data and neutral copy that shows the research-radar concept without exposing full methodology, weights, thresholds, full source/vendor lists, or internal roadmap.
- Screenshot guide in `docs/webinar_teaser_screenshot_plan.md`.

Not in scope:

- Trusted tester preview replacement.
- Production readiness.
- Backend, deployment, access gate, source activation, provider calls, OpenAI calls, secrets, dependencies, scoring changes, `final_label` changes, or `WATCHLIST` meaning changes.
- AI KINTEL implementation.

Acceptance criteria:

- The tab is useful for webinar screenshots and stays demo-safe.
- The webinar screen avoids AI KINTEL, Pawel Gradziuk, P0/P1/P2, not-ready wording, GitHub/Codex/CMD, technical roadmap details, full source/vendor names, and trading action language.
- AI KINTEL remains a later integration stage.

### 12B.3 - Webinar Screenshot Capture Kit

Goal:

- Add a lightweight capture kit to help the owner prepare 4-6 safe screenshots from the `Webinar Teaser` tab before the 2026-07-13 webinar.

Deliverables:

- `Screenshot Capture Kit` section inside the existing `Webinar Teaser` tab.
- Recommended screenshot list, viewport guidance, and safe capture copy.
- `data-shot` identifiers for the six webinar sections.
- Expanded screenshot guide in `docs/webinar_teaser_screenshot_plan.md`.

Not in scope:

- New product functionality.
- Trusted tester preview replacement.
- Local MVP RC behavior changes.
- Source checks, fetch logic, source policy, source adapters, source activation, provider calls, OpenAI calls, backend, deployment, secrets, dependencies, scoring changes, `final_label` changes, review semantics changes, or `WATCHLIST` meaning changes.
- AI KINTEL implementation.

Acceptance criteria:

- The owner can quickly identify and capture the webinar-safe sections.
- The webinar UI remains demo-safe and avoids AI KINTEL, Pawel Gradziuk, P0/P1/P2, not-ready wording, GitHub/Codex/CMD, branch/commit/script wording, technical roadmap details, full methodology, full source/vendor names, and trading action language.
- Local MVP RC and source validation remain unchanged.

## 12C - Trusted Tester Preview Mode

Goal:

- Shape the existing local MVP into a focused preview mode for an external trusted tester.

Deliverables:

- Short tester-oriented intro path.
- Clear dashboard state.
- Candidate/project detail path.
- Visible `WATCHLIST` and local review separation.
- Empty, partial, stale, and error state copy.

Not in scope:

- Full redesign.
- Production auth.
- AI KINTEL integration.
- Provider activation.

Acceptance criteria:

- Tester can understand purpose in 2-3 minutes.
- Tester can navigate dashboard, candidate detail, source freshness, review, and report preview.
- No critical confusion around research-only boundaries.

### 12C.1 - Trusted Tester Preview Shell

Goal:

- Add the first non-technical, product-facing click path for a trusted external reviewer inside the existing UI mock.

Deliverables:

- `Trusted Preview` tab in the existing standalone UI mock.
- Guided path through radar overview, candidate/project detail, source freshness, research snapshot, report preview, and structured feedback prompts.
- Clear explanation that `WATCHLIST` means manual review only, missing data requires manual verification, freshness is context recency, and review status does not change scanner labels or scoring.
- `docs/trusted_tester_preview_shell.md`.

Not in scope:

- Deployment.
- Access gate.
- Feedback capture or persistence.
- Backend production code.
- Source activation, provider calls, OpenAI calls, source adapters, secrets, dependencies, scoring changes, `final_label` changes, review semantics changes, or `WATCHLIST` meaning changes.
- AI KINTEL implementation.

Acceptance criteria:

- Tester can understand the product purpose and what to click in 2-3 minutes.
- The preview path does not require CMD, repository access, GitHub, Codex, local scripts, or developer explanation.
- The UI does not present AI KINTEL as the next implementation target.
- Private access, feedback capture, report library, and lightweight private preview deployment remain later steps.

## 12D - Reports Library + Feedback Loop

Goal:

- Make reports and feedback accessible inside the trusted tester workflow.

Deliverables:

- Report preview or simple report library.
- Feedback capture path that does not require GitHub.
- Session summary template for owner review.

Not in scope:

- Advanced report analytics.
- AI narrative generation.
- Subscription/billing.

Acceptance criteria:

- Tester can inspect report output without local path knowledge.
- Tester can leave structured feedback.
- Owner can triage feedback into blockers, improvements, and later ideas.

## 12E - Lightweight Private Preview Deployment

Goal:

- Provide a gated private preview that a trusted external tester can open without repo or local setup.

Deliverables:

- Lightweight preview hosting path.
- Access gate.
- Turn-off procedure.
- Secrets and source-call safety review.

Not in scope:

- Public beta.
- Full production backend.
- Paid source activation.
- AI KINTEL deployment.

Acceptance criteria:

- Preview is private and not publicly open.
- No secrets are exposed.
- No provider calls are made from browser.
- Preview can be disabled after test.

## 12F - Pawel Gradziuk Test Session / Feedback Fixes

Goal:

- Run the trusted tester session and fix P0 feedback.

Deliverables:

- Test session script.
- Captured feedback.
- Triage notes.
- P0 feedback fixes or explicit owner decisions.

Not in scope:

- Broad feature expansion.
- AI KINTEL port.
- Paid integrations.

Acceptance criteria:

- Pawel can complete the click path without developer help.
- Feedback is actionable and triaged.
- Owner can decide whether to proceed to AI KINTEL owner review packet.

## 13A - AI KINTEL Owner Review Packet

Goal:

- Translate standalone preview feedback into an owner-ready AI KINTEL integration decision package.

Deliverables:

- Summary of standalone preview feedback.
- Open decisions for owner/DB/source/compliance.
- Updated integration scope and risks.

Not in scope:

- Actual AI KINTEL implementation.

Acceptance criteria:

- Owner has enough evidence from the standalone preview to approve, reject, or reshape the AI KINTEL integration.

## 13B+ - AI KINTEL Integration

Goal:

- Implement the final AI KINTEL integration only after standalone preview feedback and owner review.

Deliverables:

- To be defined after 13A.

Not in scope:

- Starting before standalone preview feedback.

Acceptance criteria:

- Uses 11A-11G planning as compatibility material, updated by real trusted tester feedback.

## Risk Controls

- No AI KINTEL repo dependency during 12A-12F.
- No paid sources.
- No public URL without access control.
- No CMD for tester.
- No secrets.
- No browser provider calls.
- Research-only semantics.
- No scanner scoring, `final_label`, or `WATCHLIST` behavior changes.
