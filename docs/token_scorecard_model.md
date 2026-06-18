# Token Scorecard Model

## Purpose

The Token Scorecard is the scoring model for New Token Scanner.

It does not predict profit and does not create buy/sell signals. It ranks whether a token deserves further review.

## 100-Point Model

Maximum score:

- Security: 30.
- On-Chain: 25.
- Social: 25.
- Narrative: 20.

Total: 100.

## Security: 30 Points

Evaluate:

- Honeypot false.
- Buy/sell tax <10%.
- Contract verified.
- No critical GoPlus/Honeypot flags.
- Ownership renounced or timelock confirmed.
- No mint, blacklist, whitelist, hidden owner, or sell restriction risk.
- Liquidity locked/burned.

Critical deal breaker overrides the total score with `CRITICAL_RISK` or `NOT_ELIGIBLE_FOR_REVIEW`.

## On-Chain: 25 Points

Evaluate:

- Holders minimum 300, preferred 500-5000.
- Top 10 wallets <40% target, >60% red flag.
- Top 1 wallet <10% target, >20% red flag.
- Dev wallet <5% locked, >10% unlocked red flag.
- Liquidity/MC 10%-30% optimal, <3% red flag.
- Natural volume behavior.

## Social: 25 Points

Evaluate:

- Twitter/X account age.
- Follower quality.
- Engagement 2%-5% healthy.
- Telegram members 500+ preferred.
- Telegram active users 10%-30% active.
- Real discussion, not only hype spam.
- Admin responsiveness.
- Voice chat or credible community activity.

For Camp BETA, social may be manual input or checklist until APIs are confirmed.

## Narrative: 20 Points

Evaluate:

- Narrative clarity.
- Fit with current market themes.
- Evidence quality.
- Catalyst freshness.
- Whether the news has already played out.
- Whether claims are verifiable.

## Decision Labels

- 0-60: `REJECT`.
- 61-80: `WATCHLIST`.
- 81-100: `HIGH_CONVICTION_REVIEW`.
- Critical deal breaker: `CRITICAL_RISK` or `NOT_ELIGIBLE_FOR_REVIEW`.

## Product Language Rule

Do not use `APE` as a system output. It may exist in educational materials, but the product should use safer research labels.

Allowed:

- `WATCHLIST`.
- `HIGH_CONVICTION_REVIEW`.
- `REJECT`.
- `CRITICAL_RISK`.
- `NOT_ELIGIBLE_FOR_REVIEW`.
