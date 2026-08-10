import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import { createProductReviewPublication } from "../server/productReviewPublication.js";
import { validateScannerApiOutput } from "../src/services/scannerDataSource.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import type { ScannerOutputWithMeta } from "../server/latestScannerOutput.js";

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
    const reviewRootPath = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-version-"));
    process.env.CRYPTO_EDGE_PC1_REVIEW_MODE = "1";
    process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT = reviewRootPath;
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      reviewPublication: {
        loadBaseScanner: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
        loadBaseSnapshot: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
        validateSnapshot: () => undefined,
        persistReviewPointer: async () => undefined,
      },
      productVersion: {
        readAutomationState: async () => ({ last_published_scanner_run_id: PERSISTABLE_SCANNER_SAMPLE.scan_run.run_id, last_published_context_run_id: "context_pointer" }),
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
      const waitingStatus = await fetch(`${base}/api/product/review/publication-status?pc1_review=1`);
      assert.equal(waitingStatus.status, 200);
      const waitingPublicationStatus = await waitingStatus.json() as Record<string, unknown>;
      assert.equal(typeof waitingPublicationStatus.timer_scheduled_at, "string");
      assert.equal(typeof waitingPublicationStatus.timer_due_at, "string");
      assert.equal(waitingPublicationStatus.timer_fired_at, null);
      assert.deepEqual({
        ...waitingPublicationStatus,
        timer_scheduled_at: null,
        timer_due_at: null,
        next_attempt_at: null,
      }, {
        schema_version: "pc1_review_publication_status_v1",
        status: "WAITING",
        revision: 0,
        current_review_version: 1,
        attempt: 0,
        started_at: null,
        finished_at: null,
        source_run_id: null,
        target_run_id: null,
        failure_stage: null,
        reason_code: null,
        next_retry_at: null,
        last_published_at: null,
        next_attempt_at: null,
        timer_scheduled_at: null,
        timer_due_at: null,
        timer_fired_at: null,
        provider_calls: 0,
        openai_calls: 0,
        canonical_mutations: 0,
      });
      const published = await fetch(`${base}/api/product/review/publish-next?pc1_review=1`, { method: "POST" });
      assert.equal(published.status, 200);
      const publishedStatus = await fetch(`${base}/api/product/review/publication-status?pc1_review=1`);
      assert.equal((await publishedStatus.json() as { status: string }).status, "PUBLISHED");
      const after = await version(base, "?pc1_review=1");
      assert.notEqual(after.scanner_run_id, before.scanner_run_id);
      assert.notEqual(after.scanner_generated_at, before.scanner_generated_at);
      assert.equal(after.lifecycle_updated_at, before.lifecycle_updated_at);
      assert.deepEqual(await version(base), before, "the review publication is invisible without the review query");
    } finally {
      await close(server);
      await rm(reviewRootPath, { recursive: true, force: true });
      if (originalMode === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_MODE; else process.env.CRYPTO_EDGE_PC1_REVIEW_MODE = originalMode;
      if (originalRoot === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT; else process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT = originalRoot;
    }
  });

  it("changes the version endpoint only after the isolated review timer publishes its marker", async () => {
    let reviewTimer: (() => void) | undefined;
    const reviewRootPath = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-version-timer-"));
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      reviewPublication: {
        enabled: true,
        reviewRootPath,
        now: () => new Date("2026-08-10T10:05:00.000Z"),
        autoPublicationDelayMs: 60_000,
        setTimer: (callback, delay) => {
          assert.equal(delay, 60_000);
          reviewTimer = callback;
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: () => undefined,
        persistMarker: async () => undefined,
        loadBaseScanner: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
        loadBaseSnapshot: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
        validateSnapshot: () => undefined,
        persistReviewPointer: async () => undefined,
      },
      productVersion: {
        readAutomationState: async () => ({ last_published_scanner_run_id: PERSISTABLE_SCANNER_SAMPLE.scan_run.run_id, last_published_context_run_id: "context_pointer" }),
        readPublishedSnapshotTimes: async () => ({ scanner_published_at: "2026-08-10T10:00:00.000Z", context_published_at: "2026-08-10T09:55:00.000Z" }),
        readLifecycleReceipt: async () => ({ central_cycle_id: "cycle_pointer", finished_at: "2026-08-10T10:00:01.000Z" }),
      },
    });
    await listen(server);
    try {
      const base = serverUrl(server);
      const before = await version(base);
      assert.ok(reviewTimer, "the isolated review harness schedules one publication");
      reviewTimer();
      const publication = await fetch(`${base}/api/product/review/publish-next?pc1_review=1`, { method: "POST" });
      assert.equal(publication.status, 200);
      const after = await version(base, "?pc1_review=1");
      assert.notEqual(after.scanner_run_id, before.scanner_run_id);
      assert.equal(after.scanner_generated_at, "2026-08-10T10:05:00.000Z");
      assert.equal(after.lifecycle_updated_at, "2026-08-10T10:00:01.000Z");
    } finally {
      await close(server);
      await rm(reviewRootPath, { recursive: true, force: true });
    }
  });

  it("keeps a simulated scanner publication internally consistent for the normal UI reader", async () => {
    const reviewRootPath = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-version-snapshot-"));
    const publication = createProductReviewPublication({
      now: () => new Date("2026-08-10T10:05:00.000Z"),
      enabled: true,
      reviewRootPath,
      loadBaseScanner: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
      loadBaseSnapshot: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
      persistReviewPointer: async () => undefined,
      loadBaseVersion: async () => ({
        scanner_run_id: PERSISTABLE_SCANNER_SAMPLE.scan_run.run_id,
        scanner_generated_at: PERSISTABLE_SCANNER_SAMPLE.provenance?.generated_at ?? null,
        context_run_id: "context_pointer",
        context_generated_at: "2026-08-10T09:55:00.000Z",
        lifecycle_cycle_id: "cycle_pointer",
        lifecycle_updated_at: "2026-08-10T10:00:01.000Z",
      }),
      validateSnapshot: () => undefined,
      persistMarker: async () => undefined,
    });
    try {
      await publication.publishNext();
      const simulated = publication.decorateScanner(scannerWithMeta());
      const validated = validateScannerApiOutput(simulated);
      assert.match(validated.scan_run.run_id, /-review-1$/);
      assert.equal(validated.candidates.every((candidate) => candidate.run_id === validated.scan_run.run_id), true);
      assert.equal(validated.security_checks.every((entry) => entry.run_id === validated.scan_run.run_id), true);
      assert.equal(validated.scorecards.every((entry) => entry.run_id === validated.scan_run.run_id), true);
    } finally {
      publication.stop();
      await rm(reviewRootPath, { recursive: true, force: true });
    }
  });
});

async function version(base: string, query = ""): Promise<Record<string, unknown>> {
  const response = await fetch(`${base}/api/product/version${query}`);
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

function scannerWithMeta(): ScannerOutputWithMeta {
  return {
    ...structuredClone(PERSISTABLE_SCANNER_SAMPLE),
    _source_meta: {
      source: "real-output",
      reason: "test",
      selected_run_id: PERSISTABLE_SCANNER_SAMPLE.scan_run.run_id,
      loaded_at: "2026-08-10T10:00:00.000Z",
      runtime_mode: "INTERNAL_BETA",
      age_seconds: 0,
      source_ids: ["dexscreener"],
      freshness_status: "FRESH",
    },
  };
}
