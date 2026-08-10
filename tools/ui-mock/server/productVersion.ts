import { resolve } from "node:path";
import {
  createAutomationStateStore,
  type AutomationState,
} from "../../data-poc/src/automation/automationState.js";
import { getDefaultAutomationDirectory } from "../../data-poc/src/automation/automationPaths.js";
import {
  readPublishedSnapshotTimes,
} from "../../data-poc/src/automation/publishedSnapshotTimes.js";
import {
  getDefaultLifecycleCycleReceiptPath,
  readLatestLifecycleCycleReceipt,
  type LifecycleCycleReceipt,
} from "../../data-poc/src/systemLifecycle.js";
import type { ProductVersion } from "../src/productVersion.js";

/** A deliberately small, read-only pointer used by the product refresh poller. */
export type { ProductVersion };

type ProductVersionState = Pick<AutomationState,
  "last_published_scanner_run_id" | "last_published_context_run_id">;
type PublishedTimes = { scanner_published_at: string | null; context_published_at: string | null };

export type ProductVersionOptions = {
  automationStatePath?: string;
  outputDirectoryPath?: string;
  lifecycleReceiptPath?: string;
  readAutomationState?: () => Promise<ProductVersionState>;
  readPublishedSnapshotTimes?: (
    state: ProductVersionState,
    outputDirectoryPath: string,
  ) => Promise<PublishedTimes>;
  readLifecycleReceipt?: () => Promise<Pick<LifecycleCycleReceipt, "central_cycle_id" | "finished_at"> | null>;
};

export async function readProductVersion(options: ProductVersionOptions = {}): Promise<ProductVersion> {
  const automationDirectory = options.automationStatePath
    ? resolve(options.automationStatePath, "..")
    : getDefaultAutomationDirectory();
  const statePath = options.automationStatePath ?? resolve(automationDirectory, "automation-state.json");
  const outputDirectoryPath = options.outputDirectoryPath ?? resolve(automationDirectory, "..", "..", "output");
  const readState = options.readAutomationState
    ?? (() => createAutomationStateStore(resolve(statePath, "..")).read());
  const readTimes = options.readPublishedSnapshotTimes
    ?? ((state, outputDirectory) => readPublishedSnapshotTimes(state as AutomationState, outputDirectory));
  const readReceipt = options.readLifecycleReceipt
    ?? (() => readLatestLifecycleCycleReceipt(options.lifecycleReceiptPath ?? getDefaultLifecycleCycleReceiptPath()));

  const [state, receipt] = await Promise.all([readState(), readReceipt()]);
  const times = await readTimes(state, outputDirectoryPath);

  return {
    scanner_run_id: state.last_published_scanner_run_id,
    scanner_generated_at: times.scanner_published_at ?? null,
    context_run_id: state.last_published_context_run_id,
    context_generated_at: times.context_published_at ?? null,
    lifecycle_cycle_id: receipt?.central_cycle_id ?? null,
    lifecycle_updated_at: receipt?.finished_at ?? null,
  };
}
