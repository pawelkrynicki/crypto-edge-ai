# Frontend Target Flow Map

Stage: 12E.1 Frontend Product UX Audit

Only target flow:

```text
Start / Radar -> Candidate Results -> Candidate Detail -> External Checks -> Manual Verification -> Review / Watchlist -> Feedback Notes
```

Control Center remains an admin/status view.

| Flow | Goal | User sees | Do not show | Next step |
|---|---|---|---|---|
| Start / Radar | Orient the user and make current research value obvious. | Candidate count, risk flags, source freshness summary, latest local data state, clear start action. | Scripts, fixtures, diagnostics, report commands, AI KINTEL, demo screens. | Candidate Results |
| Candidate Results | Give a concrete list of `research candidate` items to inspect. | Token, chain, label, risk flags, source freshness, manual review need, next review step. | Raw scanner internals, admin source selector, storage state, report workspace. | Candidate Detail |
| Candidate Detail | Help the user review one `review candidate` safely. | Token snapshot, contract state, risk flags, source freshness, local review status, manual checks, notes. | Scoring controls, label mutation, hidden source activation, trading action vocabulary. | External Checks |
| External Checks | Provide link-only checks outside the app. | Chain explorer link when contract exists, project/source URL, DEX/token page link when safe, missing-link state. | Provider calls, scraping, paid source fetches, automated external verdicts. | Manual Verification |
| Manual Verification | Convert missing or partial data into concrete human review steps. | Checklist for contract, source freshness, security context, liquidity/context, community/narrative notes, unsupported chain fallback. | Implied automation, hidden data fetches, changed scanner labels. | Review / Watchlist |
| Review / Watchlist | Track local analyst follow-up without changing scanner output. | Local review status, notes, watchlist candidate state, stored review context, clear separation from scanner labels. | Storage internals as primary UI, report commands as core workflow, scoring changes. | Feedback Notes or Candidate Results |
| Feedback Notes | Capture trusted preview observations after using the workflow. | Session checklist, clarity notes, trust issues, missing context, owner follow-up buckets. | Data submission, persistence claims, backend capture, private deployment claims. | Control Center for owner triage |
| Control Center as admin/status view | Let the owner check preview readiness and operational state. | Source freshness, local API/storage status, readiness checklist, known gaps, next build stage. | Primary reviewer workflow, demo-first content, AI KINTEL as current work, report axis as critical path. | Owner fix list or external preview readiness |
