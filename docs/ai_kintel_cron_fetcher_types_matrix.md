# AI KINTEL Cron Fetcher Types Matrix

## Status

- Stage: 11D - AI KINTEL Cron Fetcher Types Matrix.
- This is a documentation-only planning matrix.
- It does not create runtime cron scripts.
- It does not create `packages/cron`.
- It does not implement source adapters or activate sources.
- It does not change the Local MVP Release Candidate.

## Future Fetcher Matrix

| Future script | Purpose | Source category | Target tables | Suggested cadence | Paid source behavior | MVP status | Notes |
|---|---|---|---|---|---|---|---|
| `fetch-crypto-market-context.ts` | Market context, sentiment, and DeFi TVL collection. | `market_context`, `sentiment`, `onchain` | `crypto_market_summaries`, `crypto_source_runs` | 2x daily or every 4-6h; open decision. | Paid sources remain disabled/deferred and must not call providers while disabled. | Active-candidate planning only. | Alternative.me and DefiLlama are active candidates where policy permits; paid sources remain deferred. |
| `fetch-crypto-projects.ts` | Project and market metadata collection. | `project_data`, `market_context` | `crypto_projects`, `crypto_source_runs` | Every 6h; open decision. | CoinGecko and CryptoCompare remain deferred until approval, env, config, and policy activation. | Free/approved first. | Use free/approved sources first; normalize project records before insert. |
| `fetch-crypto-security.ts` | Security, scam, and manual-verification context. | `security` | `crypto_scam_alerts`, `crypto_projects`, `crypto_source_runs` | Every 30-60 min only after source approval; open decision. | TokenSniffer and GoPlus remain deferred or need approval; no provider call while disabled. | Deferred until source approval. | Missing security data means manual verification, not positive context. |
| `fetch-crypto-onchain.ts` | On-chain snapshots and DeFi/on-chain context. | `onchain` | `crypto_onchain_metrics`, `crypto_source_runs` | Every 12h; open decision. | Bubblemaps and Arkham remain deferred; disabled paid sources must return disabled metadata only. | Active-candidate planning for approved/free context only. | DefiLlama is an active candidate where policy permits. |
| `generate-crypto-market-summary.ts` | Internal market summary generated from stored DB records. | `internal`, `ai_layer` | `crypto_market_summaries`, `crypto_source_runs` | Daily or 2x daily. | Optional future AI narrative remains disabled/deferred and must not call external AI while disabled. | DB-only planning. | Uses DB records only for MVP planning; any future AI narrative layer requires separate approval. |

## Cadence Notes

- Cadences are planning values only.
- Final PM2 cron schedule belongs to AI KINTEL integration review.
- Future cron fetchers must follow the 11C source adapter contract.
- Disabled/deferred paid sources must not call providers.
- Frontend provider calls remain forbidden.
