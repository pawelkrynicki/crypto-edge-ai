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
- Candidate Detail → AI compact context;
- Verification context when opened by a Playbook evidence action.

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
may render only a compact deterministic Research Playbook current-stage overlay.
That overlay is composed from the current user's Checklist at presentation
time; it never regenerates OpenAI, fragments the cache or mutates the stored
canonical AI result. AI may independently show snapshot freshness, missing
evidence, risks and server-owned next actions.

## Freshness boundary

Data freshness and Research Playbook progress are separate axes. A stale
snapshot can be displayed next to the resolver-derived current stage; it does
not redefine, rewind or become a second authority for that stage. Refresh is
read-only: it loads an accepted snapshot and does not start collector,
provider, queue, worker or OpenAI work.

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

## Canonical deployment direction

1. Finalize the standalone product locally.
2. Produce the local Release Candidate.
3. Move standalone Crypto Edge AI to the owner's VPS.
4. Make it operate correctly and independently on the VPS.
5. Complete full VPS regression and operational validation.
6. Configure the tunnel/domain.
7. AIKINTEL provides only entry, redirect or access path to standalone Crypto Edge AI.
8. Do not rebuild Crypto Edge AI inside AIKINTEL.
9. Final CAMP freeze.

Crypto Edge AI remains a standalone application. It is not being ported into
AIKINTEL, and AIKINTEL is not the runtime host of Crypto Edge AI. After VPS
and tunnel are complete, AIKINTEL is only an entry/redirect/access surface.
