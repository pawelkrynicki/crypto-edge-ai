# MVP Requirements

## MVP Goal

Build a controlled camp v1 module that fits AIKINTEL, rather than a standalone app.

The MVP should show useful crypto market intelligence and a trader-facing decision-support view without providing trading signals.

## Required Platform Alignment

The MVP must align with:

- React 19.
- Tailwind CSS 4.
- shadcn/ui.
- wouter.
- TanStack Query.
- Express.
- tRPC.
- MySQL / MariaDB.
- Drizzle ORM in webapp.
- `mysql2/promise` in cron scripts.
- Node.js 20.
- TypeScript.
- PM2 cron process pattern.

## Required AIKINTEL Sections

The MVP should expose:

- Crypto dashboard overview.
- Projects/token list.
- Scam and risk alerts.
- Opportunities/narratives.
- Market summary.
- On-chain metrics if data is available.

## Required Trader-Facing Fields

Crypto Edge AI fields should include:

- Score 0-100.
- Bias or sentiment: `bullish`, `bearish`, `neutral`.
- Confidence 0-100.
- Risk factors.
- Checklist.
- Research summary.
- Things to verify before trading.
- Optional observation status or personal insights if supported by AIKINTEL.

## AI Analysis JSON Pattern

Every table with `ai_analysis` should follow the AIKINTEL pattern:

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

The `recommendation` field must not contain buy or sell instructions. It should be interpreted as research guidance, such as what to verify next.

## Data Tables

The MVP planning should account for:

- `crypto_projects`.
- `crypto_scam_alerts`.
- `crypto_opportunities`.
- `crypto_onchain_metrics`.
- `crypto_market_summaries`.
- Existing `crypto_news` if present.

## Required tRPC Capabilities

The planned `cryptoMarket` router should provide read procedures for:

- Projects.
- Scam alerts.
- Opportunities.
- Market summary.
- On-chain metrics.

Write procedures for personal insights/statuses should be deferred until the existing AIKINTEL user model is confirmed.

## Required Cron Capabilities

Cron scripts should follow AIKINTEL style:

- Live in `packages/cron/scripts`.
- Use `packages/cron/lib/db.ts`.
- Use `mysql2/promise`.
- Use hashes for deduplication.
- Respect API rate limits.
- Be PM2-ready.
- Never hardcode credentials.

## Non-Requirements for This Stage

Do not implement:

- Full AI provider integration.
- External API keys.
- Exchange execution.
- MT4.
- Telegram.
- Discord.
- Payments.
- Trading automation.
