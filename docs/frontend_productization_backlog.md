# Frontend Productization Backlog

Stage: 12E.12 Frontend Contract Tests

Next implementation stage: 12F.1 — Private Preview Access Method

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

12E.7 delivery note:

- Research Action Panel is implemented as a shared frontend-only panel across Candidate Results, Candidate Detail, Token / Contract Lookup, and External Verification Links.
- The panel shows safe next review actions: `open candidate detail`, `open token lookup`, `open external checks`, `copy contract`, `copy token input`, `view source freshness`, `mark for manual review`, `send feedback`, and `add review note`.
- `send feedback` and `add review note` route to the existing `#feedback-notes` flow.
- `mark for manual review` is a UI-only manual state and does not save review state.
- Missing contract, unknown chain, unknown source freshness, and partial context stay `contract required`, `chain unknown`, `source freshness unknown`, `manual verification required`, `not verified`, or `cannot infer safety`.
- `WATCHLIST` remains manual review only.
- No backend, storage, provider calls, source activation, scraping, external fetch, OpenAI calls, paid sources, scoring change, `final_label` change, or `WATCHLIST` meaning change was added.
- Next stage: 12E.8 Frontend Navigation Cleanup.

12E.8 delivery note:

- Frontend Navigation Cleanup separates the sidebar into `Product Flow`, `Review / Feedback`, `Admin / Status`, and `Demo / Preview`.
- Product Flow is first and contains Candidate Results, Candidate Detail, Token Lookup, and External Checks.
- Feedback Notes remains available in the Review / Feedback flow.
- Control Center is marked as an admin/status view, while Trusted Preview and Webinar Teaser are marked as demo/preview views.
- Existing deep links remain preserved: `#candidate-results`, `#candidate-detail`, `#token-lookup`, `#external-checks`, `#feedback-notes`, `#control-center`, `#trusted-preview`, and `#webinar-teaser`.
- No backend, storage, provider calls, source activation, scraping, external fetch, OpenAI calls, paid sources, scoring change, `final_label` change, or `WATCHLIST` meaning change was added.
- Next stage: 12E.9 Empty / Error / Partial States.

12E.9 delivery note:

- Empty / Error / Partial States are implemented through the shared frontend-only `ProductStateNotice` component.
- Candidate Results, Candidate Detail, Token / Contract Lookup, and External Verification Links now show explicit empty, partial, or error/data-gap notices with `next review step`.
- Shared state copy covers `no candidates found`, `partial source coverage`, `source freshness unknown`, `contract required`, `chain unknown`, `external check required`, `security not verified`, `liquidity unknown`, `manual verification required`, `cannot infer safety`, `data gap`, `not verified`, and `manual review only`.
- Missing or partial data remains a data gap and cannot infer safety; no green safe/verified/approved state is added for missing data.
- No backend, storage, provider calls, source activation, scraping, external fetch, OpenAI calls, paid sources, scoring change, `final_label` change, or `WATCHLIST` meaning change was added.
- Next stage: 12E.10 Frontend Copy / Naming.

12E.10 delivery note:

- Frontend Copy / Naming standardizes the product-facing UI language across Candidate Results, Candidate Detail, Token Lookup, External Checks, Manual Review, shared fallback states, and admin/status navigation.
- Accepted names are: `Candidate Results`, `Candidate Detail`, `Token Lookup`, `External Checks`, `Manual Review`, `Source Freshness`, `Risk Flags`, `Data Gap`, `Next Review Step`, `Manual Verification Required`, `Cannot Infer Safety`, and `Watchlist Candidate`.
- `WATCHLIST` remains Manual Review Only.
- Missing or partial data is described as `Data Gap`, `Manual Verification Required`, `Not Verified`, `Partial Source Coverage`, or `Cannot Infer Safety`; missing data does not imply safety.
- UI copy is research-only and does not suggest an investment recommendation.
- No backend, storage, provider calls, source activation, scraping, external fetch, OpenAI calls, paid sources, dependency, scoring change, `final_label` change, or `WATCHLIST` meaning change was added.
- Next stage: 12E.11 Frontend Visual Polish.

12E.11 delivery note:

