# Security and Disclaimer

## Core Principle

Crypto Edge AI supports research and decision preparation for crypto traders. It can later integrate into AIKINTEL, but it must not make trading decisions for users.

It supports Research Review and New Token Scanner. Both modes are research and risk-filtering workflows, not trading execution workflows.

## Platform Security

Follow AIKINTEL rules:

- No hardcoded credentials.
- All secrets through `process.env`.
- No API keys committed to the repository.
- No frontend calls to external data or AI providers.
- Frontend calls tRPC procedures only.
- Backend and cron scripts use existing AIKINTEL helpers and DB patterns.
- Use `packages/cron/lib/db.ts` for cron database access.
- Do not create independent DB connection patterns unless approved.
- Validate JSON before inserts.
- Use deduplication hashes.
- Respect API rate limits.
- Use UTC timestamps.
- Do not modify `_core`.

## Trading Safety Boundaries

The AI must not give commands such as:

- `buy`.
- `sell`.
- `enter now`.
- `ape in`.
- `guaranteed profit`.
- `sure setup`.
- `risk-free`.
- `financial advice`.
- `sure profit`.
- `easy money`.

The system must not:

- Execute trades.
- Auto-buy.
- Auto-sell.
- Provide copy trading.
- Act as a signal bot.
- Integrate MT4.
- Integrate exchanges for execution.
- Integrate Telegram or Discord alerts in this stage.
- Add payments in this stage.

## Allowed AI Outputs

AI may return:

- Market context.
- Bias.
- Risk review.
- Checklist.
- Research summary.
- Decision support.
- Things to verify before trading.
- Scam or risk warnings.
- Data uncertainty notes.
- Eligible for review.
- Not eligible for review.
- Watchlist candidate.
- Critical risk.
- Requires manual verification.
- Research priority.

## Disclaimer

Crypto Edge AI is a research and checklist-support module. It does not provide investment advice, trading signals, or guaranteed outcomes. It does not execute trades and does not replace the user's judgment. Crypto trading involves significant risk, including possible loss of capital.

If a critical security item fails, use product labels such as `REJECT`, `CRITICAL_RISK`, or `NOT_ELIGIBLE_FOR_REVIEW`. Do not use trading-instruction language such as `DO NOT BUY`.

## Analysis Disclaimer

Every AI analysis should display or include a disclaimer note:

This analysis is for research support only. It is not a buy or sell signal, not financial advice, and not a guarantee of future results. The final decision belongs to the user.
