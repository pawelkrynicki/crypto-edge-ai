import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { bootstrapLifecycleReview } from "./systemLifecycle.js";
import { validatePersistableScannerOutput } from "./storageValidator.js";
import type { PersistableScannerOutput } from "./persistableScannerModel.js";

type AutomationState = { last_published_scanner_run_id?: string | null };

async function main(): Promise<void> {
  const outputRoot = requiredPath("CRYPTO_EDGE_REVIEW_OUTPUT_DIR");
  const automationStatePath = requiredPath("CRYPTO_EDGE_AUTOMATION_DIRECTORY_PATH", "automation-state.json");
  const snapshot = await readReviewSnapshot(outputRoot, automationStatePath);
  const observedAt = snapshot.provenance?.generated_at ?? snapshot.scan_run.finished_at;
  const result = await bootstrapLifecycleReview(snapshot, {
    newInboxStorePath: requiredPath("CRYPTO_EDGE_NEW_INBOX_STORE_PATH"),
    cycleReceiptPath: requiredPath("CRYPTO_EDGE_LIFECYCLE_CYCLE_RECEIPT_PATH"),
    followUpStorePath: requiredPath("CRYPTO_EDGE_FOLLOW_UP_STORE_PATH"),
    establishedStorePath: requiredPath("CRYPTO_EDGE_ESTABLISHED_UNIVERSE_STORE_PATH"),
    now: new Date(observedAt),
  });
  console.log(JSON.stringify({
    schema_version: "pc1_lifecycle_review_bootstrap_v1",
    scanner_run_id: snapshot.scan_run.run_id,
    snapshot_timestamp: observedAt,
    new_inbox_records: result.new_inbox_records,
    follow_up_records: result.follow_up_records,
    main_radar_records: result.main_radar_records,
    canonical_mutations: result.canonical_mutations,
    provider_calls: result.provider_calls,
  }));
  console.log(`New Inbox records in review: ${result.new_inbox_records}`);
  console.log(`Follow-up records in review: ${result.follow_up_records}`);
  console.log(`Main Radar records in review: ${result.main_radar_records}`);
  console.log(`canonical mutations: ${result.canonical_mutations}`);
}

async function readReviewSnapshot(outputRoot: string, automationStatePath: string): Promise<PersistableScannerOutput> {
  const configuredRunId = await readAutomationRunId(automationStatePath);
  const runIds = configuredRunId ? [configuredRunId] : (await readdir(outputRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const runId of runIds) {
    try {
      const parsed = JSON.parse(await readFile(resolve(outputRoot, runId, "full_output.json"), "utf8")) as PersistableScannerOutput;
      if (validatePersistableScannerOutput(parsed).valid) return parsed;
    } catch {
      // A review workspace never falls back to providers; try the next copied run only.
    }
  }
  throw new Error("PC1_REVIEW_SCANNER_SNAPSHOT_UNAVAILABLE");
}

async function readAutomationRunId(path: string): Promise<string | null> {
  try {
    const state = JSON.parse(await readFile(path, "utf8")) as AutomationState;
    return typeof state.last_published_scanner_run_id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(state.last_published_scanner_run_id)
      ? state.last_published_scanner_run_id
      : null;
  } catch {
    return null;
  }
}

function requiredPath(name: string, child?: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`PC1_REVIEW_ENV_REQUIRED_${name}`);
  return child ? resolve(value, child) : resolve(value);
}

void main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "PC1_REVIEW_BOOTSTRAP_FAILED";
  console.error(code);
  process.exitCode = 1;
});
