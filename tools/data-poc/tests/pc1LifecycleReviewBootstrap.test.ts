import assert from "node:assert/strict";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { bootstrapPc1LifecycleReview, readReviewSnapshot } from "../src/bootstrapPc1LifecycleReview.js";

const roots: string[] = [];
const DATA_POC_ROOT = resolve(import.meta.dirname, "..", "..");
const AUTOMATION_STATE_PATH = resolve(DATA_POC_ROOT, ".local", "automation", "automation-state.json");

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("PC.1 isolated review bootstrap", () => {
  it("reports safe, distinct diagnostics for every unavailable active snapshot state", async () => {
    const reviewRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-review-diagnostics-"));
    roots.push(reviewRoot);
    const scannerRunId = "scan_active";
    const automationStatePath = resolve(reviewRoot, "automation-state.json");
    const outputRoot = resolve(reviewRoot, "output");
    const snapshotPath = resolve(outputRoot, scannerRunId, "full_output.json");
    await writeJson(automationStatePath, { last_published_scanner_run_id: scannerRunId });

    await assert.rejects(readReviewSnapshot(outputRoot, automationStatePath), /PC1_REVIEW_SCANNER_FILE_MISSING/);
    await mkdir(resolve(snapshotPath, ".."), { recursive: true });
    await writeFile(snapshotPath, "{", "utf8");
    await assert.rejects(readReviewSnapshot(outputRoot, automationStatePath), /PC1_REVIEW_SCANNER_JSON_INVALID/);
    await writeJson(snapshotPath, {});
    await assert.rejects(readReviewSnapshot(outputRoot, automationStatePath), /PC1_REVIEW_SCANNER_SCHEMA_INVALID/);
    await writeJson(snapshotPath, { scan_run: { run_id: "scan_other" }, provenance: { run_id: "scan_other" } });
    await assert.rejects(readReviewSnapshot(outputRoot, automationStatePath), /PC1_REVIEW_SCANNER_RUN_ID_MISMATCH/);
    await writeJson(snapshotPath, { scan_run: { run_id: scannerRunId }, provenance: { run_id: scannerRunId } });
    await assert.rejects(readReviewSnapshot(outputRoot, automationStatePath), /PC1_REVIEW_SCANNER_NOT_DISPLAY_ELIGIBLE/);
  });

  it("accepts the automation-selected active Product Radar snapshot without copying historical output", async (t) => {
    const scannerRunId = await activeScannerRunId(t);
    if (!scannerRunId) return;

    const sourceSnapshot = resolve(DATA_POC_ROOT, "output", scannerRunId, "full_output.json");
    try {
      await access(sourceSnapshot);
    } catch {
      t.skip("active scanner snapshot is unavailable in this checkout");
      return;
    }

    const reviewRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-review-bootstrap-"));
    roots.push(reviewRoot);
    const reviewOutputRoot = resolve(reviewRoot, "output");
    const reviewSnapshot = resolve(reviewOutputRoot, scannerRunId, "full_output.json");
    await mkdir(resolve(reviewSnapshot, ".."), { recursive: true });
    await copyFile(sourceSnapshot, reviewSnapshot);

    const result = await bootstrapPc1LifecycleReview({
      outputRoot: reviewOutputRoot,
      automationStatePath: AUTOMATION_STATE_PATH,
      newInboxStorePath: resolve(reviewRoot, "lifecycle", "new-inbox.json"),
      cycleReceiptPath: resolve(reviewRoot, "lifecycle", "cycle-receipts.json"),
      followUpStorePath: resolve(reviewRoot, "follow-up", "store.json"),
      establishedStorePath: resolve(reviewRoot, "established", "store.json"),
    });

    assert.equal(result.scanner_run_id, scannerRunId);
    assert.equal(result.provider_calls, 0);
    assert.equal(result.canonical_mutations, 0);
    await assert.rejects(access(resolve(reviewOutputRoot, "historical", "full_output.json")));
  });
});

async function activeScannerRunId(t: { skip: (message?: string) => void }): Promise<string | null> {
  let state: unknown;
  try {
    state = JSON.parse(await readFile(AUTOMATION_STATE_PATH, "utf8"));
  } catch {
    t.skip("automation state is unavailable in this checkout");
    return null;
  }
  const runId = isRecord(state) ? state.last_published_scanner_run_id : null;
  if (typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
    t.skip("automation state has no active scanner run");
    return null;
  }
  return runId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}
