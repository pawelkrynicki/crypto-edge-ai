import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { AtomicPublishError, publishAtomicJson } from "../src/atomicPublish.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("atomic snapshot publish", () => {
  it("publishes only the complete final file and removes temporary files", async () => {
    const root = await tempRoot();
    const output = { run_id: "scan_atomic", complete: true };
    const result = await publishAtomicJson({
      output,
      baseOutputDir: root,
      runId: output.run_id,
      fileName: "full_output.json",
      validate: (value) => assert.equal(value.complete, true),
    });

    assert.deepEqual(JSON.parse(await readFile(result.output_file, "utf8")), output);
    assert.deepEqual(await readdir(result.output_dir), ["full_output.json"]);
  });

  it("does not damage a previous valid snapshot after validation failure", async () => {
    const root = await tempRoot();
    const previous = await publishAtomicJson({
      output: { valid: true },
      baseOutputDir: root,
      runId: "scan_previous",
      fileName: "full_output.json",
      validate: () => undefined,
    });

    await assert.rejects(() => publishAtomicJson({
      output: { valid: false },
      baseOutputDir: root,
      runId: "scan_invalid",
      fileName: "full_output.json",
      validate: () => { throw new Error("SCANNER_SCHEMA_INVALID"); },
    }));

    assert.deepEqual(JSON.parse(await readFile(previous.output_file, "utf8")), { valid: true });
    assert.deepEqual(await readdir(root), ["scan_previous"]);
  });

  it("never overwrites an existing run_id", async () => {
    const root = await tempRoot();
    await publishAtomicJson({
      output: { version: 1 },
      baseOutputDir: root,
      runId: "scan_collision",
      fileName: "full_output.json",
      validate: () => undefined,
    });

    await assert.rejects(
      () => publishAtomicJson({
        output: { version: 2 },
        baseOutputDir: root,
        runId: "scan_collision",
        fileName: "full_output.json",
        validate: () => undefined,
      }),
      (error: unknown) => error instanceof AtomicPublishError && error.code === "RUN_ID_COLLISION",
    );
    assert.deepEqual(JSON.parse(await readFile(resolve(root, "scan_collision", "full_output.json"), "utf8")), { version: 1 });
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-atomic-"));
  roots.push(root);
  return root;
}
