import {
  createKrakenFuturesAuthent,
  KRAKEN_FUTURES_REST_BASE,
  type KrakenFuturesCredentialSource,
} from "./krakenAccount.js";
import type { KrakenSendOrderRequest } from "./krakenLiveRequestBuilder.js";

export const KRAKEN_FUTURES_SEND_ORDER_PATH = "/api/v3/sendorder" as const;
export const KRAKEN_FUTURES_SEND_ORDER_URL = `${KRAKEN_FUTURES_REST_BASE}/sendorder` as const;
export const DEFAULT_KRAKEN_LIVE_ORDER_TIMEOUT_MS = 5_000;
export const DEFAULT_KRAKEN_PROCESS_BEFORE_MS = 5_000;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type KrakenLiveOrderTransportStatus =
  | "PLACED"
  | "PROVIDER_REJECTED"
  | "AUTH_FAILED"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "TRANSPORT_ERROR";

export type KrakenLiveOrderTransportResult = {
  status: KrakenLiveOrderTransportStatus;
  provider_status: string | null;
  order_id: string | null;
  server_time: string | null;
  error_code: string | null;
};

export type KrakenLiveOrderTransport = {
  submit(request: KrakenSendOrderRequest): Promise<KrakenLiveOrderTransportResult>;
};

export function createKrakenLiveOrderTransport(options: {
  credentialSource: KrakenFuturesCredentialSource;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  processBeforeMs?: number;
  now?: () => Date;
}): KrakenLiveOrderTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = sanitizePositiveInteger(options.timeoutMs, DEFAULT_KRAKEN_LIVE_ORDER_TIMEOUT_MS);
  const processBeforeMs = sanitizePositiveInteger(options.processBeforeMs, DEFAULT_KRAKEN_PROCESS_BEFORE_MS);
  const now = options.now ?? (() => new Date());

  return {
    async submit(request: KrakenSendOrderRequest): Promise<KrakenLiveOrderTransportResult> {
      const credentials = options.credentialSource.getCredentials();
      if (!credentials) {
        return emptyResult("AUTH_FAILED", "KRAKEN_LIVE_CREDENTIALS_NOT_CONFIGURED");
      }

      const processBefore = request.processBefore ?? new Date(now().getTime() + processBeforeMs).toISOString();
      const postData = encodeKrakenSendOrderPostData({ ...request, processBefore });
      const authent = createKrakenFuturesAuthent(
        credentials.apiSecret,
        KRAKEN_FUTURES_SEND_ORDER_PATH,
        postData,
      );

      let response: Response;
      try {
        response = await fetchWithTimeout(
          fetchImpl,
          KRAKEN_FUTURES_SEND_ORDER_URL,
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
        return emptyResult("TRANSPORT_ERROR", "KRAKEN_LIVE_TRANSPORT_ERROR");
      }

      if (response.status === 401 || response.status === 403) {
        return emptyResult("AUTH_FAILED", "KRAKEN_LIVE_AUTH_FAILED");
      }
      if (!response.ok) {
        return emptyResult("HTTP_ERROR", `KRAKEN_LIVE_HTTP_${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return emptyResult("INVALID_RESPONSE", "KRAKEN_LIVE_RESPONSE_INVALID");
      }
      return normalizeSendOrderResponse(payload);
    },
  };
}

export function encodeKrakenSendOrderPostData(request: KrakenSendOrderRequest): string {
  const params = new URLSearchParams();

  if (request.processBefore) params.set("processBefore", request.processBefore);
  params.set("orderType", request.orderType);
  params.set("symbol", request.symbol);
  params.set("side", request.side);
  params.set("size", canonicalNumber(request.size));
  if (request.limitPrice !== undefined) params.set("limitPrice", canonicalNumber(request.limitPrice));
  if (request.stopPrice !== undefined) params.set("stopPrice", canonicalNumber(request.stopPrice));
  if (request.cliOrdId) params.set("cliOrdId", request.cliOrdId);
  if (request.triggerSignal) params.set("triggerSignal", request.triggerSignal);
  if (request.reduceOnly !== undefined) params.set("reduceOnly", request.reduceOnly ? "true" : "false");

  return params.toString();
}

export function normalizeSendOrderResponse(value: unknown): KrakenLiveOrderTransportResult {
  if (!isRecord(value)) return emptyResult("INVALID_RESPONSE", "KRAKEN_LIVE_RESPONSE_INVALID");

  const result = typeof value.result === "string" ? value.result : null;
  const serverTime = validIsoOrNull(value.serverTime);

  if (result !== "success") {
    const error = typeof value.error === "string" && value.error ? value.error : "KRAKEN_LIVE_PROVIDER_ERROR";
    return {
      status: "PROVIDER_REJECTED",
      provider_status: null,
      order_id: null,
      server_time: serverTime,
      error_code: error,
    };
  }

  if (!isRecord(value.sendStatus) || typeof value.sendStatus.status !== "string") {
    return emptyResult("INVALID_RESPONSE", "KRAKEN_LIVE_SEND_STATUS_INVALID", serverTime);
  }

  const providerStatus = value.sendStatus.status;
  const orderId = typeof value.sendStatus.order_id === "string" && value.sendStatus.order_id
    ? value.sendStatus.order_id
    : null;

  if (providerStatus === "placed") {
    return {
      status: "PLACED",
      provider_status: providerStatus,
      order_id: orderId,
      server_time: serverTime,
      error_code: null,
    };
  }

  return {
    status: "PROVIDER_REJECTED",
    provider_status: providerStatus,
    order_id: orderId,
    server_time: serverTime,
    error_code: `KRAKEN_SEND_STATUS_${providerStatus}`,
  };
}

function canonicalNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) throw new Error("KRAKEN_LIVE_REQUEST_NUMBER_INVALID");
  return String(Number(value.toPrecision(15)));
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

function sanitizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function emptyResult(
  status: KrakenLiveOrderTransportStatus,
  errorCode: string,
  serverTime: string | null = null,
): KrakenLiveOrderTransportResult {
  return {
    status,
    provider_status: null,
    order_id: null,
    server_time: serverTime,
    error_code: errorCode,
  };
}

function validIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
