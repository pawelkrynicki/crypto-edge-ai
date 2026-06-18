# Product Scope

## Product Direction

Crypto Edge AI is the main module direction.

It is a crypto trading intelligence module developed in a standalone working repo first, with a path for later integration into AIKINTEL.

The crypto market intelligence layer is the data backing for Crypto Edge AI. It is not a separate product named Crypto Market.

## Core User Value

Crypto Edge AI helps traders review crypto topics before making their own decisions by showing:

- Bias.
- Score.
- Confidence.
- Risk.
- Narratives.
- Scam alerts.
- Market context.
- Setup review.
- Pre-trade checklist.

## Data Backing

The module may use:

- `crypto_projects`.
- `crypto_scam_alerts`.
- `crypto_opportunities`.
- `crypto_market_summaries`.
- Existing AIKINTEL Market News / Crypto if accessible.
- `crypto_onchain_metrics` later if useful.

Crypto Edge AI should not duplicate the existing AIKINTEL Market News section. It should map to it, summarize it, or use it as context when access is available.

## Camp v1 Scope

Camp v1 should include:

- Crypto Edge AI page/module.
- Controlled user flow for real users.
- Project/token research list.
- Scam/risk alerts.
- Opportunities/narratives.
- Market summary context.
- Setup review mock.
- Score 0-100.
- Bias: bullish, bearish, neutral.
- Confidence 0-100.
- Risk factors.
- Checklist.
- Disclaimer.

## Data Sources to Consider

Prefer credible open-source or public API sources:

- CoinGecko.
- CryptoCompare.
- DefiLlama.
- CoinMarketCap only if useful and accessible.
- Dune / public dashboards if useful.
- GDELT.
- Existing AIKINTEL Market News / Crypto.
- Fear & Greed Index.
- Token Unlocks only with legal API access.
- Public CEX/DEX data without violating terms.

## Out of Scope

The following remain out of scope:

- Rebranding to a standalone Crypto Market product.
- Full UI implementation in this documentation stage.
- Production cron scripts in this documentation stage.
- Real API fetchers in this documentation stage.
- New standalone auth/login.
- FastAPI.
- SQLite.
- MT4 integration.
- Exchange execution.
- Telegram integration.
- Discord integration.
- Payments.
- Auto-buy or auto-sell.
- Signal bot.
- Copy trading.
- Hardcoded or committed API keys.

## User Statuses

Future user-specific statuses may include:

- `new`.
- `to_review`.
- `watching`.
- `rejected`.
- `played`.
- `archived`.

These should use existing AIKINTEL users/auth if the module is integrated.
