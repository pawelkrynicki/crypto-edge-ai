# tRPC Router Design: `cryptoMarket`

## Purpose

This document designs the `cryptoMarket` tRPC router that can power the Crypto Edge AI module.

The UI/module name is `Crypto Edge AI`. The router name may remain `cryptoMarket` because it serves the market intelligence backing layer.

Target future file if integrated:

```text
packages/webapp/server/routers/cryptoMarket.ts
```

This is a design document only. It does not implement the router.

## Owner Decisions Reflected

- Crypto Edge AI remains the module/menu name.
- Work continues in this repo first.
- Existing AIKINTEL auth/users should be used if integrated.
- Existing Market News / Crypto should be reused or mapped where possible.
- OpenAI helper status remains open.

## Router Principles

- Use AIKINTEL tRPC patterns if integrated.
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

## Procedures

Minimum procedures:

- `projects`.
- `projectBySymbol`.
- `scamAlerts`.
- `opportunities`.
- `marketSummary`.
- `dashboard`.
- `search`.
- `setupReviewMock`.
- `createResearchReview`.
- `researchReviews`.
- `researchReviewById`.
- `updateResearchReviewStatus`.
- `scanCandidates`.
- `candidateById`.
- `securityCheck`.
- `scorecard`.
- `scanRunHistory`.
- `rejectCandidate`.
- `watchlistCandidate`.

For Camp BETA, scanner procedures may start as read-only/design or controlled manual-run procedures. Real scanning should remain controlled until source access and API limits are confirmed.

## Research Review Procedures

## Procedure: `createResearchReview`

Purpose: create a manual Research Review from a user-submitted topic.

Status: protected.

Input:

```ts
z.object({
  input_type: z.enum(["news", "link", "token_description", "market_event", "observation", "narrative", "contract_address", "ticker", "screenshot_text"]),
  title: z.string().min(3).max(500),
  description: z.string().min(10).max(5000),
  source_url: z.string().url().max(1024).optional(),
  symbol: z.string().max(20).optional(),
  contract_address: z.string().max(100).optional()
})
```

Output: created review with category, score, bias, confidence, risk factors, checklist, decision label, and disclaimer.

Security notes: no buy/sell wording; real AI call only after helper approval.

## Procedure: `researchReviews`

Purpose: list user Research Reviews.

Status: protected.

Input:

```ts
z.object({
  status: z.enum(["new", "to_review", "watching", "rejected", "played", "archived", "all"]).default("all"),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).default(0)
})
```

Output: paginated reviews owned by current user or admin-visible scope if AIKINTEL supports it.

## Procedure: `researchReviewById`

Purpose: return one Research Review.

Status: protected.

Input:

```ts
z.object({ id: z.number().int().positive() })
```

Output: full review detail.

Security notes: enforce user ownership unless admin.

## Procedure: `updateResearchReviewStatus`

Purpose: update workflow status of a Research Review.

Status: protected.

Input:

```ts
z.object({
  id: z.number().int().positive(),
  status: z.enum(["new", "to_review", "watching", "rejected", "played", "archived"])
})
```

Output: updated review summary.

## New Token Scanner Procedures

## Procedure: `scanCandidates`

Purpose: list New Token Scanner candidates.

Status: protected.

Input:

```ts
z.object({
  status: z.enum(["new", "rejected", "watchlist", "high_conviction_review", "critical_risk", "archived", "all"]).default("all"),
  chain: z.string().max(100).optional(),
  minLiquidityUsd: z.number().min(0).optional(),
  minVolume24hUsd: z.number().min(0).optional(),
  minMarketCapUsd: z.number().min(0).optional(),
  maxMarketCapUsd: z.number().min(0).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0)
})
```

Output: paginated candidates with latest scorecard and security status.

## Procedure: `candidateById`

Purpose: show full candidate detail.

Status: protected.

Input:

```ts
z.object({ id: z.number().int().positive() })
```

