# AXI Signal Gateway v1

The AXI Signal Gateway is an intake and read-only persistence boundary for the
AXI MetaTrader 4 ALLinCrypto Engine. It does not evaluate setups, manage risk,
send orders, or call an execution venue.

## Enablement and storage

The gateway is disabled by default. Enable it only in the server process:

```text
CRYPTO_EDGE_AXI_SIGNALS=1
CRYPTO_EDGE_AXI_SIGNAL_TOKEN=<long-random-machine-secret>
```

`CRYPTO_EDGE_AXI_SIGNALS` is resolved through the repository-owned
`crypto_edge_feature_flags_v1` manifest. An invalid value fails closed. When
disabled, all `/api/v1/trading/signals` paths return `404` and no signal
database is created.

SQLite storage defaults to `tools/ui-mock/.local/axi-signals.sqlite`. Set
`CRYPTO_EDGE_AXI_SIGNAL_SQLITE_PATH` to an absolute path, or a path relative
to `tools/ui-mock`, to override it. `signal_id` is the SQLite primary key.

## Machine ingress

`POST /api/v1/trading/signals/axi` is the MT4/Claude handoff endpoint. It is
handled before normal AIKINTEL browser-session authentication. It requires:

```http
Authorization: Bearer <CRYPTO_EDGE_AXI_SIGNAL_TOKEN>
Content-Type: application/json
```

The token is compared as fixed-length SHA-256 digests with a constant-time
comparison. It is never written to application logs or response bodies. The
body limit is 16,384 bytes.

## MT4 COMMON-file bridge (separate VPS process)

`CryptoEdge Bridge` is intentionally separate from the product runtime. MT4
does not use `WebRequest`; ALLinCrypto Engine writes JSON files to its shared
COMMON folder and the bridge forwards their original bytes to this local
gateway:

```text
ALLinCrypto Engine
  -> MetaTrader COMMON Files\CryptoEdge\outbox\*.json
  -> CryptoEdge Bridge (separate process)
  -> http://127.0.0.1:4180/api/v1/trading/signals/axi
  -> existing AXI Signal Gateway SQLite store
```

Start the product runtime and the bridge as two independently supervised VPS
processes. From a release worktree, the bridge launcher is:

```cmd
scripts\win\start-axi-mt4-bridge-vps.cmd
```

The bridge reads only `outbox/*.json` under its configured root. Its default
root is `%APPDATA%\MetaQuotes\Terminal\Common\Files\CryptoEdge`; set
`CRYPTO_EDGE_MT4_BRIDGE_ROOT` only to use another root. It creates `sent` and
`rejected` beneath that same root. A successful `201` or idempotent `200`
moves the exact source file to `sent`; `400`, `409`, and `413` move it to
`rejected`. `401`, `403`, disabled-route `404`, timeouts, connection errors,
and `5xx` responses stay in `outbox` for retry. A file that cannot yet be read
or parsed is also retried, since MT4 may still be completing its write.

Configuration is server-side only:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CRYPTO_EDGE_AXI_SIGNAL_TOKEN` | none (required) | Gateway Bearer token; never log or expose it. |
| `CRYPTO_EDGE_MT4_BRIDGE_ROOT` | APPDATA MetaTrader COMMON CryptoEdge root | Shared bridge root. |
| `CRYPTO_EDGE_AXI_SIGNAL_ENDPOINT` | `http://127.0.0.1:4180/api/v1/trading/signals/axi` | Local gateway endpoint; only loopback HTTP endpoints are accepted. |
| `CRYPTO_EDGE_MT4_BRIDGE_POLL_MS` | `1000` | Poll cadence, 100 through 60,000 ms. |

For an operator smoke check without a persistent loop, append `--once` to the
launcher. The bridge has no execution or Kraken-order behavior; successful
handoff into this gateway is its terminal responsibility.

The body must have exactly this shape. Nullable fields must be present with a
value or `null`; unknown fields are rejected.

```json
{
  "schema_version": "axi_crypto_signal_v1",
  "event_type": "SIGNAL_CREATED",
  "signal_id": "axi-20260928-000001",
  "source": {
    "provider": "AXI",
    "engine": "ALLinCrypto Engine",
    "engine_version": "1.2.3",
    "strategy_version": "2026.09",
    "terminal_id": "axi-mt4-primary"
  },
  "setup": {
    "setup_id": "trend-reclaim-v9",
    "setup_name": "Trend reclaim v9",
    "timeframe": "M15",
    "family": "custom-trend",
    "max_hold_seconds": 7200
  },
  "trade": {
    "symbol": "CRYPTOUSD",
    "side": "BUY",
    "order_type": "MARKET",
    "source_signal_time": "2026-09-28T11:59:59.000Z",
    "source_time_basis": "AXI_SERVER",
    "entry_price": 100,
    "stop_loss": 90,
    "take_profit": 120,
    "rr": 2,
    "cancel_price": null,
    "valid_for_seconds": null
  }
}
```

