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

## First Code POC Scope

The first code POC is intentionally smaller than the full Camp BETA flow.

It includes only:

- DexScreener public search endpoint.
- Fixture mode with local sample data.
- Candidate normalization.
- Basic filters.
- Standardized JSON output.

It does not include:

- GoPlus.
- Honeypot.is.
- CoinGecko.
- Fear & Greed.
- AIKINTEL Market News mapping.
- Database writes.
- UI.
- Production cron.
- AI calls.

## Second Code POC: Security Enrichment

The second code POC extends `tools/data-poc` with controlled security enrichment.

It checks:

- GoPlus Security fixture/live best-effort.
- Honeypot.is fixture/live best-effort.
- Honeypot status.
- Buy/sell tax.
- Contract verification when available.
- Ownership status when available.
- Liquidity lock when available.
- Mint, blacklist, whitelist, sell restriction, proxy risks when available.
- Top wallet and top 10 wallet concentration only when data exists.

It outputs:

- `SECURITY_PASSED`.
- `NEEDS_MANUAL_VERIFICATION`.
- `CRITICAL_RISK`.

Important rule: the POC must not invent missing security data. Missing holder, liquidity lock, ownership, or source data must be represented in `missing_data` and normally lead to `NEEDS_MANUAL_VERIFICATION`.

Still excluded:

- Database writes.
- UI.
- Production cron.
- OpenAI calls.
- CoinGecko.
- Fear & Greed.
- AIKINTEL Market News.

## Third Code POC: Combined Scanner

The third code POC connects the first two controlled POCs into one mini-flow:

1. DexScreener discovery.
2. Candidate normalization.
3. Basic market/liquidity filters.
4. Limited selection of candidates that passed the basic filter.
5. GoPlus/Honeypot security enrichment.
6. Final scanner label.
7. JSON output for Camp BETA review.

Commands:

```bash
npm run scanner:fixture
npm run scanner:live -- --query SOL --max-candidates 3
```

Final labels:

- `REJECT`: failed basic filters.
- `WATCHLIST`: eligible for further review after basic and security checks.
- `CRITICAL_RISK`: critical security risk detected.
- `NEEDS_MANUAL_VERIFICATION`: missing, incomplete, inconsistent, or warning-level security data.

`WATCHLIST` is not a buy signal and not a recommendation. It only means the token/topic may be worth further research by the trader.

Live mode is best-effort and limited to `maxCandidates = 3` by default. It must not become mass scanning, production cron, retry storm, or unbounded parallel security checking.

Known asset caution: the security rules are designed mainly for new tokens and microcaps. Large known assets, stablecoins, wrapped assets, or contracts with special structures may require contextual interpretation. This POC documents that limitation only; it does not add a whitelist or known assets list.

## Fourth Code POC: Persistable Scanner Output

The fourth code POC prepares Combined Scanner output for later database storage without connecting to a database.

It creates a storage-ready structure for future tables:

- `crypto_token_scan_runs`.
- `crypto_token_candidates`.
- `crypto_token_security_checks`.
- `crypto_token_scorecards`.

Commands:

```bash
npm run scanner:persist:fixture
npm run scanner:persist:live -- --query SOL --max-candidates 3
```

Generated local files:

- `scan_run.json`.
- `candidates.jsonl`.
- `security_checks.jsonl`.
- `scorecards.jsonl`.
- `full_output.json`.

Files are written under `tools/data-poc/output/<run_id>/`, and that output directory is ignored by git.

This remains a POC. It does not add MySQL, SQLite, Drizzle, migrations, auth, production cron, or production persistence.

Scorecards are partial in this POC. The individual score fields remain `null`, while `decision_label` mirrors the Combined Scanner final label and `risk_level` is mapped from that label.

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