Output: candidate, security checks, scorecard, checklist, and source links.

## Procedure: `securityCheck`

Purpose: return security check details for one candidate.

Status: protected.

Input:

```ts
z.object({ candidate_id: z.number().int().positive() })
```

Output: GoPlus/Honeypot/manual security results.

## Procedure: `scorecard`

Purpose: return token scorecard for one candidate.

Status: protected.

Input:

```ts
z.object({ candidate_id: z.number().int().positive() })
```

Output: security, on-chain, social, narrative, total score, risk level, confidence, decision label, checklist.

## Procedure: `scanRunHistory`

Purpose: list controlled scan runs.

Status: protected/admin-preferred.

Input:

```ts
z.object({
  source: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).default(30)
})
```

Output: scan run metadata and counts.

## Procedure: `rejectCandidate`

Purpose: mark a candidate rejected from review.

Status: protected.

Input:

```ts
z.object({
  id: z.number().int().positive(),
  reason: z.string().max(1000).optional()
})
```

Output: updated candidate status.

Security notes: use `REJECT` / `NOT_ELIGIBLE_FOR_REVIEW`, not trading instructions.

## Procedure: `watchlistCandidate`

Purpose: mark a candidate as watchlist candidate.

Status: protected.

Input:

```ts
z.object({
  id: z.number().int().positive(),
  note: z.string().max(1000).optional()
})
```

Output: updated candidate status.

Security notes: watchlist does not mean buy signal.

## Procedure: `projects`

Purpose: return filtered and sorted crypto projects/tokens for Crypto Edge AI.

Status: protected.

Input:

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

Output: list of projects with symbol, name, category, chain, risk score, opportunity score, market cap, and `ai_analysis`.

Sorting: allowlisted `sortBy` only.

Filters: category, chain, score ranges, search.

Security notes: parameterized search, no raw sort field, no external fetches.

Sample response:

```json
{
  "items": [
    {
      "id": 1,
      "symbol": "BTC",
      "name": "Bitcoin",
      "category": "L1",
      "risk_score": 25,
      "opportunity_score": 76
    }
  ],
  "nextOffset": 50
}
```

## Procedure: `projectBySymbol`

Purpose: return a single project plus related alerts/opportunities.

Status: protected.

Input:

```ts
z.object({
  symbol: z.string().min(1).max(20)
})
```

Output: project, latest alerts, latest opportunities, and optional mapped Market News references if available.

Sorting: alerts by `published_at DESC`; opportunities by `confidence_score DESC, published_at DESC`.

Security notes: normalize symbol to uppercase and use parameterized queries.

Sample response:

```json
{
  "project": { "symbol": "SOL", "name": "Solana", "risk_score": 45, "opportunity_score": 78 },
  "latestAlerts": [],
  "latestOpportunities": [{ "title": "Solana ecosystem narrative watch", "confidence_score": 72 }]
}
```

## Procedure: `scamAlerts`

Purpose: return scam and risk alerts.

Status: protected.

Input:

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

Output: paginated scam/risk alerts.

Sorting: `published_at DESC`, with high/critical surfaced in dashboard procedure.

Security notes: render evidence URLs safely and avoid raw filters.

Sample response:

```json
{
  "items": [
    {
      "id": 4,
      "project_symbol": "FAKE",
      "severity": "critical",
      "alert_type": "honeypot",
      "title": "Potential honeypot pattern detected"
    }
  ],
  "nextOffset": null
}
```

## Procedure: `opportunities`

Purpose: return opportunities and narratives for research review.

Status: protected.

Input:

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

Output: paginated opportunities with risk level, confidence, status, and AI analysis summary.

Sorting: `confidence_score DESC, published_at DESC`.

Security notes: `potential_return` is descriptive only and must not be rendered as a promise.

Sample response:

