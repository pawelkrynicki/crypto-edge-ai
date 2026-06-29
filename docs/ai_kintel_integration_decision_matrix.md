# AI KINTEL Integration Decision Matrix

## Status

- Stage: 11A - AI KINTEL Production MVP Definition and Integration Decision Matrix.
- Planning date: 2026-06-29.
- This is a documentation and decision artifact only.
- No source adapter, endpoint, auth layer, production backend, production database, migration, UI change, or paid API call is implemented here.

## Architecture Decisions

| Decision Area | Selected Direction | Rejected / Deferred Direction | Reason |
|---|---|---|---|
| Product shape | AI KINTEL module | Standalone SaaS | Final product access and billing should come through AI KINTEL/subscription. |
| Backend | Existing AI KINTEL Express/tRPC webapp backend | Separate FastAPI service | Keeps production integration inside the existing AI KINTEL architecture. |
| Database | AI KINTEL MySQL/MariaDB | PostgreSQL or local-only storage | AI KINTEL production uses MySQL/MariaDB. |
| Data collection | AI KINTEL cron scripts plus PM2 | Frontend fetches or local helper scripts | External calls must run in backend/cron only. |
| Frontend | AI KINTEL webapp route `/crypto-market` | Separate webapp | Keeps module navigation and access control inside AI KINTEL. |
| Local JSON/SQLite | Dev/local only | Production persistence | Local storage remains a porting baseline, not production storage. |
| Deployment | AI KINTEL VPS/PM2 flow | Separate deployment stack | Reduces operational split and matches current AI KINTEL deployment. |
| Access | AI KINTEL auth/subscription gate | Separate account system | Final access must align with AI KINTEL subscriptions. |
| Roles | Simple internal roles only if needed | Independent role system | Roles are subordinate to AI KINTEL access and subscription control. |
| Paid integrations | Deferred and disabled until explicitly enabled | Active during MVP definition | Production MVP starts on free/approved sources and remains paid-source-ready. |

## Source Decisions

| Source | Type | MVP status | Env var placeholder | Runtime behavior when disabled | Notes |
|---|---|---|---|---|---|
| Alternative.me | free | active candidate | none | Not applicable if active; if policy disables it, return disabled metadata. | Approved free market sentiment candidate. |
| DefiLlama | free | active candidate | none | Not applicable if active; if policy disables it, return disabled metadata. | Approved free DeFi context candidate. |
| CoinGecko | paid/freemium | deferred | `COINGECKO_API_KEY` | Return `configured: false` / `status: disabled`; do not call API. | Paid/commercial plan decision deferred. |
| CryptoCompare | freemium | possible active/deferred | `CRYPTOCOMPARE_API_KEY` | Return `configured: false` / `status: disabled`; do not call API. | Requires policy and licensing decision before use. |
| TokenSniffer | paid/limited | deferred | `TOKENSNIFFER_API_KEY` | Return `configured: false` / `status: disabled`; do not call API. | API terms and commercial use need confirmation. |
| Tokenomist | paid | deferred | `TOKENOMIST_API_KEY` | Return `configured: false` / `status: disabled`; do not call API. | Unlock/vesting data can be revisited after MVP. |
| GoPlus | needs commercial approval/written permission | deferred | `GOPLUS_API_KEY` | Return `configured: false` / `status: disabled`; do not call API. | Requires commercial-use clarification and attribution rules. |
| Bubblemaps | paid/sales | deferred | `BUBBLEMAPS_API_KEY` | Return `configured: false` / `status: disabled`; do not call API. | Sales/pricing and terms clarification required. |
| Arkham | paid/sales | deferred | `ARKHAM_API_KEY` | Return `configured: false` / `status: disabled`; do not call API. | Access-gated; written terms required before integration. |
| OpenAI | platform internal helper | deferred for AI narrative layer only | `OPENAI_API_KEY` or AI KINTEL helper env | Return disabled AI narrative metadata; do not call model. | Not a decision layer for MVP and not used in 11A. |

## Paid-Source Activation Rule

- Paid vendors may be present in configuration as disabled slots.
- No calls are made unless an explicit enabled flag is true.
- Missing env keys must not crash the module.
- A disabled source returns `configured: false` and `status: disabled`.
- The UI shows `not configured` or `deferred` instead of a user-facing error.
- Enabling a paid source requires an env var, a config flag, a source policy update, and a documented operational check.
- Activation must respect vendor terms, rate limits, attribution requirements, and commercial approval status.

## Data Model Decisions

| Local RC Concept | AI KINTEL Production Mapping | Decision |
|---|---|---|
| Scanner candidate | `crypto_projects`, `crypto_opportunities`, or `crypto_scam_alerts` depending on label and module semantics | Map by scanner label and risk category during DB blueprint stage. |
| Market context | `crypto_market_summaries` | Store normalized free/approved market context with UTC timestamps. |
| Security/manual verification | `crypto_scam_alerts` or risk fields on project/opportunity records | Use explicit missing-data fields and do not invent unavailable security data. |
| Review notes | New production review table, AI KINTEL user layer, or internal-only workflow | OPEN DECISION: whether local analyst review notes should be stored in production DB, user-specific table, or remain internal-only. |
| Analyst report | Backend-generated research summary or internal/admin export | Decide in post-MVP architecture if UI generation requires new backend surfaces. |

## Compliance Decisions

- No buy/sell/signal wording.
- `WATCHLIST` means manual review only.
- Review status does not change scanner label.
- Analyst report is a research export or summary only.
- Missing data means manual verification.
- The module must remain research-only.
- Frontend uses tRPC/backend only and must not call external data providers directly.

## Open Decisions

- Exact subscription gate location in AI KINTEL.
- First paid vendor to activate.
- Whether AI narrative summaries enter MVP or post-MVP.
- Whether review notes are user-specific, shared/internal, or not stored in production.
- Retention policy for old scanner outputs.
- Whether export/report is generated backend-side in MVP or post-MVP.
- Final table names and ownership boundaries for review queue data.
