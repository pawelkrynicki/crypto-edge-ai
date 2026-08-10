import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import { createProductReviewPublication } from "../server/productReviewPublication.js";
import { validateScannerApiOutput } from "../src/services/scannerDataSource.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const EXPECTED_KEYS = [
  "context_generated_at", "context_run_id", "lifecycle_cycle_id", "lifecycle_updated_at",
  "scanner_generated_at", "scanner_run_id",
];

describe("product version API", () => {
  it("serves only read-only publication pointers across 100 calls", async () => {
    let stateReads = 0;
    const providerCalls = 0;
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      productVersion: {
        readAutomationState: async () => {
          stateReads += 1;
          return { last_published_scanner_run_id: "scan_pointer", last_published_context_run_id: "context_pointer" };
        },
        readPublishedSnapshotTimes: async () => ({
          scanner_published_at: "2026-08-10T10:00:00.000Z",
          context_published_at: "2026-08-10T09:55:00.000Z",
        }),
        readLifecycleReceipt: async () => ({ central_cycle_id: "cycle_pointer", finished_at: "2026-08-10T10:00:01.000Z" }),
      },
    });
    await listen(server);
    try {
      const base = serverUrl(server);
      const responses = await Promise.all(Array.from({ length: 100 }, () => fetch(`${base}/api/product/version`)));
      assert.equal(responses.every((response) => response.status === 200), true);
      const bodies = await Promise.all(responses.map((response) => response.json() as Promise<Record<string, unknown>>));
      assert.equal(stateReads, 100);
      assert.equal(providerCalls, 0);
      assert.equal(new Set(bodies.map((body) => JSON.stringify(body))).size, 1);
      assert.deepEqual(Object.keys(bodies[0]!).sort(), EXPECTED_KEYS);
      assert.deepEqual(bodies[0], {
        scanner_run_id: "scan_pointer",
        scanner_generated_at: "2026-08-10T10:00:00.000Z",
        context_run_id: "context_pointer",
        context_generated_at: "2026-08-10T09:55:00.000Z",
        lifecycle_cycle_id: "cycle_pointer",
        lifecycle_updated_at: "2026-08-10T10:00:01.000Z",
      });
    } finally {
      await close(server);
    }
  });

  it("allows the publication simulation only in the isolated PC.1 review runtime", async () => {
    const originalMode = process.env.CRYPTO_EDGE_PC1_REVIEW_MODE;
    const originalRoot = process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT;
    process.env.CRYPTO_EDGE_PC1_REVIEW_MODE = "1";
    process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT = "C:\\temp\\pc1-review";
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      productVersion: {
        readAutomationState: async () => ({ last_published_scanner_run_id: "scan_pointer", last_published_context_run_id: "context_pointer" }),
        readPublishedSnapshotTimes: async () => ({ scanner_published_at: "2026-08-10T10:00:00.000Z", context_published_at: "2026-08-10T09:55:00.000Z" }),
        readLifecycleReceipt: async () => ({ central_cycle_id: "cycle_pointer", finished_at: "2026-08-10T10:00:01.000Z" }),
      },
    });
    await listen(server);
    try {
      const base = serverUrl(server);
      const before = await version(base);
      const absentReviewMarker = await fetch(`${base}/api/product/review/publish-next`, { method: "POST" });
      assert.equal(absentReviewMarker.status, 404);
      const published = await fetch(`${base}/api/product/review/publish-next?pc1_review=1`, { method: "POST" });
      assert.equal(published.status, 200);
      const after = await version(base);
      assert.notEqual(after.scanner_run_id, before.scanner_run_id);
      assert.notEqual(after.scanner_generated_at, before.scanner_generated_at);
    } finally {
      await close(server);
      if (originalMode === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_MODE; else process.env.CRYPTO_EDGE_PC1_REVIEW_MODE = originalMode;
      if (originalRoot === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT; else process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT = originalRoot;
    }
  });

  it("keeps a simulated scanner publication internally consistent for the normal UI reader", () => {
    const originalMode = process.env.CRYPTO_EDGE_PC1_REVIEW_MODE;
    const originalRoot = process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT;
    process.env.CRYPTO_EDGE_PC1_REVIEW_MODE = "1";
    process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT = "C:\\temp\\pc1-review";
    try {
      const publication = createProductReviewPublication(() => new Date("2026-08-10T10:05:00.000Z"), true);
      publication.publishNext();
      const simulated = publication.decorateScanner(structuredClone(PERSISTABLE_SCANNER_SAMPLE));
      const validated = validateScannerApiOutput(simulated);
      assert.match(validated.scan_run.run_id, /-review-1$/);
      assert.equal(validated.candidates.every((candidate) => candidate.run_id === validated.scan_run.run_id), true);
      assert.equal(validated.security_checks.every((entry) => entry.run_id === validated.scan_run.run_id), true);
      assert.equal(validated.scorecards.every((entry) => entry.run_id === validated.scan_run.run_id), true);
    } finally {
      if (originalMode === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_MODE; else process.env.CRYPTO_EDGE_PC1_REVIEW_MODE = originalMode;
      if (originalRoot === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT; else process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT = originalRoot;
    }
  });
});

async function version(base: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${base}/api/product/version`);
  assert.equal(response.status, 200);
  return await response.json() as Record<string, unknown>;
}

function listen(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
}

function close(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

function serverUrl(server: ReturnType<typeof createScannerApiServer>): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
