# System lifecycle policy v1

Policy identifier: `system_lifecycle_policy_v1`.

This is deterministic policy code. It uses no AI, no heuristic thresholds, and no
provider call. Identity is only normalized `chain + contract_address`.

## NEW → FOLLOW_UP

`evaluateNewToFollowUp` permits automatic promotion only when all of these frozen
conditions are met:

1. the identity normalizes through the existing supported-chain/address validators;
2. snapshot provenance has a contract version and `fixture_used: false`;
3. name or symbol is present;
4. the existing `basic_filter_status` is `passed_basic_filter`;
5. `final_label`/reasons contain no critical contract or identity risk; and
6. the identity is in neither Follow-up nor enabled Main Radar.

The existing basic-filter result is used unchanged. A valid discovery that is not
eligible remains in the persistent New Inbox; a later snapshot may update it but
never removes it. An entry with `archived_at` or `rejected_at` is never re-promoted
by discovery alone: only its last-seen facts may be refreshed. Reactivation is a
separate explicit operation.

## FOLLOW_UP → MAIN_RADAR

`evaluateFollowUpToMainRadar` permits automatic promotion only when all of these
existing contracts are satisfied:

1. identity remains valid and the recheck belongs to the current central cycle:
   `source_run_id` equals its cycle/scanner run, `last_checked_at` is valid and not
   in the future;
2. lifecycle is `CANDIDATE_FOR_ESTABLISHED` and every existing checkpoint
   `1/3/7/14/30` is complete;
3. the last basic filter passed;
4. security is not `CRITICAL_RISK` and is exactly `CHECKED`;
5. the latest `ManualVerificationRecord` is not `CRITICAL_RISK`, `REJECT` or
   `NEEDS_MORE_DATA`; `VERIFIED` permits progression, while no record is allowed
   only when neither security nor missing data requires manual verification;
6. the Established Universe is valid; and
7. there is no enabled Main Radar duplicate.

The resulting mutation uses the existing Established Universe manager, its atomic
write, management lock, history, checksum/version guard and Follow-up membership
sync. The former “no automatic promotion” behaviour was an owner-flow policy, not
a missing data contract; this policy supersedes it for system lifecycle only.

## Safety and audit

One lifecycle lock serializes New/Follow-up/Main transitions. Each automatic
transition has an idempotent `lifecycle_operation_journal_v1` record with ordered
stages `PLAN_CREATED`, `TARGET_STORE_APPLIED`, `FOLLOW_UP_SYNCED` (Main only),
`NEW_INBOX_APPLIED`, `AUDIT_APPLIED` and `COMMITTED`. The target store is written
before the Inbox status. Restart reconciliation only commits a journal whose target
store is demonstrably present. Each automatic transition also produces a
secret-free `lifecycle_audit_store_v1` record with IDs, policy version, conditions,
readiness, distinct security/manual-verification state, deduplication,
cycle/scanner/context references and reason.

There is intentionally no automatic degradation. If later data fails conditions,
the token remains in its layer and the new evaluation surfaces unmet conditions,
missing data and risks for re-evaluation.
