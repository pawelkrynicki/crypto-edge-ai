# Security Checklist

## Required controls

- [ ] `CRYPTO_EDGE_AIKINTEL_SSO_SECRET` and AIKINTEL `CRYPTO_EDGE_SSO_SECRET` are generated independently from passwords and match exactly.
- [ ] Both shared-secret values exist only in server process environments or approved secret injection.
- [ ] `CRYPTO_EDGE_AIKINTEL_ACTOR_KEY` is a separate stable secret and is not the SSO secret.
- [ ] `CRYPTO_EDGE_AIKINTEL_AUTH_STATE_PATH` is absolute, outside every release directory, private to the product service account, and backed up securely.
- [ ] No secret is committed to the repository, frontend bundle, browser storage, URL logs or screenshots.
- [ ] AIKINTEL uses authenticated `users.id`; no email or browser-supplied role is used.
- [ ] Crypto Edge verifies HMAC-SHA-256 server-side.
- [ ] `jti` replay protection is persistent and single-use.
- [ ] Credential expiry and future-issued checks are enabled.
- [ ] The exchange always assigns `CAMP_USER`.
- [ ] OWNER/ADMIN continue through their separate internal mechanism.
- [ ] Cookie is HttpOnly, Secure in production, SameSite=Lax and Path=/.
- [ ] Exchange redirects to a clean URL with no credential.
- [ ] AIKINTEL mode rejects unauthenticated regular API requests with 401.
- [ ] Two users have separate Radar, research evidence, progress, notes, verification and workspace results.

## Negative tests

- [ ] malformed token rejected
- [ ] invalid signature rejected
- [ ] expired token rejected
- [ ] future token rejected
- [ ] wrong issuer rejected
- [ ] wrong audience rejected
- [ ] missing subject rejected
- [ ] replayed `jti` rejected
- [ ] OWNER/ADMIN claim rejected and cannot elevate
- [ ] invalid/missing session rejected
- [ ] User B cannot read or mutate User A state

## Data boundary

Do not add AIKINTEL database migrations for Crypto Edge tables. Do not copy the Crypto Edge `state` directory into AIKINTEL. Do not expose AI v7 provider credentials or queue data through the SSO endpoint.

