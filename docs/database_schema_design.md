# Database Schema Design

## Purpose

This document defines the database design for Crypto Edge AI.

Crypto Edge AI is the main crypto trading intelligence module. The tables below provide its market intelligence backing layer and support later AIKINTEL integration.

This is a design document only. It does not implement migrations or production code.

## Owner Decisions Reflected

- Work continues in `pawelkrynicki/crypto-edge-ai` first.
- Later AIKINTEL integration is possible after the module is working.
- Existing AIKINTEL auth/users should be used if integrated.
- AIKINTEL Market News / Crypto should be reused or mapped where possible.
- Migration style remains open until main AIKINTEL repo access is confirmed.

## AIKINTEL-Compatible Database Standards

Use these conventions for later compatibility:

- Table names: snake_case, plural.
- Column names: snake_case.
- Primary key: `id INT AUTO_INCREMENT PRIMARY KEY`.
- Default charset: `utf8mb4`.
- Timestamps:
  - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`.
  - `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` where rows are updated.
- AI output: `ai_analysis JSON`.
- Deduplication: `hash VARCHAR(64) UNIQUE` where content can be collected repeatedly.
- Scores: `TINYINT` for 0-100 values.

## Camp v1 Table Priority

Must-have for Camp v1:

- `crypto_projects`.
- `crypto_scam_alerts`.
- `crypto_opportunities`.
- `crypto_market_summaries`.
- `crypto_research_reviews`.
- `crypto_token_candidates`.
- `crypto_token_security_checks`.
- `crypto_token_scorecards`.
- `crypto_token_scan_runs`.

Optional / later:

- `crypto_onchain_metrics`.
- `crypto_user_watchlist`.
- `crypto_user_insights`.
- `crypto_setup_reviews`.

Do not create a duplicate general crypto news table until the existing AIKINTEL Market News / Crypto schema is confirmed.

## Shared AI Analysis JSON Pattern

Tables with `ai_analysis` should use this shape:

```json
{
  "model": "gpt-4o",
  "analyzed_at": "2026-06-16T12:00:00Z",
  "summary": "Brief 1-2 sentence summary",
  "key_points": ["point1", "point2", "point3"],
  "sentiment": "bullish|bearish|neutral",
  "confidence": 75,
  "risk_factors": ["factor1", "factor2"],
  "recommendation": "Short research-support recommendation",
  "raw_prompt_tokens": 1500,
  "raw_completion_tokens": 800
}
```

The `recommendation` field is research guidance only. It must not contain buy/sell instructions, guaranteed profit language, or financial advice.

## Must-Have Tables

## `crypto_research_reviews`

Purpose: stores manual Research Review submissions and AI/risk/checklist outputs.

Columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
user_id INT NULL
input_type ENUM('news', 'link', 'token_description', 'market_event', 'observation', 'narrative', 'contract_address', 'ticker', 'screenshot_text') NOT NULL
title VARCHAR(500) NOT NULL
description TEXT
source_url VARCHAR(1024)
symbol VARCHAR(20)
contract_address VARCHAR(100)
category ENUM('news_event', 'token_review', 'narrative', 'risk_alert', 'market_observation', 'setup_review', 'low_value_noise', 'scam_suspicious')
score TINYINT
bias ENUM('bullish', 'bearish', 'neutral')
confidence TINYINT
risk_level ENUM('low', 'medium', 'high', 'critical')
risk_factors JSON
checklist JSON
decision_label ENUM('REJECT', 'WATCHLIST', 'HIGH_CONVICTION_REVIEW', 'CRITICAL_RISK', 'NOT_ELIGIBLE_FOR_REVIEW')
ai_analysis JSON
status ENUM('new', 'to_review', 'watching', 'rejected', 'played', 'archived') DEFAULT 'new'
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

Indexes:

- `idx_user (user_id)`.
- `idx_symbol (symbol)`.
- `idx_category (category)`.
- `idx_decision (decision_label)`.
- `idx_status (status)`.
- `idx_created (created_at)`.

Camp BETA priority: must-have for Research Review.

Future extension notes: map to AIKINTEL Market News / Crypto when source records are available.

## `crypto_projects`

Purpose: core registry for crypto projects and tokens shown in Crypto Edge AI.

Columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
symbol VARCHAR(20) NOT NULL
name VARCHAR(200) NOT NULL
category VARCHAR(100)
chain VARCHAR(100)
contract_address VARCHAR(100)
website_url VARCHAR(500)
twitter_handle VARCHAR(100)
market_cap_usd DECIMAL(20,2)
fdv_usd DECIMAL(20,2)
circulating_supply DECIMAL(20,2)
total_supply DECIMAL(20,2)
launch_date DATE
description TEXT
ai_evaluation JSON
ai_analysis JSON
risk_score TINYINT
opportunity_score TINYINT
last_evaluated_at TIMESTAMP NULL
hash VARCHAR(64) UNIQUE
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

Indexes:

- `idx_symbol (symbol)`.
- `idx_category (category)`.
- `idx_chain (chain)`.
- `idx_risk (risk_score)`.
- `idx_opportunity (opportunity_score)`.
- `idx_market_cap (market_cap_usd)`.
- unique `hash`.

Deduplication: use stable project identity fields, preferably symbol, name, chain, contract address, and source identifier.

AI fields: `ai_evaluation`, `ai_analysis`, `risk_score`, `opportunity_score`, `last_evaluated_at`.

Camp v1 priority: must-have.

Future extension notes: link to AIKINTEL news records when the Market News schema is confirmed.

## `crypto_token_candidates`

Purpose: stores New Token Scanner discovery candidates from DexScreener and later sources.

Columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
symbol VARCHAR(20)
name VARCHAR(200)
chain VARCHAR(100)
contract_address VARCHAR(100)
pair_address VARCHAR(100)
dex VARCHAR(100)
source VARCHAR(100)
source_url VARCHAR(1024)
price_usd DECIMAL(20,10)
market_cap_usd DECIMAL(20,2)
fdv_usd DECIMAL(20,2)
liquidity_usd DECIMAL(20,2)
volume_24h_usd DECIMAL(20,2)
volume_market_cap_ratio DECIMAL(10,4)
pair_created_at TIMESTAMP NULL
token_age_days INT NULL
status ENUM('new', 'rejected', 'watchlist', 'high_conviction_review', 'critical_risk', 'archived') DEFAULT 'new'
hash VARCHAR(64) UNIQUE
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

Indexes:

- `idx_symbol (symbol)`.
- `idx_chain (chain)`.
- `idx_contract (contract_address)`.
- `idx_status (status)`.
- `idx_market_cap (market_cap_usd)`.
- `idx_liquidity (liquidity_usd)`.
- `idx_volume (volume_24h_usd)`.
- unique `hash`.

Camp BETA priority: must-have for New Token Scanner.

## `crypto_token_security_checks`

Purpose: stores security check results for token candidates.

Columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
candidate_id INT NOT NULL
source VARCHAR(100) NOT NULL
honeypot_status ENUM('unknown', 'passed', 'failed')
buy_tax DECIMAL(8,4)
sell_tax DECIMAL(8,4)
contract_verified BOOLEAN
ownership_status VARCHAR(100)
liquidity_locked BOOLEAN
liquidity_lock_days INT
top_wallet_pct DECIMAL(8,4)
top_10_wallets_pct DECIMAL(8,4)
risk_flags JSON
raw_response JSON
checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

Indexes:

- `idx_candidate (candidate_id)`.
- `idx_source (source)`.
- `idx_checked (checked_at)`.

Camp BETA priority: must-have for GoPlus/Honeypot checks.

## `crypto_token_scorecards`

Purpose: stores New Token Scanner scorecard outputs.

Columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
candidate_id INT NOT NULL
security_score TINYINT
onchain_score TINYINT
social_score TINYINT
narrative_score TINYINT
total_score TINYINT
decision_label ENUM('REJECT', 'WATCHLIST', 'HIGH_CONVICTION_REVIEW', 'CRITICAL_RISK', 'NOT_ELIGIBLE_FOR_REVIEW') NOT NULL
risk_level ENUM('low', 'medium', 'high', 'critical')
confidence TINYINT
checklist JSON
ai_analysis JSON
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

Indexes:

- `idx_candidate (candidate_id)`.
- `idx_total_score (total_score)`.
- `idx_decision (decision_label)`.
- `idx_risk (risk_level)`.

Camp BETA priority: must-have.

## `crypto_token_scan_runs`

Purpose: tracks controlled scanner runs and their outcomes.

Columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
source VARCHAR(100) NOT NULL
filters JSON
started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
finished_at TIMESTAMP NULL
candidates_found INT DEFAULT 0
candidates_rejected INT DEFAULT 0
candidates_watchlist INT DEFAULT 0
errors JSON
```

