# Crypto Edge AI Data POC

## Purpose

This is a small Data Integration POC for Crypto Edge AI Camp BETA.

It checks whether we can fetch or load DexScreener pair data, normalize it into a Crypto Edge AI token candidate model, apply basic filters, and output standardized JSON.

It also includes a second POC: Security Enrichment. This checks whether a normalized candidate can be enriched with GoPlus Security and Honeypot.is style data, then classified as `SECURITY_PASSED`, `NEEDS_MANUAL_VERIFICATION`, or `CRITICAL_RISK`.

This is not the product. It does not include UI, database, migrations, auth, production cron scripts, AI calls, exchange integration, MT4, Telegram/Discord, payments, or auto-trading.

## Install

```bash
npm install
```

## Fixture Mode

Fixture mode is stable and does not require internet:

```bash
npm run poc:fixture
```

## Security Fixture Mode

Security fixture mode is stable and does not require internet:

```bash
npm run security:fixture
```

You can also run a small combined fixture flow. It loads the DexScreener fixture, selects the first candidate that passed the basic filter, and enriches it with fixture security data:

```bash
npm run poc:fixture:security
```

## Live Mode

Live mode uses the public DexScreener search endpoint:

```bash
npm run poc:live -- --query SOL
```

The POC uses:

```text
https://api.dexscreener.com/latest/dex/search?q=<query>
```

## Security Live Mode

Security live mode is best-effort. It tries public GoPlus and Honeypot.is endpoints without API keys:

```bash
npm run security:live -- --chain eth --address 0x...
npm run security:live -- --chain bsc --address 0x...
```

Supported shorthand chains in this POC:

- `eth`.
- `bsc`.
- `base`.
- `arbitrum`.
- `polygon`.
- `avalanche`.

If a live security source is unavailable or unsupported, the POC does not fake data. It marks that source as unavailable and returns missing fields with `NEEDS_MANUAL_VERIFICATION`.

## Tests

```bash
npm test
```

The tests use Node.js built-in `node:test` after TypeScript compilation. This keeps the POC light and avoids heavy test framework setup.

## Normalized Candidate Fields

The POC normalizes DexScreener pairs into:

- `symbol`.
- `name`.
- `chain`.
- `contract_address`.
- `pair_address`.
- `dex`.
- `source`.
- `source_url`.
- `price_usd`.
- `market_cap_usd`.
- `fdv_usd`.
- `liquidity_usd`.
- `volume_24h_usd`.
- `volume_market_cap_ratio`.
- `pair_created_at`.
- `pair_age_days`.
- `status`.
- `filter_reasons`.

## Basic Filters

Hard filters:

- Market cap or FDV fallback: $300K - $10M.
- 24h volume: minimum $30K.
- Liquidity: minimum $30K.
- Volume/MC: reject below 1%.
- Volume/MC: reject above 100%.
- Pair age: must be more than 7 days when pair age is available.

Soft notes:

- If market cap is missing and FDV is used, add `market_cap_missing_using_fdv`.
- Pair age preferred range is 14-90 days, but outside that range is only a soft note.
- Volume/MC sweet spot is 5%-30%, but outside that range is only a soft note.

## Output Shape

The runner prints:

```json
{
  "source": "dexscreener",
  "mode": "fixture",
  "query": "fixture",
  "generated_at": "2026-06-18T00:00:00.000Z",
  "total_raw": 1,
  "total_passed": 1,
  "total_rejected": 0,
  "candidates": []
}
```

## Security Output Shape

The security runner prints:

```json
{
  "source": "security-poc",
  "mode": "fixture",
  "generated_at": "2026-06-18T00:00:00.000Z",
  "candidate": {
    "symbol": "PASS",
    "chain": "eth",
    "contract_address": "0x..."
  },
  "security": {
    "sources": ["goplus", "honeypot"],
    "honeypot_status": "passed",
    "buy_tax": 3,
    "sell_tax": 4,
    "contract_verified": true,
    "ownership_status": "renounced",
    "liquidity_locked": true,
    "liquidity_lock_days": 120,
    "mint_risk": false,
    "blacklist_risk": false,
    "whitelist_risk": false,
    "sell_restriction_risk": false,
    "proxy_risk": false,
    "top_wallet_pct": 8.5,
    "top_10_wallets_pct": 34.2,
    "risk_flags": [],
    "missing_data": [],
    "raw_sources_available": {
      "goplus": true,
      "honeypot": true
    }
  },
  "decision": {
    "security_label": "SECURITY_PASSED",
    "critical_reasons": [],
    "warning_reasons": []
  }
}
```

## Security Rules

`CRITICAL_RISK` if:

- Honeypot failed.
- Buy tax >10%.
- Sell tax >10%.
- Contract is not verified.
- Liquidity is unlocked when data is available.
- Top wallet >30%.
- Top 10 wallets >60%.
- Mint risk is true.
- Blacklist risk is true.
- Sell restriction risk is true.

`NEEDS_MANUAL_VERIFICATION` if:

- One source is missing.
- Ownership is unknown.
- Liquidity lock is missing.
- Top wallet data is missing.
- Proxy risk is true.
- Whitelist risk is true.
- Security data is inconsistent between sources.

## What This POC Does Not Do

- No production GoPlus integration.
- No production Honeypot.is integration.
- No CoinGecko.
- No Fear & Greed.
- No database.
- No UI.
- No `.env` or secrets.
- No production cron scripts.
- No AI calls.
- No trading signals.

For the Security Enrichment POC, GoPlus and Honeypot.is are included only as fixture-first and live best-effort checks. There is still no database, UI, cron, AI, or production scanner.
