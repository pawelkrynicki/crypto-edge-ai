import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS,
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
  it("publishes exactly once in REVIEW_ROOT after the configured delay without provider, OpenAI, or canonical writes", async () => {
    const reviewRootPath = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-review-publication-"));
    let elapsedMs = 0;
    let timer: { callback: () => void; delay: number } | null = null;
    const automationStatePath = resolve(reviewRootPath, ".local", "automation", "automation-state.json");
    await mkdir(resolve(automationStatePath, ".."), { recursive: true });
    await writeFile(automationStatePath, `${JSON.stringify({ last_published_scanner_run_id: VERSION.scanner_run_id })}\n`, "utf8");
    const publication = createProductReviewPublication({
      enabled: true,
      reviewRootPath,
      now: () => new Date("2026-08-10T08:30:00.000Z"),
      loadBaseScanner: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
      loadBaseSnapshot: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
      loadBaseVersion: async () => VERSION,
      validateSnapshot: () => undefined,
      setTimer: (callback, delay) => {
        timer = { callback, delay };
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => undefined,
    });

    assert.equal(publication.autoPublicationDelayMs, PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS);
    assert.ok(timer, "review publication must schedule one timer");
    assert.equal(timer.delay, PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS);
    elapsedMs += PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS - 1;
    assert.equal(publication.getMarker(), null, "no marker exists before the 60 second delay");

    elapsedMs += 1;
    timer.callback();
    assert.equal(await publication.publishNext(), true);
    const marker = publication.getMarker();
    assert.ok(marker, "review marker was not persisted");
    assert.equal(elapsedMs, PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS);
    assert.equal(
      JSON.parse(await readFile(automationStatePath, "utf8")).last_published_scanner_run_id,
      `${VERSION.scanner_run_id}-review-1`,
      "the isolated automation pointer advances only for the validated V2",
    );
    assert.deepEqual(marker, {
      schema_version: "pc1_review_publication_v1",
      review_version_id: "pc1-review-1",
      generated_at: "2026-08-10T08:30:00.000Z",
      lifecycle_updated_at: "2026-08-04T04:39:01.000Z",
      version: {
        ...VERSION,
        scanner_run_id: `${VERSION.scanner_run_id}-review-1`,
        scanner_generated_at: "2026-08-10T08:30:00.000Z",
      },
      provider_calls: 0,
      openai_calls: 0,
      canonical_mutations: 0,
    });
    assert.deepEqual(JSON.parse(await readFile(resolve(reviewRootPath, "pc1-review-publication.json"), "utf8")), marker);
    const snapshotPath = resolve(reviewRootPath, "output", `${VERSION.scanner_run_id}-review-1`, "full_output.json");
    await access(snapshotPath);
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as ScannerOutputWithMeta;
    assert.equal(snapshot.scan_run.run_id, `${VERSION.scanner_run_id}-review-1`);
    assert.equal(snapshot.candidates.every((candidate) => candidate.run_id === snapshot.scan_run.run_id), true);

    const after = publication.decorateVersion(VERSION);
    assert.equal(after.scanner_run_id, `${VERSION.scanner_run_id}-review-1`);
    assert.equal(after.scanner_generated_at, marker.generated_at);
    assert.equal(after.lifecycle_updated_at, VERSION.lifecycle_updated_at);
    assert.equal(publication.decorateScanner(structuredClone(PERSISTABLE_SCANNER_SAMPLE)).scan_run.run_id, after.scanner_run_id);
    assert.equal(await publication.publishNext(), false, "a second publication is a no-op");
    assert.equal(publication.getMarker()?.review_version_id, "pc1-review-1");
    publication.stop();
  });

  it("does not publish V2 when canonical validation fails", async () => {
    const reviewRootPath = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-review-invalid-"));
    const publication = createProductReviewPublication({
      enabled: true,
      reviewRootPath,
      loadBaseScanner: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
      loadBaseSnapshot: async () => structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerOutputWithMeta,
      loadBaseVersion: async () => VERSION,
      validateSnapshot: () => { throw new Error("SCANNER_DISPLAY_VALIDATION_FAILED"); },
    });
    try {
      assert.equal(await publication.publishNext(), false);
      assert.equal(publication.getMarker(), null);
      assert.deepEqual(publication.decorateVersion(VERSION), VERSION);
      await assert.rejects(access(resolve(reviewRootPath, "output", `${VERSION.scanner_run_id}-review-1`, "full_output.json")));
    } finally {
      publication.stop();
    }
  });
});
