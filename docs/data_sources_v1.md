# Data Sources V1

## Purpose

Classify data sources for Camp BETA and later phases of Crypto Edge AI.

Camp BETA should use a limited, stable real-data pipeline where possible.

## Source Table

| Source | Purpose | Data Provided | Camp BETA Priority | API Status to Verify | Risks / Limitations | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| DexScreener | Discovery Radar | Pairs, liquidity, volume, price, pair age, links | Priority | Public API access and rate limits | Data quality varies; pair age may not equal token age | Manual URL input or GeckoTerminal later |
| GoPlus Security | Security Check | Honeypot, tax, contract risks, ownership, token security | Priority | API limits, supported chains | Coverage varies by chain | Honeypot.is plus manual explorer check |
| Honeypot.is | Honeypot check | Honeypot status, buy/sell simulation data | Priority | API stability and supported chains | Chain coverage and false positives | GoPlus and manual review |
| CoinGecko | Market context | Price, market cap, FDV, categories, broad token context | Priority | Free/pro API limits | Not all new tokens available quickly | DexScreener context |
| Fear & Greed Index | Market sentiment | Sentiment index | Priority | Public API status | Broad market only, not token-specific | Manual sentiment placeholder |
| AIKINTEL Market News / Crypto | News context | Crypto news, sentiment, AI Analysis | Priority if accessible | Exact schema and repo access | Access not confirmed | Manual Research Review input |
| GeckoTerminal | Discovery backup | DEX pools, liquidity, price, volume | Strong candidate after BETA | API access and rate limits | Coverage and terms | DexScreener |
| DefiLlama | DeFi context | TVL, protocols, chains | Strong candidate after BETA | Endpoint fit | Less useful for very new memecoins | CoinGecko / manual context |
| Bubblemaps | Holder clusters | Wallet cluster visualization | Strong candidate after BETA | API/legal access | May require paid access | Manual check |
| Etherscan/BscScan/Solscan | Explorer verification | Contract verification, holders, transfers | Strong candidate after BETA | API keys and chain coverage | Rate limits, parsing complexity | Manual explorer links |
| CryptoCompare | Market data/news | Prices, news, social stats | Strong candidate after BETA | API limits | May overlap with AIKINTEL news | CoinGecko / AIKINTEL news |
| Token Sniffer | Security score | Token score, contract flags | Manual/optional/later | Legal/stable API access | Access uncertainty | GoPlus + Honeypot.is |
| De.Fi Scanner | Security scan | Contract and protocol risk flags | Manual/optional/later | API/legal access | Access uncertainty | GoPlus + manual review |
| DexTools | Manual reference | DEX analytics | Manual/optional/later | API access | May be paid or manual-first | DexScreener |
| TGStat | Social check | Telegram metrics | Manual/optional/later | API access and terms | Not crypto-specific enough alone | Manual input |
| LunarCrush | Social quality | Social metrics | Manual/optional/later | API access | Paid/limited | Manual checklist |
| SocialBlade | Social quality | Social account history | Manual/optional/later | API/access terms | Not always useful for crypto | Manual checklist |
| TweetScout | Twitter/X quality | Account/social credibility | Manual/optional/later | Access terms | Availability unclear | Manual checklist |
| Arkham | Wallet intelligence | Wallet/entity labels | Manual/optional/later | API/legal access | Paid and complex | Explorer/manual |
| Dune public dashboards | On-chain analytics | Custom dashboards | Manual/optional/later | Dashboard/API terms | Data freshness varies | DefiLlama / explorers |
| Token Unlocks | Unlock schedules | Token unlock events | Manual/optional/later | Legal API access | Access uncertainty | Manual review |

## Camp BETA Priority Sources

Use first:

- DexScreener.
- GoPlus Security.
- Honeypot.is.
- CoinGecko.
- Fear & Greed Index.
- AIKINTEL Market News / Crypto if accessible.

## First Code POC

The first code POC uses only DexScreener:

- Public endpoint, no API key.
- Query-based live mode.
- Local fixture mode.
- Pair normalization.
- Basic candidate filters.

GoPlus, Honeypot.is, CoinGecko, Fear & Greed, and AIKINTEL Market News mapping are intentionally left for later POC stages.

## Second Code POC: Security Enrichment

The second code POC adds fixture-first and live best-effort security enrichment:

- GoPlus Security.
- Honeypot.is.

Scope:

- Normalize available security fields.
- Evaluate critical risk rules.
- Report missing fields explicitly.
- Avoid inventing unavailable holder/liquidity/ownership data.

Limitations:

- Public endpoints may vary by chain.
- Some fields may not exist for all tokens.
- Missing data should produce `NEEDS_MANUAL_VERIFICATION`, not fake values.

## Rule

Do not add real fetchers or API keys until source access, rate limits, and terms are confirmed.
