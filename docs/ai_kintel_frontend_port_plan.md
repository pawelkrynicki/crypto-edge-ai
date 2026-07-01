# AI KINTEL Frontend Port Plan

## Status

- Stage: 11F - AI KINTEL Frontend Port Plan.
- This is a documentation-only porting plan, not a frontend implementation.
- It does not create `CryptoMarket.tsx`.
- It does not create `packages/webapp`.
- It does not add route registration or sidebar navigation.
- It does not add React components, Tailwind/shadcn runtime code, backend code, endpoints, runtime tRPC procedures, source adapters, provider calls, OpenAI calls, dependencies, or source activation.
- It does not change the Local MVP Release Candidate.

11F frontend planning artifacts:

- `docs/ai_kintel_frontend_port_plan.md`
- `docs/ai_kintel_frontend_component_map.md`
- `docs/ai_kintel_frontend_data_contract.md`
- `docs/ai_kintel_frontend_state_model.md`
- `docs/ai_kintel_frontend_compliance_copy_guide.md`
- `docs/ai_kintel_frontend_port_checklist.md`

## Target AI KINTEL Frontend Location

Future AI KINTEL target path:

- `aikintel-platform/packages/webapp/client/src/pages/CryptoMarket.tsx`

Possible future component folder:

- `aikintel-platform/packages/webapp/client/src/pages/CryptoMarketComponents/`

Future route:

- `/crypto-market`

Future API:

- `trpc.cryptoMarket.*`

The future frontend should only call the AI KINTEL backend/tRPC layer. It must not call external providers directly from the browser.

## Product UI Goals

- Provide one clear Crypto Market workspace inside AI KINTEL.
- Keep the workflow research-only.
- Avoid trading-instruction UX and automated-decision semantics.
- Show data freshness clearly.
- Show source status clearly.
- Keep `WATCHLIST` meaning visible: further manual review only.
- Show missing data as manual verification required.
- Show paid sources as deferred or not configured, not broken.
- Keep frontend data access tRPC-only.
- Render DB-backed responses produced by cron/source-layer ingestion.

## Proposed Page Structure

### Header

- Title: `Crypto Market`.
- Data freshness badge.
- Source status badge.
- Compact research-only compliance note.
- Optional access/subscription state if AI KINTEL gate denies access.

### Sections Or Tabs

- Overview.
- Projects.
- Watchlist / Research Queue.
- Risk Alerts.
- On-chain.
- Sources / Health.
- Methodology / Compliance.

## Port From Local UX2

| Local UX2 area | Future AI KINTEL area | Porting note |
|---|---|---|
| Local Overview | Overview | Preserve market context, data coverage, health, and high-level scanner counts. |
| Scanner Radar | Projects / Watchlist | Port the candidate list as DB-backed project rows, with scanner label read-only. |
| Candidate Detail | Project Detail panel/drawer/card | Keep scanner reasons, data coverage, source freshness, manual verification notes, and neutral actions. |
| Review Queue | Research Queue | Subject to ownership decision for production review data. |
| Analyst Report Workspace | Backend/internal export or post-MVP surface | Do not generate reports in the initial frontend unless backend ownership is decided. |
| Risk Alerts | Risk Alerts tab | Render alerts as research/security context. |
| Market Context Panel | Overview / Market Summary | Read from `trpc.cryptoMarket.marketSummary`. |
| Source diagnostics | Sources / Health tab | Restrict richer diagnostics if needed by role/subscription gate. |
| Methodology | Methodology / Compliance section | Preserve research-only and manual-review explanations. |

## Port 1:1

- Scanner label vs review status separation.
- `WATCHLIST` means manual review only.
- Missing data means manual verification.
- Source status and data freshness.
- Research-only compliance boundary.
- Neutral CTAs:
  - `View details`
  - `Open research details`
  - `Review context`

## Simplify For AI KINTEL

- Local storage/import/export UI.
- Command blocks for local checks.
- Local CMD check instructions.
- Browser `localStorage` fallback.
- Local report generation instructions.
- Dev-only diagnostics.
- Fixture/local API bridge language that does not apply to production.

## Defer

- Frontend report generation.
- Review mutations until ownership is decided.
- Paid source activation UI.
- Admin source config UI.
- AI narrative summaries.
- Advanced wallet/entity intelligence.
- Rich source-run diagnostics for non-admin users.

## Frontend Architecture Boundary

- Future UI reads from `trpc.cryptoMarket.*`.
- Future tRPC procedures read MySQL/MariaDB records populated by cron/source adapters.
- Browser code must not contain provider URLs, provider keys, provider auth headers, scraping, undocumented endpoints, or direct external API calls.
- Paid/deferred sources remain disabled until separate owner, env, config, policy, vendor, and operational approval.
- Disabled/deferred source metadata should render as an informational state.

## Research And Compliance Boundary

- The module remains research-only.
- `WATCHLIST` is not approval and not a trading instruction.
- Missing data is not positive context.
- Review status, if added later, must not change scanner label, scanner scoring, `final_label`, or `WATCHLIST` meaning.
- UI copy should be short, visible, and not alarmist.
