import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS,
  createProductReviewPublication,
} from "../server/productReviewPublication.js";
import type { ProductVersion } from "../src/productVersion.js";

const VERSION: ProductVersion = {
  scanner_run_id: "scan_review_pointer",
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
    const publication = createProductReviewPublication({
      enabled: true,
      reviewRootPath,
      now: () => new Date("2026-08-10T08:30:00.000Z"),
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
    await publication.publishNext();
    const marker = publication.getMarker();
    assert.ok(marker, "review marker was not persisted");
    assert.equal(elapsedMs, PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS);
    assert.deepEqual(marker, {
      schema_version: "pc1_review_publication_v1",
      review_version_id: "pc1-review-1",
      generated_at: "2026-08-10T08:30:00.000Z",
      lifecycle_updated_at: "2026-08-10T08:30:00.000Z",
      provider_calls: 0,
      openai_calls: 0,
      canonical_mutations: 0,
    });
    assert.deepEqual(await readdir(reviewRootPath), ["pc1-review-publication.json"]);
    assert.deepEqual(JSON.parse(await readFile(resolve(reviewRootPath, "pc1-review-publication.json"), "utf8")), marker);

    const before = publication.decorateVersion(VERSION);
    assert.notEqual(before.scanner_run_id, VERSION.scanner_run_id);
    assert.equal(before.scanner_generated_at, marker.generated_at);
    assert.equal(before.lifecycle_updated_at, marker.lifecycle_updated_at);
    assert.equal(await publication.publishNext(), false, "a second publication is a no-op");
    assert.equal(publication.getMarker()?.review_version_id, "pc1-review-1");
    publication.stop();
  });
});