Indexes:

- `idx_source (source)`.
- `idx_started (started_at)`.

Camp BETA priority: must-have for controlled scanner observability.

## `crypto_scam_alerts`

Purpose: scam, exploit, honeypot, rug-pull, fake-team, pump-dump, contract-risk, and other warning alerts.

Columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
project_symbol VARCHAR(20)
project_name VARCHAR(200)
alert_type ENUM('rug_pull', 'honeypot', 'pump_dump', 'fake_team', 'contract_risk', 'phishing', 'exploit', 'other') NOT NULL
severity ENUM('low', 'medium', 'high', 'critical') NOT NULL
title VARCHAR(500) NOT NULL
description TEXT
evidence_urls JSON
source VARCHAR(100)
ai_analysis JSON
is_confirmed BOOLEAN DEFAULT FALSE
hash VARCHAR(64) UNIQUE
published_at TIMESTAMP NOT NULL
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

Indexes:

- `idx_type (alert_type)`.
- `idx_severity (severity)`.
- `idx_symbol (project_symbol)`.
- `idx_published (published_at)`.
- unique `hash`.

Deduplication: source, project symbol, alert type, normalized title, and published date.

AI fields: `ai_analysis` with risk-first summary, key points, confidence, and research-only recommendation.

Camp v1 priority: must-have.

