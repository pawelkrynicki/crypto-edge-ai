import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDisplayEligibleScannerSnapshot, type DisplaySnapshotValidationError } from "./displaySnapshotValidator.js";
import { bootstrapLifecycleReview } from "./systemLifecycle.js";
import type { PersistableScannerOutput } from "./persistableScannerModel.js";

type AutomationState = { last_published_scanner_run_id?: string | null };

export type Pc1LifecycleReviewBootstrapOptions = {
  outputRoot: string;
  automationStatePath: string;
  newInboxStorePath: string;
  cycleReceiptPath: string;
  followUpStorePath: string;
  establishedStorePath: string;
};

export type Pc1LifecycleReviewBootstrapResult = Awaited<ReturnType<typeof bootstrapLifecycleReview>> & {
  scanner_run_id: string;
  snapshot_timestamp: string;
};

export async function bootstrapPc1LifecycleReview(
  options: Pc1LifecycleReviewBootstrapOptions,
): Promise<Pc1LifecycleReviewBootstrapResult> {
  const snapshot = await readReviewSnapshot(options.outputRoot, options.automationStatePath);
  const observedAt = snapshot.provenance?.generated_at ?? snapshot.scan_run.finished_at;
  const result = await bootstrapLifecycleReview(snapshot, {
    newInboxStorePath: options.newInboxStorePath,
    cycleReceiptPath: options.cycleReceiptPath,
    followUpStorePath: options.followUpStorePath,
    establishedStorePath: options.establishedStorePath,
    now: new Date(observedAt),
  });
  return { scanner_run_id: snapshot.scan_run.run_id, snapshot_timestamp: observedAt, ...result };
}

export async function readReviewSnapshot(
  outputRoot: string,
  automationStatePath: string,
): Promise<PersistableScannerOutput> {
  const configuredRunId = await readAutomationRunId(automationStatePath);
  if (!configuredRunId) failValidation("unavailable", "PC1_REVIEW_ACTIVE_SCANNER_RUN_REQUIRED");

  const snapshotPath = resolve(outputRoot, configuredRunId, "full_output.json");
  let serialized: string;
  try {
    serialized = await readFile(snapshotPath, "utf8");
  } catch {
    failValidation(configuredRunId, "PC1_REVIEW_SCANNER_FILE_MISSING");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    failValidation(configuredRunId, "PC1_REVIEW_SCANNER_JSON_INVALID");
  }
  if (!isRecord(parsed) || !isRecord(parsed.scan_run) || !isRecord(parsed.provenance)) {
    failValidation(configuredRunId, "PC1_REVIEW_SCANNER_SCHEMA_INVALID");
  }

  const scanRunId = parsed.scan_run.run_id;
  const provenanceRunId = parsed.provenance.run_id;
  if (scanRunId !== configuredRunId || provenanceRunId !== configuredRunId) {
    failValidation(configuredRunId, "PC1_REVIEW_SCANNER_RUN_ID_MISMATCH");
  }

  try {
    validateDisplayEligibleScannerSnapshot(parsed as PersistableScannerOutput);
  } catch (error) {
    const reason = displayValidationReason(error);
    if (reason === "SCANNER_SCHEMA_INVALID") {
      failValidation(configuredRunId, "PC1_REVIEW_SCANNER_SCHEMA_INVALID");
    }
    failValidation(configuredRunId, "PC1_REVIEW_SCANNER_NOT_DISPLAY_ELIGIBLE");
  }

  reportValidation(configuredRunId, "PASS", "PC1_REVIEW_SCANNER_VALID");
  return parsed as PersistableScannerOutput;
}

async function main(): Promise<void> {
  const result = await bootstrapPc1LifecycleReview({
    outputRoot: requiredPath("CRYPTO_EDGE_REVIEW_OUTPUT_DIR"),
    automationStatePath: requiredPath("CRYPTO_EDGE_AUTOMATION_DIRECTORY_PATH", "automation-state.json"),
    newInboxStorePath: requiredPath("CRYPTO_EDGE_NEW_INBOX_STORE_PATH"),
    cycleReceiptPath: requiredPath("CRYPTO_EDGE_LIFECYCLE_CYCLE_RECEIPT_PATH"),
    followUpStorePath: requiredPath("CRYPTO_EDGE_FOLLOW_UP_STORE_PATH"),
    establishedStorePath: requiredPath("CRYPTO_EDGE_ESTABLISHED_UNIVERSE_STORE_PATH"),
  });
  console.log(JSON.stringify({ schema_version: "pc1_lifecycle_review_bootstrap_v1", ...result }));
  console.log(`Review New Inbox: ${result.new_inbox_records}`);
  console.log(`Review Follow-up: ${result.follow_up_records}`);
  console.log(`Review Main Radar: ${result.main_radar_records}`);
  console.log("Provider calls: 0");
  console.log("OpenAI calls: 0");
  console.log("Honeypot.is calls: 0");
  console.log(`Canonical mutations: ${result.canonical_mutations}`);
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

function failValidation(runId: string, code: string): never {
  reportValidation(runId, "FAIL", code);
  throw new Error(code);
}

function reportValidation(runId: string, status: "PASS" | "FAIL", reason: string): void {
  console.log(`Active scanner run: ${runId}`);
  console.log(`Validation: ${status}`);
  console.log(`Reason: ${reason}`);
}

function displayValidationReason(error: unknown): string {
  if (isDisplaySnapshotValidationError(error)) return error.code;
  return "SCANNER_DISPLAY_VALIDATION_FAILED";
}

function isDisplaySnapshotValidationError(error: unknown): error is DisplaySnapshotValidationError {
  return error instanceof Error && error.name === "DisplaySnapshotValidationError" && /^[A-Z0-9_]{3,96}$/.test(error.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredPath(name: string, child?: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`PC1_REVIEW_ENV_REQUIRED_${name}`);
  return child ? resolve(value, child) : resolve(value);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const code = error instanceof Error ? error.message : "PC1_REVIEW_BOOTSTRAP_FAILED";
    console.error(code);
    process.exitCode = 1;
  });
}
