import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS,
  PC1_REVIEW_PUBLICATION_MAX_ATTEMPTS,
  PC1_REVIEW_PUBLICATION_RETRY_DELAY_MS,
  createProductReviewPublication,
} from "../server/productReviewPublication.js";
import type { ProductVersion } from "../src/productVersion.js";
import type { ScannerOutputWithMeta } from "../server/latestScannerOutput.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const VERSION: ProductVersion = {
  scanner_run_id: PERSISTABLE_SCANNER_SAMPLE.scan_run.run_id,
  scanner_generated_at: "2026-08-04T04:39:00.000Z",
  context_run_id: "context_review_pointer",
  context_generated_at: "2026-08-04T04:39:00.000Z",
  lifecycle_cycle_id: "cycle_review_pointer",
  lifecycle_updated_at: "2026-08-04T04:39:01.000Z",
};

describe("PC.1 review auto-publication harness", () => {
  it("read-back validates and publishes V2 with marker as the final signal", async () => {
    const reviewRootPath = await reviewRoot();
    const steps: string[] = [];
    let validationRuns = 0;
    const automationStatePath = await automationState(reviewRootPath);
    const publication = createProductReviewPublication({
      enabled: true,
      reviewRootPath,
      now: () => new Date("2026-08-10T08:30:00.000Z"),
      loadBaseScanner: async () => scannerWithMeta(),
      loadBaseSnapshot: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
      loadBaseVersion: async () => VERSION,
      validateSnapshot: () => { validationRuns += 1; },
      persistReviewPointer: async (version) => {
        steps.push("pointer");
        await writeFile(automationStatePath, `${JSON.stringify({ last_published_scanner_run_id: version.scanner_run_id })}\n`, "utf8");
      },
      persistMarker: async (marker) => {
        steps.push("marker");
        await writeFile(resolve(reviewRootPath, "pc1-review-publication.json"), `${JSON.stringify(marker)}\n`, "utf8");
      },
    });
    try {
      const result = await publication.publishNext();
      assert.equal(result.published, true);
      assert.equal(result.status.status, "PUBLISHED");
      assert.equal(result.status.attempt, 1);
      assert.equal(result.status.failure_stage, null);
      assert.equal(validationRuns, 2, "the persisted snapshot must be validated after its read-back");
      assert.deepEqual(steps, ["pointer", "marker"], "marker is the final publication signal");
      assert.equal(
        JSON.parse(await readFile(automationStatePath, "utf8")).last_published_scanner_run_id,
        `${VERSION.scanner_run_id}-review-1`,
      );
      const snapshotPath = resolve(reviewRootPath, "output", `${VERSION.scanner_run_id}-review-1`, "full_output.json");
      await access(snapshotPath);
      const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as ScannerOutputWithMeta;
      assert.equal((snapshot.scan_run as { run_id: string }).run_id, `${VERSION.scanner_run_id}-review-1`);
      assert.equal((snapshot.candidates as Array<{ run_id: string }>).every((candidate) => candidate.run_id === `${VERSION.scanner_run_id}-review-1`), true);
      const status = JSON.parse(await readFile(resolve(reviewRootPath, "pc1-review-publication-status.json"), "utf8"));
      assert.equal(status.schema_version, "pc1_review_publication_status_v1");
      assert.equal(status.status, "PUBLISHED");
      assert.equal(status.provider_calls, 0);
      assert.equal(status.openai_calls, 0);
      assert.equal(status.canonical_mutations, 0);
    } finally {
      publication.stop();
    }
  });

  it("makes a first failure visible without changing V1 or its marker", async () => {
    const reviewRootPath = await reviewRoot();
    const publication = createProductReviewPublication({
      enabled: true,
      reviewRootPath,
      loadBaseScanner: async () => scannerWithMeta(),
      loadBaseSnapshot: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
      loadBaseVersion: async () => VERSION,
      validateSnapshot: () => { throw new Error("SCANNER_DISPLAY_VALIDATION_FAILED"); },
    });
    try {
      const result = await publication.publishNext();
      assert.equal(result.published, false);
      assert.equal(result.status.status, "RETRY_WAIT");
      assert.equal(result.status.attempt, 1);
      assert.equal(result.status.failure_stage, "VALIDATE");
      assert.equal(result.status.reason_code, "SCANNER_DISPLAY_VALIDATION_FAILED");
      assert.ok(result.status.next_retry_at);
      assert.equal(publication.getMarker(), null);
      assert.deepEqual(publication.decorateVersion(VERSION), VERSION);
      assert.equal(
        publication.decorateScanner(scannerWithMeta())._source_meta.selected_run_id,
        VERSION.scanner_run_id,
        "the rendered scanner remains on V1",
      );
      await assert.rejects(access(resolve(reviewRootPath, "pc1-review-publication.json")));
      await assert.rejects(access(resolve(reviewRootPath, "output", `${VERSION.scanner_run_id}-review-1`, "full_output.json")));
    } finally {
      publication.stop();
    }
  });

  it("does not create the final marker when the pointer commit fails", async () => {
    const reviewRootPath = await reviewRoot();
    const automationStatePath = await automationState(reviewRootPath);
    let markerWrites = 0;
    const publication = createProductReviewPublication({
      enabled: true,
      reviewRootPath,
      loadBaseScanner: async () => scannerWithMeta(),
      loadBaseSnapshot: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
      loadBaseVersion: async () => VERSION,
      validateSnapshot: () => undefined,
      persistReviewPointer: async () => { throw new Error("POINTER_WRITE_FAILED"); },
      persistMarker: async () => { markerWrites += 1; },
    });
    try {
      const result = await publication.publishNext();
      assert.equal(result.published, false);
      assert.equal(result.status.failure_stage, "PERSIST_POINTER");
      assert.equal(markerWrites, 0);
      assert.equal(JSON.parse(await readFile(automationStatePath, "utf8")).last_published_scanner_run_id, VERSION.scanner_run_id);
      assert.equal(publication.getMarker(), null);
    } finally {
      publication.stop();
    }
  });

  it("retries once after 30 seconds and can publish on attempt two", async () => {
    const reviewRootPath = await reviewRoot();
    await automationState(reviewRootPath);
    const timers: Array<{ callback: () => void; delay: number }> = [];
    let validations = 0;
    const publication = createProductReviewPublication({
      enabled: true,
      reviewRootPath,
      now: () => new Date("2026-08-10T08:30:00.000Z"),
      loadBaseScanner: async () => scannerWithMeta(),
      loadBaseSnapshot: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
      loadBaseVersion: async () => VERSION,
      validateSnapshot: () => {
        validations += 1;
        if (validations === 1) throw new Error("SCANNER_DISPLAY_VALIDATION_FAILED");
      },
      setTimer: (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => undefined,
    });
    try {
      assert.equal(timers.shift()?.delay, PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS);
      timers.shift()?.callback();
      const first = await publication.publishNext();
      assert.equal(first.status.status, "RETRY_WAIT");
      assert.equal(timers.length, 1);
      assert.equal(timers[0]!.delay, PC1_REVIEW_PUBLICATION_RETRY_DELAY_MS);
      timers.shift()?.callback();
      const second = await publication.publishNext();
      assert.equal(second.published, true);
      assert.equal(second.status.attempt, 2);
      assert.equal(second.status.status, "PUBLISHED");
      assert.equal(publication.getMarker()?.version.scanner_run_id, `${VERSION.scanner_run_id}-review-2`);
    } finally {
      publication.stop();
    }
  });

  it("stops after three failed attempts without scheduling an infinite retry", async () => {
    const reviewRootPath = await reviewRoot();
    const timers: Array<{ callback: () => void; delay: number }> = [];
    const publication = createProductReviewPublication({
      enabled: true,
      reviewRootPath,
      loadBaseScanner: async () => scannerWithMeta(),
      loadBaseSnapshot: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
      loadBaseVersion: async () => VERSION,
      validateSnapshot: () => { throw new Error("SCANNER_DISPLAY_VALIDATION_FAILED"); },
      setTimer: (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => undefined,
    });
    try {
      let scheduled = timers.shift();
      assert.equal(scheduled?.delay, PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS);
      for (let attempt = 1; attempt <= PC1_REVIEW_PUBLICATION_MAX_ATTEMPTS; attempt += 1) {
        scheduled?.callback();
        const result = await publication.publishNext();
        assert.equal(result.status.attempt, attempt);
        if (attempt < PC1_REVIEW_PUBLICATION_MAX_ATTEMPTS) {
          assert.equal(result.status.status, "RETRY_WAIT");
          scheduled = timers.shift();
          assert.equal(scheduled?.delay, PC1_REVIEW_PUBLICATION_RETRY_DELAY_MS);
        } else {
          assert.equal(result.status.status, "FAILED");
          assert.equal(result.status.next_retry_at, null);
          assert.equal(timers.length, 0);
        }
      }
      assert.equal(publication.getMarker(), null);
    } finally {
      publication.stop();
    }
  });
});

async function reviewRoot(): Promise<string> {
  return mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-review-publication-"));
}

async function automationState(reviewRootPath: string): Promise<string> {
  const automationStatePath = resolve(reviewRootPath, ".local", "automation", "automation-state.json");
  await mkdir(resolve(automationStatePath, ".."), { recursive: true });
  await writeFile(automationStatePath, `${JSON.stringify({ last_published_scanner_run_id: VERSION.scanner_run_id })}\n`, "utf8");
  return automationStatePath;
}

function scannerWithMeta(): ScannerOutputWithMeta {
  return {
    ...structuredClone(PERSISTABLE_SCANNER_SAMPLE),
    _source_meta: {
      source: "real-output",
      reason: "test",
      selected_run_id: VERSION.scanner_run_id,
      loaded_at: "2026-08-10T08:29:00.000Z",
      runtime_mode: "INTERNAL_BETA",
      age_seconds: 0,
      source_ids: ["dexscreener"],
      freshness_status: "FRESH",
    },
  };
}
