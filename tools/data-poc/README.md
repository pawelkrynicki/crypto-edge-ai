# Crypto Edge AI Data POC

## 12R.5 Discovery Closure

Discovery jest zamknięte dla CAMP na dwóch koszykach. `new_emerging` używa latest profiles i jest zawsze `observation_only=true`; `established` używa owner-maintained `config/established_address_universe_v1.json` oraz exact chain+contract identity. Address collector obsługuje base/quote orientation, wybiera najwyższą poprawną liquidity, uruchamia niezmienione filtry i dopiero potem GoPlus. Nie ma automatycznego transferu z latest profiles do universe.

Offline universe workflow:

```powershell
npm run universe:validate
npm run universe:list
```

Commitowany config ma 0 aktywnych entries. To poprawny `ESTABLISHED_UNIVERSE_EMPTY`: new/emerging nadal działa, snapshot jest fixture-free, a API pokazuje empty-configured zamiast udawać listę kandydatów. Symbol query plan jest `NO_GO_QUERY_PLAN`; jedyna zachowana komenda ma nazwę `npm run discovery:archived-query-plan:diagnostic` i nie jest częścią collectora.

Kontrolowany technical probe wymaga lokalnego, niecommitowanego pliku z dokładnie dwoma enabled entries oraz trzech flag `INTERNAL_BETA`:

```powershell
npm run discovery:closure:probe -- --file <local-probe-universe.json>
```

Probe wywołuje wyłącznie DexScreener dla dwóch adresów i dokładnie jeden GoPlus connectivity check, niczego nie publikuje i nie zapisuje raw payloadów. **DISCOVERY CLOSED FOR CAMP 2026.** Następny etap: **Product Radar Build & Owner Acceptance**.

## 12R.5A Discovery and Filter Calibration

Offline calibration reads an existing normalized snapshot, never modifies it, makes zero provider calls and prints JSON:

```powershell
npm run filters:calibrate -- --snapshot output/scan_20260717201111_bfd5fb1d/full_output.json
```

The report separates hard/soft reasons, summarizes missing fields and metric distributions, and evaluates versioned diagnostic variants A–E. `filter_calibration_12r5a_v1` is diagnostic only; the active production profile remains `dexscreener_basic_filters_v1`.

The bounded discovery-only command requires the same three explicit `INTERNAL_BETA` flags as the collector. It invokes only DexScreener, performs no security/context calls, stores no raw payloads and has no publish path:

```powershell
$env:CRYPTO_EDGE_DATA_ENV = "INTERNAL_BETA"
$env:CRYPTO_EDGE_RUNTIME_MODE = "INTERNAL_BETA"
$env:ALLOW_LIVE_PROVIDER_CALLS = "1"
npm run discovery:diagnostic -- --seed-limit 30
```

The one authorized 18.07.2026 run loaded 30 profiles, 54 pairs and 20 normalized candidates; baseline and A–E returned 0. All 20 failed the baseline age gate. DexScreener made 34 requests including 3 retries; all security/context counts were 0. No snapshot was stored or published.

The versioned `established_basket_v1` diagnostic uses only the owner-approved plan in `config/established_discovery_query_plan_v1.json` and the official DexScreener search API:

```powershell
$env:CRYPTO_EDGE_DATA_ENV = "INTERNAL_BETA"
$env:CRYPTO_EDGE_RUNTIME_MODE = "INTERNAL_BETA"
$env:ALLOW_LIVE_PROVIDER_CALLS = "1"
npm run discovery:archived-query-plan:diagnostic
```

The command rejects arguments and unknown/additional queries, exits before fetch without all three flags, caps concurrency at 3, uses a 10-second timeout and at most one retry, prints only normalized diagnostics, and has no raw-storage or publish path. The single authorized 18.07.2026 run returned 120 raw pairs, 57 exact anchor matches, 1 unique candidate and 0 baseline passes; verdict: `NO_GO_QUERY_PLAN`. `USDT` failed after one retry and the run was not repeated. The established search direction is not connected to the production collector. Full analysis: `../../docs/established_basket_validation.md`.

## 12R.4 Canonical INTERNAL_BETA Collector

The canonical collector is manual, local-only and fail-closed:

```powershell
$env:CRYPTO_EDGE_DATA_ENV = "INTERNAL_BETA"
$env:CRYPTO_EDGE_RUNTIME_MODE = "INTERNAL_BETA"
$env:ALLOW_LIVE_PROVIDER_CALLS = "1"
npm run collect:internal-beta -- --seed-limit 10 --security-limit 3
```

Without all three flags it exits before the first fetch. It prints only run/source health, request/candidate counts, repo-relative paths, security coverage and manifest summary.

Discovery uses DexScreener latest token profiles and bounded per-token pairs, selects highest valid liquidity, deduplicates and runs existing basic filters before GoPlus. Defaults/hard limits: 20/30 seeds and 10/20 security candidates. Request budgets default/hard: DexScreener 26/36, GoPlus 13/23, Alternative.me 2/2 and DefiLlama 2/2. Network defaults are timeout 10 s, concurrency 3 and at most one retry. The canonical collector applies Node `dns.setDefaultResultOrder("ipv4first")` before constructing clients, so local Windows execution and the later Linux VPS scheduler use the same IPv4-first bootstrap.