Future extension notes: add relation to project IDs and Market News IDs only after the AIKINTEL schema is confirmed.

## `crypto_opportunities`

Purpose: opportunities, narratives, airdrops, IDOs, staking/yield ideas, technical catalysts, and research-worthy themes.

Columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
project_symbol VARCHAR(20)
project_name VARCHAR(200)
opportunity_type ENUM('airdrop', 'ido', 'staking', 'yield', 'narrative', 'technical', 'fundamental_event', 'other') NOT NULL
title VARCHAR(500) NOT NULL
description TEXT
potential_return VARCHAR(100)
risk_level ENUM('low', 'medium', 'high', 'critical') NOT NULL
deadline TIMESTAMP NULL
source_url VARCHAR(1024)
ai_analysis JSON
confidence_score TINYINT
status ENUM('active', 'expired', 'completed') DEFAULT 'active'
hash VARCHAR(64) UNIQUE
published_at TIMESTAMP NOT NULL
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

Indexes:

- `idx_type (opportunity_type)`.
- `idx_status (status)`.
- `idx_confidence (confidence_score)`.
- `idx_symbol (project_symbol)`.
- `idx_deadline (deadline)`.
- `idx_published (published_at)`.
- unique `hash`.

Deduplication: source URL or source, project symbol, opportunity type, and normalized title.

AI fields: `ai_analysis`, `confidence_score`, `risk_level`.

Camp v1 priority: must-have.

Future extension notes: connect opportunities to existing news/catalysts if AIKINTEL data access allows it.

## `crypto_market_summaries`

Purpose: market context backing the Crypto Edge AI dashboard and setup review.

Columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
summary_date DATE NOT NULL
timeframe ENUM('daily', 'weekly') NOT NULL
market_sentiment ENUM('extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed') NOT NULL
fear_greed_index TINYINT
btc_dominance DECIMAL(5,2)
total_market_cap_usd DECIMAL(20,2)
top_gainers JSON
top_losers JSON
trending_narratives JSON
ai_summary TEXT
ai_analysis JSON
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

Indexes:

- unique `idx_date_tf (summary_date, timeframe)`.
- `idx_sentiment (market_sentiment)`.
- `idx_created (created_at)`.

Deduplication: unique date/timeframe pair.

AI fields: `ai_summary`, `ai_analysis`, `fear_greed_index`.

Camp v1 priority: must-have.

Future extension notes: include AIKINTEL Market News aggregate signals if available.

## Optional / Later Tables

## `crypto_onchain_metrics`

Purpose: daily on-chain metric snapshots for symbols/tokens.

Camp v1 priority: optional.

