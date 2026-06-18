# tRPC Router Design: `cryptoMarket`

## Purpose

This document designs the `cryptoMarket` tRPC router for the AIKINTEL Crypto Market Module.

Target file:

```text
packages/webapp/server/routers/cryptoMarket.ts
```

This is a design document only. It does not implement the router.

## Router Principles

- Use AIKINTEL tRPC router patterns.
- Do not modify `_core`.
- Use protected procedures by default.
- Do not create a standalone backend.
- Do not create a standalone login system.
- Do not call external APIs from frontend.
- Validate all inputs with Zod.
- Enforce limit caps.
- Use parameterized database access in implementation.
- Never expose credentials.
- Keep `setupReviewMock` non-persistent for Camp v1 unless approved.

## Shared Types

### Common Input Rules

- `limit`: integer, min 1, max 100, default 30 or 50 depending on procedure.
- `offset`: integer, min 0, default 0 where pagination is needed.
- `symbol`: uppercase string, max 20.
- `sortBy`: enum only, never raw SQL.
- `sortDirection`: `asc` or `desc`, default `desc`.

### AI Analysis Output Shape

```ts
type AiAnalysis = {
  model: string;
  analyzed_at: string;
  summary: string;
  key_points: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  risk_factors: string[];
  recommendation: string;
  raw_prompt_tokens: number;
  raw_completion_tokens: number;
};
```

## Procedure: `projects`

### Purpose

Return a filtered and sorted list of crypto projects/tokens.

### Protected/Public Status

Protected.

### Input Schema With Zod

```ts
z.object({
  category: z.string().max(100).optional(),
  chain: z.string().max(100).optional(),
  minOpportunityScore: z.number().int().min(0).max(100).optional(),
  maxRiskScore: z.number().int().min(0).max(100).optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(["opportunity_score", "risk_score", "market_cap_usd", "created_at"]).default("opportunity_score"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0)
})
```

### Output Shape

```ts
{
  items: Array<{
    id: number;
    symbol: string;
    name: string;
    category: string | null;
    chain: string | null;
    market_cap_usd: string | null;
    risk_score: number | null;
    opportunity_score: number | null;
    ai_analysis: AiAnalysis | null;
    updated_at: string | null;
  }>;
  nextOffset: number | null;
}
```

### Sorting

Allowed fields only:

- `opportunity_score`.
- `risk_score`.
- `market_cap_usd`.
- `created_at`.

### Filters

- Category.
- Chain.
- Minimum opportunity score.
- Maximum risk score.
- Symbol/name search.

### Limit Rules

Maximum `limit` is 100.

### Security Notes

- Use enum allowlists for sorting.
- Escape or parameterize search.
- Do not expose raw DB errors to frontend.

### Sample Response

```json
{
  "items": [
    {
      "id": 1,
      "symbol": "BTC",
      "name": "Bitcoin",
      "category": "L1",
      "chain": "Bitcoin",
      "market_cap_usd": "1250000000000.00",
      "risk_score": 25,
      "opportunity_score": 76,
      "ai_analysis": {
        "model": "mock-camp-v1",
        "analyzed_at": "2026-06-16T12:00:00Z",
        "summary": "Bitcoin remains the main market benchmark.",
        "key_points": ["High liquidity", "Macro-sensitive", "Dominance should be monitored"],
        "sentiment": "neutral",
        "confidence": 82,
        "risk_factors": ["Macro volatility", "ETF flow changes"],
        "recommendation": "Use as market context and verify current flows.",
        "raw_prompt_tokens": 0,
        "raw_completion_tokens": 0
      },
      "updated_at": "2026-06-16T12:00:00Z"
    }
  ],
  "nextOffset": 50
}
```

## Procedure: `projectBySymbol`

### Purpose

Return one project by symbol with related alerts and opportunities.

### Protected/Public Status

Protected.

### Input Schema With Zod

```ts
z.object({
  symbol: z.string().min(1).max(20)
})
```

### Output Shape

```ts
{
  project: CryptoProject | null;
  latestAlerts: CryptoScamAlert[];
  latestOpportunities: CryptoOpportunity[];
}
```

### Sorting

- Alerts: `published_at DESC`.
- Opportunities: `confidence_score DESC, published_at DESC`.

### Filters

Filter all related records by normalized uppercase symbol.

### Limit Rules

Return up to 10 alerts and 10 opportunities.

### Security Notes

- Normalize symbol to uppercase server-side.
- Do not allow arbitrary joins or raw table names.

### Sample Response

