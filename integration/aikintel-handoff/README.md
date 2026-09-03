# AIKINTEL Integration Handoff Pack v1

Owner: Paweł Grądziuk  
Crypto Edge baseline: `9b48ba945dcef2bb0f73068a22edc4a2be63779f`  
Integration shape: thin SSO launch boundary

## Purpose

AIKINTEL remains the owner of login and primary user identity. Crypto Edge remains the existing scanner, lifecycle, Radar, Follow-up, Research Playbook, Verification, AI v7 and private-workspace engine. The integration is one signed server-to-server launch exchange followed by a Crypto Edge session.

The integration does not move Crypto Edge data, queues, workers, prompts, providers, cron jobs or existing user records into AIKINTEL.

## Files in this pack

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
| AI v7, queue, provider and worker | Crypto Edge | Existing AI v7 state and limits |

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
| AI async | READY | Existing Crypto Edge AI v7 remains asynchronous through its queue/worker. |
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
