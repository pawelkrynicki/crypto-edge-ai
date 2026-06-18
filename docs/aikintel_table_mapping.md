# AIKINTEL Table Mapping

## Database Conventions

AIKINTEL table conventions:

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

| Table | Purpose | Crypto Edge AI Usage |
| --- | --- | --- |
| `crypto_projects` | Project registry and evaluation | Project cards, risk score, opportunity score, setup review context |
| `crypto_scam_alerts` | Scam and risk warnings | Risk panel, alerts, checklist blockers |
| `crypto_opportunities` | Opportunities and narratives | Opportunities tab, narrative review, confidence |
| `crypto_market_summaries` | Daily/weekly market view | Overview dashboard, sentiment, market summary |
| `crypto_onchain_metrics` | On-chain snapshots | On-chain tab, context for bias and risk |
| `crypto_user_watchlist` | User-specific watchlist | Later private observation/status tracking |
| `crypto_user_insights` | User-specific research notes | Later personal AI insights and notes |
| `crypto_setup_reviews` | Persisted setup review outputs | Later storage for Crypto Edge AI setup reviews |
| `crypto_news` | Existing news source if available | News context and related-coins analysis |

## Camp v1 Priority

Must-have:

- `crypto_projects`.
- `crypto_scam_alerts`.
- `crypto_opportunities`.
- `crypto_market_summaries`.

Optional / later:

- `crypto_onchain_metrics`.
- `crypto_user_watchlist`.
- `crypto_user_insights`.
- `crypto_setup_reviews`.

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

## Scoring Fields

Recommended fields:

- `relevance_score TINYINT` for news/relevance.
- `risk_score TINYINT` for project risk.
- `opportunity_score TINYINT` for project opportunity.
- `confidence_score TINYINT` for opportunities.
- `fear_greed_index TINYINT` for market summaries.

## Personal Insight Extension

If AIKINTEL supports user-specific records, a future extension may map user observations to:

- `user_id`.
- Source entity type.
- Source entity ID.
- Status.
- Notes.
- Checklist state.
- Personal score override.

Do not introduce this until the existing user data architecture is confirmed.

## Detailed Design Reference

Use `docs/database_schema_design.md` for columns, indexes, deduplication, AI fields, Camp v1 priority, and future extension notes.
