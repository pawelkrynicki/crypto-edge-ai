# Cloudflare Cutover Checklist

## Current state

`https://cryptoedge.crmallintraders.pl` is protected by the existing Cloudflare Tunnel plus Cloudflare Access email OTP. This is a temporary technical boundary during development and is not changed by this handoff pack.

## Final state

AIKINTEL owns the user login. The Cloudflare Tunnel remains. After AIKINTEL SSO is accepted, Cloudflare Access email OTP must not create a second user login or challenge an already authenticated AIKINTEL launch unexpectedly.

## Safe sequence

1. Keep the current Access policy unchanged while implementing and testing the server exchange.
2. Deploy the handoff code only after local tests and owner review are complete.
3. Configure Crypto Edge auth state and secrets outside the release directory.
4. Validate a signed launch for User A, a second launch after restart, and an invalid/replayed launch.
5. Validate User A/User B private isolation through Radar, Research Playbook, Verification and workspace mutations.
6. Validate the clean redirect and absence of credential in browser history/referrer/logging.
7. In a controlled maintenance window, adjust Cloudflare Access so it does not introduce a second login for the AIKINTEL path. Keep the Tunnel.
8. Repeat the two-user tests through the public hostname.
9. Keep a documented rollback that restores the previous Access challenge policy without changing Crypto Edge state.

## Guardrails

- Do not remove Access before AIKINTEL SSO and private isolation pass end-to-end.
- Do not put the shared secret in Cloudflare client configuration or frontend code.
- Do not accept an email header, query user id or Access identity as a replacement for the signed AIKINTEL credential.
- Do not change Central Automation, AI v7, the queue, the worker or data-poc as part of cutover.

