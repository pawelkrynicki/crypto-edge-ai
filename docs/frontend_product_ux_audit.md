# Frontend Product UX Audit

Stage: 12E.1 Frontend Product UX Audit

Scope:

- Audit only.
- No runtime UI change.
- No backend, storage, provider calls, source activation, scoring, `final_label`, or `WATCHLIST` meaning changes.
- AI KINTEL remains later.
- Next stage: 12E.2 Candidate Results View.

## 1. Current UI inventory

| Area | Current user value | Main issue | Follow-up stage |
|---|---|---|---|
| `WorkspaceShell` / `App.tsx` navigation | Gives access to every current surface. | User, admin, demo, and mock surfaces are mixed in one nav. | 12E.8 |
| `WorkspaceOverview` / `StatCards` / `MarketContextPanel` | Shows local health, market context, and scanner totals. | Opens as a status dashboard, not a candidate-first product flow. | 12E.2, 12E.8 |
| `LocalMvpWorkflowPanel` | Explains local workflow layers. | Exposes command-oriented workflow in the main product path. | 12E.8, 12E.10 |
| `ScannerRadar` / `ScannerCandidateCard` | Closest current candidate results surface. | Still reads as scanner output, not a prioritized research candidate list. | 12E.2 |
| `CandidateDetail` | Strongest current detail surface. | Detail is embedded and lacks dedicated external check and action panels. | 12E.3, 12E.5, 12E.7 |
| `CandidateResearchContext` | Shows context coverage and missing data. | Good seed for source freshness, but gaps are not yet action-oriented. | 12E.5, 12E.6 |
| `CandidateReviewControls` | Lets analyst record local review status. | Works as a local note layer, but lacks a broader next review step panel. | 12E.7 |
| `WatchlistTab` | Review queue, notes, backup, diagnostics, and report workspace. | Valuable review flow is mixed with storage/admin/report mechanics. | 12E.7, 12E.8 |
| `RiskAlerts` | Surfaces critical and manual verification candidates. | Does not route into a structured verification workflow. | 12E.2, 12E.6 |
| `TrustedPreview` | Non-technical preview guide. | Static guide, not the live candidate path. | 12E.8, 12E.10 |
| `FeedbackNotes` | Session feedback worksheet. | Useful later, but not core research flow. | 12E.8 |
| `ControlCenter` | Admin/status readiness surface. | Should remain admin/status, not primary user flow. | 12E.8 |
| `WebinarTeaser` | Demo-safe presentation surface. | Should be hidden from trusted reviewer navigation. | 12E.8 |
| `ResearchReview` | Mock text categorization. | Mock-only and not tied to selected candidates. | 12E.8, 12E.10 |
| `Methodology` | Explains scanner/review layers. | Educational, not a task flow. | 12E.8 |

## 2. User-facing views

| View | Keep | Change before trusted preview |
|---|---|---|
| Start / Radar | Keep product status and high-level candidate counts. | Open into candidate discovery, not local health commands. |
| Candidate Results | Use `ScannerRadar` data and card/table pieces. | Rename and reshape as `research candidate` results. |
| Candidate Detail | Use current `CandidateDetail` sections. | Make it a dedicated `review candidate` surface. |
| Review / Watchlist | Use local review status and notes. | Separate from storage, diagnostics, backup, and report mechanics. |
| Risk Flags | Use risk grouping from `RiskAlerts`. | Route each flag to a manual verification task. |
| Feedback Notes | Keep for session notes. | Place after the research workflow, not before it. |

## 3. Developer/admin/demo views

| View or element | Classification | Product decision |
|---|---|---|
| `Control Center` | Admin/status view | Keep, but move out of primary user flow. |
| `Overview` local workflow block | Admin/operator view | Reduce or move behind Control Center. |
| Data source selector | Developer/operator control | Hide from trusted reviewer mode or rename to source freshness. |
| Storage diagnostics / reset | Admin tool | Keep behind Control Center or Review admin area. |
| Report command workspace | Operator tool | De-emphasize; reports are not the critical path. |
| `Webinar Teaser` | Demo view | Remove from default reviewer nav. |
| `Research Review` | Mock view | Hide, defer, or repurpose after candidate action panel exists. |
| `Methodology` | Reference view | Keep as secondary reference. |

## 4. Product gaps

- [ ] No explicit `Candidate Results` view centered on `research candidate` rows.
- [ ] No dedicated `Candidate Detail` route/state for one `review candidate`.
- [ ] No `Token / Contract Lookup` shell for direct verification.
- [ ] No chain-aware external verification link cluster.
- [ ] No manual fallback flow when contract, source, or context is missing.
- [ ] No single `next review step` panel per candidate.
- [ ] Navigation mixes user, admin, demo, and mock surfaces.
- [ ] Data source and storage language is too technical for trusted preview.
- [ ] Report surfaces are too prominent for the current product axis.
- [ ] Empty, error, stale, and partial states are not product-complete.
- [ ] Copy still relies on scanner/developer naming in user-facing areas.
- [ ] Visual hierarchy is dense and status-heavy before the user sees value.

