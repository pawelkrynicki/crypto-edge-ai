# Camp v1 Delivery Plan

## Objective

Deliver a controlled Crypto Edge AI BETA module for real users, using AIKINTEL-compatible patterns and a clear later integration path.

The goal is usefulness and safety, not full automation.

## Camp BETA Must Have

- Crypto Edge AI page/module.
- Controlled user flow.
- Research Review.
- New Token Scanner.
- Risk Engine.
- Setup Review.
- Final Checklist.
- Project/token research list.
- Scam/risk alerts.
- Opportunities/narratives.
- Market summary context.
- AI analysis JSON display or mapping.
- Setup review mock.
- Score 0-100.
- Bias: bullish, bearish, neutral.
- Confidence 0-100.
- Risk factors.
- Checklist.
- Disclaimer.

## Real-Data Minimum

Camp BETA should work on a limited real-data pipeline:

- DexScreener discovery.
- GoPlus/Honeypot security check.
- CoinGecko context.
- Fear & Greed market sentiment.
- AIKINTEL Market News / Crypto mapping if accessible.
- Scorecard.
- Final checklist.

## Camp v1 Should Reuse or Map

- Existing AIKINTEL Market News / Crypto if accessible.
- Existing AIKINTEL users/auth when integrated.
- AIKINTEL-style UI patterns.

## Camp v1 Should Avoid

- Full AI automation before review.
- Unverified paid data dependencies.
- Duplicating the general Market News / Crypto section.
- Complex personal workflows before auth/users integration is confirmed.
- Trading execution.
- Signals.
- MT4.
- Exchange execution.
- Telegram/Discord integrations.
- Payments.

## Suggested Delivery Phases

### Phase 1: Product Modes and Owner Decisions

- Use `docs/owner_decisions_2026_06_18.md`.
- Use `docs/product_modes_research_and_scanner.md`.
- Use `docs/research_review_scope.md`.
- Use `docs/new_token_scanner_scope.md`.
- Resolve open questions from `docs/open_questions_for_aikintel_owner.md`.
- Select credible data sources for v1.

### Phase 2: Data Model Refinement

- Use `docs/database_schema_design.md`.
- Use `docs/data_sources_v1.md`.
- Confirm which tables are needed for Camp v1.
- Decide how existing Market News / Crypto maps into Crypto Edge AI.

### Phase 3: Mock/Seed Crypto Edge AI Module

- Use `docs/camp_v1_mock_data_plan.md`.
- Use `docs/camp_beta_real_data_plan.md`.
- Add safe mock records in the future implementation step.
- Validate AI JSON shape.

### Phase 4: Read-Only tRPC Router Design / Skeleton

- Use `docs/trpc_router_design.md`.
- Keep procedures read-only except `setupReviewMock`.
- Keep `setupReviewMock` safe and non-trading.

### Phase 5: AIKINTEL-Style UI Mock

- Align with screenshots or existing AIKINTEL pages.
- Use the module name `Crypto Edge AI`.
- Avoid building full UI before integration decisions are settled.

### Phase 6: Controlled User Flow

- Test with real-user assumptions.
- Keep access controlled.
- Verify disclaimers.
- Monitor errors.
- Keep backup/demo data.

## Acceptance Criteria

- Module remains Crypto Edge AI.
- Fits AIKINTEL direction.
- Does not duplicate general crypto news.
- Uses AIKINTEL-compatible data model.
- Shows useful crypto research context.
- Does not provide buy/sell instructions.
- Does not execute trades.
- Working release can be demonstrated safely during camp.
- Working tree and deployment artifacts do not contain secrets.
