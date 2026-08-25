# Canonical product information architecture

> **AUTHORITATIVE.** This document is the canonical source of truth for Crypto Edge AI product surfaces, Research Playbook ownership, navigation, current-step authority, AI role, Verification role and final deployment direction. If older documentation conflicts with this file, this file wins.

## Product purpose and hierarchy

Crypto Edge AI is a standalone research product. Radar answers what is available
to inspect; Candidate Detail explains one selected token; the Research Playbook
organizes the user's research work; Verification provides evidence tools; AI
explains what follows from stored evidence. Opening a surface does not change
lifecycle, Radar membership, Established membership, shared scanner facts or a
canonical AI result.

## Product surfaces

### Radar

Product Radar is the entry point for current shared and private baskets. It is
not a research-progress tracker and does not own Research Playbook state.

### Candidate Detail

Candidate Detail is the selected-token workspace and has exactly seven tabs:

1. Summary / Podsumowanie
2. Observation / Obserwacja
3. Market data / Dane rynkowe
4. Filters / Filtry
5. Security / Bezpieczeństwo
6. AI analysis / Analiza AI
7. Data and sources / Dane i źródła

These are data and analysis views, not Research Playbook stages.

### Verification

Verification is the manual evidence and source workspace. It has exactly six
tabs:

1. Identity / Tożsamość
2. Market data / Dane rynkowe
3. Filters / Filtry
4. Security / Bezpieczeństwo
5. Data and sources / Dane i źródła
6. Verification decision / Decyzja weryfikacyjna

These are tools, not the seven-stage research process. A Playbook stage can
use more than one Verification tab, and a Verification tab can support more
than one stage. Verification does not own progress or present a second full
Playbook.

## Research Playbook

The single master Research Playbook lives in **Candidate Detail → Summary**.
It is the answer to “where am I, what is known, and what is next?” It shows
all seven inspectable stages, completeness, actual evidence states, red flags
and the next required work:

1. Szybki filtr / Quick filter
2. Deal Breakers / Deal breakers
3. Bezpieczeństwo / 3 kontrole / Security / 3 checks
4. On-chain / On-chain
5. Social / Social
6. Scorecard / Scorecard
7. Finalna checklista / Final research checklist

Selecting a stage opens its focused, read/research view inside Candidate Detail
→ Summary. It never marks the stage complete, advances lifecycle or routes to
Verification merely to render the stage. Completed, current and future stages
are all inspectable. Future stages remain read-only except for the legitimate
manual evidence actions already provided by that stage; partial known facts
remain visible and are never represented as generically “locked”.

The focused view shows the numbered stage, state, checks, existing evidence,
red flags, missing items, manual requirements and available actions. Back to
Research Playbook returns to the Summary master.

## Single current-step authority

resolveResearchChecklist(candidate, manualEvidence) is the sole product
authority for progress. Its ResearchChecklistView.current_step, resolved
against the current user's private research evidence where that contract
applies, is the value rendered by:

- Candidate Detail → Summary master;
- Candidate Detail → Summary focused stage;
- neutral Verification context when opened by a Playbook evidence action.

There is no other product current-step resolver, lifecycle-derived stage,
stored UI heuristic, hard-coded display value or provider-prose authority.
Private evidence can alter that user's resolved checklist and therefore that
user's presented stage, but remains actor-private. It does not mutate shared
scanner facts, Radar/lifecycle, scorecard persistence or another user's view.

## Deal Breakers rule

Step 2 is a calculated checklist summary, not another evidence store.
reconcileResearchChecklistStep2 mirrors canonical overlapping facts from
security, on-chain and social domains into the stop/go summary. Honeypot,
taxes, contract verification, wallets, security and social facts must not be
entered a second time solely for Deal Breakers.

## AI role and shared-cache boundary

AI answers what follows from verified stored data, risks and gaps. It does not
own stage completion, current step, manual evidence, scorecard mutation,
lifecycle, Radar or Established promotion.