```json
{
  "project": {
    "id": 1,
    "symbol": "SOL",
    "name": "Solana",
    "risk_score": 45,
    "opportunity_score": 78
  },
  "latestAlerts": [],
  "latestOpportunities": [
    {
      "id": 12,
      "title": "Solana ecosystem narrative watch",
      "risk_level": "medium",
      "confidence_score": 72
    }
  ]
}
```

## Procedure: `scamAlerts`

### Purpose

Return scam and risk alerts.

### Protected/Public Status

Protected.

### Input Schema With Zod

```ts
z.object({
  severity: z.enum(["low", "medium", "high", "critical", "all"]).default("all"),
  alertType: z.string().max(50).optional(),
  symbol: z.string().max(20).optional(),
  confirmedOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).default(0)
})
```

### Output Shape

```ts
{
  items: CryptoScamAlert[];
  nextOffset: number | null;
}
```

### Sorting

`published_at DESC`, then severity priority.

### Filters

- Severity.
- Alert type.
- Symbol.
- Confirmed only.

### Limit Rules

Maximum `limit` is 100.

### Security Notes

- Severity must be allowlisted.
- Evidence URLs should be rendered safely in frontend.

### Sample Response

```json
{
  "items": [
    {
      "id": 4,
      "project_symbol": "FAKE",
      "severity": "critical",
      "alert_type": "honeypot",
      "title": "Potential honeypot pattern detected",
      "is_confirmed": false,
      "published_at": "2026-06-16T08:00:00Z"
    }
  ],
  "nextOffset": null
}
```

## Procedure: `opportunities`

### Purpose

Return opportunities and narratives for research review.

### Protected/Public Status

Protected.

### Input Schema With Zod

```ts
z.object({
  type: z.string().max(50).optional(),
  status: z.enum(["active", "expired", "completed", "all"]).default("active"),
  riskLevel: z.enum(["low", "medium", "high", "critical", "all"]).default("all"),
  minConfidence: z.number().int().min(0).max(100).optional(),
  symbol: z.string().max(20).optional(),
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).default(0)
})
```

### Output Shape

```ts
{
  items: CryptoOpportunity[];
  nextOffset: number | null;
}
```

### Sorting

`confidence_score DESC, published_at DESC`.

### Filters

- Type.
- Status.
- Risk level.
- Minimum confidence.
- Symbol.

### Limit Rules

Maximum `limit` is 100.

### Security Notes

- `potential_return` is descriptive only and must not be presented as a promise.
- Show disclaimer near opportunity analysis.

### Sample Response

```json
{
  "items": [
    {
      "id": 8,
      "project_symbol": "ETH",
      "opportunity_type": "narrative",
      "title": "L2 activity narrative",
      "risk_level": "medium",
      "confidence_score": 69,
      "status": "active"
    }
  ],
  "nextOffset": 30
}
```

## Procedure: `marketSummary`

### Purpose

Return latest market summary for a requested timeframe.

### Protected/Public Status

Protected.

### Input Schema With Zod

```ts
z.object({
  timeframe: z.enum(["daily", "weekly"]).default("daily")
})
```

### Output Shape

```ts
{
  summary: CryptoMarketSummary | null;
}
```

### Sorting

`summary_date DESC`.

### Filters

Timeframe only.

### Limit Rules

Always return one record or null.

### Security Notes

- JSON fields should be parsed safely.
- Missing summary should return null, not throw.

### Sample Response

```json
{
  "summary": {
    "summary_date": "2026-06-16",
    "timeframe": "daily",
    "market_sentiment": "neutral",
    "fear_greed_index": 52,
    "trending_narratives": ["BTC ETF flows", "L2 activity"],
    "ai_summary": "The market is mixed with no clear broad-risk impulse."
  }
}
```

## Procedure: `dashboard`

### Purpose

Return a single payload for the Crypto Market overview dashboard.

### Protected/Public Status

Protected.

### Input Schema With Zod

```ts
z.object({
  timeframe: z.enum(["daily", "weekly"]).default("daily"),
  projectLimit: z.number().int().min(1).max(20).default(8),
  alertLimit: z.number().int().min(1).max(20).default(5),
  opportunityLimit: z.number().int().min(1).max(20).default(5)
})
```

### Output Shape

```ts
{
  summary: CryptoMarketSummary | null;
  topProjects: CryptoProject[];
  criticalAlerts: CryptoScamAlert[];
  activeOpportunities: CryptoOpportunity[];
  generatedAt: string;
}
```

### Sorting

- Projects by `opportunity_score DESC`.
- Alerts by `published_at DESC`.
- Opportunities by `confidence_score DESC`.

### Filters

- Summary timeframe.
- Alerts should prioritize `high` and `critical`.
- Opportunities should default to `active`.

