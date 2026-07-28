import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectInternalBetaContext } from "../src/internalBetaContextCollection.js";

describe("DATA.1 context partial availability", () => {
  it("reuses the previous validated source on one provider failure and reports PARTIAL health", async () => {
    const first = await collectInternalBetaContext({
      now: new Date("2026-07-28T10:00:00.000Z"),
      runId: "approved_sources_first",
      fetchImpl: async (input) => providerResponse(String(input)),
    });
    const previousDefillama = first.context.sources.find((source) => source.source_id === "defillama_api");
    assert.ok(previousDefillama);

    const second = await collectInternalBetaContext({
      now: new Date("2026-07-28T11:00:00.000Z"),
      runId: "approved_sources_partial",
      dueSourceIds: ["defillama_api"],
      previousContext: first.context,
      fetchImpl: async (input) => {
        if (String(input) === "https://api.llama.fi/protocols") throw new Error("network unavailable at secret path");
        throw new Error(`unexpected provider ${String(input)}`);
      },
    });
    const fallback = second.context.sources.find((source) => source.source_id === "defillama_api");
    assert.ok(fallback);
    assert.deepEqual(fallback.records, previousDefillama.records);
    assert.equal(fallback.fetched_at, previousDefillama.fetched_at);
    assert.equal(fallback.errors.length, 0);
    assert.ok(fallback.warnings.includes("SOURCE_LAST_KNOWN_GOOD: defillama_api"));
    assert.equal(second.source_health.defillama_api, "DEGRADED");
    assert.deepEqual(second.refreshed_source_ids, []);
    assert.deepEqual(second.request_counts, { alternative_me_fng: 0, defillama_api: 2 });
    assert.doesNotMatch(JSON.stringify(second.context), /secret path/i);
    assert.equal(second.context.provenance.fixture_used, false);
  });
});

function providerResponse(url: string): Response {
  if (url === "https://api.alternative.me/fng/?limit=1") {
    return Response.json({ data: [{ value: "45", value_classification: "Fear", timestamp: "1785232800", time_until_update: "3600" }] });
  }
  if (url === "https://api.llama.fi/protocols") {
    return Response.json([{ name: "Lido", chain: "Ethereum", tvl: 1_000_000, change_1d: 1, change_7d: 2, url: "https://lido.fi" }]);
  }
  throw new Error(`unexpected provider ${url}`);
}
