# AI KINTEL tRPC Access Control Blueprint

## Status

- Stage: 11E - tRPC access control blueprint.
- This is documentation only.
- It does not implement auth.
- It does not add backend code, endpoints, tRPC procedures, migrations, UI, CSS, source adapters, provider calls, OpenAI calls, or dependencies.

## Access Model

- Crypto Market access should come from the AI KINTEL subscription/access model.
- Internal roles may be used for workflow and diagnostics.
- Roles are subordinate to the AI KINTEL subscription/access gate.

Possible internal roles:

- `admin`
- `analyst`
- `viewer`

The final role names and checks should follow existing AI KINTEL conventions.

## Procedure Access

| Procedure area | Suggested access | Notes |
|---|---|---|
| Read-only module data | `viewer+` | Includes market summaries, projects, alerts, research events, on-chain snapshots, and safe source status. |
| Analyst review notes if enabled | `analyst+` | Optional/open decision; review state must not change scanner label, scoring, `final_label`, or `WATCHLIST` meaning. |
| Source health/admin diagnostics | `admin` or `analyst`; open decision | Rich diagnostics should be restricted and sanitized. |
| Source activation/config mutation | Not in MVP; future `admin` only | Source activation requires separate owner approval, env/config/policy gates, and vendor/commercial review. |

Production MVP should begin with read queries. Mutations should be deferred unless review-note ownership is explicitly decided.

## Subscription Gate Open Decisions

- Exact AI KINTEL gate location.
- Whether Crypto Market is a separate entitlement or included in an existing AI KINTEL plan.
- Whether review queue data is internal-only, user-specific, shared within an organization, or disabled.
- Whether analyst reports are user-visible, analyst-only, admin/internal, or backend export only.
- Whether source diagnostics are visible to analysts or restricted to admins.

## Security Rules

- No secrets in responses.
- No env values in responses.
- Source status can expose configured/disabled/deferred state, but not secret values.
- Errors must be sanitized.
- No raw provider payload unless explicitly approved by owner, policy, and storage review.
- Disabled/deferred paid sources must not be called.
- Missing env for disabled/deferred source is not an error.
- Missing env for enabled source is a sanitized configuration issue.
- Frontend must not call external providers directly.
- Future read queries should read DB rows populated by cron.

## Compliance Rules

- The module remains research-only.
- `WATCHLIST` means manual review only.
- Missing data means manual verification.
- Review status is an analyst workflow layer and must remain separate from scanner output.
- Scanner label, scanner scoring, and `final_label` must not be changed by access-control or review-note behavior.