```json
{
  "items": [
    {
      "project_symbol": "ETH",
      "opportunity_type": "narrative",
      "title": "L2 activity narrative",
      "risk_level": "medium",
      "confidence_score": 69
    }
  ]
}
```

## Procedure: `marketSummary`

Purpose: return latest market summary context for Crypto Edge AI.

Status: protected.

Input:

```ts
z.object({
  timeframe: z.enum(["daily", "weekly"]).default("daily")
})
```

Output: one summary or null.

Sorting: `summary_date DESC`.

Security notes: safely parse JSON fields; missing summary returns null.

Sample response:

```json
{
  "summary": {
    "market_sentiment": "neutral",
    "fear_greed_index": 52,
    "ai_summary": "The market is mixed with no clear broad-risk impulse."
  }
}
```

## Procedure: `dashboard`

Purpose: return one payload for the Crypto Edge AI dashboard.

Status: protected.

Input:

```ts
z.object({
  timeframe: z.enum(["daily", "weekly"]).default("daily"),
  projectLimit: z.number().int().min(1).max(20).default(8),
  alertLimit: z.number().int().min(1).max(20).default(5),
  opportunityLimit: z.number().int().min(1).max(20).default(5)
})
```

Output: summary, top projects, critical alerts, active opportunities, and generated timestamp.

Security notes: bounded queries only.

Sample response:

```json
{
  "summary": { "market_sentiment": "neutral", "fear_greed_index": 52 },
  "topProjects": [{ "symbol": "BTC", "opportunity_score": 76 }],
  "criticalAlerts": [{ "title": "Potential honeypot pattern detected", "severity": "critical" }],
  "activeOpportunities": [{ "title": "L2 activity narrative", "confidence_score": 69 }],
  "generatedAt": "2026-06-16T12:00:00Z"
}
```

## Procedure: `search`

Purpose: search across Crypto Edge AI backing data.

Status: protected.

Input:

```ts
z.object({
  query: z.string().min(2).max(100),
  scope: z.enum(["all", "projects", "alerts", "opportunities", "summaries", "market_news"]).default("all"),
  limit: z.number().int().min(1).max(50).default(20)
})
```

Output: mixed typed search results.

Security notes: use parameterized LIKE or full-text search; minimum query length avoids broad scans. Only include `market_news` after schema is confirmed.

Sample response:

```json
{
  "items": [
    { "type": "project", "id": 1, "title": "Bitcoin", "symbol": "BTC", "score": 76 }
  ]
}
```

## Procedure: `setupReviewMock`

Purpose: safe Camp v1 mock endpoint for trader-facing setup review. This is not full AI integration.

Status: protected.

Input:

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

Output:

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

Security notes:

- Must not call real AI until approved.
- Must not persist user context until approved.
- Must include disclaimer.
- Must not return buy/sell/enter-now language.
- Must sanitize and limit inputs.

Sample response:

```json
{
  "bias": "neutral",
  "score": 64,
  "confidence": 71,
  "risk_level": "medium",
  "summary": "The topic may be worth monitoring, but the available evidence is not enough for a trading decision.",
  "key_points": ["Narrative alignment is visible", "Liquidity should be checked"],
  "risk_factors": ["Post-news chasing risk", "Possible social hype"],
  "checklist": ["Verify liquidity", "Check whether the catalyst is already priced in"],
  "disclaimer_note": "This is research support only, not financial advice or a buy/sell signal.",
  "ai_analysis": {
    "model": "mock-camp-v1",
    "analyzed_at": "2026-06-16T12:00:00Z",
    "summary": "Research topic needs verification before action.",
    "key_points": ["Narrative visible", "Evidence incomplete"],
    "sentiment": "neutral",
    "confidence": 71,
    "risk_factors": ["Post-news chasing risk"],
    "recommendation": "Verify liquidity, catalyst freshness, and risk factors before considering the topic further.",
    "raw_prompt_tokens": 0,
    "raw_completion_tokens": 0
  }
}
```
