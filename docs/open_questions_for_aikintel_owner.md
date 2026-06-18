# Open Questions for AIKINTEL Owner

## Answered Decisions

1. Answered: Working repo remains separate for now.
   - Decision: Continue conceptual and technical work in `pawelkrynicki/crypto-edge-ai`.

2. Answered: Later integration path.
   - Decision: Crypto Edge AI may be connected/deployed into AIKINTEL after it works and is ready for integration.

3. Answered: Auth/users model.
   - Decision: Use existing AIKINTEL auth/users if integrated into the platform.

4. Answered: Module/menu name.
   - Decision: Use `Crypto Edge AI`.

5. Answered: Relationship to Market News.
   - Decision: AIKINTEL already has Market News with Crypto category, sentiment filters, and AI Analysis. Crypto Edge AI should not duplicate it. It should reuse or map to it if data access is possible.

6. Answered: Camp v1 users.
   - Decision: Camp v1 targets real users like AIKINTEL, starting as a controlled module version.

7. Answered: Product direction.
   - Decision: Do not change direction to a separate `Crypto Market` product. Crypto Edge AI remains the main module direction.

## Still Open

1. Do we have access to the main AIKINTEL repo, and when should implementation move there?

2. What is the exact schema for AIKINTEL Market News / Crypto?
   - Does `crypto_news` exist in production?
   - Which fields are available for sentiment, AI Analysis, categories, tags, related coins, and source URLs?

3. What is the preferred migration mechanism?
   - Drizzle migration.
   - Raw SQL.
   - Separate deployment script.
   - Other AIKINTEL convention.

4. What is the current status of the OpenAI helper?
   - Does it already exist?
   - Where is it located?
   - What model/configuration patterns does AIKINTEL use?

5. Which data sources are approved for v1?
   - CoinGecko.
   - CryptoCompare.
   - DefiLlama.
   - CoinMarketCap if useful and accessible.
   - Dune / public dashboards.
   - GDELT.
   - Existing AIKINTEL Market News.
   - Fear & Greed Index.
   - Token Unlocks if legal API access exists.
   - Public CEX/DEX data without violating terms.

6. What AI usage limits and cost controls should apply?
   - Per user.
   - Per day.
   - Per setup review.
   - Whether `insight_costs` / `token_pools` apply.

7. When do we move from this standalone working repo into the main AIKINTEL repo?

## Deferred Until Integration

- Whether private watchlists are included in v1.
- Whether setup reviews are persisted in v1.
- Whether real data fetchers are built before or after main repo access.
- Whether production cron scripts are needed for Camp v1.
