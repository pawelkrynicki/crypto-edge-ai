# AI KINTEL Frontend Component Map

## Status

- Stage: 11F - frontend component map.
- This is documentation only.
- It does not create React components, `.tsx` files, route registration, sidebar navigation, Tailwind/shadcn runtime code, backend code, runtime tRPC procedures, provider calls, dependencies, or source activation.

## Component Map

| Future component | Purpose | Data source / tRPC procedure | Local UX2 source | Access level | MVP status | Notes |
|---|---|---|---|---|---|---|
| `CryptoMarket.tsx` | Page composition for the AI KINTEL Crypto Market workspace. | `trpc.cryptoMarket.marketSummary`, `projects`, `scamAlerts`, `onchainMetrics`, `sourceStatus`, optional `moduleHealth` | UX2 app shell and tab structure | `viewer+` behind AI KINTEL access gate | MVP | Future file only: `aikintel-platform/packages/webapp/client/src/pages/CryptoMarket.tsx`. |
| `CryptoMarketHeader` | Page title, freshness, source health, and compact compliance note. | `marketSummary`, `sourceStatus`, optional `moduleHealth` | Overview header and health copy | `viewer+` | MVP | Should avoid local runbook or CMD wording. |
| `MarketSummaryCards` | High-level market context, scanner counts, coverage, and warning summary. | `marketSummary`, `projects` aggregate fields, `sourceStatus` | Local Overview and Market Context Panel | `viewer+` | MVP | Shows stale/partial state without hiding available data. |
| `SourceStatusBadge` | Small status indicator for source health/config state. | `sourceStatus`, optional `moduleHealth` | Source status chips in UX2 | `viewer+`; richer details open decision | MVP | Disabled/deferred paid source is informational, not an error. |
| `ComplianceNotice` | Short research-only copy and manual verification reminder. | `compliance` block from every procedure | UX2 guidance copy | `viewer+` | MVP | Use standardized copy from `docs/ai_kintel_frontend_compliance_copy_guide.md`. |
| `ProjectList` | Filterable/listed project and scanner candidate rows. | `projects` | Scanner Radar list | `viewer+` | MVP | Scanner label stays read-only; review status is separate if enabled later. |
| `ProjectCard` | Compact project row/card with scanner label, review context, source freshness, and key metrics. | `projects` | Scanner candidate card | `viewer+` | MVP | Neutral CTAs only, such as `View details`. |
| `ProjectDetailPanel` | Detail panel/drawer/card for scanner reasons, data coverage, related alerts, on-chain metrics, and compliance. | `projectById`, `scamAlerts`, `onchainMetrics`, `sourceStatus` | Candidate Detail panel | `viewer+` | MVP | Missing data renders manual verification state. |
| `ResearchQueuePanel` | Future research queue or review follow-up area. | `projects`, optional `analystReviews` if approved | Review Queue | `analyst+` or open decision | Open decision | Ownership of production review data must be decided first. |
| `RiskAlertList` | List of risk/security alerts. | `scamAlerts` | Risk Alerts tab | `viewer+` | MVP | Alerts are research context only. |
| `RiskAlertCard` | Individual risk/security alert summary. | `scamAlerts` | Risk alert items | `viewer+` | MVP | Show severity and source freshness with neutral language. |
| `OnchainMetricsPanel` | On-chain snapshots and coverage/missing-data messaging. | `onchainMetrics`, `sourceStatus` | Data Coverage & Context section | `viewer+` | MVP if DB data exists; otherwise post-MVP | Missing on-chain data requires manual verification. |
| `SourceHealthPanel` | Source health, disabled/deferred state, latest runs, and warnings. | `sourceStatus`, optional `sourceRuns`, optional `moduleHealth` | Source diagnostics | `viewer+` for safe status; `analyst+`/`admin` for richer diagnostics | MVP safe status; post-MVP diagnostics | Must not expose secrets, env values, or raw provider payloads. |
| `DataFreshnessBadge` | Freshness indicator for page, section, or record. | `data_freshness`, `generated_at` from procedure envelope | Source status/freshness copy | `viewer+` | MVP | Stale data should warn but keep available records visible. |
| `EmptyState` | No rows/data state with manual verification copy. | Empty `items`/`item`, `warnings`, `compliance` | Fixture fallback and empty local states | `viewer+` | MVP | Empty data is not positive context. |
| `StaleDataWarning` | Warning for stale source/table data. | `data_freshness`, `warnings` | Health/status copy | `viewer+` | MVP | Should not block the whole page when useful data exists. |
| `DeferredSourceNotice` | Informational state for paid/deferred/not configured sources. | `sourceStatus` | Paid/future data coverage copy | `viewer+` | MVP | Paid/deferred source is expected until activation is approved. |
| `MethodologyPanel` | Methodology, label boundaries, data limitations, and compliance copy. | Static copy plus `compliance` block | Methodology tab | `viewer+` | MVP | Should explain `WATCHLIST`, missing data, and scanner label immutability. |

## Shared Rules

- Components should receive data from `trpc.cryptoMarket.*` only.
- Components should not import provider SDKs or call provider URLs.
- Components should render disabled/deferred sources as informational states.
- Components should preserve scanner label, scanner scoring, `final_label`, and `WATCHLIST` meaning.
- Components should avoid disallowed CTA/function wording listed in the compliance copy guide.
