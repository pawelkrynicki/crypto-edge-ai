import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  acquireGlobalCollectorLock,
  COLLECTOR_LOCK_SCHEMA_VERSION,
  CollectorLockError,
} from "../src/automation/globalCollectorLock.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("global collector lock", () => {
  it("enforces one winner across five separate Node processes", async () => {
    const directoryPath = await tempDirectory();
    const workerPath = resolve(import.meta.dirname, "fixtures", "automationLockWorker.js");
    const startAt = Date.now() + 1_000;
    const results = await Promise.all(Array.from({ length: 5 }, (_, index) => runWorker(
      workerPath,
      directoryPath,
      `run_process_${index + 1}`,
      startAt,
    )));
    const successes = results.filter((result) => result.status === "SUCCESS");
    const blocked = results.filter((result) => result.status === "RUN_ALREADY_IN_PROGRESS");
    assert.equal(successes.length, 1);
    assert.equal(blocked.length, 4);
    assert.deepEqual(
      new Set(blocked.map((result) => result.active_run_id)),
      new Set([successes[0].run_id]),
    );
  });

  it("creates atomically, blocks an active run and returns its run_id", async () => {
    const directoryPath = await tempDirectory();
    const first = await acquireGlobalCollectorLock("run_active", { directoryPath });
    assert.equal(first.status, "ACQUIRED");
    const second = await acquireGlobalCollectorLock("run_second", { directoryPath });
    assert.equal(second.status, "RUN_ALREADY_IN_PROGRESS");
    if (second.status === "RUN_ALREADY_IN_PROGRESS") assert.equal(second.active_run_id, "run_active");
    if (first.status === "ACQUIRED") await first.release();
  });

  it("heartbeats extend the expiry and controlled release allows the next run", async () => {
    const directoryPath = await tempDirectory();
    let currentMs = Date.parse("2026-07-21T10:00:00.000Z");
    const now = () => new Date(currentMs);
    const first = await acquireGlobalCollectorLock("run_heartbeat", { directoryPath, ttlMs: 1_000, now });
    assert.equal(first.status, "ACQUIRED");
    if (first.status !== "ACQUIRED") return;
    currentMs += 700;
    const heartbeat = await first.heartbeat();
    assert.equal(heartbeat.heartbeat_at, "2026-07-21T10:00:00.700Z");
    assert.equal(heartbeat.expires_at, "2026-07-21T10:00:01.700Z");
    await first.release();
    const second = await acquireGlobalCollectorLock("run_after_release", { directoryPath, now });
    assert.equal(second.status, "ACQUIRED");
    if (second.status === "ACQUIRED") await second.release();
  });

  it("never steals an expired lock from a living process", async () => {
    const directoryPath = await tempDirectory();
    await writeLock(directoryPath, {
      runId: "run_alive_expired",
      pid: process.pid,
      expiresAt: "2026-07-21T09:59:00.000Z",
    });
    const result = await acquireGlobalCollectorLock("run_candidate", {
      directoryPath,
      now: () => new Date("2026-07-21T10:00:00.000Z"),
      isProcessAlive: (pid) => pid === process.pid,
    });
    assert.equal(result.status, "RUN_ALREADY_IN_PROGRESS");
    if (result.status === "RUN_ALREADY_IN_PROGRESS") assert.equal(result.active_run_id, "run_alive_expired");
  });

  it("recovers only a dead and expired stale lock", async () => {
    const directoryPath = await tempDirectory();
    await writeLock(directoryPath, {
      runId: "run_dead_expired",
      pid: 999_999,
      expiresAt: "2026-07-21T09:59:00.000Z",
    });
    const result = await acquireGlobalCollectorLock("run_recovered", {
      directoryPath,
      now: () => new Date("2026-07-21T10:00:00.000Z"),
      isProcessAlive: () => false,
    });
    assert.equal(result.status, "ACQUIRED");
    if (result.status === "ACQUIRED") await result.release();
  });

  it("fails closed for unreadable or invalid lock state and lock-directory failures", async () => {
    const directoryPath = await tempDirectory();
    await mkdir(directoryPath, { recursive: true });
    await writeFile(resolve(directoryPath, "collector.lock.json"), "{invalid", "utf8");
    await assert.rejects(
      acquireGlobalCollectorLock("run_invalid", { directoryPath }),
      (error: unknown) => error instanceof CollectorLockError && error.code === "COLLECTOR_LOCK_READ_FAILED",
    );

    const fileInsteadOfDirectory = resolve(await tempDirectory(), "not-a-directory");
    await mkdir(resolve(fileInsteadOfDirectory, ".."), { recursive: true });
    await writeFile(fileInsteadOfDirectory, "blocked", "utf8");
    await assert.rejects(
      acquireGlobalCollectorLock("run_directory_error", { directoryPath: fileInsteadOfDirectory }),
      (error: unknown) => error instanceof CollectorLockError && error.code === "COLLECTOR_LOCK_DIRECTORY_UNAVAILABLE",
    );
  });
});

async function tempDirectory(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-automation-lock-"));
  tempRoots.push(root);
  return resolve(root, "automation");
}

async function writeLock(
  directoryPath: string,
  options: { runId: string; pid: number; expiresAt: string },
): Promise<void> {
  await mkdir(directoryPath, { recursive: true });
  await writeFile(resolve(directoryPath, "collector.lock.json"), `${JSON.stringify({
    schema_version: COLLECTOR_LOCK_SCHEMA_VERSION,
    run_id: options.runId,
    pid: options.pid,
    started_at: "2026-07-21T09:00:00.000Z",
    heartbeat_at: "2026-07-21T09:30:00.000Z",
    expires_at: options.expiresAt,
  })}\n`, "utf8");
}

function runWorker(
  workerPath: string,
  directoryPath: string,
  runId: string,
  startAt: number,
): Promise<{ status: string; run_id?: string; active_run_id?: string }> {
  return new Promise((resolveWorker, rejectWorker) => {
    const child = spawn(process.execPath, [workerPath, directoryPath, runId, String(startAt)], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", rejectWorker);
    child.once("exit", (code) => {
      if (code !== 0) {
        rejectWorker(new Error(`worker exited ${code}: ${Buffer.concat(stderr).toString("utf8")}`));
        return;
      }
      try {
        resolveWorker(JSON.parse(Buffer.concat(stdout).toString("utf8")) as {
          status: string;
          run_id?: string;
          active_run_id?: string;
        });
      } catch (error) {
        rejectWorker(error);
      }
    });
  });
}