The heavy AI result remains shared and its identity never contains actor ID,
session, private workspace or private research evidence. Candidate Detail → AI
never renders a current Playbook step, a 1/7–7/7 tracker or a stage label as
an AI-owned state. It states its purpose plainly: it explains what follows from
available verified data, the important risks and gaps, and what still requires
research. It may link to the Summary master Playbook without duplicating its
progress. AI availability distinguishes no analysis yet, queued, processing,
ready, provider/system error and stale/new-evidence states according to the
frozen v7 contract; absence of a request is not an error.

## Candidate filters, security and provenance

Candidate Detail → Filters presents the five canonical basic-filter facts:
market cap, 24-hour volume, liquidity, volume/market-cap ratio and pair age.
Each fact uses the canonical filter resolver for its current value, hard
threshold and state. Preferred ranges are labelled non-blocking; they do not
silently become lifecycle rules.

Candidate Detail → Security separates **confirmed / available** canonical
facts from **missing checks**. It never fabricates an unavailable security
value, and its manual Verification CTA remains a source-checking action.

Data and sources distinguishes canonical provenance from a manual destination.
It shows a real captured source when the canonical snapshot retained it. When a
historical Follow-up snapshot retained values and capture time but not source
provenance, it says that simply; it never calls an external verification link
the source of a value it did not produce. Persistence or projection vocabulary
does not appear in normal CAMP UI.

## Freshness, checkpoints and automation boundary

Data freshness and Research Playbook progress are separate axes. A stale
snapshot can be displayed next to the resolver-derived current stage; it does
not redefine, rewind or become a second authority for that stage. Refresh is
read-only: it loads an accepted snapshot and does not start collector,
provider, queue, worker or OpenAI work.

The header label **Last data update / Ostatnia aktualizacja danych** means the
last accepted, published central product snapshot relevant to the view. It is
not the time a browser read or refreshed its view. A delayed/stale state stays
visible with the last-known-good data.

A Follow-up checkpoint is a planned date to reassess data, not a guaranteed
automatic operating-system execution. The UI shows an execution time only when
the real automation-status contract proves one is scheduled. The central
scheduler and collector, not a browser, create fresh data: on the VPS the
scheduler wakes independently, one coordinator acquires the single-flight
lock, publishes atomically and advances the product-version pointer for all
readers.

### Central automation operational contract

A real central product cycle may perform only canonical **system** lifecycle
transitions defined by the lifecycle contract. It never writes private user
Radar state, private research evidence, scorecards or an automatic Established
promotion. In contrast, browser refresh, product-version polling, read-only
user fan-out and offline regression run with zero lifecycle mutations.

An explicit owner one-shot data smoke is a bounded coordinator execution, not
a scheduler resume. It acquires the same global single-flight lock, preserves
provider budgets, retries and atomic/LKG protections, then exits. It does not
enable or resume persistent scheduling, alter the prior enabled/suspended
operator configuration, install a task, create a timer or schedule a follow-up
run. This allows a suspended local owner preview to validate one bounded cycle
without changing how its normal scheduler is configured.

Invalid or insufficient source coverage is never published merely to advance a
timestamp. A transient source/data-quality failure preserves the accepted
last-known-good snapshot, records a safe failure state and applies bounded
cadence-safe backoff before the next scheduled opportunity. It does not become
a hidden permanent stale-data dead state. Deterministic contract/provenance
failures remain separately suspendable for operator intervention. VPS central
automation continues to run independently of browser presence; local owner
preview automation may remain disabled or suspended until an operator changes
that configuration deliberately.

## Radar and private organization

**Product Radar** is shared server-owned product state and answers which token
to inspect. Its New, Further observation and Main Radar counts use one
canonical basket meaning; pipeline metrics are labelled as pipeline metrics and
never presented as competing basket totals or score-like `6/6` values.

