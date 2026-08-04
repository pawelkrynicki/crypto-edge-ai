# PC.1 — Lifecycle, Private Radar and Operational Data Flow

## Existing-system audit and root causes

Before PC.1, the Follow-up Basket was durable but it had no durable system New
Inbox. The UI derived “New” from the latest scanner snapshot after Follow-up
membership; observation records could immediately be ingested and an absent later
snapshot had nothing to show. That is why New could be `0`.

Follow-up counts came from mutable current membership, rechecks and a presentation
list limited to the first 100 records. The UI did not distinguish total records,
action-due records, candidates, or displayed records. Rechecks, membership sync and
the 100-item slice therefore made count changes between reads hard to interpret.

Manual movement was owner-only and intentionally blocked/hidden outside enabled
owner operations. The old Established promotion resolver treated manual
verification/owner approval as an override and historical FLOW.1 documents/tests
explicitly prohibited automatic promotion. It was neither a usable per-user action
nor a private decision layer.

PC.1 reuses the existing scanner candidates, basic filters, Follow-up checkpoint
model `1/3/7/14/30`, Established Universe manager, atomic writes/locks, owner
preflight and central single-flight coordinator. It adds only the missing New Inbox,
system policy/audit, and one SQLite `UserWorkspaceRepository`.

## Stores and two statuses

`new_inbox_store_v1` is an atomically written, locked durable store. It keeps
normalized identity, display data, first/last seen values, scanner IDs, current
system status, policy evaluation, archive/reject fields and transition IDs.

`user_workspace_sqlite_v1` is one SQLite database, not one file per user. The
repository takes an actor only from server-created session context. It stores private
status/note and an audit row with the system status at decision time, conditions,
override reason and a session hash. Client payloads cannot supply `user_id`, role or
owner flags. The interface is intentionally ready for a later CAMP/AIKINTEL account
adapter without reshaping lifecycle code or UI.

Every card and Candidate Detail show **Status systemowy** and **Twój status**. An
actor without a workspace row inherits the system status. A private forward decision
remains explicit after a later system move; it never writes Follow-up, Main Radar or
another actor’s workspace.

## Private action and counters

A valid CAMP session can move `NEW → FOLLOW_UP` and then
`FOLLOW_UP → MAIN_RADAR` in its own workspace. Conditions met require an explicit
confirmation only. Unmet soft conditions show met/unmet/missing/risk lists and
require a short override reason plus confirmation. Invalid identity, missing
contract, unsupported chain, corrupt state, duplicate action or absent session fail
closed. Trusted tester has no write capability.

`lifecycle_summary_v1` separates `system_new_total`, system Follow-up/Main totals,
action-due, promotion-ready, displayed, store version and last-cycle delta. The
Radar labels are “Łącznie obserwowane”, “Do działania teraz”, “Kandydaci do
Głównego Radaru” and “Wyświetlane teraz”. Refresh is API re-read only; it does not
call a collector, providers, lifecycle evaluation or store write and preserves the
selected token and active detail tab.

## Controlled scan and review isolation

Owner scan stays on the existing signed one-time preflight, global lock, central
coordinator, circuit breaker and single-flight flow. The preview shows due scope,
lock, possible sources and explicitly reports `Honeypot.is` as not invoked. The
receipt exposes scanner totals, lifecycle delta, source errors and snapshot time.
One hundred concurrent owner attempts are covered by the pre-existing coordinator
contract; CAMP user and trusted tester have no scan capability.

`scripts\win\start-pc1-lifecycle-radar-review.cmd` builds INTERNAL_BETA, copies
stores/config/snapshots to `%TEMP%\crypto-edge-pc1-review-*`, starts an isolated
local review instance and opens one `?pc1_review=1` browser tab. It starts with an
owner session and offers a local-only switch to a server-created CAMP_USER session.
No provider call happens on launch. A live limited scan remains possible only after
an explicit owner browser confirmation, and writes only to the copied workspace.

## Migration and recovery

`pc1_lifecycle_migration_preview_v1` is read-only and deterministic for identical
inputs. It reports before counts, duplicate snapshot identities, planned New Inbox
identities, expected store versions and a rollback requirement: STAB.2 backup before
any later canonical apply. This PR supplies no canonical apply path.

STAB.2 now includes `new_inbox_store`, `lifecycle_audit_store` and
`user_workspace_sqlite`, validates both JSON stores, runs SQLite integrity/schema
checks, and includes them in restore completeness and isolated drills.

## Explicit boundaries

PC.1 does not invoke OpenAI, Honeypot.is, a provider, VPS, Cloudflare, Task
Scheduler, AIKINTEL, Research Playbook or a CAMP user-management panel during its
implementation/tests. It also does not alter historic freeze artefacts.
