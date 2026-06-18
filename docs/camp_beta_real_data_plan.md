# Camp BETA Real Data Plan

## Purpose

Camp BETA should be a working Crypto Edge AI tool on real data in a limited, stable pipeline.

This is still a planning document. It does not implement real fetchers, production cron scripts, migrations, auth, UI, or AI calls.

## Minimum Viable Real-Data Flow

1. DexScreener discovery.
2. GoPlus/Honeypot security check.
3. CoinGecko context.
4. Fear & Greed market sentiment.
5. AIKINTEL Market News / Crypto mapping if available.
6. Scorecard.
7. Final checklist.
8. AIKINTEL-style UI.

## Flow Details

## Step 1: DexScreener Discovery

Use DexScreener as primary source for token/pair discovery.

Initial filters:

- Market cap: $300K - $10M.
- Pair age: >7 days minimum; preferred 14-90 days.
- 24h volume: minimum $30K.
- Liquidity: minimum $30K.
- Volume/MC: 3%-80%.
- Sweet spot Volume/MC: 5%-30%.

Reject:

- Volume/MC <1%.
- Volume/MC >100%.

## Step 2: GoPlus/Honeypot Security

Priority security checks:

- GoPlus Security.
- Honeypot.is.

Evaluate:

- Honeypot status.
- Buy/sell tax.
- Contract verification.
- Ownership.
- Mint/blacklist/whitelist/sell restriction risks.
- Critical flags.

## Step 3: CoinGecko Context

Use CoinGecko for:

- Market cap context.
- FDV context.
- Price context.
- Broader token/category context when available.

## Step 4: Fear & Greed

Use Fear & Greed Index for broad market sentiment.

It should influence context and caution level, not create a trading signal.

## Step 5: AIKINTEL Market News Mapping

If accessible, map token/topic to existing AIKINTEL Market News / Crypto.

Use:

- News title.
- Sentiment.
- AI Analysis.
- Related coins/tags.
- Published date.

Do not duplicate the general news feed.

## Step 6: Scorecard

Apply:

- Security: max 30.
- On-Chain: max 25.
- Social: max 25.
- Narrative: max 20.

Decision labels:

- `REJECT`.
- `WATCHLIST`.
- `HIGH_CONVICTION_REVIEW`.
- `CRITICAL_RISK`.
- `NOT_ELIGIBLE_FOR_REVIEW`.

## Step 7: Final Checklist

Show checklist before user decision:

- Security.
- Distribution.
- Liquidity.
- Social.
- Personal risk readiness.

If critical security fails:

- `REJECT`.
- `CRITICAL_RISK`.
- `NOT_ELIGIBLE_FOR_REVIEW`.

## Step 8: UI in AIKINTEL Style

The UI should look and behave like AIKINTEL where possible:

- Dark interface.
- Dense operational layout.
- Scorecards.
- Risk badges.
- Checklist.
- Clear disclaimer.

## Camp BETA Boundaries

Do not implement:

- Trading signals.
- Auto-buy.
- Auto-sell.
- MT4.
- Exchange execution.
- Telegram/Discord integrations.
- Payments.
- Unapproved API fetchers.
- OpenAI calls without helper decision.
