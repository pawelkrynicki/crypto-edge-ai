# VPS Runtime Freeze

This document records only non-secret operational facts needed to keep the
working Crypto Edge production runtime intact during AIKINTEL integration.

## Runtime ownership

| Runtime | Task | Keep |
|---|---|---|
| Product | Crypto Edge AI Product Runtime | Yes |
| AI | Crypto Edge AI Worker | Keep disabled |
| Central | Crypto Edge AI Central Automation | Yes |

- State root: `C:\CryptoEdge\state`
- Product port: `4180`
- Public URL: <https://cryptoedge.crmallintraders.pl>
- Product runtime: **RC9**
- Central Automation: **RC8 / ENABLED**
- AI Worker: Crypto Edge-owned, currently intentionally **DISABLED** and
  **STOPPED**. The owner will enable the normal production configuration
  before CAMP.
- Cloudflare Tunnel: **KEEP**
- Central Automation: **KEEP**

Lifecycle state must not be copied into a release directory. External VPS
launchers and configuration are runtime configuration outside the immutable
release tree; preserve that separation.

## AIKINTEL integration must not

- repoint `data-poc`;
- move lifecycle state;
- modify retention;
- rebuild AI v7 or change the Automatic AI reconciliation;
- enable or reconfigure the AI Worker, including its limits;
- use the test one-shot launcher;
- move the AI queue or provider configuration;
- change AI budgets or the circuit breaker;
- replace Central Automation or repoint it to RC9; or
- copy state into the release tree.

AIKINTEL integration does not require the Worker to be running. Paweł
Grądziuk must not enable, reconfigure or migrate it; it remains Crypto Edge
VPS ownership.

Do not copy real secrets or environment values into this handoff. Do not
restart production tasks as part of the integration preparation.