- Frontend Visual Polish tightens the standalone preview layout, spacing, card hierarchy, status badges, notices, Research Action Panel, header/sidebar framing, and responsive behavior.
- Candidate Results, Candidate Detail, Token Lookup, External Checks, Manual Verification Fallbacks, and Product State notices keep the same data, flow, deep links, and review semantics.
- The polish is CSS/UI-only and does not add backend, storage, provider calls, source activation, scraping, external fetch, OpenAI calls, paid sources, dependencies, scoring changes, `final_label` changes, or `WATCHLIST` meaning changes.
- Next stage: 12E.12 Frontend Contract Tests.

12E.12 delivery note:

- Frontend Contract Tests now lock the main standalone product flow after 12E.11.
- The suite covers required deep links, Candidate Results as the default product view, navigation group ownership, Candidate Results, Candidate Detail, Token Lookup local classifications, External Checks link-only/manual semantics, Manual Verification fallback states, Product State notices, Research Action Panel actions, forbidden trading CTA copy, and forbidden frontend mechanisms in the product flow files.
- Protected manual states include `Manual Verification Required`, `Not Verified`, `Contract Required`, `Chain Unknown`, `Security Not Verified`, `Liquidity Unknown`, `Source Freshness Unknown`, `External Check Required`, `Partial Source Coverage`, `Cannot Infer Safety`, `Data Gap`, `No Candidates Found`, `Next Review Step`, and `Manual Review Only`.
- Run from the repo root with `scripts\win\check-ui-mock.cmd`.
- No browser automation dependency was added. The repo does not currently include a browser/responsive harness, so 1440x900, 1920x1080, and 390x844 no-horizontal-overflow checks remain manual preview validation.
- 12E Frontend Productization is complete.
- Next stage: 12F.1 — Private Preview Access Method.

