# Database Schema Design

## Purpose

This document defines the database design for the AIKINTEL Crypto Market Module and the future Crypto Edge AI decision-support layer.

This is a design document only. It does not implement migrations or production code.

## AIKINTEL Database Standards

Use the platform conventions from the AIKINTEL integration guidelines:

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
- Avoid frontend-owned schema decisions.
- Confirm migration style with AIKINTEL owner before implementation.

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

### Purpose

Core registry for crypto projects and tokens shown in the Crypto Market page. This table powers project cards, token lists, risk/opportunity sorting, and setup review context.

### Columns

Recommended columns:

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

### Indexes

Recommended indexes:

- `idx_symbol (symbol)`.
- `idx_category (category)`.
- `idx_chain (chain)`.
- `idx_risk (risk_score)`.
- `idx_opportunity (opportunity_score)`.
- `idx_market_cap (market_cap_usd)`.
- unique `hash`.

### Deduplication

Use `hash` generated from stable identity fields, for example:

```text
lower(symbol) + "|" + lower(name) + "|" + lower(chain) + "|" + lower(contract_address)
```

If contract address is missing, dedup by symbol, name, and source-specific identifier when available.

### AI Fields

- `ai_evaluation`: project-specific assessment if AIKINTEL keeps this separate.
- `ai_analysis`: general AIKINTEL JSON pattern.
- `risk_score`: 0-100, higher means riskier.
- `opportunity_score`: 0-100, higher means stronger research opportunity.
- `last_evaluated_at`: last AI analysis timestamp.

### Camp v1 Priority

Must-have.

Camp v1 should seed 8-15 projects/tokens covering major assets, narratives, risky assets, and scam-like examples.

### Future Extension Notes

- Add normalized relation to chains if AIKINTEL later has a shared chain registry.
- Add links to latest news, scam alerts, opportunities, and on-chain metrics.
- Add user-specific watchlist in `crypto_user_watchlist`, not directly in this table.

## `crypto_scam_alerts`

### Purpose

Stores scam, exploit, honeypot, rug-pull, fake-team, pump-dump, contract-risk, and other warning alerts.

### Columns

Recommended columns:

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

### Indexes

Recommended indexes:

- `idx_type (alert_type)`.
- `idx_severity (severity)`.
- `idx_symbol (project_symbol)`.
- `idx_published (published_at)`.
- unique `hash`.

### Deduplication

Use `hash` generated from:

```text
source + "|" + project_symbol + "|" + alert_type + "|" + normalized_title + "|" + published_date
```

If source provides an ID, use that ID in the hash.

### AI Fields

- `ai_analysis` stores summary, key points, sentiment, confidence, risk factors, and research recommendation.
- Scam/risk alerts should usually map sentiment to `bearish` or `neutral`; never use sentiment as an instruction to trade.

### Camp v1 Priority

Must-have.

Camp v1 should include at least one high-risk and one critical alert to demonstrate safe risk handling.

### Future Extension Notes

- Add link to `crypto_projects.id` after schema ownership is confirmed.
- Add evidence verification state and reviewer metadata if AIKINTEL has an admin review workflow.

## `crypto_opportunities`

### Purpose

Stores opportunities, narratives, airdrops, IDOs, staking/yield ideas, technical catalysts, and research-worthy themes.

### Columns

Recommended columns:

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

### Indexes

Recommended indexes:

- `idx_type (opportunity_type)`.
- `idx_status (status)`.
- `idx_confidence (confidence_score)`.
- `idx_symbol (project_symbol)`.
- `idx_deadline (deadline)`.
- `idx_published (published_at)`.
- unique `hash`.

### Deduplication

Use `hash` generated from:

```text
source_url OR source + "|" + project_symbol + "|" + opportunity_type + "|" + normalized_title
```

### AI Fields

- `ai_analysis` uses the AIKINTEL JSON pattern.
- `confidence_score` is 0-100 and describes analysis confidence, not profit probability.
- `risk_level` is explicit so the UI can filter and warn users.

### Camp v1 Priority

Must-have.

Camp v1 should include a mix of narrative, fundamental-event, and high-risk opportunity examples.

### Future Extension Notes

- Consider separating narratives from opportunities only if the data volume grows.
- Add lifecycle events for opportunity status changes later.

## `crypto_market_summaries`

### Purpose

Stores daily or weekly crypto market summaries generated from collected data and AI analysis.

### Columns

Recommended columns:

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

### Indexes

Recommended indexes:

- unique `idx_date_tf (summary_date, timeframe)`.
- `idx_sentiment (market_sentiment)`.
- `idx_created (created_at)`.

### Deduplication

