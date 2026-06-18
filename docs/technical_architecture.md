# Technical Architecture

## Architecture Direction

Crypto Edge AI is developed in this standalone working repository first, with a clear path for later AIKINTEL integration.

The technical design should remain compatible with the AIKINTEL monorepo, but implementation does not move into the main AIKINTEL repo until access and integration timing are confirmed.

## Target Monorepo Paths

```text
packages/webapp/client/src/pages
packages/webapp/client/src/components
packages/webapp/server/routers
packages/cron/scripts
packages/cron/lib/db.ts
docs
vault
```

Do not modify:

```text
packages/webapp/server/_core
```

## Stack

### Frontend

- React 19.
- Tailwind CSS 4.
- shadcn/ui.
- wouter.
- TanStack Query.
- Lucide React icons.
- Recharts or existing AIKINTEL charting patterns where needed.

### Backend

- Express.
- tRPC.
- Existing AIKINTEL router pattern.

### Database

- MySQL / MariaDB.
- Drizzle ORM in `packages/webapp`.
- `mysql2/promise` in `packages/cron`.

### Runtime

- Node.js 20.
- TypeScript.
- `tsx` for cron scripts.
- PM2 for scheduled processes.

### AI

- OpenAI API through AIKINTEL internal helper or established project pattern.
- No provider calls from frontend.
- No committed provider keys.
- Mock AI output may be used before real provider wiring.

## Data Layer

The module should follow AIKINTEL database conventions:

- Table names: snake_case, plural.
- Column names: snake_case.
- Primary key: `id INT AUTO_INCREMENT PRIMARY KEY`.
- Timestamps: `created_at`, `updated_at`.
- JSON AI output in `ai_analysis`.
- `hash VARCHAR(64) UNIQUE` for deduplication.
- Relevance or score fields as `TINYINT` 0-100.
- Charset: `utf8mb4`.

## Proposed Tables

- `crypto_projects`.
- `crypto_scam_alerts`.
- `crypto_opportunities`.
- `crypto_onchain_metrics`.
- `crypto_market_summaries`.

Use existing `crypto_news` if available in AIKINTEL.

## Backend API Pattern

Create a router:

```text
packages/webapp/server/routers/cryptoMarket.ts
```

Register it in the main router as:

```text
cryptoMarket: cryptoMarketRouter
```

The router should expose protected read procedures for:

- `projects`.
- `scamAlerts`.
- `opportunities`.
- `marketSummary`.
- `onchainMetrics`.

## Frontend Pattern

Create a page:

```text
packages/webapp/client/src/pages/CryptoMarket.tsx
```

Register route:

```text
/crypto-market
```

The page should follow existing AIKINTEL visual conventions:

- Dark UI.
- shadcn components.
- Tabs.
- Cards.
- Badges.
- Skeleton states.
- Existing sidebar/navigation pattern.

## Cron Pattern

Scripts should live in:

```text
packages/cron/scripts/fetch-crypto-*.ts
packages/cron/scripts/generate-crypto-summary.ts
```

Scripts should:

- Import shared DB helper from `../lib/db.js`.
- Use `query`.
- Generate SHA-256 hashes for deduplication.
- Use `ON DUPLICATE KEY UPDATE`.
- Respect rate limits with sleeps.
- Handle errors with try/catch.
- Exit cleanly for PM2 cron restarts.

## Security Rules

- No hardcoded credentials.
- All secrets through `process.env`.
- No frontend external API calls.
- Frontend calls tRPC only.
- AI provider usage remains backend/cron only.
- Validate JSON before insert.
- Use UTC timestamps.
- Avoid modifying AIKINTEL framework internals.