**Your Radar** is actor-private organization only. Its active state is named,
visibly marked and accessible independently of Product Radar. CAMP users may
move a private assignment between Further observation and Main Radar, or remove
the private assignment. These controls use the same private-Radar component on
Radar cards and Candidate Detail, state that the action is private-only, and
never mutate product lifecycle, Established, shared research or another
user's workspace.

## Evidence navigation and routes

One route format is used for a selected candidate:

| Intent | Canonical route state |
| --- | --- |
| Summary master | chain, contract, detail=summary, research_playbook=1, candidate-detail hash |
| Focused stage | the master route plus research_step=1..7 |
| Verification from a specific check | chain, contract, research_step=1..7, research_check=check, external-checks hash |
| Return from Verification | the same candidate Summary focused-stage route |
| AI → Playbook | the Summary master route |

Locale remains controlled by the existing locale route/preference contract and
candidate identity is retained. Browser history uses ordinary pushState; back
and forward therefore restore the corresponding master, focused stage or
specific Verification context without a route loop.

Only a specific evidence/check action may open Verification. The current
Security-stage Honeypot action opens the existing Security tab with Playbook
context, the selected stage and the specific check. Verification always offers
return to that same focused stage. It never embeds a full seven-stage
Playbook in Data and sources.

Missing Verification evidence uses one canonical mapping from a missing-item
key to an exact internal check or external tool location where one exists.
Decision items are keyboard-accessible, visibly interactive and retain
candidate, locale and Decision origin. A focused check offers a return to the
same Verification Decision context; an unmapped item gives truthful inline
guidance instead of a dead link.

## Final owner-review interaction rules

1. Every Candidate Detail tab renders its selected content on a single click.
2. The selected Candidate Detail tab, its rendered panel and its canonical
   route state are atomic: they must never diverge.
3. Candidate Detail → Verification carries the same token identity into the
   Verification drawer automatically.
4. An unsupported or otherwise ineligible candidate still opens in
   Verification; the drawer states the exact product blocking reason instead
   of clearing selection.
5. Verification Decision records a verification opinion. It is not a private
   Research Playbook evidence editor.
6. Private evidence editing belongs only in the relevant focused Research
   Playbook stages.
7. Verification Decision contains only current result, concise available and
   missing context, the decision, a short note, save and return controls.
8. Known missing Verification items use the canonical direct-target mapping;
   unmapped items use truthful inline guidance.
9. Effective Product Radar and Your Radar states have text, accessible state
   semantics and a visibly active marker; color is supplementary only.
10. The Your Radar heading and explanation sit outside its basket-card grid.
11. Raw persistence field names such as `chain` and `contract_address` are
    forbidden in normal user-facing copy.
12. Market snapshot time and record-check time are distinct concepts and are
    never substituted for each other.
13. AI ineligibility is distinct from a provider or system failure and gives
    the deterministic eligibility reason without a request/retry action.

## Reports

Reports remain a backend/history and audit capability. They are not a CAMP
frontend section: no normal sidebar item, route or product rendering exposes
Reports, and an old `#reports` URL redirects to the canonical Radar start.

## Read/write boundaries and forbidden duplication

Inspection, navigation, locale changes and refresh are read-only. Existing
manual evidence and verification-decision controls retain their established
private-write contracts. No future work may:

- add an eighth Candidate Detail tab or seventh Verification tab for Playbook;
- make Candidate Detail tabs equivalent to Playbook stages;
- duplicate the Playbook master or seven-stage tracker in AI or Verification;
- introduce another current-step authority;
- put private evidence into shared AI cache identity;
- turn freshness into research progression;
- duplicate Deal Breaker facts in another store.

## Final RC deployment direction

1. Finalize the local standalone product.
2. Validate the local Release Candidate.
3. Deploy it to the owner's VPS.
4. Complete full VPS regression and operational validation.
5. Configure the tunnel/domain.
6. Use AIKINTEL only as the entry/redirect to Crypto Edge AI.
7. Freeze CAMP after that validated path.

AIKINTEL never hosts or reimplements Crypto Edge AI.