The `setup` object is source-owned rather than an application enum. New or
retired setups require no backend code change.

Validation rules:

- `schema_version`, `event_type`, `source.provider`, `source.engine`, and
  `source_time_basis` must respectively be `axi_crypto_signal_v1`,
  `SIGNAL_CREATED`, `AXI`, `ALLinCrypto Engine`, and `AXI_SERVER`.
- `signal_id`, `setup_id`, `engine_version`, `strategy_version`, `terminal_id`,
  `timeframe`, and `family` are non-empty ASCII identifiers matching
  `[A-Za-z0-9][A-Za-z0-9._:-]*`, with maximum lengths 128, 128, 64, 64, 128,
  32, and 64 characters. `setup_name` is trimmed, non-empty, at most 128
  characters, and contains no control characters. `symbol` matches
  `[A-Za-z0-9][A-Za-z0-9._/-]{0,31}`.
- `source_signal_time` originates from the AXI broker-server clock. Before
  POSTing, the MT4 publisher MUST normalize that instant to canonical UTC and
  send it in `YYYY-MM-DDTHH:mm:ss.sssZ` format. `source_time_basis=AXI_SERVER`
  records the source clock domain, not the wire timezone.
- Prices are finite values in `(0, 1,000,000,000,000]`; `rr` is finite in
  `(0, 1,000]`. BUY requires `stop_loss < entry_price < take_profit`; SELL
  requires `take_profit < entry_price < stop_loss`. The declared `rr` must be
  within 2% of the price-implied risk/reward ratio.
- `max_hold_seconds` is `null` or an integer from 1 through 366 days;
  `valid_for_seconds` is `null` or an integer from 1 through seven days;
  `cancel_price` is `null` or a valid price. MARKET requires both
  `cancel_price` and `valid_for_seconds` to be `null`; LIMIT may provide
  either or both.

First delivery returns `201`:

```json
{
  "schema_version": "axi_signal_ingest_receipt_v1",
  "status": "CREATED",
  "signal_id": "axi-20260928-000001",
  "received_at": "2026-09-28T12:00:00.000Z"
}
```

The server persists the complete validated source object and a server-owned
`received_at`. A key-sorted canonical JSON form is the idempotency value:
retrying the same `signal_id` with the same canonical payload returns `200`
with `status: "DUPLICATE"` and creates no row. Reusing a `signal_id` with a
different payload returns `409` with `AXI_SIGNAL_ID_CONFLICT`.

| Condition | HTTP | Error code |
| --- | ---: | --- |
| Missing, malformed, or wrong Bearer token | 401 | `AXI_SIGNAL_AUTH_INVALID` |
| Non-JSON content type | 400 | `AXI_SIGNAL_CONTENT_TYPE_INVALID` |
| Invalid JSON | 400 | `AXI_SIGNAL_JSON_INVALID` |
| Body over 16,384 bytes | 413 | `AXI_SIGNAL_BODY_TOO_LARGE` |
| Contract validation | 400 | Deterministic `AXI_SIGNAL_*` validation code |
| Existing ID, different canonical payload | 409 | `AXI_SIGNAL_ID_CONFLICT` |
| SQLite unavailable | 503 | `AXI_SIGNAL_UNAVAILABLE` |

## Authenticated read API

The existing Crypto Edge user-session path protects these routes. This packet
limits them to `OWNER` and `ADMIN` session roles:

- `GET /api/v1/trading/signals?limit=N` returns
  `{ "schema_version": "axi_signal_list_v1", "signals": [...] }`.
  `limit` defaults to 50 and must be an integer from 1 through 100. Results
  are newest received first.
- `GET /api/v1/trading/signals/:signal_id` returns
  `{ "schema_version": "axi_signal_detail_v1", "signal": {...}, "received_at": "..." }`.

An unauthenticated AIKINTEL request is rejected by the normal session layer;
an authenticated non-OWNER/non-ADMIN session receives `403` with
`axi_signals_forbidden`. These endpoints expose source records only and have
no execution behavior.
