# Architecture

## Existing Crypto Edge auth audit

The current default path is implemented by `tools/ui-mock/server/lifecycleSession.ts` and `campUserIdentityRegistry.ts`:

1. A browser receives an opaque `crypto_edge_pc1_session` cookie.
2. The in-process session map resolves that cookie to a `Pc1SessionContext`.
3. For `CAMP_USER`, a durable registry stores only a SHA-256 cookie-token digest and a generated `camp-user-*` actor id.
4. After a product restart, the same valid cookie can restore the same actor id from that registry.
5. `userWorkspaceRepository`, research evidence and lifecycle reads use `session.actor_id` as the private partition key.
6. `safeActor()` accepts the opaque `aikintel-*` format as well as existing actors; no old actor id is migrated.

The default CAMP behavior remains the same when `CRYPTO_EDGE_AUTH_MODE` is unset or `CAMP`.

## AIKINTEL flow

```text
AIKINTEL authenticated browser
        |
        | protected tRPC cryptoEdge.launch
        v
AIKINTEL backend signs 60-second credential
        |
        | browser navigation only; no direct data API call
        v
Crypto Edge GET /api/auth/aikintel/exchange?credential=...
        |
        | verify signature, claims, expiry and unused jti
        | derive opaque actor_id from subject + separate actor key
        | persist session/replay state outside release directory
        | Set-Cookie HttpOnly and 303 to /
        v
Crypto Edge session cookie -> CAMP_USER actor_id
        |
        v
Existing Radar, lifecycle, workspace, Verification and AI v7 APIs
```

In AIKINTEL mode, every `/api/*` request except the exchange endpoint requires the Crypto Edge session. Missing or invalid session returns `401 {"error":"AUTH_REQUIRED"}`. No anonymous CAMP user is created.

## Stable actor mapping

`actor_id = aikintel-<HMAC-SHA256(CRYPTO_EDGE_AIKINTEL_ACTOR_KEY, subject)>`.

The full hex digest is retained in the opaque actor id. The raw subject is not returned to the browser and is not written to the Crypto Edge auth state file. The actor key is intentionally separate from the SSO signing secret so signing rotation does not silently change private-workspace ownership.

The same subject therefore resolves to the same actor after a process restart. Different subjects resolve to different cryptographic actor ids. Existing `camp-user-*` records are left untouched.

## State placement

The AIKINTEL auth state file contains only:

- the schema version,
- hashes of Crypto Edge session cookies mapped to opaque actor ids and expiry,
- consumed `jti` values with expiry.

It contains no AIKINTEL password, cookie, email or raw subject. Configure an absolute path such as `C:\CryptoEdge\state\aikintel-auth.json`; never place it below `C:\CryptoEdge\releases\...`.
