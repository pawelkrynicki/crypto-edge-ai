# Crypto Edge AI Data POC

## Purpose

This is a small Data Integration POC for Crypto Edge AI Camp BETA.

It checks whether we can fetch or load DexScreener pair data, normalize it into a Crypto Edge AI token candidate model, apply basic filters, and output standardized JSON.

It also includes a second POC: Security Enrichment. This checks whether a normalized candidate can be enriched with GoPlus Security and Honeypot.is style data, then classified as `SECURITY_PASSED`, `NEEDS_MANUAL_VERIFICATION`, or `CRITICAL_RISK`.

It also includes a third POC: Combined Scanner. This connects DexScreener discovery, basic filters, limited security enrichment, final scanner labels, and standardized JSON output for Camp BETA.

It also includes a fourth POC: Persistable Scanner Output. This converts Combined Scanner JSON into a storage-ready model and writes local JSON/JSONL files for later database mapping.

This is not the product. It does not include UI, database, migrations, auth, production cron scripts, AI calls, exchange integration, MT4, Telegram/Discord, payments, or auto-trading.

## Install

```bash
npm install
```

## Data Source Registry Enforcement

Data source authorization is fail-closed in v1.

Registry and policy files:

- Registry record: `docs/compliance/data_source_registry_v1.json`.
- Product policy: `docs/compliance/data_source_policy.md`.
- Runtime policy: `config/data_source_runtime_policy.json`.

The authoritative registry reviewed 21 sources:

- Priority A: 12.
- Priority B: 9.
- Camp BETA cleared sources: 2.

Runtime environments:

- `FIXTURE_ONLY`.
- `LOCAL_POC`.
- `INTERNAL_BETA`.
- `PUBLIC_BETA`.
- `COMMERCIAL`.

`CRYPTO_EDGE_DATA_ENV` selects the active environment. If it is missing or invalid, the scanner uses the safe default `FIXTURE_ONLY`.

Runtime actions:

- `fixture_load`.
- `live_fetch`.
- `normalized_storage`.
- `raw_storage`.
- `user_display`.
- `derived_score_display`.

Validate the registry:

```bash
pnpm run sources:validate
```

Check a policy decision:

```bash
pnpm run sources:check -- --source dexscreener --environment PUBLIC_BETA --action live_fetch
```

Enable LOCAL_POC live mode explicitly:

```powershell
$env:CRYPTO_EDGE_DATA_ENV = "LOCAL_POC"
pnpm run scanner:live -- --query SOL --max-candidates 3
```

Without `LOCAL_POC`, live DexScreener discovery is denied before any network request.

Current PUBLIC_BETA source boundary:

- Alternative.me Fear & Greed and DefiLlama are the only registry-cleared sources for Camp BETA.
- DexScreener, GoPlus Security, and Honeypot.is remain LOCAL_POC only and are not approved for PUBLIC_BETA.
- The runtime policy is intentionally stricter than the research registry.
- AIKINTEL Market News, BscScan, Etherscan, and any source absent from the runtime policy are disabled until an explicit future policy update.
- Unknown `source_id` values fail closed.
- Raw API response storage is disabled for all v1 automated sources.
- No API failure may fall back to scraping, HTML parsing, browser automation, undocumented endpoints, or invented data.

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

## Combined Scanner Fixture Mode

Combined scanner fixture mode is stable and does not require internet:

```bash
npm run scanner:fixture
```

It runs:

- DexScreener fixture loading.
- Candidate normalization.
- Basic filters.
- Fixture GoPlus/Honeypot security enrichment for candidates that passed the basic filter.
- Final scanner labels.
- JSON output.

## Live Mode

Live mode uses the DexScreener API endpoint only in `LOCAL_POC`:

```bash
npm run poc:live -- --query SOL
```

The POC uses:

```text
https://api.dexscreener.com/latest/dex/search?q=<query>
```

This source is blocked in `PUBLIC_BETA` and `COMMERCIAL` until written clarification is recorded in the registry and runtime policy.

## Security Live Mode

Security live mode is best-effort and `LOCAL_POC` only. It tries GoPlus and Honeypot.is API endpoints without API keys:

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

If a live security source is denied by policy, the POC does not call it, does not invent security values, and requires manual verification.

## Combined Scanner Live Mode

Combined scanner live mode is best-effort and intentionally limited:

```bash
npm run scanner:live -- --query SOL --max-candidates 3
```

The default and maximum safety limit is `maxCandidates = 3`. The runner does not perform mass scanning, does not retry aggressively, and does not make unbounded parallel requests.

## Persistable Scanner Output

Persistable mode prepares the Combined Scanner output for later storage, without connecting to any database:

```bash
npm run scanner:persist:fixture
npm run scanner:persist:live -- --query SOL --max-candidates 3
```

It writes files under:

```text
tools/data-poc/output/<run_id>/
```

Generated files:

