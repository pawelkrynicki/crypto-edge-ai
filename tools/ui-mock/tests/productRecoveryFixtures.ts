import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createEmptyFollowUpStore,
} from "../../data-poc/src/followUpBasket.js";
import {
  createEmptyLifecycleAuditStore,
  createEmptyLifecycleCycleReceiptStore,
  createEmptyLifecycleOperationJournalStore,
  createEmptyNewInboxStore,
} from "../../data-poc/src/systemLifecycle.js";
import {
  validateEstablishedAddressUniverse,
} from "../../data-poc/src/establishedAddressUniverse.js";
import { createInitialAutomationState } from "../../data-poc/src/automation/automationState.js";
import { createFeedbackStore } from "../server/feedbackStore.js";
import { createAIAnalysisQueueStore } from "../server/aiResearchQueueStore.js";
import { createUserWorkspaceRepository } from "../server/userWorkspaceRepository.js";
import type { ProductRecoveryPaths } from "../server/productRecovery.js";

const FIXTURE_COMMIT_SHA = "738483d4d5fa267f70e3d87e6753c3a6cbae3461";
const SCANNER_RUN_ID = "scan_20260801090000";
const CONTEXT_RUN_ID = "approved_sources_20260801090000";
const FIXTURE_TIME = "2026-08-01T09:00:00.000Z";

export function createIsolatedRecoveryPaths(root: string): ProductRecoveryPaths {
  const productRoot = resolve(root, "product");
  const recoveryRoot = resolve(root, "recovery");
  return {
    repoRoot: productRoot,
    outputRoot: resolve(productRoot, "tools", "data-poc", "output"),
    followUpStore: resolve(productRoot, "tools", "data-poc", ".local", "follow-up", "store.json"),
    followUpBackup: resolve(productRoot, "tools", "data-poc", ".local", "follow-up", "store.json.bak"),
    newInboxStore: resolve(productRoot, "tools", "data-poc", ".local", "lifecycle", "new-inbox.json"),
    lifecycleAuditStore: resolve(productRoot, "tools", "data-poc", ".local", "lifecycle", "audit.json"),
    lifecycleCycleReceipt: resolve(productRoot, "tools", "data-poc", ".local", "lifecycle", "cycle-receipts.json"),
    lifecycleOperationJournal: resolve(productRoot, "tools", "data-poc", ".local", "lifecycle", "operation-journal.json"),
    establishedStore: resolve(productRoot, "tools", "data-poc", ".local", "established-universe", "store.json"),
    establishedConfig: resolve(productRoot, "config", "established_address_universe_v1.json"),
    feedbackSqlite: resolve(productRoot, "tools", "ui-mock", ".local", "tester-feedback.sqlite"),
    aiQueueSqlite: resolve(productRoot, "tools", "ui-mock", ".local", "ai-analysis-queue.sqlite"),
    userWorkspaceSqlite: resolve(productRoot, "tools", "ui-mock", ".local", "user-workspace.sqlite"),
    automationState: resolve(productRoot, "tools", "data-poc", ".local", "automation", "automation-state.json"),
    runOnceReceipt: resolve(productRoot, "tools", "data-poc", ".local", "data-cycle", "last-run-once.json"),
    reportsRoot: resolve(productRoot, "tools", "ui-mock", ".local", "reports"),
    safeConfigFiles: [
      { logicalStoreId: "runtime_policy_config", path: resolve(productRoot, "config", "data_source_runtime_policy.json"), payloadPath: "config/data_source_runtime_policy.json" },
      { logicalStoreId: "established_discovery_query_plan", path: resolve(productRoot, "config", "established_discovery_query_plan_v1.json"), payloadPath: "config/established_discovery_query_plan_v1.json" },
      { logicalStoreId: "data_source_registry", path: resolve(productRoot, "docs", "compliance", "data_source_registry_v1.json"), payloadPath: "config/data_source_registry_v1.json" },
    ],
    recoveryRoot,
    backupsRoot: resolve(recoveryRoot, "backups"),
    operationsRoot: resolve(recoveryRoot, "operations"),
    ownerLockPath: resolve(recoveryRoot, "owner-operation.lock.json"),
    maintenanceStatePath: resolve(recoveryRoot, "maintenance-state.json"),
  };
}

