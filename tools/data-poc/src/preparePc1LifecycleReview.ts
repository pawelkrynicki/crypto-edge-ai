import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type AutomationState = {
  last_published_scanner_run_id?: string | null;
  last_published_context_run_id?: string | null;
};

export type PreparePc1LifecycleReviewOptions = {
  sourceDataPocDir: string;
  sourceUiDir: string;
  reviewDataPocDir: string;
  reviewUiDir: string;
};

export type PreparedPc1LifecycleReview = {
  scanner_run_id: string;
  context_run_id: string;
  copied_optional_files: number;
};

export async function preparePc1LifecycleReview(options: PreparePc1LifecycleReviewOptions): Promise<PreparedPc1LifecycleReview> {
  const sourceDataPocDir = resolve(options.sourceDataPocDir);
  const sourceUiDir = resolve(options.sourceUiDir);
  const reviewDataPocDir = resolve(options.reviewDataPocDir);
  const reviewUiDir = resolve(options.reviewUiDir);
  const automationStatePath = resolve(sourceDataPocDir, ".local", "automation", "automation-state.json");
  const state = await readAutomationState(automationStatePath);
  const scannerRunId = requiredRunId(state.last_published_scanner_run_id, "SCANNER");
  const contextRunId = requiredRunId(state.last_published_context_run_id, "CONTEXT");

  await copyRequired(
    automationStatePath,
    resolve(reviewDataPocDir, ".local", "automation", "automation-state.json"),
  );
  await copyRequired(
    resolve(sourceDataPocDir, "output", scannerRunId, "full_output.json"),
    resolve(reviewDataPocDir, "output", scannerRunId, "full_output.json"),
  );
  await copyRequired(
    resolve(sourceDataPocDir, "output", contextRunId, "approved_sources_output.json"),
    resolve(reviewDataPocDir, "output", contextRunId, "approved_sources_output.json"),
  );
  await copyRequired(
    resolve(sourceDataPocDir, "..", "..", "config", "established_address_universe_v1.json"),
    resolve(reviewDataPocDir, "config", "established_address_universe_v1.json"),
  );

  const optionalFiles: Array<[string, string]> = [
    [resolve(sourceDataPocDir, ".local", "follow-up", "store.json"), resolve(reviewDataPocDir, ".local", "follow-up", "store.json")],
    [resolve(sourceDataPocDir, ".local", "follow-up", "store.json.bak"), resolve(reviewDataPocDir, ".local", "follow-up", "store.json.bak")],
    [resolve(sourceDataPocDir, ".local", "established-universe", "store.json"), resolve(reviewDataPocDir, ".local", "established-universe", "store.json")],
    [resolve(sourceDataPocDir, ".local", "lifecycle", "new-inbox.json"), resolve(reviewDataPocDir, ".local", "lifecycle", "new-inbox.json")],
    [resolve(sourceDataPocDir, ".local", "lifecycle", "audit.json"), resolve(reviewDataPocDir, ".local", "lifecycle", "audit.json")],
    [resolve(sourceDataPocDir, ".local", "lifecycle", "cycle-receipts.json"), resolve(reviewDataPocDir, ".local", "lifecycle", "cycle-receipts.json")],
    [resolve(sourceDataPocDir, ".local", "lifecycle", "operation-journal.json"), resolve(reviewDataPocDir, ".local", "lifecycle", "operation-journal.json")],
    [resolve(sourceUiDir, ".local", "tester-feedback.sqlite"), resolve(reviewUiDir, "tester-feedback.sqlite")],
    [resolve(sourceUiDir, ".local", "ai-analysis-queue.sqlite"), resolve(reviewUiDir, "ai-analysis-queue.sqlite")],
    [resolve(sourceUiDir, ".local", "user-workspace.sqlite"), resolve(reviewUiDir, "user-workspace.sqlite")],
  ];
  let copiedOptionalFiles = 0;
  for (const [source, target] of optionalFiles) {
    if (await copyIfPresent(source, target)) copiedOptionalFiles += 1;
  }
  return { scanner_run_id: scannerRunId, context_run_id: contextRunId, copied_optional_files: copiedOptionalFiles };
}

async function readAutomationState(path: string): Promise<AutomationState> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isRecord(value)) throw new Error("invalid");
    return value as AutomationState;
  } catch {
    throw new Error("PC1_REVIEW_AUTOMATION_STATE_UNAVAILABLE");
  }
}

function requiredRunId(value: unknown, kind: "SCANNER" | "CONTEXT"): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`PC1_REVIEW_ACTIVE_${kind}_RUN_REQUIRED`);
  }
  return value;
}

async function copyRequired(source: string, target: string): Promise<void> {
  try {
    await mkdir(resolve(target, ".."), { recursive: true });
    await copyFile(source, target);
  } catch {
    throw new Error("PC1_REVIEW_ACTIVE_DATA_UNAVAILABLE");
  }
}

async function copyIfPresent(source: string, target: string): Promise<boolean> {
  try {
    const sourceStat = await stat(source);
    if (!sourceStat.isFile()) return false;
    await mkdir(resolve(target, ".."), { recursive: true });
    await copyFile(source, target);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  const result = await preparePc1LifecycleReview({
    sourceDataPocDir: requiredEnvironment("CRYPTO_EDGE_REVIEW_SOURCE_DATA_POC_DIR"),
    sourceUiDir: requiredEnvironment("CRYPTO_EDGE_REVIEW_SOURCE_UI_DIR"),
    reviewDataPocDir: requiredEnvironment("CRYPTO_EDGE_REVIEW_DATA_POC_DIR"),
    reviewUiDir: requiredEnvironment("CRYPTO_EDGE_REVIEW_UI_DIR"),
  });
  console.log(JSON.stringify({ schema_version: "pc1_lifecycle_review_prepare_v1", ...result }));
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`PC1_REVIEW_ENV_REQUIRED_${name}`);
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "PC1_REVIEW_PREPARE_FAILED");
    process.exitCode = 1;
  });
}
