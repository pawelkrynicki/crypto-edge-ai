# Frontend Target Flow Map

Stage: 12E.12 Frontend Contract Tests

Implemented deep links: `#candidate-results`, `#candidate-detail`, `#token-lookup`, `#external-checks`, `#feedback-notes`, `#control-center`, `#trusted-preview`, `#webinar-teaser`

Next implementation stage: 12E.12 Frontend Contract Tests

Only target flow:

```text
Start / Radar -> Candidate Results -> Candidate Detail -> Token Lookup -> External Checks -> Manual Verification -> Review / Watchlist -> Feedback Notes
```

Control Center remains an admin/status view.

Navigation groups after 12E.8:

- `Product Flow`: Candidate Results, Candidate Detail, Token Lookup, External Checks.
- `Review / Feedback`: Feedback Notes and the local review queue.
- `Admin / Status`: Control Center, source freshness/status surfaces, scanner/reference views, and technical review surfaces.
- `Demo / Preview`: Trusted Preview and Webinar Teaser.

The 12E.8 cleanup preserves existing deep links and does not add backend, storage, provider calls, source activation, fetches, scraping, scoring changes, `final_label` changes, or `WATCHLIST` meaning changes.

The 12E.9 pass adds shared frontend-only Empty / Error / Partial States through `ProductStateNotice`. Candidate Results, Candidate Detail, Token Lookup, and External Checks now show data gaps, partial source coverage, unknown freshness, missing contract/chain, required external checks, security/liquidity gaps, and a `next review step` without adding backend, storage, provider calls, source activation, fetches, scraping, scoring changes, `final_label` changes, or `WATCHLIST` meaning changes.

The 12E.10 pass standardizes frontend copy and naming around `Candidate Results`, `Candidate Detail`, `Token Lookup`, `External Checks`, `Manual Review`, `Source Freshness`, `Risk Flags`, `Data Gap`, `Next Review Step`, `Manual Verification Required`, `Cannot Infer Safety`, and `Watchlist Candidate`. Copy stays research-only, does not suggest an investment recommendation, keeps `WATCHLIST` as Manual Review Only, and does not add backend, storage, provider calls, source activation, fetches, scraping, scoring changes, `final_label` changes, or `WATCHLIST` meaning changes.

The 12E.11 pass polishes the visual hierarchy of the same target flow: spacing, cards, status badges, Manual Verification / Product State notices, Research Action Panel, header/sidebar framing, and responsive behavior. It is UI polish only and preserves the existing flow, implemented deep links, data logic, scoring, `final_label`, and `WATCHLIST` meaning.

The 12E.12 pass locks the same standalone target flow with frontend contract tests. Coverage protects required deep links, Candidate Results as the default product view, navigation group ownership, Candidate Results, Candidate Detail, Token Lookup local classifications, External Checks link-only/manual semantics, Manual Verification and Product State copy, Research Action Panel actions, forbidden trading CTA copy, and forbidden frontend mechanisms in the product flow files. No browser automation dependency was added; responsive no-horizontal-overflow checks for 1440x900, 1920x1080, and 390x844 remain manual preview validation because the repo has no existing browser harness. 12E Frontend Productization is complete. Next stage: 12F.1 — Private Preview Access Method.

| Flow | Goal | User sees | Do not show | Next step |
|---|---|---|---|---|
| Start / Radar | Orient the user and make current research value obvious. | Candidate count, risk flags, source freshness summary, latest local data state, clear start action. | Scripts, fixtures, diagnostics, report commands, AI KINTEL, demo screens. | Candidate Results |
| Candidate Results | Give a concrete list of `research candidate` items to inspect. | Token, chain, label, risk flags, source freshness, manual review need, shared manual verification fallback, `research action panel`, `cannot infer safety`, and next review step. | Raw scanner internals, admin source selector, storage state, report workspace. | Candidate Detail |
| Candidate Detail | Help the user review one `review candidate` safely. | Token/project name, symbol, chain/network, contract state, research priority, reason on radar, candidate summary, Source Freshness, source coverage, Risk Flags, security notes, liquidity / market context, open questions, Manual Review status, shared manual verification fallback, `research action panel`, Next Review Step, and WATCHLIST as Manual Review Only. | Scoring controls, label mutation, hidden source activation, external verification URL builder, storage, trading action vocabulary. | Token Lookup |
| Token Lookup | Let the user classify a token to verify before manual external checks. | One local input field, quick examples, likely symbol, likely project name, likely EVM contract address, likely URL, unknown format, contract required, chain unknown, not verified, external check required, security not verified, liquidity unknown, source freshness unknown, `research action panel`, cannot infer safety, next review step, and `Open external checks`. | Backend lookup, provider calls, URL fetch, scraping, storage, source activation, automated verdicts. | External Checks |
| External Checks | Provide link-only checks outside the app. | Explorer/manual address check when chain and contract are known, DEX/liquidity manual check when chain and pair context are known, source/context manual check from URL without fetching it, honeypot/security manual check as copy/manual fallback, `copy contract`, `copy token input`, `research action panel`, contract required, chain unknown, not verified, manual verification required, security not verified, liquidity unknown, source freshness unknown, external check required, cannot infer safety, and next review step. | Provider calls, scraping, paid source fetches, automated external verdicts, backend, storage, source activation, scoring changes, `final_label` changes, `WATCHLIST` meaning changes. | Manual Verification |
| Manual Verification | Convert missing or partial data into concrete human review steps. | Shared fallback names: `manual verification required`, `not verified`, `contract required`, `chain unknown`, `security not verified`, `liquidity unknown`, `source freshness unknown`, `external check required`, `manual review only`, `cannot infer safety`; each fallback includes `next review step`. | Implied automation, hidden data fetches, changed scanner labels, changed WATCHLIST meaning. | Review / Watchlist |
| Review / Watchlist | Track local analyst follow-up without changing scanner output. | Local review status, notes, watchlist candidate state, stored review context, clear separation from scanner labels. | Storage internals as primary UI, report commands as core workflow, scoring changes. | Feedback Notes or Candidate Results |
| Feedback Notes | Capture trusted preview observations after using the workflow. | Session checklist, clarity notes, trust issues, missing context, owner follow-up buckets; Research Action Panel links here through `send feedback` and `add review note`. | Data submission, persistence claims, backend capture, private deployment claims. | Control Center for owner triage |
| Control Center as admin/status view | Let the owner check preview readiness and operational state. | Source Freshness, local API/storage status, readiness checklist, known gaps, next build stage. | Primary reviewer workflow, demo-first content, AI KINTEL as current work, report axis as critical path. | Owner fix list or external preview readiness |
