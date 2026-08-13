# PC.3C — Step 4 coverage matrix

Audit basis: checked-in normalized models, GoPlus fixture/raw snapshot, DexScreener
candidate snapshot, persisted scanner fixture, source policy, and the PC.3A private
evidence store. This audit deliberately made no live provider request.

| Item | Current normalized field | Raw data exists? | Current source | Current state | Can normalize without new provider? | Manual fallback | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `top1_wallet` | `security.top_wallet_pct` | Yes | GoPlus security snapshot | Automatic | Already normalized centrally | Not needed for the normal path | Quality preference `<10%`; frozen deal breaker remains `>30%` |
| `top10_wallets` | `security.top_10_wallets_pct` | Yes | GoPlus security snapshot | Automatic | Already normalized centrally | Not needed for the normal path | Quality preference `<40%`; value remains factual context in PC.3C |
| `liquidity_market_cap_ratio` | derived from `liquidity_usd / market_cap_usd` | Yes | DexScreener candidate snapshot | Automatic | Yes, from the shared candidate snapshot | Not needed for the normal path | `10–30%` is contextual optimum; only `<3%` is a Step 4 red concern |
| `liquidity_lock` | `security.liquidity_locked` | Yes | GoPlus security snapshot | Automatic | Already normalized centrally | Not needed for the normal path | Missing remains missing; false remains a red flag |
| `liquidity_lock_days` | `security.liquidity_lock_days` | Yes | GoPlus security snapshot | Automatic | Already normalized centrally | Not needed for the normal path | `180–365` days is preference context, not an invented end date |
| `holder_count` | — | No valid checked-in value | — | Unavailable | No | Structured private evidence | No live provider approved |
| `developer_wallet` | — | No reliable identity + percentage + lock context | GoPlus raw was audited; `creator_percent` alone is insufficient | Unavailable | No | Structured private evidence | Never infer identity or a pass |
| `liquidity_lock_end_date` | — | No exact timestamp in checked-in snapshot | — | Unavailable | No | Structured private evidence | Never derive from duration alone |
| `wallet_clustering` | `wallet_clustering` private evidence | No automated cluster result | Bubblemaps external website | Manual external research | No | Existing PC.3B Bubblemaps result | No API, iframe, or extraction |
| `volume_quality` | — | Partial inputs only (`volume_24h_usd`, ratio, liquidity) | DexScreener candidate snapshot | Unavailable as a verdict | No | Structured controlled private evidence | Never label volume “natural” automatically |

Automatic Step 4 values retain a readable source and snapshot timestamp in the
research view. The internal normalization path distinguishes direct candidate,
security, and derived candidate-snapshot values; raw provider payloads and IDs are
not exposed in CAMP.