GoPlus is the only active automated security source. EVM uses an explicit allowlist; Solana uses its separate endpoint and optional `GOPLUS_API_TOKEN`. Unavailable data retains the candidate and reports `SECURITY DATA UNAVAILABLE`. Attribution is `provider: GoPlus Security`.

Honeypot.is is blocked from `INTERNAL_BETA` automated fetch/storage/display by the Third-Party Restriction. Its legacy fixture/demo/LOCAL_POC client supports only Ethereum, BSC and Base and is never called by this collector.

Alternative.me uses `limit=1` and source timestamps; DefiLlama uses only free `api.llama.fi`. Scanner/context outputs are normalized, attributed, fixture-free and atomically published. Raw responses, unknown fields, host paths and scorecards are not published.

Offline validation (zero network calls): `npm run snapshot:validate:latest`.

Latest controlled gate (17.07.2026): the full offline RC passed with 123 Data PoC tests and 34 fail-closed boundary tests. The one authorized limited live smoke then passed as run `scan_20260717201111_bfd5fb1d`: 10 seeds, 13 pairs, 7 candidates before filters and 0 after filters. Request counts were `13/0/1/1` for DexScreener/GoPlus/Alternative.me/DefiLlama. Security was `NOT_INVOKED` because no candidate passed the basic filters, and Honeypot.is made zero calls. The fixture-free normalized scanner/context snapshots passed offline validation; local `/api/readiness` returned HTTP 200 with both datasets ready.

Published outputs: `output/scan_20260717201111_bfd5fb1d/full_output.json` and `output/approved_sources_20260717201111_71b5ca78/approved_sources_output.json`. Scanner provenance declares `source_ids=[dexscreener]`; context provenance declares `source_ids=[alternative_me_fng, defillama_api]`; every published source declares `raw_storage=denied`.

No scheduler, retention, VPS/public deployment, scraping, paid sources, AI KINTEL, scoring or `final_label` changes are included. `WATCHLIST` remains Manual Review Only. The superseding next stage is **Product Radar Build & Owner Acceptance**.

## Purpose

This is a small Data Integration POC for Crypto Edge AI Camp BETA.

It checks whether we can fetch or load DexScreener pair data, normalize it into a Crypto Edge AI token candidate model, apply basic filters, and output standardized JSON.

It also includes a second POC: Security Enrichment. This checks whether a normalized candidate can be enriched with GoPlus Security and Honeypot.is style data, then classified as `SECURITY_PASSED`, `NEEDS_MANUAL_VERIFICATION`, or `CRITICAL_RISK`.

It also includes a third POC: Combined Scanner. This connects DexScreener discovery, basic filters, limited security enrichment, final scanner labels, and standardized JSON output for Camp BETA.

It also includes a fourth POC: Persistable Scanner Output. This converts Combined Scanner JSON into a storage-ready model and writes local JSON/JSONL files for later database mapping.

It also includes an approved free source adapter framework. This normalizes Alternative.me Fear & Greed and DefiLlama API output into a small context JSON file for later API/UI exposure.

This is not the product. It does not include UI, database, migrations, auth, production cron scripts, AI calls, exchange integration, MT4, Telegram/Discord, payments, or auto-trading.

## 12R.3 Provenance Contract

Persistable scanner and approved context generators now attach a versioned `provenance` manifest. The manifest contains:

- dataset `schema_version`;
- `contract_version=real_data_boundary_v1`;
- generator version;
- environment and mode;
- `fixture_used`;
- `run_id`, `generated_at`, and `finished_at`;
- source IDs;
- per-source decisions for `live_fetch`, `normalized_storage`, `user_display`, and `raw_storage`.

Scanner uses `scanner_snapshot_v1` / `data_poc_persistable_scanner_v1`. Approved context uses `context_snapshot_v1` / `approved_sources_poc_v1`.

Fixture commands produce an explicit `DEVELOPMENT_DEMO`, `mode=fixture`, `fixture_used=true` manifest. Those artifacts remain valid for tests/demo but are rejected by the `INTERNAL_BETA` reader. A future live run is not display-eligible merely because it has `mode=live`: its manifest must say `INTERNAL_BETA`, contain no fixture marker, have all required policy decisions, and agree with checked-in runtime policy.

12R.3 updates registry/runtime policy for the accepted `INTERNAL_BETA` source actions but does not activate collectors or execute provider calls. `PUBLIC_BETA` remains blocked for DexScreener, GoPlus and Honeypot.is; raw storage remains denied everywhere.

Offline validation:

```powershell
pnpm run test
pnpm run typecheck
pnpm run sources:approved:fixture
pnpm run scanner:persist:fixture
```

Do not run `sources:approved:live`, `scanner:live`, `security:live` or the strict live-source helper as part of 12R.3. `scripts\win\check-data-poc.cmd` skips live calls by default and requires a separate explicit `CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=1` opt-in outside this stage.

