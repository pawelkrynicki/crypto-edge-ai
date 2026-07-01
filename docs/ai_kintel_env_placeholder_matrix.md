# AI KINTEL Env Placeholder Matrix

## Status

- Stage: 11G - env placeholder matrix.
- This is documentation only.
- No secret values are included.
- No `.env` file is created.
- No production config is changed.
- No source is activated.
- No provider call, source adapter, backend code, cron code, frontend code, runtime tRPC procedure, dependency, or deployment is added.

## Rules

- Document env names only.
- Do not commit values.
- Do not commit secrets.
- Missing env for a disabled/deferred source is not an error.
- Missing env for an enabled source is a configuration issue.
- Paid source env must not trigger provider calls unless the source is explicitly enabled and policy allows the runtime action.
- Existing AI KINTEL DB/auth/subscription env should be reused by the AI KINTEL implementation and not redefined here.

## Matrix

| Env placeholder | Purpose | Source/tier | Required for local MVP? | Required for production MVP? | Required when source disabled? | Secret? | Owner/review | Notes |
|---|---|---|---|---|---|---|---|---|
| `CRYPTO_MARKET_ENABLED` | Module-level enable flag for future AI KINTEL wiring. | Module config | No | Yes, if module is launched | No | No | AI KINTEL owner | Should not bypass access/subscription gate. |
| `CRYPTO_MARKET_STAGING_MODE` | Marks future staging behavior or safer defaults. | Module config | No | Staging only | No | No | AI KINTEL owner / operations | Documentation-only placeholder; final naming should follow AI KINTEL conventions. |
| `CRYPTO_MARKET_SOURCE_ALTERNATIVE_ME_ENABLED` | Enable flag for Alternative.me market sentiment source. | Free/approved candidate | No | Yes, if enabled for MVP | No | No | Source/compliance review | Alternative.me may not need an API key but still needs policy review. |
| `CRYPTO_MARKET_SOURCE_DEFILLAMA_ENABLED` | Enable flag for DefiLlama DeFi context source. | Free/approved candidate | No | Yes, if enabled for MVP | No | No | Source/compliance review | DefiLlama may not need an API key but still needs policy review. |
| `CRYPTOCOMPARE_API_KEY` | Future CryptoCompare access key. | Freemium/deferred | No | No, unless selected | No | Yes | Source/compliance/vendor review | Must not trigger provider calls while disabled. |
| `COINGECKO_API_KEY` | Future CoinGecko paid/freemium access key. | Paid/freemium deferred | No | No, unless selected | No | Yes | Source/compliance/vendor review | Paid/commercial plan decision remains deferred. |
| `TOKENSNIFFER_API_KEY` | Future TokenSniffer access key. | Paid/limited deferred | No | No, unless selected | No | Yes | Source/compliance/vendor review | Commercial-use terms need review before activation. |
| `TOKENOMIST_API_KEY` | Future Tokenomist access key. | Paid deferred | No | No, unless selected | No | Yes | Source/compliance/vendor review | Unlock/vesting source can remain post-MVP. |
| `GOPLUS_API_KEY` | Future GoPlus access key if commercial use is approved. | Approval-gated deferred | No | No, unless approved | No | Yes | Source/compliance/vendor review | Requires written commercial-use clarification. |
| `BUBBLEMAPS_API_KEY` | Future Bubblemaps access key. | Paid/sales deferred | No | No, unless selected | No | Yes | Source/compliance/vendor review | Sales/pricing and terms review required. |
| `ARKHAM_API_KEY` | Future Arkham access key. | Paid/sales deferred | No | No, unless selected | No | Yes | Source/compliance/vendor review | Access-gated and terms-sensitive. |
| `OPENAI_API_KEY` | Future AI narrative/research helper only. | Deferred AI narrative layer | No | No | No | Yes | AI KINTEL owner/compliance review | Not a decision layer and not required for production MVP launch. |
| Existing AI KINTEL DB env, do not redefine here | Existing DB connection configuration. | AI KINTEL platform | No | Yes through existing platform config | Not applicable | Yes/possibly | AI KINTEL DB owner | Mention only; real names/values belong to AI KINTEL platform config. |
| Existing AI KINTEL access env, do not redefine here | Existing auth/subscription/access configuration. | AI KINTEL platform | No | Yes through existing platform config | Not applicable | Yes/possibly | AI KINTEL owner | Mention only; real names/values belong to AI KINTEL platform config. |

## Notes

- Alternative.me and DefiLlama may not need API keys, but source enable flags and policy review are still needed.
- OpenAI is deferred for a narrative/research layer only, not a decision layer.
- Paid vendors are not required for production MVP launch if they remain deferred.
- Disabled/deferred sources should render safe status metadata and must not call providers.
