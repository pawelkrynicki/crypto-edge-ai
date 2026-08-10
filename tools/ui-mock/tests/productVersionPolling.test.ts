import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRODUCT_VERSION_HIDDEN_POLL_INTERVAL_MS,
  PRODUCT_VERSION_RETRY_DELAY_MS,
  createProductVersionPoller,
  productVersionsEqual,
  resolveProductVersionPollDelay,
  type ProductVersionPollingDiagnostics,
} from "../src/productVersionPolling.js";
import type { ProductVersion } from "../src/productVersion.js";

const VERSION_A: ProductVersion = {
  scanner_run_id: "scan_a",
  scanner_generated_at: "2026-08-10T10:00:00.000Z",
  context_run_id: "context_a",
  context_generated_at: "2026-08-10T10:00:00.000Z",
  lifecycle_cycle_id: "cycle_a",
  lifecycle_updated_at: "2026-08-10T10:00:01.000Z",
};

describe("product version polling", () => {
  it("does no full refresh across 100 unchanged pointer checks", async () => {
    let pointerReads = 0;
    let fullRefreshes = 0;
    const poller = createProductVersionPoller({
      loadVersion: async () => { pointerReads += 1; return VERSION_A; },
      onVersionChanged: async () => { fullRefreshes += 1; },
    });

    for (let index = 0; index < 100; index += 1) await poller.checkNow();

    assert.equal(pointerReads, 100);
    assert.equal(fullRefreshes, 0);
  });

  it("refreshes exactly once for a new published version and does not overlap checks", async () => {
    let current = VERSION_A;
    let pointerReads = 0;
    let fullRefreshes = 0;
    let resolveFirstRead: (() => void) | undefined;
    const firstRead = new Promise<void>((resolve) => { resolveFirstRead = resolve; });
    const poller = createProductVersionPoller({
      loadVersion: async () => {
        pointerReads += 1;
        if (pointerReads === 1) await firstRead;
        return current;
      },
      onVersionChanged: async () => { fullRefreshes += 1; },
    });

    const baseline = poller.checkNow();
    const overlapping = poller.checkNow();
    assert.equal(pointerReads, 1, "only one pointer request may be in flight");
    resolveFirstRead?.();
    await Promise.all([baseline, overlapping]);
    poller.markCommitted(VERSION_A);

    current = { ...VERSION_A, scanner_run_id: "scan_b", scanner_generated_at: "2026-08-10T10:05:00.000Z" };
    await poller.checkNow();
    await poller.checkNow();

    assert.equal(fullRefreshes, 1);
    assert.equal(pointerReads, 3);
  });

  it("detects one review publication and treats a second poll of its marker as NO_ACTION", async () => {
    let current = VERSION_A;
    let fullRefreshes = 0;
    const poller = createProductVersionPoller({
      loadVersion: async () => current,
      onVersionChanged: async () => { fullRefreshes += 1; },
    });

    await poller.checkNow();
    poller.markCommitted(VERSION_A);
    current = {
      ...VERSION_A,
      scanner_run_id: "scan_a-review-1",
      scanner_generated_at: "2026-08-10T10:01:00.000Z",
      lifecycle_updated_at: "2026-08-10T10:01:00.000Z",
    };
    await poller.checkNow();
    await poller.checkNow();

    assert.equal(fullRefreshes, 1, "the review marker produces one bounded full read refresh");
  });

  it("reports the review-safe poll, refresh, and commit diagnostic timeline", async () => {
    let current = VERSION_A;
    let clock = Date.parse("2026-08-10T10:00:00.000Z");
    const diagnostics: ProductVersionPollingDiagnostics[] = [];
    const poller = createProductVersionPoller({
      loadVersion: async () => current,
      onVersionChanged: async () => true,
      now: () => clock,
      onDiagnosticsChange: (next) => diagnostics.push(next),
    });

    await poller.checkNow();
    poller.markCommitted(VERSION_A);
    current = { ...VERSION_A, scanner_run_id: "scan_a-review-1", scanner_generated_at: "2026-08-10T10:01:00.000Z" };
    clock = Date.parse("2026-08-10T10:01:00.000Z");
    await poller.checkNow();

    assert.deepEqual(poller.getDiagnostics(), {
      last_poll_at: "2026-08-10T10:01:00.000Z",
      last_seen_version: current,
      last_attempted_version: current,
      last_committed_version: current,
      last_refresh_result: "PASS",
    });
    assert.equal(diagnostics.some((entry) => entry.last_refresh_result === "REFRESHING"), true);
    assert.equal(diagnostics.at(-1)?.last_refresh_result, "PASS");
  });

  it("keeps the committed V1 after an invalid V2 and retries it only after the bounded delay", async () => {
    let current = VERSION_A;
    let clock = 0;
    let attempts = 0;
    const poller = createProductVersionPoller({
      loadVersion: async () => current,
      onVersionChanged: async () => {
        attempts += 1;
        return attempts === 2;
      },
      now: () => clock,
    });

    await poller.checkNow();
    poller.markCommitted(VERSION_A);
    current = { ...VERSION_A, scanner_run_id: "scan_v2", scanner_generated_at: "2026-08-10T10:05:00.000Z" };
    await poller.checkNow();
    assert.equal(attempts, 1);
    assert.deepEqual(poller.getVersionState(), {
      last_seen_version: current,
      last_attempted_version: current,
      last_committed_version: VERSION_A,
    });

    clock = PRODUCT_VERSION_RETRY_DELAY_MS - 1;
    await poller.checkNow();
    assert.equal(attempts, 1, "the same failed V2 cannot cause a full refresh on every poll");

    clock = PRODUCT_VERSION_RETRY_DELAY_MS;
    await poller.checkNow();
    assert.equal(attempts, 2);
    assert.deepEqual(poller.getVersionState().last_committed_version, current);
    await poller.checkNow();
    assert.equal(attempts, 2, "a committed V2 becomes the new no-action baseline");
  });

  it("keeps V2 rendered when V3 is invalid, then commits V4 without an empty state", async () => {
    const v2 = { ...VERSION_A, scanner_run_id: "scan-review-1", scanner_generated_at: "2026-08-10T10:01:00.000Z" };
    const v3 = { ...VERSION_A, scanner_run_id: "scan-review-2", scanner_generated_at: "2026-08-10T10:02:00.000Z" };
    const v4 = { ...VERSION_A, scanner_run_id: "scan-review-3", scanner_generated_at: "2026-08-10T10:03:00.000Z" };
    let current = VERSION_A;
    const committed: string[] = [];
    const poller = createProductVersionPoller({
      loadVersion: async () => current,
      onVersionChanged: async (version) => {
        committed.push(version.scanner_run_id!);
        return version.scanner_run_id !== v3.scanner_run_id;
      },
    });

    await poller.checkNow();
    poller.markCommitted(VERSION_A);
    current = v2;
    await poller.checkNow();
    assert.equal(poller.getVersionState().last_committed_version?.scanner_run_id, v2.scanner_run_id);

    current = v3;
    await poller.checkNow();
    assert.equal(poller.getVersionState().last_committed_version?.scanner_run_id, v2.scanner_run_id, "invalid V3 preserves V2");

    current = v4;
    await poller.checkNow();
    assert.equal(poller.getVersionState().last_committed_version?.scanner_run_id, v4.scanner_run_id);
    assert.deepEqual(committed, [v2.scanner_run_id, v3.scanner_run_id, v4.scanner_run_id]);
  });

  it("retries a temporarily unavailable V3 and preserves V2 until V3 then V4 commit", async () => {
    const v2 = { ...VERSION_A, scanner_run_id: "scan-review-1", scanner_generated_at: "2026-08-10T10:01:00.000Z" };
    const v3 = { ...VERSION_A, scanner_run_id: "scan-review-2", scanner_generated_at: "2026-08-10T10:02:00.000Z" };
    const v4 = { ...VERSION_A, scanner_run_id: "scan-review-3", scanner_generated_at: "2026-08-10T10:03:00.000Z" };
    let current = VERSION_A;
    let clock = 0;
    const rendered: string[] = [VERSION_A.scanner_run_id!];
    let v3Attempts = 0;
    const poller = createProductVersionPoller({
      loadVersion: async () => current,
      onVersionChanged: async (version) => {
        if (version.scanner_run_id === v3.scanner_run_id && v3Attempts++ === 0) return false;
        rendered.push(version.scanner_run_id!);
        return true;
      },
      now: () => clock,
    });

    await poller.checkNow();
    poller.markCommitted(VERSION_A);
    current = v2;
    clock += 1;
    await poller.checkNow();
    assert.deepEqual(rendered, [VERSION_A.scanner_run_id, v2.scanner_run_id]);

    current = v3;
    clock += 1;
    await poller.checkNow();
    assert.equal(poller.getVersionState().last_committed_version?.scanner_run_id, v2.scanner_run_id);
    assert.equal(poller.getDiagnostics().last_refresh_result, "FAILED");
    assert.deepEqual(rendered, [VERSION_A.scanner_run_id, v2.scanner_run_id], "the temporary V3 failure keeps V2 rendered");

    clock += PRODUCT_VERSION_RETRY_DELAY_MS;
    await poller.checkNow();
    assert.equal(poller.getVersionState().last_committed_version?.scanner_run_id, v3.scanner_run_id);

    current = v4;
    clock += 1;
    await poller.checkNow();
    assert.deepEqual(rendered, [VERSION_A.scanner_run_id, v2.scanner_run_id, v3.scanner_run_id, v4.scanner_run_id]);
    assert.equal(poller.getDiagnostics().last_refresh_result, "PASS");
  });

  it("uses jitter while visible, slows down hidden tabs, and checks immediately after focus", async () => {
    assert.equal(resolveProductVersionPollDelay(false, () => 0), 35_000);
    assert.equal(resolveProductVersionPollDelay(false, () => 1), 55_000);
    assert.equal(resolveProductVersionPollDelay(true, () => 0.5), PRODUCT_VERSION_HIDDEN_POLL_INTERVAL_MS);

    let pointerReads = 0;
    let focusHandler: (() => void) | undefined;
    const document = {
      hidden: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as Document;
    const window = {
      addEventListener: (name: string, handler: () => void) => { if (name === "focus") focusHandler = handler; },
      removeEventListener: () => undefined,
    } as unknown as Window;
    const timers: number[] = [];
    const poller = createProductVersionPoller({
      loadVersion: async () => { pointerReads += 1; return VERSION_A; },
      onVersionChanged: () => undefined,
      document,
      window,
      random: () => 0.5,
      setTimer: (_callback, delay) => { timers.push(delay); return 1 as unknown as ReturnType<typeof setTimeout>; },
      clearTimer: () => undefined,
    });
    poller.start();
    await flush();
    focusHandler?.();
    await flush();
    poller.stop();

    assert.equal(pointerReads, 2, "focus performs an immediate lightweight check");
    assert.deepEqual(timers, [45_000, 45_000]);
  });

  it("compares all six product version pointers", () => {
    assert.equal(productVersionsEqual(VERSION_A, { ...VERSION_A }), true);
    assert.equal(productVersionsEqual(VERSION_A, { ...VERSION_A, lifecycle_updated_at: "2026-08-10T10:01:00.000Z" }), false);
  });
});

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
