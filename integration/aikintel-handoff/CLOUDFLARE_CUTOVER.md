# Cloudflare Cutover Checklist

## Current state

- The Cloudflare Tunnel is active.
- The public hostname `https://cryptoedge.crmallintraders.pl` is working.
- Cloudflare Access email OTP is working for the owner and explicitly whitelisted testers.
- This is the temporary pre-AIKINTEL access model.
- The Tunnel and current Access configuration are not changed by this handoff.

## Final state

AIKINTEL owns login. A signed AIKINTEL launch becomes the Crypto Edge identity
boundary. Cloudflare must not create a second unexpected login challenge after
the launch has been authenticated.

The Cloudflare Tunnel remains active. AIKINTEL owns the login experience after
cutover; the signed launch credential remains the server-side identity
boundary.

Do not perform this cutover now. It is the final infrastructure step after the
AIKINTEL integration and public-hostname acceptance tests pass.

## Safe sequence

1. Keep the current Access policy unchanged while implementing and testing the server exchange.
2. Deploy the handoff code only after local tests and owner review are complete.
3. Configure Crypto Edge auth state and secrets outside the release directory.
4. Validate a signed launch for User A, a second launch after restart, and an invalid/replayed launch.
5. Validate User A/User B private isolation through Radar, Research Playbook, Verification and workspace mutations.
6. Validate the clean redirect and absence of credential in browser history/referrer/logging.
7. In a controlled maintenance window, adjust Cloudflare Access so it does not introduce a second login for the AIKINTEL path. Keep the Tunnel unchanged.
8. Repeat the two-user tests through the public hostname.
9. Keep a documented rollback that restores the previous Access challenge policy without changing Crypto Edge state.

## Guardrails

- Do not remove Access before AIKINTEL SSO and private isolation pass end-to-end.
- Do not put the shared secret in Cloudflare client configuration or frontend code.
- Do not accept an email header, query user id or Access identity as a replacement for the signed AIKINTEL credential.
- Do not change Central Automation, AI v7, Automatic AI reconciliation, the
  queue, the worker, retention or data-poc as part of cutover.
- Do not execute the cutover as part of this handoff preparation.
