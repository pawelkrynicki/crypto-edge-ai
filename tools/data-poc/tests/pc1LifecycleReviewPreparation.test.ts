import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { preparePc1LifecycleReview } from "../src/preparePc1LifecycleReview.js";

const roots: string[] = [];

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("PC.1 isolated review preparation", () => {
  it("copies only review-safe active data and never copies a user's private workspace", async () => {
    const root = await isolatedRoot();
    const sourceDataPoc = resolve(root, "repository", "tools", "data-poc");
    const sourceUi = resolve(root, "repository", "tools", "ui-mock");
    const reviewDataPoc = resolve(root, "review", "data-poc");
    const reviewUi = resolve(root, "review", "ui-mock");
    await writeJson(resolve(sourceDataPoc, ".local", "automation", "automation-state.json"), {
      last_published_scanner_run_id: "scan_active",
      last_published_context_run_id: "context_active",
    });
    await writeJson(resolve(sourceDataPoc, "output", "scan_active", "full_output.json"), { active: "scanner" });
    await writeJson(resolve(sourceDataPoc, "output", "context_active", "approved_sources_output.json"), { active: "context" });
    await writeJson(resolve(sourceDataPoc, "output", "scan_historical", "full_output.json"), { historical: true });
    await writeJson(resolve(root, "repository", "config", "established_address_universe_v1.json"), { schema_version: "established_universe_schema_v1" });
    await writeJson(resolve(sourceDataPoc, ".local", "follow-up", "store.json"), { copied: "follow-up" });
    await writeJson(resolve(sourceDataPoc, ".local", "lifecycle", "new-inbox.json"), { copied: "new-inbox" });
    await mkdir(resolve(sourceUi, ".local"), { recursive: true });
    await writeFile(resolve(sourceUi, ".local", "user-workspace.sqlite"), "sqlite", "utf8");

    const result = await preparePc1LifecycleReview({ sourceDataPocDir: sourceDataPoc, sourceUiDir: sourceUi, reviewDataPocDir: reviewDataPoc, reviewUiDir: reviewUi });

    assert.deepEqual(result, { scanner_run_id: "scan_active", context_run_id: "context_active", copied_optional_files: 2 });
    assert.deepEqual(JSON.parse(await readFile(resolve(reviewDataPoc, "output", "scan_active", "full_output.json"), "utf8")), { active: "scanner" });
    assert.deepEqual(JSON.parse(await readFile(resolve(reviewDataPoc, "output", "context_active", "approved_sources_output.json"), "utf8")), { active: "context" });
    await assert.rejects(access(resolve(reviewDataPoc, "output", "scan_historical", "full_output.json")));
    assert.deepEqual(JSON.parse(await readFile(resolve(reviewDataPoc, ".local", "lifecycle", "new-inbox.json"), "utf8")), { copied: "new-inbox" });
    await assert.rejects(access(resolve(reviewUi, "user-workspace.sqlite")));
  });

  it("fails closed when automation state does not point to both active snapshots", async () => {
    const root = await isolatedRoot();
    const sourceDataPoc = resolve(root, "repository", "tools", "data-poc");
    await writeJson(resolve(sourceDataPoc, ".local", "automation", "automation-state.json"), { last_published_scanner_run_id: "scan_active" });
    await assert.rejects(
      preparePc1LifecycleReview({
        sourceDataPocDir: sourceDataPoc,
        sourceUiDir: resolve(root, "repository", "tools", "ui-mock"),
        reviewDataPocDir: resolve(root, "review", "data-poc"),
        reviewUiDir: resolve(root, "review", "ui-mock"),
      }),
      /PC1_REVIEW_ACTIVE_CONTEXT_RUN_REQUIRED/,
    );
  });
});

async function isolatedRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-review-prepare-"));
  roots.push(root);
  return root;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}
