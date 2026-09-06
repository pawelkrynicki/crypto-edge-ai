# Owner Integration Checklist

Owner: Paweł Grądziuk

CANONICAL SOURCE: `d55892dc04421c50ea94ebc18918e1dfe842e47e`

PRODUCT: `RC9`

MAIN: NOT CANONICAL FOR THIS HANDOFF

## 1. Copy the references

- [ ] Copy the server router pattern from `aikintel-snippets/server/routers/cryptoEdge.ts`.
- [ ] Copy the page pattern from `aikintel-snippets/client/pages/CryptoEdge.tsx`.
- [ ] Register the route from `aikintel-snippets/App.route.snippet.tsx`.
- [ ] Add the sidebar item from `aikintel-snippets/Sidebar.snippet.ts`.

## 2. Connect identity

- [ ] In `resolveAikintelUserId(ctx)`, connect the existing authenticated `users.id`.
- [ ] Keep the value server-side and convert it to `String(users.id)`.
- [ ] Do not use email, role, display name, query parameters or browser storage.

## 3. Configure environments

- [ ] Set AIKINTEL `CRYPTO_EDGE_BASE_URL` to the public Crypto Edge hostname.
- [ ] Set AIKINTEL `CRYPTO_EDGE_SSO_SECRET`.
- [ ] Set Crypto Edge `CRYPTO_EDGE_AUTH_MODE=AIKINTEL`.
- [ ] Set Crypto Edge `CRYPTO_EDGE_AIKINTEL_SSO_SECRET` to the same value.
- [ ] Generate and set a separate stable `CRYPTO_EDGE_AIKINTEL_ACTOR_KEY`.
- [ ] Set an absolute external `CRYPTO_EDGE_AIKINTEL_AUTH_STATE_PATH`.
- [ ] Set matching issuer/audience values.
- [ ] Use production Secure cookies.

## 4. Register and build AIKINTEL

- [ ] Register the router under the AIKINTEL tRPC root.
- [ ] Confirm the client uses only the protected tRPC mutation.
- [ ] Confirm the browser performs navigation to the returned URL and does not log it.
- [ ] Run the AIKINTEL typecheck and production build.

## 5. User A test

- [ ] Login as User A.
- [ ] Open Crypto Market.
- [ ] Confirm one clean redirect and Radar access.
- [ ] Save a private lifecycle status, research note/progress and manual verification decision.
- [ ] Refresh and restart Crypto Edge; confirm the same private state remains.

## 6. User B test

- [ ] Login as a different User B.
- [ ] Open Crypto Market.
- [ ] Confirm User A's private Radar and research state are not visible.
- [ ] Attempt the User A identity through UI/API and confirm no read or mutation is possible.

## 7. SSO negative tests

- [ ] Expired, malformed, future, wrong-issuer and wrong-audience credentials fail closed.
- [ ] Invalid signature fails closed.
- [ ] Reusing the same `jti` fails closed.
- [ ] A credential containing OWNER/ADMIN claims cannot elevate.
- [ ] The exchange response redirects to a clean URL.

## 8. Production readiness before Cloudflare cutover

Before changing Cloudflare Access, require:

- [ ] Product RC9 is healthy.
- [ ] The current Radar timestamp is present and operationally current.
- [ ] Central Automation continues publishing canonical snapshots.
- [ ] The existing Automatic AI result is readable.
- [ ] AI Worker may remain intentionally disabled; enabling it is not an
      AIKINTEL acceptance requirement.
- [ ] Integration does not enable or reconfigure the Worker.
- [ ] New Inbox retention remains active.
- [ ] Persistent state remains unchanged.
- [ ] User A/User B identity isolation passes.

AI Worker running is **not** an AIKINTEL acceptance requirement. The owner
will separately enable the normal production Worker configuration before
CAMP.

## 9. Cloudflare cutover

Before changing Cloudflare Access, confirm:

- [ ] Crypto Edge standalone production remains healthy
- [ ] Product timestamp is current
- [ ] Central Automation continues publishing
- [ ] AI Worker state is recorded as intentionally disabled if it has not yet
      been enabled by the owner
- [ ] retention remains active
- [ ] no AIKINTEL test changes data-poc/runtime ownership

- [ ] Complete `CLOUDFLARE_CUTOVER.md` in order.
- [ ] Keep Tunnel configuration unchanged.
- [ ] Change Access only after public-hostname two-user tests pass.
- [ ] Test rollback to the previous Access policy.

## 10. Final acceptance

- [ ] Existing default CAMP mode regression passes.
- [ ] AIKINTEL mode is fail-closed without a Crypto Edge session.
- [ ] Same AIKINTEL subject maps to the same actor after restart.
- [ ] Different subjects are isolated.
- [ ] No secrets or credentials appear in source, bundle, URL logs or browser storage.
- [ ] No OpenAI live call is needed for SSO acceptance.
- [ ] Crypto Edge scanner, lifecycle, Automatic AI, AI v7, queue, worker and
      Central Automation remain unchanged.

## Rollback

Disable the AIKINTEL launch entry and restore the previous Cloudflare Access policy. Keep the external auth-state file and existing Crypto Edge state intact; do not delete or migrate private workspace data during rollback.