Key columns: `symbol`, `metric_date`, `active_addresses`, `transaction_count`, `tvl_usd`, `volume_24h_usd`, `whale_transactions`, `exchange_inflow`, `exchange_outflow`, `net_flow`, `source`, `created_at`.

Indexes: unique `(symbol, metric_date)`, plus `symbol` and `metric_date`.

Future extension notes: add after source approval and legal/API access review.

## `crypto_user_watchlist`

Purpose: private user watchlist entries if user-specific tracking is needed.

Camp v1 priority: later unless approved.

Must use existing AIKINTEL users/auth when integrated.

## `crypto_user_insights`

Purpose: user-specific research notes, observations, and personal AI-assisted insights.

Camp v1 priority: later.

Requires privacy and ownership review.

## `crypto_setup_reviews`

Purpose: persisted setup-review outputs from Crypto Edge AI.

Camp v1 priority: later as storage. For Camp v1, `setupReviewMock` can remain non-persistent.

Future extension notes: add only after AI usage limits, cost controls, and user ownership rules are confirmed.

## Fourth Code POC: Persistable Scanner Output Mapping

The Persistable Scanner Output POC does not create tables, migrations, or database connections. It creates local JSON/JSONL files that mirror the intended database boundaries.

Generated files:

- `scan_run.json` maps to `crypto_token_scan_runs`.
- `candidates.jsonl` maps to `crypto_token_candidates`.
- `security_checks.jsonl` maps to `crypto_token_security_checks`.
- `scorecards.jsonl` maps to `crypto_token_scorecards`.
- `full_output.json` keeps the full nested storage-ready object for inspection.

Local output path:

```text
tools/data-poc/output/<run_id>/
```

The output directory is ignored by git.

POC field mapping notes:

- `run_id` is generated as a stable string from the scan timestamp.
- `candidate_id` is a deterministic SHA-256 hash of `chain`, `contract_address`, `pair_address`, and `source`.
- Rejected candidates without security data do not produce `security_checks` rows.
- Every candidate produces one partial `scorecards` row.
- Score fields are intentionally `null` until the full scorecard model is implemented.
- `decision_label` mirrors Combined Scanner `final_label`.
- `risk_level` maps as `CRITICAL_RISK -> critical`, `NEEDS_MANUAL_VERIFICATION -> medium`, `WATCHLIST -> low`, and `REJECT -> high`.

## Fifth Code POC: Storage Output Validation

The Storage Output Validation POC checks storage-ready JSON/JSONL before it can later be imported into database tables.

Validation covers:

- Required `crypto_token_scan_runs`-style fields in `scan_run.json`.
- Required `crypto_token_candidates`-style fields in `candidates.jsonl`.
- `crypto_token_security_checks` candidate references.
- `crypto_token_scorecards` candidate references.
- Exactly one scorecard per candidate.
- Allowed values for `basic_filter_status`, `final_label`, `decision_label`, `security_label`, and `risk_level`.
- JSONL parse errors.
- Consistency between candidate final labels and scorecard decision/risk fields.

This POC does not create tables or import rows. It is a pre-import quality gate so future DB work does not start from malformed output files.

## Sixth Code POC: DB Import Dry Run

The DB Import Dry Run POC proposes how validated scanner files would map to future database operations.

Future table plan:

- `crypto_token_scan_runs`: `upsert`, key `run_id`, conflict policy `skip_if_exists`.
- `crypto_token_candidates`: `upsert`, key `candidate_id`, conflict policy `update_existing_for_same_candidate_id`.
- `crypto_token_security_checks`: `insert`, key `run_id + candidate_id`, conflict policy `skip_duplicate_run_candidate`.
- `crypto_token_scorecards`: `insert`, key `run_id + candidate_id`, conflict policy `replace_for_same_run_candidate`.

Readiness checks:

- Storage validation must pass.
- A scan run must exist.
- Candidate count must be greater than zero.
- Scorecard count must equal candidate count.
- Candidate IDs must be unique.
- Security checks and scorecards must reference existing candidates.

Idempotency strategy:

- Re-running the same output should not duplicate the scan run.
- Candidates can be upserted by stable `candidate_id`.
- Security checks can skip duplicate `run_id + candidate_id`.
- Scorecards can be replaced for the same `run_id + candidate_id`.

This is still only a dry-run proposal. It does not create migrations, tables, DB clients, or production import code.