- `scan_run.json`: one scan run record.
- `candidates.jsonl`: candidate rows, one JSON object per line.
- `security_checks.jsonl`: security check rows for candidates with security data.
- `scorecards.jsonl`: partial scorecard rows, one per candidate.
- `full_output.json`: full storage-ready object.

This is a storage-ready POC, not a database implementation. It does not add MySQL, SQLite, Drizzle, migrations, auth, or production persistence.

Future table mapping:

- `scan_run.json` -> `crypto_token_scan_runs`.
- `candidates.jsonl` -> `crypto_token_candidates`.
- `security_checks.jsonl` -> `crypto_token_security_checks`.
- `scorecards.jsonl` -> `crypto_token_scorecards`.

Scorecards are intentionally partial at this stage. `security_score`, `onchain_score`, `social_score`, `narrative_score`, `total_score`, and `confidence` are `null`. `decision_label` mirrors the Combined Scanner `final_label`, and `risk_level` is mapped from that label.

## Storage Output Validation

The fifth POC validates storage-ready output before any future database import:

```bash
npm run scanner:validate:fixture
npm run scanner:validate -- --output-dir tools/data-poc/output/<run_id>
```

The validator checks:

- Required `scan_run` fields.
- Candidate required fields and unique `candidate_id` values.
- Security checks referencing existing candidates.
- Scorecards referencing existing candidates.
- Exactly one scorecard per candidate.
- Allowed values for filter status, labels, security labels, and risk levels.
- Cross-checks between candidate final labels and scorecard decisions/risk levels.
- JSONL parse errors and missing split files.

`full_output.json` is useful for inspection, but missing `full_output.json` is only a warning when the split files are valid. Empty `security_checks.jsonl` is allowed with a warning because some runs may not produce security rows.

This is still not database persistence. It is a guardrail before later mapping into `crypto_token_scan_runs`, `crypto_token_candidates`, `crypto_token_security_checks`, and `crypto_token_scorecards`.

## DB Import Dry Run

The sixth POC builds a dry-run import report from validated storage-ready output:

```bash
npm run scanner:import:dry-run:fixture
npm run scanner:import:dry-run -- --output-dir tools/data-poc/output/<run_id>
npm run scanner:import:dry-run:live -- --query SOL --max-candidates 3
```

It does not connect to a database and does not write rows. It reports what would be imported later:

- `crypto_token_scan_runs`: one scan run, logical key `run_id`.
- `crypto_token_candidates`: candidate rows, logical key `candidate_id`.
- `crypto_token_security_checks`: security rows, logical key `run_id + candidate_id`.
- `crypto_token_scorecards`: scorecard rows, logical key `run_id + candidate_id`.

Proposed idempotency strategy:

- `scan_run skip_if_exists by run_id`.
- `candidate upsert by candidate_id`.
- `security_check skip duplicate run_id+candidate_id`.
- `scorecard replace by run_id+candidate_id`.

This is a dry-run proposal only. Real MySQL/Drizzle/AIKINTEL import work remains a separate future stage.

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

## Combined Scanner Output Shape

The combined scanner runner prints:

```json
{
  "source": "combined-scanner-poc",
  "mode": "fixture",
  "query": "fixture",
  "generated_at": "2026-06-18T00:00:00.000Z",
  "limits": {
    "max_candidates": 3
  },
  "summary": {
    "total_raw": 3,
    "passed_basic_filter": 2,
    "rejected_basic_filter": 1,
    "security_checked": 2,
    "security_passed": 2,
    "needs_manual_verification": 0,
    "critical_risk": 0,
    "watchlist_candidates": 2
  },
  "candidates": []
}
```

Final labels:

- `REJECT`: candidate failed the basic filters.
- `WATCHLIST`: candidate passed basic filters and security checks, and is eligible for further review.
- `CRITICAL_RISK`: candidate passed basic filters but security enrichment found a critical risk.
- `NEEDS_MANUAL_VERIFICATION`: candidate needs human review because security data is missing, incomplete, inconsistent, or warning-level.

Important: `WATCHLIST` is not a buy signal. It only means `eligible for further review`.

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
- No scraping fallback.
- No raw API response storage in v1.
- No CoinGecko.
- No Fear & Greed.
- No database.
- No UI.
- No `.env` or secrets.
- No production cron scripts.
- No AI calls.
- No trading signals.
- No database persistence.
- No production database importer.

For the Security Enrichment POC, GoPlus and Honeypot.is are included only as fixture-first and live best-effort checks. There is still no database, UI, cron, AI, or production scanner.

## Known Asset Caution

The security rules are designed mainly for new tokens and microcaps. Large known assets, stablecoins, wrapped assets, or contracts with special structures may require contextual interpretation if the POC returns `CRITICAL_RISK` or `NEEDS_MANUAL_VERIFICATION`.

Do not treat this POC as a universal token safety oracle. A future production design may add contextual asset handling, but this POC does not implement a whitelist or known assets list.
