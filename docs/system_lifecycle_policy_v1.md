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
never removes it.

## FOLLOW_UP → MAIN_RADAR

`evaluateFollowUpToMainRadar` permits automatic promotion only when all of these
existing contracts are satisfied:

1. identity remains valid and a `last_checked_at` exists;
2. lifecycle is `CANDIDATE_FOR_ESTABLISHED` and every existing checkpoint
   `1/3/7/14/30` is complete;
3. the last basic filter passed;
4. security is not `CRITICAL_RISK` and is exactly `CHECKED`;
5. the Established Universe is valid; and
6. there is no enabled Main Radar duplicate.

The resulting mutation uses the existing Established Universe manager, its atomic
write, management lock, history, checksum/version guard and Follow-up membership
sync. The former “no automatic promotion” behaviour was an owner-flow policy, not
a missing data contract; this policy supersedes it for system lifecycle only.

## Safety and audit

One lifecycle lock serializes New/Follow-up/Main transitions. Each automatic
transition is idempotent and produces a secret-free `lifecycle_audit_store_v1`
record with IDs, policy version, conditions, readiness, security/verification,
deduplication, cycle/scanner/context references and reason.

There is intentionally no automatic degradation. If later data fails conditions,
the token remains in its layer and the new evaluation surfaces unmet conditions,
missing data and risks for re-evaluation.
