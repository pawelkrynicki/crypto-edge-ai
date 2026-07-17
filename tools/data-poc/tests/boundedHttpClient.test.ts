import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BoundedHttpClient,
  BoundedHttpError,
  boundedRetryAfterMs,
} from "../src/boundedHttpClient.js";

describe("BoundedHttpClient", () => {
  it("preserves the globalThis context for the default fetch without using the network", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = function (this: typeof globalThis, input, init) {
      calls += 1;
      assert.equal(this, globalThis);
      assert.equal(String(input), "https://example.test/default-fetch-context");
      assert.equal(new Headers(init?.headers).get("accept"), "application/json");
      return Promise.resolve(Response.json({ ok: true }));
    } as typeof globalThis.fetch;

    try {
      const client = new BoundedHttpClient({
        sourceId: "default_fetch_context",
        maxRequests: 1,
      });
      assert.deepEqual(
        await client.requestJson("https://example.test/default-fetch-context"),
        { ok: true },
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retries 429 once and respects bounded Retry-After", async () => {
    let calls = 0;
    const delays: number[] = [];
    const client = new BoundedHttpClient({
      sourceId: "test_source",
      maxRequests: 2,
      retryAfterCapMs: 1_500,
      sleep: async (milliseconds) => { delays.push(milliseconds); },
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? new Response("", { status: 429, headers: { "retry-after": "10" } })
          : Response.json({ ok: true });
      },
    });

    assert.deepEqual(await client.requestJson("https://example.test/data"), { ok: true });
    assert.equal(calls, 2);
    assert.deepEqual(delays, [1_500]);
    assert.equal(client.getStats().retry_count, 1);
  });

  it("times out a request and never retries more than once", async () => {
    let calls = 0;
    const client = new BoundedHttpClient({
      sourceId: "timeout_source",
      timeoutMs: 5,
      maxRetries: 1,
      maxRequests: 2,
      fetchImpl: async (_input, init) => {
        calls += 1;
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      },
    });

    await assert.rejects(
      () => client.requestJson("https://example.test/timeout"),
      (error: unknown) => error instanceof BoundedHttpError && error.code === "REQUEST_TIMEOUT",
    );
    assert.equal(calls, 2);
    assert.equal(client.getStats().retry_count, 1);
  });

  it("does not retry non-429 4xx responses", async () => {
    let calls = 0;
    const client = new BoundedHttpClient({
      sourceId: "client_error_source",
      maxRequests: 2,
      fetchImpl: async () => {
        calls += 1;
        return new Response("", { status: 403 });
      },
    });

    await assert.rejects(
      () => client.requestJson("https://example.test/forbidden"),
      (error: unknown) => error instanceof BoundedHttpError && error.status === 403,
    );
    assert.equal(calls, 1);
  });

  it("parses Retry-After dates inside the configured bound", () => {
    assert.equal(boundedRetryAfterMs("2", 1_000), 1_000);
    assert.equal(boundedRetryAfterMs("invalid", 1_000), 0);
  });
});
