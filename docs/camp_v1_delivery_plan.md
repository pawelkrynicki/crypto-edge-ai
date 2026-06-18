# Camp v1 Delivery Plan

## Objective

Deliver a limited AIKINTEL-compatible Crypto Market Module for camp use.

The goal is usefulness and safety, not full automation.

## Camp v1 Must Have

- `/crypto-market` page.
- Overview dashboard.
- Projects/token list.
- Scam/risk alerts.
- Opportunities/narratives.
- Market summary.
- AI analysis JSON display or mapping.
- Score 0-100.
- Sentiment/bias.
- Confidence 0-100.
- Risk factors.
- Checklist.
- Disclaimer.

## Camp v1 Should Avoid

- Full AI automation before review.
- Unverified paid data dependencies.
- Complex personal workflows.
- Trading execution.
- Signals.
- MT4.
- Exchange execution.
- Telegram/Discord integrations.
- Payments.

## Suggested Delivery Phases

### Phase 1: Schema and Mock Data

- Confirm tables.
- Prepare migration.
- Add seed/mock records.
- Validate AI JSON shape.

### Phase 2: Read-Only tRPC Router

- Add `cryptoMarket` router.
- Add protected read procedures.
- Keep writes deferred.

### Phase 3: Frontend Page

- Add `/crypto-market`.
- Add overview, projects, opportunities, alerts, on-chain tabs.
- Match AIKINTEL visual patterns.

### Phase 4: Cron Skeletons

- Add PM2-ready scripts.
- Use dedup hashes.
- Use safe logging.
- Leave external API keys as env vars only.

### Phase 5: Controlled Camp Release

- Deploy limited module.
- Verify disclaimers.
- Monitor errors.
- Keep backup/demo data.

## Acceptance Criteria

- Fits AIKINTEL UI.
- Uses tRPC.
- Uses MySQL/MariaDB schema.
- Shows useful crypto research context.
- Does not provide buy/sell instructions.
- Does not execute trades.
- Working release can be demonstrated safely during camp.
