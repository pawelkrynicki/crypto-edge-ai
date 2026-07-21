import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";

const ADDRESS = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("established universe owner CLI", () => {
  it("prints a dry-run plan and changes nothing without --apply", async () => {
    const storePath = await newStorePath();
    const result = await runCli(storePath, ["add", "--chain", "base", "--contract", ADDRESS]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /DRY-RUN: add/);
    assert.match(result.stdout, /No files, providers, snapshots, collector state, Cloudflare, VPS or Task Scheduler were changed/);
    await assert.rejects(stat(storePath), (error: unknown) => isErrorCode(error, "ENOENT"));
  });

  it("applies explicitly, returns JSON for automation and lists the normalized entry", async () => {
    const storePath = await newStorePath();
    const applied = await runCli(storePath, [
      "add", "--chain", "BASE", "--contract", ADDRESS, "--display-name", "Project", "--apply", "--json",
    ]);
    assert.equal(applied.code, 0, applied.stderr);
    const body = JSON.parse(applied.stdout) as Record<string, unknown>;
    assert.equal(body.applied, true);
    assert.equal(body.to_version, "established-universe-v000001");

    const listed = await runCli(storePath, ["list", "--json"]);
    assert.equal(listed.code, 0, listed.stderr);
    const listBody = JSON.parse(listed.stdout) as { entries: Array<Record<string, unknown>> };
    assert.equal(listBody.entries.length, 1);
    assert.equal(listBody.entries[0].chain, "base");
    assert.equal(listBody.entries[0].contract_address, ADDRESS.toLowerCase());
  });

  it("rejects unknown parameters instead of ignoring them", async () => {
    const storePath = await newStorePath();
    const result = await runCli(storePath, ["list", "--secret", "value"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /UNKNOWN_ARGUMENT:--secret/);
  });
});

async function newStorePath(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-universe-cli-"));
  roots.push(root);
  return resolve(root, "universe", "store.json");
}

function runCli(storePath: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const runner = resolve(import.meta.dirname, "..", "src", "runEstablishedUniverse.js");
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [runner, ...args], {
      env: {
        ...process.env,
        CRYPTO_EDGE_ESTABLISHED_UNIVERSE_STORE_PATH: storePath,
        CRYPTO_EDGE_UNIVERSE_OWNER_ID: "test-owner",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", rejectRun);
    child.once("exit", (code) => resolveRun({
      code,
      stdout: Buffer.concat(stdout).toString("utf8").trim(),
      stderr: Buffer.concat(stderr).toString("utf8").trim(),
    }));
  });
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
