# Trusted Tester Preview Path

## Status

- Stage 12A.
- Plan for a trusted tester preview path.
- Target trusted tester: Pawel Gradziuk.
- This is not a public beta.
- This is not AI KINTEL implementation.

## What Pawel Gradziuk Should Be Able To Do

- Open a private link or simple preview.
- Understand what the product does in 2-3 minutes.
- Open the dashboard.
- Review source status and freshness.
- Open a project/candidate.
- Inspect details and reasons.
- Understand `WATCHLIST` as manual review only.
- Inspect a report or report preview.
- Leave feedback.

## What He Should Not Need

- Repository access.
- GitHub.
- Codex.
- CMD.
- Local scripts.
- `.env`.
- API keys.
- AI KINTEL access.
- Technical explanation of storage.

## Preview Access Options

| Option | Pros | Cons | Security risk | Setup effort | Suitable for Pawel test? |
|---|---|---|---|---|---|
| Local machine + temporary tunnel | Fast emergency demo path; can reuse local preview. | Depends on developer machine, session uptime, and manual setup. | Medium if tunnel URL leaks or access gate is weak. | Low to medium. | Maybe, as emergency/demo only. |
| VPS private preview | More stable than a developer laptop; can be turned off after test. | Needs deployment checklist, basic hardening, and controlled data files. | Medium without access gate; low/medium with gate. | Medium. | Yes, if gated and scoped. |
| Cloudflare Access / Basic Auth style gate | Simple private access layer; familiar for one external tester. | Still needs hosted preview and credential handling. | Low/medium if credentials are scoped and rotated. | Medium. | Yes. Recommended direction. |
| Screen-recording-only demo | Safest and fastest for communication. | Not clickable; cannot validate self-service usability. | Low. | Low. | No, if the goal is independent click-through. |
| Static export/demo | Easy to host and safer than a live app. | Not enough for review state, reports, freshness, or feedback workflow. | Low/medium depending on hosting. | Low. | Maybe for narrative backup, not enough alone. |

## Recommended Direction

- Prefer a lightweight private preview with an access gate.
- Temporary tunnel can be an emergency/demo option only.
- Static demo is not enough if Pawel must click independently.
- Public open URL is not acceptable.
- The preview should be easy to disable after the session.

## Trusted Tester Test Script

Target duration: 10-15 minutes.

Click path:

1. Open preview.
2. Read header and dashboard.
3. Check source/data status.
4. Open candidate/project.
5. Inspect source status and freshness.
6. Check report or report preview.
7. Leave feedback.

Questions to ask:

- Is the product purpose clear?
- Do labels feel like research workflow or trading instruction?
- Is source freshness clear?
- Is the detail view useful?
- What would you need before accepting this direction?
- What is confusing?
- What is missing?

## Acceptance Criteria

- Tester can complete the click path without developer help.
- Tester understands the research-only boundary.
- Tester can give actionable feedback.
- No critical confusion around `WATCHLIST`.
- No public exposure or secret leak.
- System can be turned off after the test.

## Feedback Capture

Minimum viable feedback capture can be simple:

- A structured feedback form or issue template not requiring GitHub.
- A short post-session questionnaire using the questions above.
- A short owner summary with observed blockers, unclear labels, missing context, and requested changes.

The feedback path must not require the tester to understand repository structure, scripts, local storage, or implementation details.
