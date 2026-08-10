import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRODUCT_VERSION_HIDDEN_POLL_INTERVAL_MS,
  createProductVersionPoller,
  productVersionsEqual,
  resolveProductVersionPollDelay,
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
