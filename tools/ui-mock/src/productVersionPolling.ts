import type { ProductVersion } from "./productVersion";

export const PRODUCT_VERSION_POLL_INTERVAL_MS = 45_000;
export const PRODUCT_VERSION_POLL_JITTER_MS = 10_000;
export const PRODUCT_VERSION_HIDDEN_POLL_INTERVAL_MS = 120_000;

type VisibilityDocument = Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;
type FocusWindow = Pick<Window, "addEventListener" | "removeEventListener">;

export type ProductVersionPollerOptions = {
  loadVersion: () => Promise<ProductVersion | null>;
  onVersionChanged: (version: ProductVersion) => Promise<void> | void;
  document?: VisibilityDocument;
  window?: FocusWindow;
  random?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

export type ProductVersionPoller = {
  start: () => void;
  stop: () => void;
  checkNow: () => Promise<void>;
  markKnown: (version: ProductVersion | null) => void;
};

export function productVersionsEqual(left: ProductVersion, right: ProductVersion): boolean {
  return left.scanner_run_id === right.scanner_run_id
    && left.scanner_generated_at === right.scanner_generated_at
    && left.context_run_id === right.context_run_id
    && left.context_generated_at === right.context_generated_at
    && left.lifecycle_cycle_id === right.lifecycle_cycle_id
    && left.lifecycle_updated_at === right.lifecycle_updated_at;
}

export function resolveProductVersionPollDelay(hidden: boolean, random: () => number = Math.random): number {
  if (hidden) return PRODUCT_VERSION_HIDDEN_POLL_INTERVAL_MS;
  const jitter = Math.round((Math.min(1, Math.max(0, random())) * 2 - 1) * PRODUCT_VERSION_POLL_JITTER_MS);
  return PRODUCT_VERSION_POLL_INTERVAL_MS + jitter;
}

export function createProductVersionPoller(options: ProductVersionPollerOptions): ProductVersionPoller {
  const document = options.document;
  const window = options.window;
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  const random = options.random ?? Math.random;
  let active = false;
  let known: ProductVersion | null = null;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (!active) return;
    if (timer) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void checkNow();
    }, resolveProductVersionPollDelay(Boolean(document?.hidden), random));
  };

  const checkNow = async (): Promise<void> => {
    if (inFlight) return inFlight;
    const task = (async () => {
      const next = await options.loadVersion();
      if (!next) return;
      const changed = known !== null && !productVersionsEqual(known, next);
      known = next;
      if (changed) await options.onVersionChanged(next);
    })();
    inFlight = task;
    try {
      await task;
    } finally {
      if (inFlight === task) inFlight = null;
      schedule();
    }
  };

  const onFocus = () => {
    if (active && !document?.hidden) void checkNow();
  };
  const onVisibilityChange = () => {
    if (!active) return;
    if (!document?.hidden) void checkNow();
    else schedule();
  };

  return {
    start: () => {
      if (active) return;
      active = true;
      document?.addEventListener("visibilitychange", onVisibilityChange);
      window?.addEventListener("focus", onFocus);
      void checkNow();
    },
    stop: () => {
      if (!active) return;
      active = false;
      if (timer) clearTimer(timer);
      timer = null;
      document?.removeEventListener("visibilitychange", onVisibilityChange);
      window?.removeEventListener("focus", onFocus);
    },
    checkNow,
    markKnown: (version) => { if (version) known = version; },
  };
}
