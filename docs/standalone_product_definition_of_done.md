# Standalone Product Definition Of Done

## Status

- Stage 12A.
- Defines standalone product readiness before AI KINTEL integration.
- This is documentation only and does not change runtime behavior.

## Standalone MVP Done

The standalone MVP is done when:

- System can be used without AI KINTEL.
- Tester/user can operate through UI or simple private URL.
- No developer commands are needed for normal review.
- Data refresh/status is understandable.
- Project/candidate list and detail work.
- Review state works and stays separate from scanner output.
- Reports are accessible.
- Source health is clear.
- Compliance copy is visible.
- Feedback path exists.
- No secrets are exposed.
- No paid source activation is enabled by default.

## Trusted Tester Done

The trusted tester preview is done when:

- Private access is available.
- Tester can complete the click path.
- Feedback is captured.
- Issues are triaged.
- Owner can decide the next step.

## Not Done

These items are not required for standalone trusted tester readiness:

- AI KINTEL port.
- Paid source integrations.
- Public SaaS launch.
- Subscription billing.
- Auto-trading.
- Investment advice.
- Automated trading instructions.

## Done / Not Done Matrix

| Area | Done means | Not done means | Stage |
|---|---|---|---|
| Launch | User opens a private URL or simple launcher without CMD. | User still needs repository, Codex, GitHub, or scripts. | 12B/12E |
| Dashboard | Purpose, status, source freshness, and next action are clear. | Dashboard requires technical explanation. | 12B/12C |
| Source status | Approved, fallback, stale, partial, and unavailable states are visible. | Source state is hidden in logs or developer diagnostics. | 12B/12C |
| Data freshness | Last refresh and stale state are visible. | Tester cannot tell whether data is fresh or fixture fallback. | 12B/12C |
| Project detail | Candidate/project detail gives useful research context. | Detail view is only a raw data dump or unclear labels. | 12C |
| Review | Local review status works and is visibly separate from scanner labels. | Review state appears to change scanner output or imply a trading action. | 12C |
| Reports | Report or report preview is reachable from preview workflow. | Reports require CMD knowledge or local path knowledge. | 12D |
| Feedback | Tester can submit or provide structured feedback without GitHub. | Feedback depends on ad hoc chat only. | 12D |
| Access | Preview is private, gated, and can be turned off. | Preview is public/open or requires local machine setup. | 12E |
| Compliance | Research-only boundary is visible and neutral. | Tester confuses `WATCHLIST` with a trading instruction. | 12C |
| Deployment/preview | Lightweight private preview is available for the test. | Local RC works only on developer machine. | 12E |
| AI KINTEL | Deferred compatibility package is ready for later integration. | Treated as the immediate implementation target before standalone preview feedback. | 13B+ |

## Readiness Rule

Do not call the product externally preview-ready until a non-developer trusted tester can complete the core path without developer commands and without confusion around data status, review state, reports, or `WATCHLIST` meaning.
