import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BoundedHttpClient } from "../src/boundedHttpClient.js";
import { fetchGoPlusSecurityResult, toGoPlusChainId } from "../src/goplusClient.js";
import { toHoneypotChainId } from "../src/honeypotClient.js";

describe("approved security clients", () => {
  it("keeps GoPlus EVM mapping on an explicit allowlist", () => {
    assert.equal(toGoPlusChainId("base"), "8453");
    assert.equal(toGoPlusChainId("999999"), null);
  });

  it("returns Security Data Unavailable semantics for unsupported GoPlus chains without fetch", async () => {
    let fetchCalls = 0;
    const client = new BoundedHttpClient({
      sourceId: "goplus_security",
      maxRequests: 1,
      fetchImpl: async () => { fetchCalls += 1; return Response.json({}); },
    });
    const result = await fetchGoPlusSecurityResult("unsupported", "0x1", {
      environment: "INTERNAL_BETA",
      client,
    });
    assert.equal(result.availability, "unavailable");
    assert.equal(result.reason_code, "GOPLUS_UNSUPPORTED_CHAIN");
    assert.equal(fetchCalls, 0);
  });

  it("does not call the Solana endpoint without its optional auth token", async () => {
    let fetchCalls = 0;
    const client = new BoundedHttpClient({
      sourceId: "goplus_security",
      maxRequests: 1,
      fetchImpl: async () => { fetchCalls += 1; return Response.json({}); },
    });
    const result = await fetchGoPlusSecurityResult("solana", "So111", {
      environment: "INTERNAL_BETA",
      client,
      apiToken: "",
    });
    assert.equal(result.reason_code, "GOPLUS_AUTH_TOKEN_MISSING");
    assert.equal(fetchCalls, 0);
  });

  it("treats an HTTP 200 provider error as unavailable", async () => {
    const client = new BoundedHttpClient({
      sourceId: "goplus_security",
      maxRequests: 1,
      fetchImpl: async () => Response.json({ code: 5006, message: "Param error", result: {} }),
    });
    const result = await fetchGoPlusSecurityResult("base", "0x1", {
      environment: "INTERNAL_BETA",
      client,
    });
    assert.equal(result.availability, "unavailable");
    assert.equal(result.reason_code, "GOPLUS_PROVIDER_ERROR");
    assert.equal(result.raw, null);
  });

  it("does not claim coverage when the requested token is absent", async () => {
    const client = new BoundedHttpClient({
      sourceId: "goplus_security",
      maxRequests: 1,
      fetchImpl: async () => Response.json({ code: 1, result: { "0xother": { is_honeypot: "0" } } }),
    });
    const result = await fetchGoPlusSecurityResult("base", "0x1", {
      environment: "INTERNAL_BETA",
      client,
    });
    assert.equal(result.availability, "unavailable");
    assert.equal(result.reason_code, "GOPLUS_RESULT_UNAVAILABLE");
    assert.equal(result.raw, null);
  });

  it("supports Honeypot.is only on Ethereum, BSC and Base", () => {
    assert.equal(toHoneypotChainId("ethereum"), "1");
    assert.equal(toHoneypotChainId("bsc"), "56");
    assert.equal(toHoneypotChainId("base"), "8453");
    for (const chain of ["arbitrum", "polygon", "avalanche"]) {
      assert.equal(toHoneypotChainId(chain), null);
    }
  });
});
