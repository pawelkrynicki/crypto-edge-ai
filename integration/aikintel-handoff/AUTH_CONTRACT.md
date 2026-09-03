# Authentication Contract v1

## Credential

The AIKINTEL backend creates a compact two-part value:

```text
base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload segment))
```

Payload:

```json
{
  "version": "aikintel_launch_v1",
  "issuer": "aikintel",
  "audience": "crypto-edge",
  "subject": "<stable AIKINTEL users.id as string>",
  "issued_at": 1730000000,
  "expires_at": 1730000060,
  "jti": "<random unique id>"
}
```

Rules:

- `version`, `issuer`, and `audience` must match exactly.
- `subject` is required, trimmed, non-control text, and is the only user identity input.
- `issued_at` and `expires_at` are integer Unix UTC seconds.
- `issued_at` cannot be in the future.
- `expires_at` must be in the future, after `issued_at`, and within the configured 60-second launch TTL.
- `jti` is required, random and single-use.
- Invalid signature, malformed payload, wrong issuer/audience, missing subject, future token, expired token or replay is rejected.
- A `role` or `capabilities` claim is not accepted. The exchange always creates `CAMP_USER`.

## Exchange

```text
GET /api/auth/aikintel/exchange?credential=<url-encoded credential>
```

Success:

- consume `jti` atomically in the external auth state,
- derive the opaque actor id,
- create a Crypto Edge session,
- return `303 Location: /`,
- set `crypto_edge_aikintel_session`.

The redirect target is clean and contains no credential. The response is `no-store` and uses `Referrer-Policy: no-referrer`.

Failure:

```json
{
  "error": "AUTH_REQUIRED",
  "message": "Authentication required"
}
```

with HTTP 401 for credential/session rejection. Storage/configuration failure is HTTP 503 with `AUTH_UNAVAILABLE`.

## Session

The Crypto Edge session cookie is:

- HttpOnly,
- Secure when production config or HTTPS forwarding is present,
- SameSite=Lax,
- Path=/,
- 30-day Max-Age.

The cookie value is opaque and the state file stores only its SHA-256 digest. A session resolves to `CAMP_USER` with existing `CAMP_USER_WORKSPACE_WRITE` capability.

## Endpoint protection

In `CRYPTO_EDGE_AUTH_MODE=AIKINTEL`, no regular API path can create an anonymous session. Every user-facing API requires the Crypto Edge session. The existing default CAMP mode is unchanged.

