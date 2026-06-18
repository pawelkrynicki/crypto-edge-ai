# Crypto Edge AI Data POC

## Purpose

This is a small Data Integration POC for Crypto Edge AI Camp BETA.

It checks whether we can fetch or load DexScreener pair data, normalize it into a Crypto Edge AI token candidate model, apply basic filters, and output standardized JSON.

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

## Live Mode

Live mode uses the public DexScreener search endpoint:

```bash
npm run poc:live -- --query SOL
```

The POC uses:

```text
https://api.dexscreener.com/latest/dex/search?q=<query>
```

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

## What This POC Does Not Do

- No GoPlus.
- No Honeypot.is.
- No CoinGecko.
- No Fear & Greed.
- No database.
- No UI.
- No `.env` or secrets.
- No production cron scripts.
- No AI calls.
- No trading signals.
