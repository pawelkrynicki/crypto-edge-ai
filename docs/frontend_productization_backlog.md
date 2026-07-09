# Frontend Productization Backlog

Stage: 12E.6 Manual Verification Fallbacks

Next implementation stage: 12E.7 Research Action Panel

Rules:

- Frontend productization is the main axis now.
- Reports are not the critical path.
- AI KINTEL remains later.
- No backend, storage, provider calls, source activation, scoring, `final_label`, or `WATCHLIST` meaning changes.

12E.2 delivery note:

- Candidate Results is implemented as a product-facing research candidate list.
- Deep link: `#candidate-results`.
- The view shows token/project name, chain/network, research priority, reason on radar, source freshness, risk flags, manual review status, and next review step.
- `WATCHLIST` remains manual review only.
- Missing data stays `manual verification required`, `unknown`, or `not verified`.
- Next stage: 12E.3 Candidate Detail View.

12E.3 delivery note:

- Candidate Detail is implemented as a second product-facing view for one `review candidate`.
- Deep link: `#candidate-detail`.
- Candidate Results links to Candidate Detail through `Open candidate detail`.
- The view shows token/project identity, chain/network, contract state, research priority, reason on radar, candidate summary, source freshness, source coverage, risk flags, security notes, liquidity / market context, open questions, manual review status, and next review step.
- `WATCHLIST` remains manual review only.
- Missing contract, chain, security, liquidity, or freshness data stays `manual verification required`, `unknown`, or `not verified`.
- Next stage: 12E.4 Token / Contract Lookup Shell.

12E.4 delivery note:

- Token / Contract Lookup Shell is implemented as a local frontend-only classification view.
- Deep link: `#token-lookup`.
- Candidate Detail links to it through `Open token lookup`.
- The view accepts a token symbol, project name, contract address, URL, or chain + address and classifies the input locally.
- Contract-like input remains `not verified`; chain stays `chain unknown / verify manually`; external checks are `external check required`.
- Symbol, project, URL, unknown, missing security, missing liquidity, and missing source states remain `contract required`, `manual verification required`, `unknown`, or `not verified`.
- No backend, storage, provider calls, source activation, external verification URL builder, scraping, scoring change, `final_label` change, or `WATCHLIST` meaning change was added.
- Next stage: 12E.5 External Verification Links.

12E.5 delivery note:

- External Verification Links is implemented as a link-only manual check view.
- Deep link: `#external-checks`.
- Candidate Detail and Token / Contract Lookup link to it through `Open external checks`.
- The view shows explorer/manual address check, DEX/liquidity manual check, honeypot/security manual check, and source/context manual check targets from a central frontend registry.
- Links are static `href` values opened only by user click with `target="_blank"` and `rel="noreferrer noopener"`.
- Missing contract, unknown chain, uncertain security target, missing liquidity, and source freshness gaps stay `contract required`, `chain unknown`, `not verified`, `security not verified`, `liquidity unknown`, `source freshness unknown`, or `manual verification required`.
- When a safe prefilled link cannot be built, the view shows manual fallback plus `copy contract` or `copy token input`.
- No backend, storage, provider calls, source activation, scraping, external fetch, scoring change, `final_label` change, or `WATCHLIST` meaning change was added.
- Next stage: 12E.6 Manual Verification Fallbacks.

12E.6 delivery note:

- Manual Verification Fallbacks are implemented as a shared frontend-only fallback component/helper.
- The shared fallback names are `manual verification required`, `not verified`, `contract required`, `chain unknown`, `security not verified`, `liquidity unknown`, `source freshness unknown`, `external check required`, `manual review only`, and `cannot infer safety`.
- Candidate Results, Candidate Detail, Token / Contract Lookup, and External Verification Links now show consistent data gap panels with a `next review step`.
- Missing data is explicitly shown as a data gap and cannot infer safety.
- `WATCHLIST` remains manual review only.
- No backend, storage, provider calls, source activation, scraping, external fetch, OpenAI calls, paid sources, scoring change, `final_label` change, or `WATCHLIST` meaning change was added.
- Next stage: 12E.7 Research Action Panel.

