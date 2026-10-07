# ALLinCrypto Engine -> Crypto Edge integration contract

Status: CANONICAL. Claude must read and obey this file before every ALLinCrypto Engine update.

## Goal

ALLinCrypto Engine is allowed to change setups, filters, risk/trading logic, UI and internal architecture.
The Crypto Edge publishing boundary must remain stable across every Engine release.

A normal setup update must NEVER require rebuilding the Bridge or Kraken Copy integration.

## Mandatory integration points

Every released ALLinCrypto Engine source MUST contain all three:

1. Include:
   `#include <CryptoEdgePublisher.mqh>`

2. Initialization inside `OnInit()`:
   `CryptoEdgeInit();`

3. Exactly one generic signal publish call after a valid signal has final Entry / SL / TP / RR, but BEFORE AUTO/SIGNALS execution gating:
   `CryptoEdgePublishSignal(...)`

The publisher call must happen before checks such as `if(!gAuto)`, `TradeAllowed()`, spread gating, lot sizing and `OrderSend`.
Crypto Edge receives the source signal whether or not MT4 later executes the trade.

## Publisher contract

`CryptoEdgePublisher.mqh` is setup-agnostic and version-agnostic.

It must NOT:
- declare `InpCE_Enabled`, `InpCE_EngineVer`, `InpCE_StrategyVer` or `InpCE_TerminalId`;
- contain setup-specific logic or hardcoded A/B/C/... families;
- contain Engine-version literals;
- place trades;
- call Kraken;
- perform HTTP/WebRequest;
- contain Crypto Edge bearer/API credentials.

It only serializes a completed Engine signal into:
`FILE_COMMON\CryptoEdge\outbox\<signal_id>.json`

The Bridge owns transport from outbox to Crypto Edge AI.

## Engine-owned Crypto Edge inputs

Every released Engine MUST declare these inputs in the Engine source, immediately before:
`#include <CryptoEdgePublisher.mqh>`

Required shape:

`input bool   InpCE_Enabled     = true;`
`input string InpCE_EngineVer   = "<same as #property version>";`
`input string InpCE_StrategyVer = "<deliberate strategy version>";`
`input string InpCE_TerminalId  = "";`

The publisher only reads these values. If an Engine does not declare them, compilation must fail rather than silently fall back to stale defaults.

## Default publishing state

Released Engine builds MUST default to:
`InpCE_Enabled = true`

Do not reset this default to false in future versions.

The user may still manually disable publishing through MT4 inputs when intentionally needed.

## Version synchronization

For every Engine release:
- `#property version` must contain the actual Engine version;
- `InpCE_EngineVer` in the Engine must match the actual Engine version;
- `InpCE_StrategyVer` must be deliberately set and not accidentally left stale;
- the shared publisher must contain no Engine-version default.

Example for Engine 1.10:
- `#property version "1.10"`
- `InpCE_EngineVer = "1.10"`

Do not ship Engine 1.10 while Crypto Edge metadata still reports Engine 1.00.

## MARKET contract

For MARKET signals publish:
- order_type = MARKET
- entry_price = source signal price at generation
- stop_loss
- take_profit
- rr
- cancel_price = 0/null
- valid_for_seconds = 0/null
- max_hold_seconds when applicable

## LIMIT contract

For LIMIT signals publish:
- order_type = LIMIT
- entry_price = intended limit entry price
- stop_loss
- take_profit
- rr
- cancel_price
- valid_for_seconds
- max_hold_seconds when applicable

LIMIT signals MUST be published when generated, not only after the pending order fills.

## Signal identity

Signal IDs must remain deterministic and idempotent for the same source signal.
Do not introduce random IDs.
Do not reuse the same ID for distinct signals.

Current canonical identity basis:
terminal/account + setup_id + source close time + side + order_type.

## Setup changes

Adding/removing/renaming setups is routine Engine work.

Claude may change:
- setup count;
- setup IDs;
- families;
- timeframes;
- parameters;
- signal logic;
- trade logic.

Claude must NOT require a change in `CryptoEdgePublisher.mqh` merely because the setup list changed.

## Release package requirements

Every Engine release delivered by Claude must include:
1. updated `.mq4`
2. compiled `.ex4` produced by the verifier run
3. canonical, shared, version-agnostic `CryptoEdgePublisher.mqh`
4. compile result: `0 errors, 0 warnings`
5. release version
6. setup list
7. SHA256 of MQ4, EX4 and publisher
8. `ENGINE_RELEASE_CHECK.txt`
9. compile log

Never deliver only EX4.

MetaEditor output is not assumed byte-deterministic across independent compiles. The release EX4 is the EX4 produced by the PASS verifier run and copied into its output directory.

## Mandatory release checks

Before saying an Engine update is complete, Claude must explicitly verify:

- [ ] correct Engine version
- [ ] current setup count/list
- [ ] CryptoEdgePublisher include present
- [ ] CryptoEdgeInit present
- [ ] CryptoEdgePublishSignal present after final E/SL/TP calculation
- [ ] publish call occurs before AUTO execution gating
- [ ] MARKET mapping correct
- [ ] LIMIT mapping correct
- [ ] LIMIT cancel_price and validity are passed
- [ ] Engine declares all four `InpCE_*` inputs before the publisher include
- [ ] InpCE_Enabled default = true
- [ ] InpCE_EngineVer matches Engine version
- [ ] publisher declares no `InpCE_*` inputs and contains no Engine-version defaults
- [ ] verifier resolves the publisher from the actual MQL4 Include root used for compilation
- [ ] no Kraken/API/HTTP/order-placement logic in publisher
- [ ] compilation = 0 errors / 0 warnings
- [ ] MQ4 + verifier-produced EX4 + publisher are all delivered

## What Claude should report after every update

Use exactly this compact summary:

ENGINE RELEASE CHECK
Version: <version>
Setups: <count> — <ids>
Crypto Edge include: PASS
Crypto Edge init: PASS
Crypto Edge publish hook: PASS
Hook before AUTO gating: PASS
MARKET mapping: PASS
LIMIT mapping: PASS
Publisher default enabled: PASS
Engine version metadata synced: PASS
Compile: 0 errors / 0 warnings
MQ4 SHA256: <hash>
EX4 SHA256: <hash>
Publisher SHA256: <hash>
RESULT: PASS

If any line is not PASS, do not deploy the Engine.