Use the unique date/timeframe pair. No separate `hash` is required unless multiple sources produce competing summaries for the same timeframe.

### AI Fields

- `ai_summary` is display text.
- `ai_analysis` stores the structured AIKINTEL JSON.
- `fear_greed_index` is 0-100.

### Camp v1 Priority

Must-have.

Camp v1 can start with a few seeded daily and weekly summaries.

### Future Extension Notes

- Add source coverage metadata.
- Add market regime labels if AIKINTEL uses them elsewhere.

## Optional / Later Tables

## `crypto_onchain_metrics`

### Purpose

Stores daily on-chain metric snapshots for symbols/tokens.

### Columns

Recommended columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
symbol VARCHAR(20) NOT NULL
metric_date DATE NOT NULL
active_addresses INT
transaction_count INT
tvl_usd DECIMAL(20,2)
volume_24h_usd DECIMAL(20,2)
whale_transactions INT
exchange_inflow DECIMAL(20,4)
exchange_outflow DECIMAL(20,4)
net_flow DECIMAL(20,4)
source VARCHAR(100)
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### Indexes

- unique `idx_symbol_date (symbol, metric_date)`.
- `idx_date (metric_date)`.
- `idx_symbol (symbol)`.

### Deduplication

Use unique symbol/date records.

### AI Fields

No `ai_analysis` required for raw metrics. AI can analyze metrics into summaries later.

### Camp v1 Priority

Optional.

### Future Extension Notes

Add only after data source approval and chart requirements are confirmed.

## `crypto_user_watchlist`

### Purpose

Stores private user watchlist entries if Camp v1 requires per-user tracking.

### Columns

Recommended columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
user_id INT NOT NULL
symbol VARCHAR(20) NOT NULL
project_id INT NULL
status ENUM('new', 'to_review', 'watching', 'rejected', 'played', 'archived') DEFAULT 'new'
notes TEXT
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### Indexes

- `idx_user (user_id)`.
- `idx_symbol (symbol)`.
- `idx_status (status)`.
- unique `idx_user_symbol (user_id, symbol)`.

### Deduplication

One watchlist entry per user and symbol.

### AI Fields

No `ai_analysis` required initially.

### Camp v1 Priority

Later unless AIKINTEL owner confirms private watchlists are needed for Camp v1.

### Future Extension Notes

Must use existing AIKINTEL users and auth. Do not create a separate login.

## `crypto_user_insights`

### Purpose

Stores user-specific research notes, observations, and personal AI-assisted insights.

### Columns

Recommended columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
user_id INT NOT NULL
entity_type ENUM('project', 'opportunity', 'scam_alert', 'market_summary', 'manual') NOT NULL
entity_id INT NULL
symbol VARCHAR(20)
title VARCHAR(500)
body TEXT
ai_analysis JSON
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### Indexes

- `idx_user (user_id)`.
- `idx_entity (entity_type, entity_id)`.
- `idx_symbol (symbol)`.
- `idx_created (created_at)`.

### Deduplication

No global deduplication. User notes may intentionally repeat topics.

### AI Fields

Optional `ai_analysis` for personal summary or checklist support.

### Camp v1 Priority

Later.

### Future Extension Notes

Requires privacy review and clear ownership rules.

## `crypto_setup_reviews`

### Purpose

Stores structured setup-review outputs from Crypto Edge AI.

### Columns

Recommended columns:

```sql
id INT AUTO_INCREMENT PRIMARY KEY
user_id INT NULL
symbol VARCHAR(20) NOT NULL
title VARCHAR(500) NOT NULL
description TEXT
source_url VARCHAR(1024)
timeframe VARCHAR(50)
bias ENUM('bullish', 'bearish', 'neutral') NOT NULL
score TINYINT NOT NULL
confidence TINYINT NOT NULL
risk_level ENUM('low', 'medium', 'high', 'critical') NOT NULL
summary TEXT
key_points JSON
risk_factors JSON
checklist JSON
disclaimer_note TEXT
ai_analysis JSON
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### Indexes

- `idx_user (user_id)`.
- `idx_symbol (symbol)`.
- `idx_bias (bias)`.
- `idx_score (score)`.
- `idx_created (created_at)`.

### Deduplication

No global deduplication in early versions. Setup reviews may be repeated over time because context changes.

### AI Fields

Use full AIKINTEL `ai_analysis` JSON pattern plus mapped fields for direct UI display.

### Camp v1 Priority

Later as persisted storage. For Camp v1, `setupReviewMock` can be a non-persisted endpoint design.

### Future Extension Notes

Add only after AI usage limits and user ownership rules are confirmed.