| Stage | Task | Target files | Acceptance criteria | Not in scope | Priority |
|---|---|---|---|---|---|
| 12E.2 Candidate Results View | Build a candidate-first results surface from current scanner UI data. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/components/ScannerRadar.tsx`, `tools/ui-mock/src/components/ScannerCandidateCard.tsx`, `tools/ui-mock/src/components/WorkspaceShell.tsx`, `tools/ui-mock/src/index.css`, `tools/ui-mock/tests/contract.test.ts` | User sees `research candidate` rows/cards with token, chain, label, risk flags, source freshness, and `next review step`; empty/loading/partial states render. | Backend, provider calls, source activation, storage, scoring, label semantics, AI KINTEL. | High |
| 12E.3 Candidate Detail View | Make selected candidate review a dedicated product surface. | `tools/ui-mock/src/components/CandidateDetailView.tsx`, `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/workspaceNavigation.ts`, `tools/ui-mock/src/components/WorkspaceShell.tsx`, `tools/ui-mock/src/index.css`, `tools/ui-mock/tests/contract.test.ts` | User can open `#candidate-detail` from Candidate Results and inspect one `review candidate` with snapshot, source freshness, source coverage, risk flags, security notes, liquidity / market context, open questions, manual review status, and next review step. | Real token lookup, honeypot links, external verification URL builder, backend, provider calls, storage, scoring changes, label changes, AI KINTEL. | High |
| 12E.4 Token / Contract Lookup Shell | Add a safe shell for direct token/contract verification. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/components`, `tools/ui-mock/src/index.css`, `tools/ui-mock/tests/contract.test.ts` | User can open `#token-lookup`, enter or inspect token/contract input, classify it locally, and see manual verification required states without fetching data. | Backend lookup, storage, provider calls, scraping, paid sources, source activation, external verification URL builder. | High |
| 12E.5 External Verification Links | Add link-only external check cluster for known chain/contract/source states. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/workspaceNavigation.ts`, `tools/ui-mock/src/externalVerificationTargets.ts`, `tools/ui-mock/src/components/ExternalVerificationLinksView.tsx`, `tools/ui-mock/src/components/CandidateDetailView.tsx`, `tools/ui-mock/src/components/TokenContractLookupView.tsx`, `tools/ui-mock/tests/contract.test.ts` | External links render only when safe inputs exist; missing inputs show `manual review` plus `copy contract` or `copy token input`; links open outside app with `target="_blank"` and `rel="noreferrer noopener"` and make no provider calls. | New data provider integration, scraping, paid source activation, browser fetches to verification sites. | High |
| 12E.6 Manual Verification Fallbacks | Add shared fallback states for missing contract, stale source, unsupported chain, missing context, and unclear risk flags. | `tools/ui-mock/src/components/ManualVerificationFallback.tsx`, `tools/ui-mock/src/components/CandidateResultsView.tsx`, `tools/ui-mock/src/components/CandidateDetailView.tsx`, `tools/ui-mock/src/components/TokenContractLookupView.tsx`, `tools/ui-mock/src/components/ExternalVerificationLinksView.tsx`, `tools/ui-mock/src/index.css`, `tools/ui-mock/tests/contract.test.ts` | User always sees `manual verification required`, `not verified`, `contract required`, `chain unknown`, `security not verified`, `liquidity unknown`, `source freshness unknown`, `external check required`, `cannot infer safety`, and a concrete `next review step` when automated context is missing or partial. `WATCHLIST` remains manual review only. | Automated verdicts, backend, storage, provider calls, source activation, scoring changes, `final_label` changes, `WATCHLIST` changes. | High |
| 12E.7 Research Action Panel | Add candidate-level action panel for `next review step`, local note status, and watchlist follow-up. | `tools/ui-mock/src/components/CandidateDetail.tsx`, `tools/ui-mock/src/components/CandidateReviewControls.tsx`, `tools/ui-mock/src/components/WatchlistTab.tsx`, `tools/ui-mock/tests/contract.test.ts` | Candidate detail shows current local review status, clear next action, and safe follow-up controls without changing scanner output. | Report generation from UI, storage model changes, scoring, label changes, AI KINTEL. | High |
| 12E.8 Frontend Navigation Cleanup | Split reviewer workflow from admin/status/demo/reference surfaces. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/components/WorkspaceShell.tsx`, `tools/ui-mock/src/workspaceNavigation.ts`, `tools/ui-mock/tests/contract.test.ts`, `tools/ui-mock/README.md` | Primary nav follows Start / Radar -> Candidate Results -> Candidate Detail -> External Checks -> Manual Verification -> Review / Watchlist -> Feedback Notes; Control Center remains admin/status. | Router dependency, deployment, auth, backend changes. | High |
| 12E.9 Empty / Error / Partial States | Productize missing, loading, stale, fallback, API unavailable, no candidates, and no contract states. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/components`, `tools/ui-mock/src/index.css`, `tools/ui-mock/tests/contract.test.ts` | Each major view has useful empty/error/partial copy and a `next review step`. | New provider calls, storage, data mutation, scoring changes. | High |
| 12E.10 Frontend Copy / Naming | Replace developer/mock/scanner-first names with product workflow language. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/components`, `tools/ui-mock/README.md`, `tools/ui-mock/tests/contract.test.ts` | User-facing copy uses `research candidate`, `review candidate`, `token to verify`, `manual review`, `external check`, `source freshness`, `risk flags`, and `next review step`. | Runtime logic changes, AI KINTEL implementation, trading action vocabulary. | Medium |
| 12E.11 Frontend Visual Polish | Tighten hierarchy, density, spacing, buttons, icons, responsive behavior, and detail readability. | `tools/ui-mock/src/index.css`, `tools/ui-mock/src/components`, `tools/ui-mock/tests/contract.test.ts` | Candidate workflow scans clearly on desktop and mobile; admin/demo surfaces no longer compete with primary product value. | Redesign outside current UI mock, new dependencies, backend changes. | Medium |
| 12E.12 Frontend Contract Tests | Lock the 12E product workflow through focused rendering tests. | `tools/ui-mock/tests/contract.test.ts`, `tools/ui-mock/src/components`, `tools/ui-mock/src/workspaceNavigation.ts` | Tests cover nav, candidate results, detail, lookup states, external link guardrails, manual fallbacks, copy vocabulary, and no behavior changes to scoring/labels. | E2E browser suite, network tests, provider calls, new dependencies. | High |
