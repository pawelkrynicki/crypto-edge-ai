import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  DATA_POC_PACKAGE_NAME,
  getDataPocRuntimeRoot,
} from "../src/dataPocRuntimeRoot.js";
import { getDefaultAutomationDirectory } from "../src/automation/automationPaths.js";
import { getDefaultEstablishedUniverseStorePath } from "../src/establishedAddressUniverse.js";
import { getDefaultFollowUpStorePath } from "../src/followUpBasket.js";
import {
  getDefaultLifecycleAuditStorePath,
  getDefaultLifecycleCycleReceiptPath,
  getDefaultLifecycleOperationJournalPath,
  getDefaultNewInboxStorePath,
} from "../src/systemLifecycle.js";

const cleanup: string[] = [];
const root = getDataPocRuntimeRoot();

afterEach(async () => { await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("canonical data-poc runtime store paths", () => {
  it("resolves identical canonical source and compiled roots", () => {
    const sourceRoot = getDataPocRuntimeRoot({}, resolve(root, "src", "systemLifecycle.ts"));
    const compiledRoot = getDataPocRuntimeRoot({}, resolve(root, "dist", "src", "systemLifecycle.js"));
    const sourcePaths = canonicalPaths(sourceRoot);
    const compiledPaths = canonicalPaths(compiledRoot);
    assert.equal(sourceRoot, root);
    assert.equal(compiledRoot, root);
    assert.equal(sourceRoot, compiledRoot);
    assert.deepEqual(sourcePaths, compiledPaths);
    assert.deepEqual(defaultPaths(), compiledPaths);
  });

  it("uses the canonical default layout for lifecycle, Follow-up, and Established stores", () => {
    assert.equal(getDefaultNewInboxStorePath(), resolve(root, ".local", "lifecycle", "new-inbox.json"));
    assert.equal(getDefaultLifecycleAuditStorePath(), resolve(root, ".local", "lifecycle", "audit.json"));
    assert.equal(getDefaultLifecycleOperationJournalPath(), resolve(root, ".local", "lifecycle", "operation-journal.json"));
    assert.equal(getDefaultLifecycleCycleReceiptPath(), resolve(root, ".local", "lifecycle", "cycle-receipts.json"));
    assert.equal(getDefaultFollowUpStorePath(), resolve(root, ".local", "follow-up", "store.json"));
    assert.equal(getDefaultEstablishedUniverseStorePath(), resolve(root, ".local", "established-universe", "store.json"));
    assert.equal(getDefaultAutomationDirectory(), resolve(root, ".local", "automation"));
  });

  it("preserves explicit temporary store overrides", () => {
    const temporary = resolve(tmpdir(), "crypto-edge-runtime-path-override", "store.json");
    assert.equal(getDefaultNewInboxStorePath({ CRYPTO_EDGE_NEW_INBOX_STORE_PATH: temporary }), temporary);
    assert.equal(getDefaultEstablishedUniverseStorePath({ CRYPTO_EDGE_ESTABLISHED_UNIVERSE_STORE_PATH: temporary }), temporary);
    assert.equal(getDefaultFollowUpStorePath({ CRYPTO_EDGE_FOLLOW_UP_STORE_PATH: temporary }), temporary);
  });

  it("uses a valid explicit data-poc root and rejects an invalid one", async () => {
    const temporaryRoot = resolve(tmpdir(), `crypto-edge-data-poc-root-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    cleanup.push(temporaryRoot);
    await mkdir(temporaryRoot, { recursive: true });
    await writeFile(resolve(temporaryRoot, "package.json"), JSON.stringify({ name: DATA_POC_PACKAGE_NAME }), "utf8");
    const env = { CRYPTO_EDGE_DATA_POC_ROOT: temporaryRoot };
    assert.equal(getDataPocRuntimeRoot(env), temporaryRoot);
    assert.equal(getDefaultNewInboxStorePath(env), resolve(temporaryRoot, ".local", "lifecycle", "new-inbox.json"));
    assert.throws(
      () => getDataPocRuntimeRoot({ CRYPTO_EDGE_DATA_POC_ROOT: resolve(temporaryRoot, "missing") }),
      /DATA_POC_RUNTIME_ROOT_INVALID/,
    );
  });

  it("never resolves a default store under dist/.local", () => {
    const defaults = [
      getDefaultNewInboxStorePath(),
      getDefaultLifecycleAuditStorePath(),
      getDefaultLifecycleOperationJournalPath(),
      getDefaultLifecycleCycleReceiptPath(),
      getDefaultFollowUpStorePath(),
      getDefaultEstablishedUniverseStorePath(),
      getDefaultAutomationDirectory(),
    ];
    for (const path of defaults) assert.equal(path.includes(`${sep}dist${sep}.local${sep}`), false);
  });
});

function canonicalPaths(runtimeRoot: string): string[] {
  return [
    resolve(runtimeRoot, ".local", "lifecycle", "new-inbox.json"),
    resolve(runtimeRoot, ".local", "lifecycle", "audit.json"),
    resolve(runtimeRoot, ".local", "lifecycle", "operation-journal.json"),
    resolve(runtimeRoot, ".local", "lifecycle", "cycle-receipts.json"),
    resolve(runtimeRoot, ".local", "follow-up", "store.json"),
    resolve(runtimeRoot, ".local", "established-universe", "store.json"),
  ];
}

function defaultPaths(): string[] {
  return [
    getDefaultNewInboxStorePath(),
    getDefaultLifecycleAuditStorePath(),
    getDefaultLifecycleOperationJournalPath(),
    getDefaultLifecycleCycleReceiptPath(),
    getDefaultFollowUpStorePath(),
    getDefaultEstablishedUniverseStorePath(),
  ];
}
