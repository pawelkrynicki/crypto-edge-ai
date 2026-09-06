# Paweł Grądziuk — Start Here

CANONICAL SOURCE: `d55892dc04421c50ea94ebc18918e1dfe842e47e`

PRODUCT: `RC9`

PUBLIC URL: <https://cryptoedge.crmallintraders.pl>

OWNER: Paweł Grądziuk

This handoff gives AIKINTEL Crypto Edge AI as a standalone backend/product
engine. Crypto Edge remains the owner of its operational runtime and state.

## Do not port into AIKINTEL

Do not port or replace the scanner, Central Automation, lifecycle engine, New
Inbox retention, Automatic AI reconciliation, AI v7, queue, AI Worker,
OpenAI provider integration, Research Playbook, Verification or Crypto Edge
private state. These remain owned and operated by Crypto Edge.

## Connect on the AIKINTEL side

Your integration work is:

1. connect authenticated `users.id`;
2. register the `cryptoEdge` tRPC router;
3. register `/crypto-market`;
4. add the sidebar entry;
5. implement the backend signed launch;
6. pass the two-user identity isolation test; and
7. perform the Cloudflare cutover last.

Do not touch Crypto Edge operational subsystems while doing this integration.

Use `AIKINTEL users.id` as the identity. Do not use email, display name, role
or a query parameter.

The AIKINTEL backend signs a short-lived credential. Crypto Edge verifies it
and creates its own `CAMP_USER` session. The credential is HMAC-signed, has a
60-second TTL and uses a single-use `jti`.

## Acceptance test

Test User A and User B separately. Confirm private isolation, persistence
after a restart and rejection of credential replay.

## Cloudflare and production

Change Cloudflare only at the end, after integration and public-hostname tests
pass. Do not perform the cutover during this handoff.

Public Crypto Edge URL: <https://cryptoedge.crmallintraders.pl>
