# AIKINTEL Integration Handoff Pack v2

Owner: Paweł Grądziuk
Canonical Crypto Edge source: `d55892dc04421c50ea94ebc18918e1dfe842e47e`
Production runtime: `RC9 Product`
Integration shape: thin SSO launch boundary

## Purpose

AIKINTEL remains the owner of login and primary user identity. Crypto Edge remains the existing scanner, lifecycle, Radar, Follow-up, Research Playbook, Verification, AI v7 and private-workspace engine. The integration is one signed server-to-server launch exchange followed by a Crypto Edge session.

The integration does not move Crypto Edge data, queues, workers, prompts, providers, cron jobs or existing user records into AIKINTEL.

## Start here

Begin with `PAWEL_GRADZIUK_START_HERE.md`. It defines the integration boundary,
the required AIKINTEL-side wiring and the acceptance tests for the owner.

## Files in this pack

- `PAWEL_GRADZIUK_START_HERE.md` — concise owner entry point.
- `CURRENT_PRODUCTION_STATE.md` — non-secret production state as of 06.09.2026.
- `VPS_RUNTIME_FREEZE.md` — operational facts and integration freeze guardrails.
- `HANDOFF_MANIFEST.md` — canonical source, auth model and complete file list.
- `ARCHITECTURE.md` — boundary and request flow.
- `AUTH_CONTRACT.md` — signed credential, exchange and session contract.
- `SECURITY.md` — security controls and acceptance checks.
- `CLOUDFLARE_CUTOVER.md` — staged Access-to-SSO cutover plan.
- `OWNER_INTEGRATION_CHECKLIST.md` — step-by-step owner handoff.
- `.env.example` — both-side environment contract.
- `aikintel-snippets/server/routers/cryptoEdge.ts` — AIKINTEL tRPC adapter.
- `aikintel-snippets/client/pages/CryptoEdge.tsx` — AIKINTEL launch page.
- `aikintel-snippets/App.route.snippet.tsx` — wouter route.
- `aikintel-snippets/Sidebar.snippet.ts` — sidebar item.

## Quick integration

1. Copy the server router snippet into AIKINTEL and register it as `cryptoEdge`.
2. In the one marked adapter, connect `resolveAikintelUserId(ctx)` to the authenticated AIKINTEL `users.id`.
3. Put the same 32+ character secret in AIKINTEL `CRYPTO_EDGE_SSO_SECRET` and Crypto Edge `CRYPTO_EDGE_AIKINTEL_SSO_SECRET`.
4. Register `/crypto-market` and the sidebar item.
5. Set Crypto Edge `CRYPTO_EDGE_AUTH_MODE=AIKINTEL`, its actor key, and an absolute external auth-state path.
6. Build and test with two separate AIKINTEL users before changing Cloudflare Access.

The browser never signs a credential, never receives the shared secret, never calls a Crypto Edge API directly, and never stores the launch credential.

The local receiver contract test is `node --import tsx --test tests/aikintelAuth.test.ts` from `tools/ui-mock`.

## Automatic AI Lifecycle Analysis V1

Automatic AI is a Crypto Edge-owned shared system analysis. New / Observation
does not receive automatic heavy AI. Active Follow-up and enabled Main Radar
receive automatic shared AI qualification. Reconciliation runs worker-side
with a persistent fair cursor, so eligible identities are processed in a
bounded but eventually fair order.

The heavy AI result is system-shared, not per-user. For the same
`chain`, `contract_address`, `snapshot_fingerprint` and prompt/model/schema
identity, the existing shared result/job is reused. Changing presentation
locale between Polish and English does not create another heavy analysis;
both locales consume the same shared heavy result.

If material canonical evidence changes and the canonical
`snapshot_fingerprint` changes, the system may create exactly one new current
shared analysis identity for the changed evidence. The previous valid result
may remain last-known-good under existing AI v7 semantics. Repeated
reconciliation for the same new fingerprint does not create duplicate heavy
jobs. A routine scanner refresh does not automatically imply a new AI call.