### Limit Rules

Each list maximum is 20.

### Security Notes

- Combine server-side only.
- Avoid expensive unbounded queries.

### Sample Response

```json
{
  "summary": {
    "market_sentiment": "neutral",
    "fear_greed_index": 52
  },
  "topProjects": [{"symbol": "BTC", "opportunity_score": 76}],
  "criticalAlerts": [{"title": "Potential honeypot pattern detected", "severity": "critical"}],
  "activeOpportunities": [{"title": "L2 activity narrative", "confidence_score": 69}],
  "generatedAt": "2026-06-16T12:00:00Z"
}
```

## Procedure: `search`

### Purpose

Search across projects, opportunities, alerts, and summaries for quick research navigation.

### Protected/Public Status

Protected.

### Input Schema With Zod

```ts
z.object({
  query: z.string().min(2).max(100),
  scope: z.enum(["all", "projects", "alerts", "opportunities", "summaries"]).default("all"),
  limit: z.number().int().min(1).max(50).default(20)
})
```

### Output Shape

```ts
{
  items: Array<{
    type: "project" | "alert" | "opportunity" | "summary";
    id: number;
    title: string;
    symbol?: string;
    subtitle?: string;
    score?: number;
  }>;
}
```

### Sorting

Relevance-like ordering:

- Exact symbol matches first.
- Newer alerts/opportunities next.
- Higher opportunity/confidence scores next.

### Filters

Scope.

### Limit Rules

Maximum `limit` is 50.

### Security Notes

- Minimum query length avoids expensive broad searches.
- Use parameterized LIKE queries or full-text search if available.

### Sample Response

```json
{
  "items": [
    {
      "type": "project",
      "id": 1,
      "title": "Bitcoin",
      "symbol": "BTC",
      "subtitle": "L1",
      "score": 76
    }
  ]
}
```

## Procedure: `setupReviewMock`

### Purpose

Design-only Camp v1 endpoint for a safe, non-trading setup review mock.

It should help test the Crypto Edge AI decision-support layer without real AI provider integration and without persisting production AI analysis.

### Protected/Public Status

Protected.

### Input Schema With Zod

```ts
z.object({
  symbol: z.string().min(1).max(20),
  title: z.string().min(3).max(500),
  description: z.string().min(10).max(5000),
  source_url: z.string().url().max(1024).optional(),
  timeframe: z.string().max(50).optional(),
  user_context: z.string().max(2000).optional()
})
```

### Output Shape

```ts
{
  bias: "bullish" | "bearish" | "neutral";
  score: number;
  confidence: number;
  risk_level: "low" | "medium" | "high" | "critical";
  summary: string;
  key_points: string[];
  risk_factors: string[];
  checklist: string[];
  disclaimer_note: string;
  ai_analysis: AiAnalysis;
}
```

### Sorting

Not applicable.

### Filters

Not applicable.

### Limit Rules

The implementation should apply daily/user-level usage limits if this becomes real. For mock design, document a future cap such as 10 reviews per user per day.

### Security Notes

- Must not call real AI in Camp v1 unless explicitly approved.
- Must not persist user context unless approved.
- Must include disclaimer in every response.
- Must not return buy/sell/enter-now language.
- Must sanitize and limit input lengths.

### Sample Response

```json
{
  "bias": "neutral",
  "score": 64,
  "confidence": 71,
  "risk_level": "medium",
  "summary": "The topic may be worth monitoring, but the available evidence is not enough for a trading decision.",
  "key_points": [
    "Narrative alignment is visible but needs confirmation.",
    "Liquidity and recent news should be checked.",
    "Risk is elevated if the move already happened."
  ],
  "risk_factors": [
    "Post-news chasing risk",
    "Unclear invalidation level",
    "Possible social hype"
  ],
  "checklist": [
    "Verify current liquidity and spreads.",
    "Check whether the catalyst is already priced in.",
    "Review token unlocks and recent alerts.",
    "Define invalidation before any decision."
  ],
  "disclaimer_note": "This is research support only, not financial advice or a buy/sell signal.",
  "ai_analysis": {
    "model": "mock-camp-v1",
    "analyzed_at": "2026-06-16T12:00:00Z",
    "summary": "Research topic needs verification before action.",
    "key_points": ["Narrative visible", "Evidence incomplete", "Risk requires review"],
    "sentiment": "neutral",
    "confidence": 71,
    "risk_factors": ["Post-news chasing risk", "Possible hype"],
    "recommendation": "Verify liquidity, catalyst freshness, and risk factors before considering the topic further.",
    "raw_prompt_tokens": 0,
    "raw_completion_tokens": 0
  }
}
```
