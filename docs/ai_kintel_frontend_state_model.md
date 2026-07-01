# AI KINTEL Frontend State Model

## Status

- Stage: 11F - frontend state model.
- This is documentation only.
- It does not create frontend code, React components, route registration, sidebar navigation, UI/CSS, backend code, runtime tRPC procedures, provider calls, dependencies, source adapters, or source activation.

## State Matrix

| UI state | UI wording | Visual severity | Source of state | Should block page? | Compliance note |
|---|---|---|---|---|---|
| `loading` | `Loading Crypto Market research context...` | Neutral loading | TanStack Query/tRPC pending state | Section-level where possible | Do not show stale success copy while first load is pending. |
| `loaded` | `Crypto Market context loaded.` | Success/neutral | Successful tRPC response | No | Still show research-only note and freshness. |
| `empty` | `No data available yet. Manual verification required before drawing conclusions.` | Neutral/info | Empty `items`, null `item`, or `no_data` warning | No, unless core page data is absent | Missing data is not positive context. |
| `partial_data` | `Partial data available. Review source status before using this context.` | Warning | `warnings` or `data_freshness.partial` | No | Keep available data visible; do not invent missing fields. |
| `stale_data` | `Data may be stale. Check source status and verify manually.` | Warning | `data_freshness.is_stale` or `stale_data` warning | No, unless stale threshold is critical by owner policy | Stale data requires manual verification. |
| `source_disabled` | `Source disabled.` | Info | `source_status.status = disabled` | No | Disabled source is expected when configured off. |
| `source_deferred` | `Paid/deferred source is not configured yet.` | Info | `source_status.status = deferred` | No | Deferred paid source is not a runtime error. |
| `source_env_missing` | `Source configuration is incomplete.` | Warning only if source enabled; info if disabled/deferred | Sanitized source status | No for disabled/deferred; maybe section-level for enabled required source | Do not expose env var values. |
| `source_policy_blocked` | `Source is blocked by policy.` | Warning/info | Source policy status | No for non-core sources; section-level if core data unavailable | Do not bypass policy from frontend. |
| `access_denied` | `Crypto Market access requires the appropriate AI KINTEL subscription or role.` | Blocked/permission | tRPC auth/access error | Yes for protected content | Do not show provider fallback or source details. |
| `error` | `Crypto Market data could not be loaded. Try again later or check module health.` | Error | Sanitized tRPC error | Page-level only for core failures; otherwise section-level | No secrets, stack traces, env values, or raw provider payloads. |
| `manual_verification_required` | `Manual verification required.` | Info/warning depending on context | Compliance block, missing fields, warnings | No | Use when data is missing, incomplete, stale, or source coverage is insufficient. |

## Rules

- Disabled paid source is not an error.
- Missing env for a disabled source is not an error.
- Missing env for an enabled source is a sanitized configuration issue.
- Missing data means manual verification.
- Stale and partial states should show warning copy while keeping available data visible.
- Access denied uses AI KINTEL subscription/role wording.
- UI must not expose secrets, env values, stack traces, raw provider payloads, or provider auth details.
- Frontend must not recover from source errors by calling providers directly.
- Review state, if added later, must not change scanner label, scanner scoring, `final_label`, or `WATCHLIST` meaning.

## Blocking Guidance

- Block the page only for `access_denied` or core fatal tRPC/database errors.
- Prefer section-level warnings for partial/stale/source-disabled states.
- Keep methodology and compliance copy visible even when data is empty or stale.
- If source status is unavailable, render a sanitized warning and do not show operational internals to regular viewers.
