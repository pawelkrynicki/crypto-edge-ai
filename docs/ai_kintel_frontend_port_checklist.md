# AI KINTEL Frontend Port Checklist

## Status

- Stage: 11F - future implementation checklist.
- This is documentation only.
- No code is implemented in 11F.
- It does not create `packages/webapp`, `CryptoMarket.tsx`, route registration, sidebar navigation, React components, Tailwind/shadcn runtime code, backend code, runtime tRPC procedures, endpoints, auth implementation, source adapters, provider calls, OpenAI calls, dependencies, source activation, or local RC changes.

## Before Implementation

- Confirm AI KINTEL frontend conventions.
- Confirm route registration location.
- Confirm sidebar navigation pattern.
- Confirm shadcn components available.
- Confirm Tailwind/dark-theme conventions.
- Confirm tRPC procedures are available or explicitly mocked in AI KINTEL dev context.
- Confirm subscription/access gate.
- Confirm review queue ownership decision.
- Confirm source diagnostics visibility by role.
- Confirm paid sources remain disabled/deferred until activation approval.

## Implementation Checklist

- Create page at `aikintel-platform/packages/webapp/client/src/pages/CryptoMarket.tsx`.
- Register route `/crypto-market`.
- Add sidebar nav entry `Crypto Market`.
- Call `trpc.cryptoMarket.*` only.
- Render loading state.
- Render empty state.
- Render sanitized error state.
- Render stale data state.
- Render partial data state.
- Render disabled/deferred source state.
- Render access denied state.
- Render compliance block.
- Render data freshness.
- Render source status.
- Avoid direct provider calls.
- Avoid secrets in browser code.
- Avoid provider URLs and provider auth headers in browser code.
- Avoid disallowed CTA/function wording.
- Preserve scanner label, scanner scoring, `final_label`, and `WATCHLIST` meaning.

## QA Checklist

- Desktop layout.
- Mobile layout.
- Dark theme readability.
- Header freshness/status badges.
- Source deferred state.
- Source disabled state.
- Stale data state.
- Partial data state.
- Access denied state.
- Empty data state.
- Project list.
- Project detail.
- Research queue or owner-deferred state.
- Risk alerts.
- On-chain metrics.
- Sources / Health safe status.
- Methodology / Compliance section.
- Compliance copy visible without dominating the workspace.
- No direct browser provider call in network/code review.
- No secrets, env values, or raw provider payloads in UI.

## Non-Goals For 11F

- No implementation in 11F.
- No runtime route.
- No tRPC procedures.
- No provider calls.
- No source activation.
- No backend changes.
- No auth implementation.
- No UI/CSS changes.
- No local RC changes.
- No scanner scoring change.
- No `final_label` change.
- No `WATCHLIST` meaning change.
