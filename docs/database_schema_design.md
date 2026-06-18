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
