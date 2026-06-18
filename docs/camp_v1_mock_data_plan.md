# Camp v1 Mock Data Plan

## Purpose

Define safe mock/seed data for Camp v1 demonstrations of the Crypto Edge AI module.

This is not a production data collection plan and does not add live cron scripts.

## Mock Data Principles

- Use realistic but clearly seedable examples.
- Avoid claims of guaranteed profit.
- Include neutral, high-risk, and scam-suspicious scenarios.
- Make AI analysis useful for research, not trading instructions.
- Keep examples compatible with AIKINTEL `ai_analysis` JSON.

## Example Projects / Tokens

Seed 8-15 rows in `crypto_projects`.

Suggested examples:

| Symbol | Name | Category | Chain | Purpose in demo |
| --- | --- | --- | --- | --- |
| BTC | Bitcoin | L1 | Bitcoin | Market benchmark |
| ETH | Ethereum | L1 | Ethereum | Large-cap ecosystem |
| SOL | Solana | L1 | Solana | Narrative/opportunity watch |
| LINK | Chainlink | Oracle | Ethereum | Fundamental event example |
| ARB | Arbitrum | L2 | Ethereum | L2 narrative example |
| RNDR | Render | AI | Ethereum/Solana | AI narrative example |
| MEME | Meme Basket Example | Meme | Multi-chain | Hype/risk example |
| FAKE | Fake Yield Protocol | DeFi | BSC | Scam-suspicious example |

Recommended field coverage:

- `risk_score`.
- `opportunity_score`.
- `ai_analysis`.
- `market_cap_usd` where useful.
- `category`.
- `chain`.

## Example Scam Alerts

Seed 5-8 rows in `crypto_scam_alerts`.

Suggested examples:

1. Potential honeypot contract on `FAKE`.
2. Fake-team warning for a suspicious DeFi project.
3. Pump-dump risk for a meme token.
4. Phishing campaign impersonating a known ecosystem.
5. Contract-risk alert for unaudited token tax mechanics.

Each alert should include:

- `alert_type`.
- `severity`.
- `title`.
- `description`.
- `evidence_urls` as JSON.
- `ai_analysis`.
- `is_confirmed`.
- `published_at`.
- `hash`.

## Example Opportunities

Seed 6-10 rows in `crypto_opportunities`.

Suggested examples:

1. L2 activity narrative for ARB.
2. AI infrastructure narrative for RNDR.
3. Ethereum upgrade/fundamental event.
4. Solana ecosystem liquidity watch.
5. High-risk meme rotation example.
6. Airdrop watch item with deadline.

Each opportunity should include:

- `opportunity_type`.
- `risk_level`.
- `confidence_score`.
- `status`.
- `source_url`.
- `ai_analysis`.

## Example Market Summaries

Seed 3-5 rows in `crypto_market_summaries`.

Suggested examples:

1. Neutral daily summary.
2. Fear-driven market summary.
3. Greed/hype-driven market summary.
4. Weekly mixed market summary.

Each summary should include:

- `summary_date`.
- `timeframe`.
- `market_sentiment`.
- `fear_greed_index`.
- `btc_dominance`.
- `total_market_cap_usd`.
- `top_gainers`.
- `top_losers`.
- `trending_narratives`.
- `ai_summary`.
- `ai_analysis`.

## Required Camp Scenarios

## Scenario 1: Good Topic to Watch

Purpose:

Show a project/narrative that deserves observation but not a direct trade instruction.

Example:

- Symbol: `SOL`.
- Opportunity: ecosystem liquidity watch.
- Bias: bullish or neutral.
- Score: 70-80.
- Confidence: 65-80.
- Risk level: medium.

Expected AI behavior:

- Explain why the topic deserves monitoring.
- Ask user to verify liquidity, catalyst freshness, and invalidation.
- Avoid buy/sell language.

## Scenario 2: High-Risk Topic

Purpose:

Show a topic with potential attention but elevated risk.

Example:

- Symbol: `MEME`.
- Opportunity: high-volume meme rotation.
- Bias: neutral.
- Score: 45-60.
- Confidence: 55-70.
- Risk level: high.

Expected AI behavior:

- Warn about volatility and hype.
- Flag liquidity and post-move risk.
- Suggest checklist verification only.

## Scenario 3: Scam / Suspicious Project

Purpose:

Show scam alert and risk-first decision support.

Example:

- Symbol: `FAKE`.
- Alert: honeypot or fake-team warning.
- Bias: bearish.
- Score: 5-20.
- Confidence: 70-90.
- Risk level: critical.

Expected AI behavior:

- Clearly surface red flags.
- Recommend verification and avoidance of assumptions.
- Do not tell the user to short, buy, or sell.

## Scenario 4: News After the Fact

Purpose:

Show AI cooling down a stale news item that may already be priced in.

Example:

- Symbol: `LINK`.
- Opportunity: partnership/news item published after price movement.
- Bias: neutral.
- Score: 35-55.
- Confidence: 60-75.
- Risk level: medium.

Expected AI behavior:

- Identify post-news chasing risk.
- Ask user to verify timing and market reaction.
- Emphasize that catalyst freshness matters.

## Scenario 5: Neutral Market Summary

Purpose:

Show broad market context without forcing a directional view.

Example:

- Market sentiment: neutral.
- Fear and greed index: 48-55.
- Trending narratives: BTC ETF flows, L2 activity, AI tokens.
- Bias: neutral.

Expected AI behavior:

- Provide balanced summary.
- Highlight uncertainty.
- Suggest observation and verification.

## Seed Data Delivery Notes

Future implementation can deliver mock data as:

- Raw SQL seed script.
- Drizzle migration/seed if AIKINTEL uses this pattern.
- JSON fixtures loaded through a local script.

The owner must confirm the preferred seed/migration style before implementation.
