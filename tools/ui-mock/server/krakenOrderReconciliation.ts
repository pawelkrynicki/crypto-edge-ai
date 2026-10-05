import {
  createKrakenFuturesAuthent,
  KRAKEN_FUTURES_REST_BASE,
  type KrakenFuturesCredentialSource,
} from "./krakenAccount.js";

export const KRAKEN_FUTURES_ORDER_STATUS_PATH = "/api/v3/orders/status" as const;
export const KRAKEN_FUTURES_ORDER_STATUS_URL = `${KRAKEN_FUTURES_REST_BASE}/orders/status` as const;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type KrakenOrderReconciliationResult =
  | {
      status: "FOUND";
      cli_ord_id: string;
      order_id: string | null;
      provider_status: string | null;
      quantity: number | null;
      filled: number | null;
      symbol: string | null;
      side: string | null;
      reduce_only: boolean | null;
      error: string | null;
      server_time: string | null;
    }
  | {
      status: "NOT_FOUND" | "AUTH_FAILED" | "HTTP_ERROR" | "INVALID_RESPONSE" | "TRANSPORT_ERROR";
      cli_ord_id: string;
      order_id: null;
      provider_status: null;
      quantity: null;
      filled: null;
      symbol: null;
      side: null;
      reduce_only: null;
      error: string | null;
      server_time: string | null;
    };

export type KrakenOrderReconciliationTransport = {
  queryByCliOrdId(cliOrdId: string): Promise<KrakenOrderReconciliationResult>;
};

export function createKrakenOrderReconciliationTransport(options: {
  credentialSource: KrakenFuturesCredentialSource;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): KrakenOrderReconciliationTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Number.isSafeInteger(options.timeoutMs) && (options.timeoutMs ?? 0) > 0
    ? options.timeoutMs as number
    : 5_000;

  return {
    async queryByCliOrdId(cliOrdId: string): Promise<KrakenOrderReconciliationResult> {
      if (!cliOrdId || cliOrdId.length > 100) return empty("INVALID_RESPONSE", cliOrdId, "CLI_ORD_ID_INVALID");

      const credentials = options.credentialSource.getCredentials();
      if (!credentials) return empty("AUTH_FAILED", cliOrdId, "KRAKEN_LIVE_CREDENTIALS_NOT_CONFIGURED");

      const postData = encodeCliOrdIdStatusPostData(cliOrdId);
      const authent = createKrakenFuturesAuthent(
        credentials.apiSecret,
        KRAKEN_FUTURES_ORDER_STATUS_PATH,
        postData,
      );

      let response: Response;
      try {
        response = await fetchWithTimeout(
          fetchImpl,
          KRAKEN_FUTURES_ORDER_STATUS_URL,
          {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/x-www-form-urlencoded",
              APIKey: credentials.apiKey,
              Authent: authent,
            },
            body: postData,
          },
          timeoutMs,
        );
      } catch {
        return empty("TRANSPORT_ERROR", cliOrdId, "KRAKEN_RECONCILIATION_TRANSPORT_ERROR");
      }

      if (response.status === 401 || response.status === 403) {
        return empty("AUTH_FAILED", cliOrdId, "KRAKEN_RECONCILIATION_AUTH_FAILED");
      }
      if (!response.ok) {
        return empty("HTTP_ERROR", cliOrdId, `KRAKEN_RECONCILIATION_HTTP_${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return empty("INVALID_RESPONSE", cliOrdId, "KRAKEN_RECONCILIATION_RESPONSE_INVALID");
      }

      return normalizeOrderStatusResponse(payload, cliOrdId);
    },
  };
}

export function encodeCliOrdIdStatusPostData(cliOrdId: string): string {
  const params = new URLSearchParams();
  params.append("cliOrdIds", cliOrdId);
  return params.toString();
}

export function normalizeOrderStatusResponse(
  value: unknown,
  requestedCliOrdId: string,
): KrakenOrderReconciliationResult {
  if (!isRecord(value) || value.result !== "success" || !Array.isArray(value.orders)) {
    return empty("INVALID_RESPONSE", requestedCliOrdId, "KRAKEN_RECONCILIATION_RESPONSE_INVALID");
  }

  const serverTime = validIsoOrNull(value.serverTime);
  const match = value.orders.find((candidate) => {
    if (!isRecord(candidate) || !isRecord(candidate.order)) return false;
    return candidate.order.cliOrdId === requestedCliOrdId;
  });

  if (!match || !isRecord(match) || !isRecord(match.order)) {
    return {
      ...empty("NOT_FOUND", requestedCliOrdId, null),
      server_time: serverTime,
    };
  }

  const order = match.order;
  return {
    status: "FOUND",
    cli_ord_id: requestedCliOrdId,
    order_id: stringOrNull(order.orderId),
    provider_status: stringOrNull(match.status),
    quantity: finiteOrNull(order.quantity),
    filled: finiteOrNull(order.filled),
    symbol: stringOrNull(order.symbol),
    side: stringOrNull(order.side),
    reduce_only: typeof order.reduceOnly === "boolean" ? order.reduceOnly : null,
    error: stringOrNull(match.error),
    server_time: serverTime,
  };
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function empty(
  status: Exclude<KrakenOrderReconciliationResult["status"], "FOUND">,
  cliOrdId: string,
  error: string | null,
): KrakenOrderReconciliationResult {
  return {
    status,
    cli_ord_id: cliOrdId,
    order_id: null,
    provider_status: null,
    quantity: null,
    filled: null,
    symbol: null,
    side: null,
    reduce_only: null,
    error,
    server_time: null,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validIsoOrNull(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