export async function seedIsolatedProductState(paths: ProductRecoveryPaths): Promise<void> {
  const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
  const followUp = createEmptyFollowUpStore(new Date(FIXTURE_TIME));
  await writeJson(paths.followUpStore, followUp);
  await writeJson(paths.followUpBackup, followUp);
  await writeJson(paths.newInboxStore, createEmptyNewInboxStore(new Date(FIXTURE_TIME)));
  await writeJson(paths.lifecycleAuditStore, createEmptyLifecycleAuditStore(new Date(FIXTURE_TIME)));
  await writeJson(paths.lifecycleCycleReceipt, createEmptyLifecycleCycleReceiptStore(new Date(FIXTURE_TIME)));
  await writeJson(paths.lifecycleOperationJournal, createEmptyLifecycleOperationJournalStore(new Date(FIXTURE_TIME)));

  await mkdir(resolve(paths.establishedConfig, ".."), { recursive: true });
  await copyFile(resolve(repositoryRoot, "config", "established_address_universe_v1.json"), paths.establishedConfig);
  const established = validateEstablishedAddressUniverse(JSON.parse(await readFile(paths.establishedConfig, "utf8")) as unknown);
  await writeJson(paths.establishedStore, {
    schema_version: "established_universe_store_v1",
    current: established,
    history: [],
    audit_log: [],
  });

  for (const config of paths.safeConfigFiles) {
    await writeJson(config.path, { schema_version: `${config.logicalStoreId}_v1`, enabled: true });
  }

  const feedback = await createFeedbackStore({ databaseFilePath: paths.feedbackSqlite });
  feedback.close();
  const aiQueue = await createAIAnalysisQueueStore({ databaseFilePath: paths.aiQueueSqlite });
  aiQueue.close();
  const workspace = await createUserWorkspaceRepository({ databaseFilePath: paths.userWorkspaceSqlite });
  workspace.close();

  const automation = {
    ...createInitialAutomationState(),
    last_published_scanner_run_id: SCANNER_RUN_ID,
    last_published_context_run_id: CONTEXT_RUN_ID,
  };
  await writeJson(paths.automationState, automation);
  await writeJson(paths.runOnceReceipt, {
    schema_version: "data_cycle_run_once_receipt_v1",
    run_id: "fixture_run_once",
    completed_at: FIXTURE_TIME,
  });

  const scanner = JSON.parse(await readFile(
    resolve(import.meta.dirname, "..", "src", "fixtures", "persistableScannerSample.json"),
    "utf8",
  )) as Record<string, unknown>;
  setScannerRunId(scanner, SCANNER_RUN_ID);
  await writeJson(resolve(paths.outputRoot, SCANNER_RUN_ID, "full_output.json"), scanner);
  await writeJson(resolve(paths.outputRoot, CONTEXT_RUN_ID, "approved_sources_output.json"), makeContextOutput());
  await mkdir(paths.reportsRoot, { recursive: true });
}

export async function cloneBundle(source: string, destination: string): Promise<void> {
  const { cp } = await import("node:fs/promises");
  await cp(source, destination, { recursive: true, errorOnExist: true });
}

export { FIXTURE_COMMIT_SHA, SCANNER_RUN_ID, CONTEXT_RUN_ID };

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function setScannerRunId(value: Record<string, unknown>, runId: string): void {
  const scanRun = value.scan_run as Record<string, unknown>;
  scanRun.run_id = runId;
  if (value.provenance && typeof value.provenance === "object") {
    (value.provenance as Record<string, unknown>).run_id = runId;
  }
  for (const key of ["candidates", "security_checks", "scorecards"]) {
    const records = value[key] as Array<Record<string, unknown>>;
    for (const record of records) record.run_id = runId;
  }
}

function makeContextOutput(): Record<string, unknown> {
  const alternativeAttribution = {
    provider: "Alternative.me",
    requirement: "Attribution appreciated, not required",
    url: "https://alternative.me/crypto/fear-and-greed-index/",
  };
  const defillamaAttribution = {
    provider: "DefiLlama",
    requirement: "Attribution appreciated",
    url: "https://defillama.com/",
  };
  const allowedPolicy = {
    live_fetch: "allowed",
    normalized_storage: "allowed",
    user_display: "allowed",
    raw_storage: "denied",
  };
  return {
    provenance: {
      schema_version: "context_snapshot_v1",
      contract_version: "real_data_boundary_v1",
      generator_version: "approved_sources_poc_v1",
      environment: "INTERNAL_BETA",
      mode: "live",
      fixture_used: false,
      run_id: CONTEXT_RUN_ID,
      generated_at: FIXTURE_TIME,
      finished_at: FIXTURE_TIME,
      source_ids: ["alternative_me_fng", "defillama_api"],
      policy_decisions: {
        alternative_me_fng: allowedPolicy,
        defillama_api: allowedPolicy,
      },
      metadata: {
        request_counts: { alternative_me_fng: 1, defillama_api: 1 },
        attributions: { alternative_me_fng: alternativeAttribution, defillama_api: defillamaAttribution },
      },
    },
    run_id: CONTEXT_RUN_ID,
    generated_at: FIXTURE_TIME,
    environment: "INTERNAL_BETA",
    sources: [
      {
        source_id: "alternative_me_fng",
        source_name: "Alternative.me Fear & Greed Index",
        mode: "live",
        fetched_at: FIXTURE_TIME,
        health_status: "ready",
        attribution: alternativeAttribution,
        policy: { environment: "INTERNAL_BETA", action: "live_fetch", allowed: true, reason: "Allowed by runtime policy" },
        data_category: "sentiment",
        records: [{ record_type: "fear_greed_index", value: 42, value_classification: "Fear", timestamp: FIXTURE_TIME, time_until_update: "3600" }],
        warnings: [],
        errors: [],
      },
      {
        source_id: "defillama_api",
        source_name: "DefiLlama API",
        mode: "live",
        fetched_at: FIXTURE_TIME,
        health_status: "ready",
        attribution: defillamaAttribution,
        policy: { environment: "INTERNAL_BETA", action: "live_fetch", allowed: true, reason: "Allowed by runtime policy" },
        data_category: "defi_context",
        records: [{ record_type: "defi_protocol_snapshot", name: "Lido", chain: "Ethereum", tvl_usd: 35_400_000_000, change_1d: 0.75, change_7d: -2.1, url: "https://lido.fi" }],
        warnings: [],
        errors: [],
      },
    ],
    summary: {
      sources_requested: 2,
      sources_allowed: 2,
      sources_denied: 0,
      records_total: 2,
      warnings_total: 0,
      errors_total: 0,
      degraded_external_sources_total: 0,
      hard_failures_total: 0,
    },
  };
}
