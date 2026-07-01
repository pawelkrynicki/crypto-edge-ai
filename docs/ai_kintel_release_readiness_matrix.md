# AI KINTEL Release Readiness Matrix

## Status

- Stage: 11G - release readiness matrix.
- This is documentation only.
- It does not deploy staging, create runtime code, activate sources, add env values, add dependencies, or change the Local MVP Release Candidate.

## Matrix

| Area | Required for staging? | Required for production MVP? | Current status | Owner/reviewer | Blocker if missing? | Notes |
|---|---|---|---|---|---|---|
| Product scope | Yes | Yes | Ready for implementation planning | AI KINTEL owner | Yes | 11A defines Crypto Market as an AI KINTEL module. |
| DB schema/migration review | Yes | Yes | Blocker if not resolved | DB owner | Yes | 11B is review-only; real migration belongs in `aikintel-platform`. |
| Source policy | Yes | Yes | Blocker if not resolved | Source/compliance reviewer | Yes | No scraping, no undocumented endpoints, no disabled paid-source calls. |
| Env placeholders | Yes | Yes | Ready for implementation planning | AI KINTEL owner / operations | Yes | Names only; no values in repo. |
| Cron fetchers | Yes | Yes | Ready for implementation planning | Backend/operations | Yes | Implement later in AI KINTEL repo; paid sources disabled/deferred. |
| PM2 config | Yes | Yes | Ready for implementation planning | Operations | Yes | Future config only; no real `.cjs` added here. |
| tRPC router | Yes | Yes | Ready for implementation planning | Backend owner | Yes | Read-first, DB-backed, no provider calls in read path. |
| Frontend route/page | Yes | Yes | Ready for implementation planning | Frontend owner | Yes | Future `/crypto-market` uses `trpc.cryptoMarket.*` only. |
| Access/subscription gate | Yes | Yes | Needs owner decision | AI KINTEL owner | Yes | Exact gate and entitlement must be confirmed. |
| Compliance copy | Yes | Yes | Ready for implementation planning | Compliance reviewer | Yes | Research-only, `WATCHLIST` manual review only, missing data manual verification. |
| Source health / observability | Yes | Yes | Ready for implementation planning | Backend/operations | Yes | Use `crypto_source_runs` and sanitized status. |
| Monitoring/logging | Yes | Yes | Ready for implementation planning | Operations | Yes | Logs must contain no secrets or raw provider payloads. |
| Rollback | Yes | Yes | Blocker if not resolved | Operations / DB owner | Yes | Disable sources, stop PM2, revert route/router exposure where needed. |
| Manual QA | Yes | Yes | Ready for implementation planning | QA / AI KINTEL owner | Yes | Includes browser network review for no provider calls. |
| Paid source activation | No | No | Deferred | AI KINTEL owner / source reviewer | No for MVP | Paid sources remain disabled/deferred until separate approval. |
| AI narrative layer | No | No | Post-MVP | AI KINTEL owner / compliance | No | OpenAI is not required for production MVP and not a decision layer. |
| Review queue ownership | Yes if review queue ships | Yes if review queue ships | Needs owner decision | AI KINTEL owner / DB owner | Maybe | Can be deferred if production review storage is not in MVP. |
| Analyst report UI/export | No | No | Post-MVP / open decision | AI KINTEL owner | No | Backend/internal export may come later. |

## Readiness Summary

- Staging can start only after owner, DB, source policy, env placeholder, access gate, rollback, and monitoring review are complete.
- Production MVP does not require paid source activation or AI narrative summaries.
- Real implementation should move to `aikintel-platform` only after 11A-11G are accepted.