The consumer contract and reason codes are documented in `../../docs/real_data_api_contract.md`. The next stage is 12R.4 — Approved Live Collectors & Normalized Snapshot.

## Install

```bash
npm install
```

## Windows Helper Scripts

Windows CMD helpers for running the data POC checks and generating approved live context are documented in `../../scripts/win/README.md`.

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

## Approved Free Source Adapter Framework

The approved source framework lives in `src/sources/`.

Current adapters:

- `alternative_me_fng`: Alternative.me Fear & Greed Index.
- `defillama_api`: DefiLlama `/protocols` API.

These are the only Camp BETA approved free live adapters. Paid or pending sources are intentionally not implemented here.

Planned paid or clarification-dependent candidates remain later work:

- CoinGecko Analyst as the first paid market/onchain candidate.
- TokenSniffer as the first paid security pilot candidate.
- Tokenomist as the unlock/vesting candidate.
- GoPlus only after written commercial-use clarification.
- Bubblemaps/Arkham only after sales and pricing clarification.

Adapter contract:

```ts
type SourceAdapter = {
  sourceId: string;
  displayName: string;
  supportedActions: SourceAction[];
  fetchFixture(): Promise<NormalizedSourceOutput>;
  fetchLive(options: { environment?: string }): Promise<NormalizedSourceOutput>;
}
```

Normalized output:

```ts
type NormalizedSourceOutput = {
  source_id: string;
  source_name: string;
  mode: "fixture" | "live";
  fetched_at: string;
  health_status?: "degraded_external_source" | "error";
  policy: {
    environment: string;
    action: string;
    allowed: boolean;
    reason: string;
  };
  data_category: "sentiment" | "defi_context" | "market_context";
  records: NormalizedSourceRecord[];
  warnings: string[];
  errors: string[];
}
```

Fixture mode:

```powershell
pnpm run sources:approved:fixture
```

Fixture mode loads only local files from `fixtures/`. It does not need internet and does not require `live_fetch` permission.

Live mode:

```powershell
$env:CRYPTO_EDGE_DATA_ENV = "PUBLIC_BETA"
pnpm run sources:approved:live
```

Live mode calls the runtime policy gate before network access:

```ts
assertSourceActionAllowed({
  sourceId,
  environment,
  action: "live_fetch"
})
```

If the policy denies a source, the adapter must not call the network and must not fall back to scraping.

Allowed live endpoints in this POC:

- `https://api.alternative.me/fng/`
- `https://api.llama.fi/protocols`

The DefiLlama adapter caps live protocol context to 10 normalized records so the output stays lightweight.

Approved source output is written to:

```text
tools/data-poc/output/<run_id>/approved_sources_output.json
```

The output directory is ignored by git. The file contains:

```ts
{
  run_id,
  generated_at,
  environment,
  sources,
  summary: {
    sources_requested,
    sources_allowed,
    sources_denied,
    records_total,
    warnings_total,
    errors_total,
    degraded_external_sources_total,
    hard_failures_total
  }
}
```

Raw provider responses are not stored in this output.

For local MVP/RC checks, a transient fetch failure from an allowed `PUBLIC_BETA` live source is reported as `EXTERNAL SOURCE DEGRADED` with `health_status: "degraded_external_source"`. The original error remains in `errors`, the warning includes `degraded_external_source`, and the source must not be treated as verified, healthy, or OK.

Strict live-source validation can be run with:

```powershell
$env:CRYPTO_EDGE_DATA_ENV = "PUBLIC_BETA"
$env:STRICT_LIVE_SOURCES = "1"
pnpm run sources:approved:live
```

On Windows, use:

```cmd
scripts\win\check-live-sources-strict.cmd
```

Policy denial, unknown sources, unauthorized activation, forbidden provider calls, adapter/application errors, scraping fallback attempts, and raw-storage violations remain hard failures.

Future API bridge target:

```text
GET /api/context/latest
```

That endpoint is implemented in `tools/ui-mock/server` as a local read-only bridge. It reads the latest valid `tools/data-poc/output/<run_id>/approved_sources_output.json`, returns only normalized approved-source records, and falls back to `tools/ui-mock/public/fixtures/contextLatestFixture.json` when no valid output exists.

The endpoint does not live-fetch, does not call Alternative.me or DefiLlama directly, does not scrape, and does not expose raw provider responses. A future UI context panel can consume this endpoint later.

## How to Add a New Data Source Safely

- Add or confirm the registry entry.
- Add runtime policy permissions for the required actions and environments.
- Record the official docs URL.
- Record the terms URL.
- Add a small stable fixture.
- Add one adapter.
- Add one normalizer.
- Add tests for policy, fixture mode, live URL, and normalized shape.
- Add the UI display rule before exposing it.
- Add the attribution rule before exposing it.
- Store only normalized output, not raw provider JSON.
- Do not add scraping fallback, HTML parsing, browser automation, undocumented endpoints, or reverse-engineered endpoints.

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
