# Manus Prompt: AIKINTEL Frontend MVP

You are working on Crypto Edge AI, now the trader-facing layer of the AIKINTEL Crypto Market Module.

Do not design a standalone app. Build UI plans that match AIKINTEL patterns.

## Target Stack

- React 19.
- Tailwind CSS 4.
- shadcn/ui.
- wouter.
- TanStack Query.
- tRPC client.
- Lucide React icons.
- Existing AIKINTEL dark visual system.

## Target Page

Create or plan:

```text
packages/webapp/client/src/pages/CryptoMarket.tsx
```

Route:

```text
/crypto-market
```

## Required UI Sections

- Overview dashboard.
- Market summary.
- Projects/token list.
- Scam/risk alerts.
- Opportunities/narratives.
- On-chain metrics tab if data is available.
- Crypto Edge decision-support panel if compatible.

## Required Fields

Display:

- Score 0-100.
- Sentiment/bias: bullish, bearish, neutral.
- Confidence 0-100.
- Risk factors.
- Checklist.
- Research summary.
- Things to verify before trading.
- Disclaimer.

## Design Rules

- Use AIKINTEL dark theme.
- Use shadcn cards, tabs, badges, skeletons, and tooltips.
- Use existing sidebar/navigation conventions.
- Use tRPC only.
- Do not call external APIs from the frontend.
- Do not show buy/sell signals.
- Do not imply guaranteed profit.

## Forbidden Features

- Trading execution.
- Exchange integration.
- MT4.
- Telegram.
- Discord.
- Payments.
- Auto-buy.
- Auto-sell.
- Copy trading.