| Stage | Task | Target files | Acceptance criteria | Not in scope | Priority |
|---|---|---|---|---|---|
| 12E.2 Candidate Results View | Build a candidate-first results surface from current scanner UI data. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/components/ScannerRadar.tsx`, `tools/ui-mock/src/components/ScannerCandidateCard.tsx`, `tools/ui-mock/src/components/WorkspaceShell.tsx`, `tools/ui-mock/src/index.css`, `tools/ui-mock/tests/contract.test.ts` | User sees `research candidate` rows/cards with token, chain, label, risk flags, source freshness, and `next review step`; empty/loading/partial states render. | Backend, provider calls, source activation, storage, scoring, label semantics, AI KINTEL. | High |
| 12E.3 Candidate Detail View | Make selected candidate review a dedicated product surface. | `tools/ui-mock/src/components/CandidateDetailView.tsx`, `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/workspaceNavigation.ts`, `tools/ui-mock/src/components/WorkspaceShell.tsx`, `tools/ui-mock/src/index.css`, `tools/ui-mock/tests/contract.test.ts` | User can open `#candidate-detail` from Candidate Results and inspect one `review candidate` with snapshot, source freshness, source coverage, risk flags, security notes, liquidity / market context, open questions, manual review status, and next review step. | Real token lookup, honeypot links, external verification URL builder, backend, provider calls, storage, scoring changes, label changes, AI KINTEL. | High |
| 12E.4 Token / Contract Lookup Shell | Add a safe shell for direct token/contract verification. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/components`, `tools/ui-mock/src/index.css`, `tools/ui-mock/tests/contract.test.ts` | User can open `#token-lookup`, enter or inspect token/contract input, classify it locally, and see manual verification required states without fetching data. | Backend lookup, storage, provider calls, scraping, paid sources, source activation, external verification URL builder. | High |
| 12E.5 External Verification Links | Add link-only external check cluster for known chain/contract/source states. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/workspaceNavigation.ts`, `tools/ui-mock/src/externalVerificationTargets.ts`, `tools/ui-mock/src/components/ExternalVerificationLinksView.tsx`, `tools/ui-mock/src/components/CandidateDetailView.tsx`, `tools/ui-mock/src/components/TokenContractLookupView.tsx`, `tools/ui-mock/tests/contract.test.ts` | External links render only when safe inputs exist; missing inputs show `manual review` plus `copy contract` or `copy token input`; links open outside app with `target="_blank"` and `rel="noreferrer noopener"` and make no provider calls. | New data provider integration, scraping, paid source activation, browser fetches to verification sites. | High |
| 12E.6 Manual Verification Fallbacks | Add shared fallback states for missing contract, stale source, unsupported chain, missing context, and unclear risk flags. | `tools/ui-mock/src/components/ManualVerificationFallback.tsx`, `tools/ui-mock/src/components/CandidateResultsView.tsx`, `tools/ui-mock/src/components/CandidateDetailView.tsx`, `tools/ui-mock/src/components/TokenContractLookupView.tsx`, `tools/ui-mock/src/components/ExternalVerificationLinksView.tsx`, `tools/ui-mock/src/index.css`, `tools/ui-mock/tests/contract.test.ts` | User always sees `manual verification required`, `not verified`, `contract required`, `chain unknown`, `security not verified`, `liquidity unknown`, `source freshness unknown`, `external check required`, `cannot infer safety`, and a concrete `next review step` when automated context is missing or partial. `WATCHLIST` remains manual review only. | Automated verdicts, backend, storage, provider calls, source activation, scoring changes, `final_label` changes, `WATCHLIST` changes. | High |
| 12E.7 Research Action Panel | Add shared action panel for safe candidate/token research next steps. | `tools/ui-mock/src/components/ResearchActionPanel.tsx`, `tools/ui-mock/src/components/CandidateResultsView.tsx`, `tools/ui-mock/src/components/CandidateDetailView.tsx`, `tools/ui-mock/src/components/TokenContractLookupView.tsx`, `tools/ui-mock/src/components/ExternalVerificationLinksView.tsx`, `tools/ui-mock/src/index.css`, `tools/ui-mock/tests/contract.test.ts` | Candidate Results, Candidate Detail, Token / Contract Lookup, and External Verification Links show `research action panel` with safe hash links, copy fallbacks, source freshness state, feedback links, and UI-only manual review action. | Backend, storage, provider calls, source activation, scraping, OpenAI calls, paid sources, scoring, label changes, `WATCHLIST` meaning changes, investment/trading CTAs. | High |
| 12E.8 Frontend Navigation Cleanup | Split reviewer workflow from admin/status/demo/reference surfaces. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/components/WorkspaceShell.tsx`, `tools/ui-mock/src/workspaceNavigation.ts`, `tools/ui-mock/tests/contract.test.ts`, `tools/ui-mock/README.md` | Sidebar groups are `Product Flow`, `Review / Feedback`, `Admin / Status`, and `Demo / Preview`; Product Flow contains Candidate Results, Candidate Detail, Token Lookup, and External Checks first; Feedback Notes stays visible; Control Center remains admin/status; Trusted Preview and Webinar Teaser remain demo/preview; all existing deep links are preserved. | Router dependency, deployment, auth, backend changes, provider calls, storage, scoring or label changes. | High |
| 12E.9 Empty / Error / Partial States | Productize missing, loading, stale, fallback, API unavailable, no candidates, and no contract states. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/components`, `tools/ui-mock/src/index.css`, `tools/ui-mock/tests/contract.test.ts` | Each major view has useful empty/error/partial copy and a `next review step`. | New provider calls, storage, data mutation, scoring changes. | High |
| 12E.10 Frontend Copy / Naming | Replace developer/mock/scanner-first names with product workflow language. | `tools/ui-mock/src/App.tsx`, `tools/ui-mock/src/components`, `tools/ui-mock/README.md`, `tools/ui-mock/tests/contract.test.ts` | User-facing copy uses `research candidate`, `review candidate`, `token to verify`, `manual review`, `external check`, `source freshness`, `risk flags`, and `next review step`. | Runtime logic changes, AI KINTEL implementation, trading action vocabulary. | Medium |
| 12E.11 Frontend Visual Polish | Tighten hierarchy, density, spacing, buttons, icons, responsive behavior, and detail readability. | `tools/ui-mock/src/index.css`, `tools/ui-mock/src/components`, `tools/ui-mock/tests/contract.test.ts` | Candidate workflow scans clearly on desktop and mobile; admin/demo surfaces no longer compete with primary product value. | Redesign outside current UI mock, new dependencies, backend changes. | Medium |
| 12E.12 Frontend Contract Tests | Lock the 12E product workflow through focused rendering tests. | `tools/ui-mock/tests/contract.test.ts`, `tools/ui-mock/src/components`, `tools/ui-mock/src/workspaceNavigation.ts` | Tests cover nav, candidate results, detail, lookup states, external link guardrails, manual fallbacks, copy vocabulary, forbidden mechanism scans, and no behavior changes to scoring/labels. 12E is complete after this stage. | E2E browser suite, network tests, provider calls, new dependencies. | High |
