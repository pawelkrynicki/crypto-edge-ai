# Product Modes: Research Review and New Token Scanner

## Product Principle

Crypto Edge AI is a web tool for crypto traders. It helps with research, market-topic selection, risk review, scam filtering, and decision process structure.

It is not only an automatic New Token Scanner. New Token Scanner is one key module, but it does not replace the full product.

## Mode 1: Research Review

Research Review lets a user manually submit a topic for analysis.

User input may include:

- News.
- Link.
- Token description.
- Market event.
- Personal observation.
- Narrative description.
- Contract address.
- Ticker.
- Screenshot described as text.

The system evaluates whether the topic deserves further review and returns:

- `category`.
- `score`.
- `bias`.
- `confidence`.
- `summary`.
- `reasoning`.
- `risk_factors`.
- `checklist`.
- `decision_label`.
- `disclaimer_note`.

Research Review is useful when the trader already has a topic and wants to reduce noise, clarify risk, and decide whether it is worth deeper analysis.

## Mode 2: New Token Scanner

New Token Scanner helps find and filter new tokens using real data.

The scanner focuses on:

- Scam elimination.
- Rug pull risk.
- Security checks.
- Liquidity.
- Holder distribution.
- Volume quality.
- Social quality.
- Narrative fit.
- Scorecard.

New Token Scanner is useful when the trader wants to discover new candidates and quickly reject dangerous or low-quality tokens.

## Shared Decision Layer

Both modes use a shared decision-support layer:

- Score.
- Risk.
- Bias.
- Confidence.
- Checklist.
- Decision labels.
- Disclaimer.

## Decision Labels

Allowed labels:

- `REJECT`.
- `WATCHLIST`.
- `HIGH_CONVICTION_REVIEW`.
- `CRITICAL_RISK`.
- `NOT_ELIGIBLE_FOR_REVIEW`.

These labels are research workflow labels. They are not trading signals.

## Safety Boundary

Crypto Edge AI may say:

- Eligible for review.
- Not eligible for review.
- Watchlist candidate.
- Critical risk.
- Requires manual verification.
- Research priority.
- Risk review.

Crypto Edge AI must not say:

- Buy.
- Sell.
- Enter now.
- Ape in.
- Guaranteed.
- Risk-free.
- Financial advice.
- Sure profit.
- Easy money.

The trader always makes the final decision.
