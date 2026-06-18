# AIKINTEL-Compatible Table Mapping

## Purpose

This document maps Crypto Edge AI data needs to AIKINTEL-compatible database tables.

Crypto Edge AI is the main module direction. The tables below are the market intelligence backing layer for trader-facing decision support.

## Database Conventions

Use AIKINTEL-compatible conventions:

- Table names use snake_case and plural form.
- Column names use snake_case.
- Primary key is `id INT AUTO_INCREMENT PRIMARY KEY`.
- Use `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`.
- Use `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` where needed.
- Store AI output in `ai_analysis JSON`.
- Use `hash VARCHAR(64) UNIQUE` for deduplication.
- Use `TINYINT` for 0-100 scores.
- Use `utf8mb4`.

## Table Mapping

| Table | Purpose | Crypto Edge AI Usage | Priority |
| --- | --- | --- | --- |
| `crypto_projects` | Project/token registry and evaluation | Project cards, risk score, opportunity score, setup context | Camp v1 must-have |
| `crypto_scam_alerts` | Scam and risk warnings | Risk panel, alerts, checklist blockers | Camp v1 must-have |
| `crypto_opportunities` | Opportunities and narratives | Opportunities tab, narrative review, confidence | Camp v1 must-have |
| `crypto_market_summaries` | Daily/weekly market view | Dashboard context, sentiment, market summary | Camp v1 must-have |
| `crypto_research_reviews` | Manual Research Review records | User-submitted topics, AI classification, checklist, status | Camp BETA must-have |
| `crypto_token_candidates` | New Token Scanner candidates | DexScreener token discovery and filtering | Camp BETA must-have |
| `crypto_token_security_checks` | Security check results | GoPlus/Honeypot/optional scanner outputs | Camp BETA must-have |
| `crypto_token_scorecards` | Token scorecard outputs | Security, on-chain, social, narrative scoring | Camp BETA must-have |
| `crypto_token_scan_runs` | Scan execution tracking | Controlled discovery runs and errors | Camp BETA must-have |
| AIKINTEL Market News / Crypto | Existing general news layer | Reuse/map as context; do not duplicate | Confirm schema |
| `crypto_onchain_metrics` | On-chain snapshots | Later context for bias and risk | Optional/later |
| `crypto_user_watchlist` | User-specific watchlist | Later private observation/status tracking | Optional/later |
| `crypto_user_insights` | User-specific research notes | Later personal AI insights and notes | Optional/later |
| `crypto_setup_reviews` | Persisted setup review outputs | Later storage for Crypto Edge AI setup reviews | Optional/later |

## Camp v1 Priority

Must-have:

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

Do not add a duplicate general crypto news table until the existing AIKINTEL Market News / Crypto schema is confirmed.

## AI Analysis JSON

Use this JSON shape in `ai_analysis`:

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

The `recommendation` field must remain research guidance. It must not contain buy/sell instructions, guaranteed profit claims, or financial advice.

## Scoring Fields

Recommended fields:

- `risk_score TINYINT` for project risk.
- `opportunity_score TINYINT` for project opportunity.
- `confidence_score TINYINT` for opportunities and setup review confidence.
- `fear_greed_index TINYINT` for market summaries.

If existing AIKINTEL Market News includes `relevance_score`, map it as context instead of creating duplicate news rows.

## Personal Insight Extension

If AIKINTEL integration is approved and users/auth are available, future user-specific records may map to:

- `user_id`.
- Source entity type.
- Source entity ID.
- Status.
- Notes.
- Checklist state.
- Personal score override.

Do not introduce separate auth/users for this module.

## Detailed Design Reference

Use `docs/database_schema_design.md` for columns, indexes, deduplication, AI fields, Camp v1 priority, and future extension notes.
