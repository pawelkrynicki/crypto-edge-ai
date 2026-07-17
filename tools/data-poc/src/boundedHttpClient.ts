export const DEFAULT_HTTP_TIMEOUT_MS = 10_000;
export const DEFAULT_HTTP_MAX_RETRIES = 1;
export const DEFAULT_HTTP_CONCURRENCY = 3;
export const DEFAULT_RETRY_AFTER_CAP_MS = 2_000;
export const INTERNAL_BETA_USER_AGENT = "Crypto-Edge-AI-INTERNAL_BETA/12R.4";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type BoundedHttpClientStats = {
  source_id: string;
  request_count: number;
  retry_count: number;
  failure_count: number;
};

export type BoundedHttpClientOptions = {
  sourceId: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  concurrency?: number;
  maxRequests: number;
  retryAfterCapMs?: number;
  userAgent?: string;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class BoundedHttpError extends Error {
  readonly code: string;
  readonly sourceId: string;
  readonly status: number | null;

  constructor(code: string, sourceId: string, status: number | null = null) {
    super(status === null ? `${sourceId}: ${code}` : `${sourceId}: ${code} (HTTP ${status})`);
    this.name = "BoundedHttpError";
    this.code = code;
    this.sourceId = sourceId;
    this.status = status;
  }
}

export class BoundedHttpClient {
  private readonly sourceId: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly concurrency: number;
  private readonly maxRequests: number;
  private readonly retryAfterCapMs: number;
  private readonly userAgent: string;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private activeRequests = 0;
  private readonly waiters: Array<() => void> = [];
  private requestCount = 0;
  private retryCount = 0;
  private failureCount = 0;

  constructor(options: BoundedHttpClientOptions) {
    this.sourceId = options.sourceId;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_HTTP_TIMEOUT_MS);
    this.maxRetries = clampInteger(options.maxRetries, DEFAULT_HTTP_MAX_RETRIES, 0, 1);
    this.concurrency = positiveInteger(options.concurrency, DEFAULT_HTTP_CONCURRENCY);
    this.maxRequests = positiveInteger(options.maxRequests, 1);
    this.retryAfterCapMs = positiveInteger(options.retryAfterCapMs, DEFAULT_RETRY_AFTER_CAP_MS);
    this.userAgent = options.userAgent ?? INTERNAL_BETA_USER_AGENT;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  getStats(): BoundedHttpClientStats {
    return {
      source_id: this.sourceId,
      request_count: this.requestCount,
      retry_count: this.retryCount,
      failure_count: this.failureCount,
    };
  }

  async requestJson<T>(url: string | URL, init: RequestInit = {}): Promise<T> {
    await this.acquire();
    try {
      return await this.requestJsonWithRetry<T>(url, init);
    } finally {
      this.release();
    }
  }

  private async requestJsonWithRetry<T>(url: string | URL, init: RequestInit): Promise<T> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (this.requestCount >= this.maxRequests) {
        this.failureCount += 1;
        throw new BoundedHttpError("REQUEST_BUDGET_EXHAUSTED", this.sourceId);
      }

      this.requestCount += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImpl(url, {
          ...init,
          signal: controller.signal,
          headers: {
            accept: "application/json",
            "user-agent": this.userAgent,
            ...headersToRecord(init.headers),
          },
        });

        if (!response.ok) {
          if (attempt < this.maxRetries && isRetryableStatus(response.status)) {
            this.retryCount += 1;
            const delay = response.status === 429
              ? boundedRetryAfterMs(response.headers.get("retry-after"), this.retryAfterCapMs)
              : 0;
            if (delay > 0) await this.sleep(delay);
            continue;
          }

          this.failureCount += 1;
          throw new BoundedHttpError(
            response.status === 429 ? "RATE_LIMITED" : "HTTP_ERROR",
            this.sourceId,
            response.status,
          );
        }

        try {
          return await response.json() as T;
        } catch {
          this.failureCount += 1;
          throw new BoundedHttpError("INVALID_JSON", this.sourceId, response.status);
        }
      } catch (error: unknown) {
        if (error instanceof BoundedHttpError) throw error;

        const timedOut = controller.signal.aborted;
        if (attempt < this.maxRetries) {
          this.retryCount += 1;
          continue;
        }

        this.failureCount += 1;
        throw new BoundedHttpError(timedOut ? "REQUEST_TIMEOUT" : "NETWORK_ERROR", this.sourceId);
      } finally {
        clearTimeout(timeout);
      }
    }

    this.failureCount += 1;
    throw new BoundedHttpError("RETRY_EXHAUSTED", this.sourceId);
  }

  private async acquire(): Promise<void> {
    if (this.activeRequests < this.concurrency) {
      this.activeRequests += 1;
      return;
    }

    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.activeRequests += 1;
  }

  private release(): void {
    this.activeRequests -= 1;
    this.waiters.shift()?.();
  }
}

export function boundedRetryAfterMs(value: string | null, capMs = DEFAULT_RETRY_AFTER_CAP_MS, now = Date.now()): number {
  if (!value) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1000), capMs);
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) return 0;
  return Math.min(Math.max(0, date - now), capMs);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, Number(value)));
}
