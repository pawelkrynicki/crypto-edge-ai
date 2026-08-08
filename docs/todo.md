# Delivery TODO

## Current

- [x] PC.1 code: lifecycle policy, durable New Inbox, private workspace, canonical
  bounded Radar view, operation journal, counters, isolated review and STAB.2 coverage.
- [ ] Review and accept the PC.1 Draft PR.

## Explicitly deferred

- [ ] AI work.
- [ ] Research Playbook.
- [ ] PC.4 — AIKINTEL Access Bridge and CAMP User Workspace (deferred; no implementation in PC.1):
  - AIKINTEL is the source of truth for accounts, roles and access; Crypto Edge AI does not build a second user panel or password flow.
  - An AIKINTEL user reaches Crypto Edge AI through a subdomain on our VPS; Crypto Edge AI verifies the handed-off identity/session.
  - Crypto Edge AI stores only its private workspace, notes, statuses, AI usage and audit.
- [ ] Final VPS, Cloudflare, scheduler, smoke and rollback approval.
