# PC.3E — Research scorecard contract (v1)

## Purpose and boundary

`research_scorecard_v1` is a deterministic **Research Playbook** calculation. It summarizes confirmed research evidence for the current actor. It is not an investment recommendation, a return forecast, a safety probability, or a scanner score.

The public response extension is `research_scorecard_view_v1`, returned as `effective_scorecard` on the existing `research_checklist_view_v1` read model. This is backward compatible: the checklist schema and its seven steps remain unchanged.

The resolver uses only:

- the existing, read-only automatic candidate facts;
- private research evidence already loaded for the requesting actor.

It does not write a score, call a provider, call OpenAI, alter a scanner snapshot, update lifecycle/Radar/Established state, or alter AI cache. The shared `PersistableScorecard` stays untouched. There is no score-edit endpoint.

## Frozen maximums

| Domain | Maximum |
| --- | ---: |
| Security | 30 |
| On-chain | 25 |
| Social | 25 |
| Narrative | 20 |
| Total | 100 |

Every applicable unique criterion in a domain receives an equal share of that domain's fixed maximum. `NOT_APPLICABLE` criteria are removed from that domain's allocation. Missing, external-tool, resolved-concern, and red-flag criteria remain applicable and earn zero. Calculations retain fractional precision; UI rounds only for display.

The total is always `/ 100`. It is never normalized around unavailable Narrative evidence. V1 has no approved structured numeric Narrative source, so Narrative is deliberately `scored: false`, earns `0 / 20`, and leaves `unresolved_max: 20`.

## States and positive evidence

`AUTO_VERIFIED` only says that a fact is known. It never earns a point by itself. Each criterion checks its value semantics and produces one of:

- `POSITIVE` — positive evidence earns its equal share;
- `RESOLVED` — known or manually assessed, but no positive allocation;
- `MISSING` — missing or still open in an external tool;
- `RED_FLAG` — known red flag, zero allocation;
- `NOT_APPLICABLE` — excluded before the equal allocation is calculated.

Red flags and missing evidence stay visible independently of the total.

## Unique criterion mapping

The score resolves overlapping facts exactly once. Step 2 deal-breaker duplicates are represented by the unique Security or On-chain check below; they never create a second allocation.

### Security / 30

| Criterion | Positive evidence | Resolved but zero / red handling |
| --- | --- | --- |
| Honeypot | low risk, no honeypot, or passed | recorded honeypot is red |
| Contract verified | `true` | `false` is red |
| Buy tax / sell tax | `<= 10` | above 10 follows existing red state |
| Ownership | renounced | active is resolved zero; unknown is missing |
| Mint / blacklist / whitelist / sell restriction / proxy risk | `false` | `true` is red |
| TokenSniffer | `>= 50` | `< 50` is red |
| De.Fi Scanner | structured manual `clean` or `acceptable` | manual risk/red state is red; no numeric threshold exists |

### On-chain / 25

| Criterion | Positive evidence | Resolved but zero / red handling |
| --- | --- | --- |
| Top-1 wallet | `< 10%` | `10–30%` zero; existing `>30%` red |
| Top-10 wallets | `< 40%` | `>=40%` is zero, never newly red |
| Liquidity / market cap | `10–30%` | `3–10%` and `>30%` zero; existing `<3%` red |
| Liquidity lock | locked | unlocked is red |
| Lock days | `180–365` | other known duration is zero |
| Holder count | `>=300` | lower known count is zero, not newly red |
| Developer wallet | `<5%` | `5–10%` zero; only existing `>10% unlocked` state is red |
| Wallet clustering | no material cluster | needs attention is zero; strong related cluster is red |
| Volume quality | natural | requires attention is zero; suspicious is red |

`liquidity_lock_end_date` is supporting evidence only because lock duration already measures the same quality fact.

### Social / 25

Link availability always remains missing for scoring. Positive evidence requires a private structured finding:

- X/Twitter, Telegram, Discord: `healthy`;
- Website: `working`;
- Team: `transparent`;
- Whitepaper: `reasonable`;
- Roadmap: `coherent`.

`needs_attention` and an `anonymous` team are resolved zero, not red. Suspicious social/website, suspected copy-paste, or an existing red state are red.

## Output shape

`effective_scorecard` contains the scoring/schema versions, all four domain blocks (`earned`, `max`, `resolved`, `applicable`, `missing`, `red_flags`, human-readable reasons), total (`earned`, `max: 100`, `scored_max`, `unresolved_max`), completeness/partiality, global counters, and a single global readiness aggregation grouped by Steps 1–6.

Step 7 derives both its status and counters from this same aggregation:

1. red flag present → `RED_FLAGS_DETECTED` / “Wykryto czerwone flagi”;
2. otherwise missing evidence → `RESEARCH_INCOMPLETE` / “Research niekompletny”;
3. only complete evidence → `RESEARCH_COMPLETE_FOR_OWN_ASSESSMENT`.

No state uses buy/sell/invest/safe language.

## UI contract

Step 6 exposes a beginner-first partial `earned / 100` scorecard, explicit Narrative gap, counters, red-flag notice, and non-advisory helper copy. Its calculation detail is collapsed by default and uses symbols, labels, and translated evidence states only—never IDs, provider internals, or raw JSON.

Step 7 exposes one readiness status, score, the same global checked/red/missing counters, one non-trading next action, and a collapsed meaningful checklist grouped by Steps 1–6. Step 2 explains that duplicate facts are intentionally represented once rather than being double-counted.

## Seven-step product audit

| Step | Useful | Beginner value | Advanced value | Truthful | Empty wall |
| --- | --- | --- | --- | --- | --- |
| 1 — Quick filter | Yes | Yes | Yes | Yes | No |
| 2 — Deal breakers | Yes | Yes | Yes | Yes | No |
| 3 — Security | Yes | Yes | Yes | Yes | No |
| 4 — On-chain | Yes | Yes | Yes | Yes | No |
| 5 — Social / Team / Docs | Yes | Yes | Yes | Yes | No |
| 6 — Scorecard | Yes | Yes | Yes | Yes | No |
| 7 — Final checklist | Yes | Yes | Yes | Yes | No |

## Privacy and authorization

The HTTP checklist handler loads `research_evidence` with `session.context.actor_id`. Therefore User A's saved social evidence can change only User A's `effective_scorecard`; User B resolves from a different evidence list. Trusted testers can read the scorecard but retain no `CAMP_USER_WORKSPACE_WRITE` capability and receive `403` for evidence writes. A score-write route does not exist.