## 5. Candidate workflow gaps

| Gap | Current state | Needed product behavior |
|---|---|---|
| Candidate prioritization | Scanner list and filters exist. | Show `research candidate` priority, risk flags, freshness, and next step together. |
| Selection flow | Detail opens inside scanner workspace. | Selecting a row/card should clearly move to `Candidate Detail`. |
| Review intent | Local review status exists. | Status should be paired with a clear `next review step`. |
| Risk path | Risk Alerts lists candidates. | Risk flags should deep-link into manual verification tasks. |
| Watchlist meaning | Copy repeats boundary. | Keep meaning, but make `watchlist candidate` a workflow state, not a trading cue. |
| Source freshness | Context status exists globally. | Show candidate-level source freshness and missing source flags. |

## 6. Token/contract verification gaps

| Gap | Needed behavior |
|---|---|
| Lookup shell | User can paste or inspect a token symbol/contract address without changing scanner output. |
| Chain handling | Chain must be visible, selectable, and validated before showing external links. |
| Contract availability | Missing or truncated contract address must become a clear manual review state. |
| Unsupported chain | Show `manual review` fallback, not a broken link cluster. |
| Contract copy/check | Provide safe copy and external check links only. |
| Lookup result state | Show found, partial, not found, invalid input, and unsupported network states. |

## 7. External verification opportunities

| Opportunity | Link-only target | Guardrail |
|---|---|---|
| Contract explorer | Chain explorer contract page when chain and contract are known. | Link out only; no scraping or provider calls. |
| DEX context | External DEX/token page when available. | Treat as `external check`, not source activation. |
| Project/source URL | Existing `source_url` from candidate data. | Preserve source freshness and stale/missing state. |
| Market context | Existing approved context links. | Keep as context, not candidate proof. |
| Security review | Manual security checklist plus external links. | No paid source, browser provider call, or automated verdict. |
| Missing link state | Show `manual verification required`. | Avoid silent blanks. |

## 8. Copy/naming issues

| Current copy/name | Issue | Product direction |
|---|---|---|
| `Scanner Radar` | Feels like internal scanner output. | `Candidate Results` or `Research Candidates`. |
| `Review Queue` | Good but too broad. | `Review / Watchlist` for user flow. |
| `Risk Alerts` | Good content, isolated workflow. | `Risk Flags` tied to detail/manual review. |
| `Research Review (Mock)` | Mock language lowers trust. | Hide until tied to selected candidate notes. |
| `Fixture`, `Static JSON`, `API / latest` | Developer source names. | Source freshness and data mode only in admin view. |
| `Local MVP`, scripts, CMD, diagnostics | Operator language. | Control Center only. |
| Negative trading disclaimer copy | Names forbidden trading action vocabulary. | Use `Research-only. Human manual review required.` |

## 9. Navigation issues

- [ ] Primary nav mixes candidate workflow with admin and demo surfaces.
- [ ] `Overview` is first, but product value is in candidate discovery.
- [ ] `Control Center` should be admin/status, not part of reviewer path.
- [ ] `Webinar Teaser` should not appear in trusted external preview mode.
- [ ] `Methodology` and static guides should be secondary reference links.
- [ ] Hash links exist, but target product flow is not yet defined around candidates.

## 10. Visual polish issues

- [ ] Dense status panels compete with candidate value.
- [ ] Detail panel is strong but visually crowded.
- [ ] Cards and panels often carry similar weight, so priority is unclear.
- [ ] Sidebar abbreviations are developer-friendly, not user-friendly.
- [ ] Buttons and actions are mostly text labels; future polish should use clearer icon/action hierarchy.
- [ ] Dark slate palette is cohesive but can feel one-note in long workflows.
- [ ] Mobile flow needs verification after nav cleanup and detail view split.

## 11. Test coverage gaps

| Gap | Add coverage in |
|---|---|
| Candidate Results view contract | 12E.12 |
| Candidate Detail route/state contract | 12E.12 |
| Token / Contract Lookup shell states | 12E.12 |
| External links render as link-only checks | 12E.12 |
| Manual verification fallbacks | 12E.12 |
| Research action panel states | 12E.12 |
| Navigation cleanup and admin/demo separation | 12E.12 |
| Empty/error/partial states | 12E.12 |
| Product copy vocabulary guardrails | 12E.12 |
| No provider calls, storage, scoring, label changes | 12E.12 |

## 12. Must-fix before trusted external preview

1. Add `Candidate Results` as the primary value view.
2. Add dedicated `Candidate Detail` flow for one `review candidate`.
3. Add `Token / Contract Lookup` shell with safe states.
4. Add external verification links as link-only checks.
5. Add manual verification fallback copy and states.
6. Add `Research Action Panel` with `next review step`.
7. Clean navigation into user flow plus admin/status flow.
8. Complete empty, error, stale, and partial states.
9. Replace developer/mock naming in user-facing surfaces.
10. Add contract tests for the 12E product workflow.
