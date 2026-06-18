# Rug Pull Risk Engine

## Purpose

Rug Pull Risk Engine is the risk layer that identifies critical token risks before a candidate reaches setup review.

It is part of New Token Scanner and Final Checklist.

## Critical Risks

Critical risks include:

- Unlocked liquidity.
- Liquidity lock <30 days.
- LP tokens controlled by a single wallet.
- Contract ownership active.
- Mint function possible.
- Blacklist/whitelist functions.
- Sell restrictions.
- Hidden owner / proxy risk.
- Top wallet concentration.
- Fresh wallets buying together.
- Large transfers between linked wallets.
- Developer wallet sells during pump.
- Liquidity spike without organic volume.

## Deal Breaker Output

If any critical security item fails, output one of:

- `REJECT`.
- `CRITICAL_RISK`.
- `NOT_ELIGIBLE_FOR_REVIEW`.

Do not output:

- `DO NOT BUY`.
- `SELL`.
- `SHORT`.

Safer product language:

- Reject from review.
- Critical risk, do not proceed to setup review.
- Not eligible for watchlist.

## Required Checks

Security:

- Honeypot passed.
- Contract verified.
- GoPlus/Token Sniffer/De.Fi no critical flags.
- Tax <10%.
- Ownership renounced or timelock confirmed.
- No mint or hidden risky functions.

Distribution:

- Holders >300.
- Top 10 wallets below threshold.
- Top 1 wallet below threshold.
- No obvious linked cluster.

Liquidity:

- Liquidity >$30K.
- Liquidity/MC >5%.
- Liquidity locked/burned.
- Volume healthy.

Social:

- Organic engagement.
- Real community discussion.
- No aggressive shilling.
- Team/admin responsive.

Personal:

- I understand what I am reviewing.
- I accept potential full loss.
- Position size follows risk rules.
- Exit plan exists.

## Camp BETA Implementation Boundary

This document defines behavior and scoring logic only. Do not implement production security fetchers until data access and terms are confirmed.

## Second Code POC: Security Enrichment

The second POC implements only a controlled subset:

- Fixture GoPlus response.
- Fixture Honeypot.is response.
- Best-effort live GoPlus/Honeypot.is calls without keys.
- Normalization into Crypto Edge AI security model.
- Critical and warning decision rules.

The POC must not invent unavailable data. Missing top wallet, top 10 wallet, liquidity lock, ownership, or source data should remain null and be listed in `missing_data`.

## Third Code POC: Combined Scanner

The combined scanner uses this risk layer after DexScreener discovery and basic filters.

Final behavior:

- Basic filter rejection returns `REJECT` without security enrichment.
- `SECURITY_PASSED` returns `WATCHLIST`.
- `CRITICAL_RISK` returns `CRITICAL_RISK`.
- `NEEDS_MANUAL_VERIFICATION` returns `NEEDS_MANUAL_VERIFICATION`.
- Missing security check returns `NEEDS_MANUAL_VERIFICATION` with `NOT_CHECKED`.

`WATCHLIST` means eligible for further research only. It is not permission to buy, not a signal, and not financial advice.

Known asset caution: the risk engine is primarily designed for new tokens and microcaps. Large known assets, stablecoins, wrapped tokens, or special contract structures can trigger warnings that require human context. This is documented as future work only; no whitelist or known assets list is implemented in the POC.
