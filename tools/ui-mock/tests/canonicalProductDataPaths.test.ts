import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  resolveCanonicalProductDataPaths,
} from "../server/canonicalProductDataPaths.js";
import { DATA_POC_PACKAGE_NAME } from "../../data-poc/src/dataPocRuntimeRoot.js";
import type { DataCycleCanonicalPaths } from "../../data-poc/src/automation/dataCycleOperations.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("canonical product data paths", () => {
  it("keeps RC8 persistent automation state independent from the data-poc output root", async () => {
    const root = await createRuntimeRoot();
    const dataPocRoot = resolve(root, "releases", "CAMP2026-VPS-RC8", "tools", "data-poc");
    const automationStatePath = resolve(root, "state", "automation", "automation-state.json");
    const scannerSnapshot = resolve(dataPocRoot, "output", "scan_test", "full_output.json");
    const contextSnapshot = resolve(dataPocRoot, "output", "context_test", "approved_sources_output.json");
    await mkdir(dataPocRoot, { recursive: true });
    await writeFile(resolve(dataPocRoot, "package.json"), JSON.stringify({ name: DATA_POC_PACKAGE_NAME }), "utf8");

    await withDataPocRoot(dataPocRoot, async () => {
      const canonical = await resolveCanonicalProductDataPaths(() => Promise.resolve({
        ...fixtureCanonicalPaths(automationStatePath),
        scanner_snapshot: scannerSnapshot,
        context_snapshot: contextSnapshot,
      }));

      assert.deepEqual(canonical, {
        automationStatePath,
        outputDirPath: resolve(dataPocRoot, "output"),
        scannerRunId: "scan_test",
        contextRunId: "context_test",
      });
    });
  });

  it("preserves the legacy default automation layout", async () => {
    const root = await createRuntimeRoot();
    const dataPocRoot = resolve(root, "data-poc");
    const automationStatePath = resolve(dataPocRoot, ".local", "automation", "automation-state.json");
    await mkdir(dataPocRoot, { recursive: true });
    await writeFile(resolve(dataPocRoot, "package.json"), JSON.stringify({ name: DATA_POC_PACKAGE_NAME }), "utf8");

    await withDataPocRoot(dataPocRoot, async () => {
      const canonical = await resolveCanonicalProductDataPaths(() => Promise.resolve({
        ...fixtureCanonicalPaths(automationStatePath),
        scanner_snapshot: resolve(dataPocRoot, "output", "scan_legacy", "full_output.json"),
        context_snapshot: resolve(dataPocRoot, "output", "context_legacy", "approved_sources_output.json"),
      }));

      assert.equal(canonical.automationStatePath, automationStatePath);
      assert.equal(canonical.outputDirPath, resolve(dataPocRoot, "output"));
      assert.equal(canonical.scannerRunId, "scan_legacy");
      assert.equal(canonical.contextRunId, "context_legacy");
    });
  });
});

async function createRuntimeRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-canonical-product-paths-"));
  temporaryRoots.push(root);
  return root;
}

function fixtureCanonicalPaths(automationStatePath: string): DataCycleCanonicalPaths {
  return {
    repo_root: resolve(automationStatePath, "..", "..", ".."),
    automation_state: automationStatePath,
    follow_up_store: resolve(automationStatePath, "..", "follow-up.json"),
    follow_up_backup: resolve(automationStatePath, "..", "follow-up.json.bak"),
    scanner_snapshot: null,
    context_snapshot: null,
    established_universe: resolve(automationStatePath, "..", "established.json"),
    run_once_receipt: resolve(automationStatePath, "..", "last-run-once.json"),
    backups_directory: resolve(automationStatePath, "..", "backups"),
  };
}

async function withDataPocRoot<T>(dataPocRoot: string, callback: () => Promise<T>): Promise<T> {
  const previous = process.env.CRYPTO_EDGE_DATA_POC_ROOT;
  process.env.CRYPTO_EDGE_DATA_POC_ROOT = dataPocRoot;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.CRYPTO_EDGE_DATA_POC_ROOT;
    else process.env.CRYPTO_EDGE_DATA_POC_ROOT = previous;
  }
}