The queue is shared and deduplicated by canonical cache identity. The existing
AI v7 provider integration remains unchanged. The lifecycle is fail-open:
AI outage, budget, queue or suspension state does not block promotion to
Follow-up or Main Radar.

Production acceptance evidence: TART / TartSwap on BSC,
contract `0x7ab8d02cbb51ff7223fde700eaaaa2a91bf750314`, was a controlled RC9
one-shot deployment acceptance. The persistent scheduled AI Worker remained
DISABLED. The flow reached Follow-up, automatic lifecycle reconciliation,
exactly one new shared queue record, exactly one worker claim, exactly one
OpenAI provider call, `VALID`, `READY` and automatic display in the Product
UI. Manual `Zleć analizę AI` was not used. This proves Automatic AI V1
end-to-end behavior and does not mean the persistent Worker was enabled for
continuous production at that moment.

## Required owner adapter

The only AIKINTEL-specific application mapping is:

> Paweł: podłącz tutaj istniejące authenticated `users.id` z AIKINTEL.

Do not substitute email, a browser parameter, a role claim or a display name. The value is converted to a short-lived signed credential server-side.

## Runtime boundary

| Component | Owner | State kept there |
|---|---|---|
| AIKINTEL login and `users.id` | AIKINTEL | Authenticated user context |
| Launch signing | AIKINTEL backend | No browser secret; one short-lived credential |
| Launch exchange and Crypto Edge session | Crypto Edge | External auth-state file outside release directory |
| Scanner, lifecycle, Radar, Follow-up | Crypto Edge | Existing shared/system and private state |
| Research Playbook and Verification | Crypto Edge | Existing `actor_id`-keyed private state |
| AI v7, Automatic AI reconciliation, queue, provider and worker | Crypto Edge | Existing shared AI state and limits |

## AIKINTEL guideline alignment

| Requirement | Status | Implementation / Owner Action |
|---|---|---|
| React page | READY | Use `client/pages/CryptoEdge.tsx`. |
| wouter route | READY | Register `/crypto-market`. |
| Sidebar | READY | Use `Sidebar.snippet.ts`. |
| protectedProcedure | READY | `cryptoEdge.launch` is protected. |
| tRPC | READY | Browser calls only the AIKINTEL tRPC procedure. |
| `users.id` identity | OWNER ACTION | Connect the one `resolveAikintelUserId(ctx)` adapter. |
| No frontend external fetch | READY | Browser receives only the tRPC launch URL. |
| Environment secrets | READY | `process.env` only; no hardcoded credentials. |
| UTC | READY | Credential timestamps are Unix UTC seconds. |
| Deployment handoff | READY | Checklist and Cloudflare sequence are included. |
| AI async | READY | Existing Crypto Edge AI v7 and Automatic AI remain asynchronous through the shared queue/worker. |
| Data collection | NOT PORTED BY DESIGN | Existing Crypto Edge scanner and Central Automation remain on the VPS. |
| Database tables | NOT PORTED BY DESIGN | Crypto Edge keeps its existing stores and actor-keyed workspace. |
| Cron scripts | NOT PORTED BY DESIGN | Crypto Edge Central Automation and AI worker remain existing VPS processes. |

## Contract assumptions

- AIKINTEL signs with HMAC-SHA-256 using `CRYPTO_EDGE_SSO_SECRET`.
- Crypto Edge verifies with the identical value in `CRYPTO_EDGE_AIKINTEL_SSO_SECRET`.
- `issuer` is `aikintel`; `audience` is `crypto-edge`.
- `subject` is the stable AIKINTEL `users.id` string.
- Credential lifetime is 60 seconds and `jti` is single-use.
- The exchange creates only `CAMP_USER`; launch claims cannot create OWNER or ADMIN.
- Crypto Edge derives `actor_id` with a separate `CRYPTO_EDGE_AIKINTEL_ACTOR_KEY`.
- Auth state, replay records and sessions are stored in the configured absolute path outside the release directory.
