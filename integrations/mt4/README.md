# MT4 Crypto Edge publisher

This adapter keeps ALLinCrypto Engine independent from Crypto Edge transport.

Flow:

ALLinCrypto Engine -> MetaTrader COMMON Files/CryptoEdge/outbox/*.json -> CryptoEdge Bridge -> local AXI Signal Gateway.

`CryptoEdgePublisher.mqh` has no HTTP, bearer token, Kraken API logic, retry loop, setup allow-list, or setup-family enum mapping.

Stable Engine hooks:

1. Add `#include <CryptoEdgePublisher.mqh>` near the top of the EA.
2. Call `CryptoEdgeInit();` once from `OnInit()`.
3. After a signal has valid entry, SL and TP, call `CryptoEdgePublishSignal(...)` before the EA's AUTO/SIGNALS execution split.

The hook passes scalar values only: setup id/name, symbol, timeframe, side, order type, entry, SL, TP, RR, source close time, cancel price, validity, max hold and price digits.

Adding, removing or rewriting a setup does not require changes in `CryptoEdgePublisher.mqh`.

The publisher is disabled by default. Enable `InpCE_Enabled` only on the intended VPS source terminal.

It writes one UTF-8 JSON file per signal to the MetaTrader COMMON file area. The signal id is deterministic, so gateway retries remain idempotent.

`source_signal_time` is normalized from the current AXI server/GMT offset for a freshly closed live bar. MT4 has no historical broker timezone table, so a signal exactly around a broker DST transition retains that documented limitation.

The full ALLinCrypto Engine source is intentionally not stored in this repository.
