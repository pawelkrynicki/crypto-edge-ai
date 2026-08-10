import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateDisplayEligibleScannerSnapshot } from "../../data-poc/src/displaySnapshotValidator.js";
import type { PersistableScannerOutput as DisplayEligibleScannerSnapshot } from "../../data-poc/src/persistableScannerModel.js";
import type { ProductVersion } from "../src/productVersion.js";
import type { PersistableScannerOutput } from "../src/types/scannerTypes.js";
import type { ScannerOutputWithMeta, ScannerSourceMeta } from "./latestScannerOutput.js";

export const PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS = 60_000;
export const PC1_REVIEW_PUBLICATION_RETRY_DELAY_MS = 30_000;
export const PC1_REVIEW_PUBLICATION_MAX_ATTEMPTS = 3;
const REVIEW_PUBLICATION_MARKER_FILE = "pc1-review-publication.json";
const REVIEW_PUBLICATION_STATUS_FILE = "pc1-review-publication-status.json";

export type ProductReviewPublicationMarker = {
  schema_version: "pc1_review_publication_v1";
  review_version_id: string;
  generated_at: string;
  lifecycle_updated_at: string | null;
  version: ProductVersion;
  provider_calls: 0;
  openai_calls: 0;
  canonical_mutations: 0;
};

export type ProductReviewPublicationStage =
  | "LOAD_BASE_SCANNER"
  | "LOAD_BASE_SNAPSHOT"
  | "LOAD_BASE_VERSION"
  | "SOURCE_VERSION_MATCH"
  | "CREATE_REVIEW_SNAPSHOT"
  | "VALIDATE"
  | "PERSIST_SNAPSHOT"
  | "READ_BACK_VALIDATE"
  | "PERSIST_POINTER"
  | "PERSIST_MARKER";

export type ProductReviewPublicationStatus = {
  schema_version: "pc1_review_publication_status_v1";
  status: "WAITING" | "PREPARING" | "VALIDATING" | "PUBLISHING" | "PUBLISHED" | "RETRY_WAIT" | "FAILED";
  attempt: number;
  started_at: string | null;
  finished_at: string | null;
  source_run_id: string | null;
  target_run_id: string | null;
  failure_stage: ProductReviewPublicationStage | null;
  reason_code: string | null;
  next_retry_at: string | null;
  /** Safe review-only timing facts for diagnosing the API-server lifetime timer. */
  timer_scheduled_at: string | null;
  timer_due_at: string | null;
  timer_fired_at: string | null;
  provider_calls: 0;
  openai_calls: 0;
  canonical_mutations: 0;
};

export type ProductReviewPublicationResult = {
  published: boolean;
  status: ProductReviewPublicationStatus;
};

export type ProductReviewPublicationOptions = {
  now?: () => Date;
  enabled?: boolean;
  reviewRootPath?: string;
  outputRootPath?: string;
  autoPublicationDelayMs?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  loadBaseScanner?: () => Promise<ScannerOutputWithMeta>;
  /** Reads the immutable V1 file that is materialized as the review V2 snapshot. */
  loadBaseSnapshot?: () => Promise<ScannerOutputWithMeta>;
  loadBaseVersion?: () => Promise<ProductVersion>;
  validateSnapshot?: (snapshot: ScannerOutputWithMeta) => void;
  /** Advances only the isolated review automation pointer after the V2 file has passed validation. */
  persistReviewPointer?: (version: ProductVersion) => Promise<void>;
  persistMarker?: (marker: ProductReviewPublicationMarker) => Promise<void>;
  persistStatus?: (status: ProductReviewPublicationStatus) => Promise<void>;
};

export type ProductReviewPublication = {
  readonly enabled: boolean;
  readonly autoPublicationDelayMs: number;
  /** Prepares, validates and publishes the complete V2 snapshot before changing its pointer. */
  publishNext: () => Promise<ProductReviewPublicationResult>;
  decorateVersion: (version: ProductVersion) => ProductVersion;
  decorateScanner: (scanner: ScannerOutputWithMeta) => ScannerOutputWithMeta;
  getMarker: () => ProductReviewPublicationMarker | null;
  getStatus: () => ProductReviewPublicationStatus;
  stop: () => void;
};

type ReviewScannerSnapshot = PersistableScannerOutput;

class PublicationStepError extends Error {
  readonly stage: ProductReviewPublicationStage;
  readonly reasonCode: string;

  constructor(
    stage: ProductReviewPublicationStage,
    reasonCode: string,
  ) {
    super(reasonCode);
    this.stage = stage;
    this.reasonCode = reasonCode;
  }
}

export function createProductReviewPublication(options: ProductReviewPublicationOptions = {}): ProductReviewPublication {
  const now = options.now ?? (() => new Date());
  const reviewRootPath = options.reviewRootPath ?? process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT?.trim() ?? "";
  const outputRootPath = options.outputRootPath ?? (reviewRootPath ? resolve(reviewRootPath, "output") : "");
  const enabled = options.enabled ?? (process.env.CRYPTO_EDGE_PC1_REVIEW_MODE === "1" && Boolean(reviewRootPath));
  const autoPublicationDelayMs = options.autoPublicationDelayMs ?? configuredAutoPublicationDelay();
  const retryDelayMs = options.retryDelayMs ?? PC1_REVIEW_PUBLICATION_RETRY_DELAY_MS;
  const maxAttempts = options.maxAttempts ?? PC1_REVIEW_PUBLICATION_MAX_ATTEMPTS;
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  const markerPath = reviewRootPath ? resolve(reviewRootPath, REVIEW_PUBLICATION_MARKER_FILE) : null;
  const statusPath = reviewRootPath ? resolve(reviewRootPath, REVIEW_PUBLICATION_STATUS_FILE) : null;
  const persistMarker = options.persistMarker ?? (async (marker: ProductReviewPublicationMarker) => {
    if (!markerPath || !reviewRootPath) throw new Error("PC1_REVIEW_ROOT_REQUIRED");
    await mkdir(reviewRootPath, { recursive: true });
    await writeAtomically(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
  });
  const persistStatus = options.persistStatus ?? (async (nextStatus: ProductReviewPublicationStatus) => {
    if (!statusPath || !reviewRootPath) return;
    await mkdir(reviewRootPath, { recursive: true });
    await writeAtomically(statusPath, `${JSON.stringify(nextStatus, null, 2)}\n`);
  });
  const reviewPointerPath = reviewRootPath ? resolve(reviewRootPath, ".local", "automation", "automation-state.json") : null;
  const persistReviewPointer = options.persistReviewPointer ?? (async (version: ProductVersion) => {
    if (!reviewPointerPath) throw new Error("PC1_REVIEW_POINTER_PATH_REQUIRED");
    const current = JSON.parse(await readFile(reviewPointerPath, "utf8")) as unknown;
    if (!isRecord(current)) throw new Error("PC1_REVIEW_POINTER_INVALID");
    await writeAtomically(reviewPointerPath, `${JSON.stringify({
      ...current,
      last_published_scanner_run_id: version.scanner_run_id,
    }, null, 2)}\n`);
  });

  let marker: ProductReviewPublicationMarker | null = null;
  let activeVersion: ProductVersion | null = null;
  let publishedSnapshot: ScannerOutputWithMeta | null = null;
  let publishing: Promise<ProductReviewPublicationResult> | null = null;
  let autoTimer: ReturnType<typeof setTimeout> | null = null;
  let status = createStatus("WAITING", 0);
  let persistedStatus = Promise.resolve();

  const saveStatus = (nextStatus: ProductReviewPublicationStatus): Promise<void> => {
    status = nextStatus;
    const statusToPersist = nextStatus;
    persistedStatus = persistedStatus.then(async () => {
      try {
        await persistStatus(statusToPersist);
      } catch {
        // Review diagnostics must never turn a valid publication into a failed one.
      }
    });
    return persistedStatus;
  };

  const scheduleAttempt = (delayMs: number): void => {
    if (autoTimer) clearTimer(autoTimer);
    const scheduledAt = now();
    void saveStatus({
      ...status,
      timer_scheduled_at: scheduledAt.toISOString(),
      timer_due_at: new Date(scheduledAt.getTime() + delayMs).toISOString(),
      timer_fired_at: null,
    });
    autoTimer = setTimer(() => {
      autoTimer = null;
      void saveStatus({ ...status, timer_fired_at: now().toISOString() }).finally(() => { void publishNext(); });
    }, delayMs);
    if (typeof autoTimer === "object" && autoTimer !== null && "unref" in autoTimer && typeof autoTimer.unref === "function") {
      autoTimer.unref();
    }
  };

  const publishNext = (): Promise<ProductReviewPublicationResult> => {
    if (publishing) return publishing;
    if (!enabled) return Promise.resolve({ published: false, status });
    if (marker) return Promise.resolve({ published: false, status });

    const attempt = status.attempt + 1;
    publishing = prepareValidateAndPublish({
      attempt,
      now,
      outputRootPath,
      loadBaseScanner: options.loadBaseScanner,
      loadBaseSnapshot: options.loadBaseSnapshot,
      loadBaseVersion: options.loadBaseVersion,
      validateSnapshot: options.validateSnapshot ?? validateCanonicalDisplaySnapshot,
      persistReviewPointer,
      persistMarker,
      saveStatus,
      getStatus: () => status,
      holdActiveVersion: (version) => { activeVersion = version; },
      maxAttempts,
      retryDelayMs,
    }).then((result) => {
      if (result.published) {
        marker = result.marker;
        publishedSnapshot = result.snapshot;
      } else if (result.status.status === "RETRY_WAIT") {
        scheduleAttempt(retryDelayMs);
      }
      return { published: result.published, status: result.status };
    }).finally(() => {
      publishing = null;
    });
    return publishing;
  };

  if (enabled) scheduleAttempt(autoPublicationDelayMs);

  return {
    enabled,
    autoPublicationDelayMs,
    publishNext,
    decorateVersion: (version) => marker?.version ?? activeVersion ?? version,
    decorateScanner: (scanner) => publishedSnapshot
      ? withPublicationSourceMetadata(publishedSnapshot, scanner._source_meta)
      : scanner,
    getMarker: () => marker,
    getStatus: () => status,
    stop: () => {
      if (autoTimer) clearTimer(autoTimer);
      autoTimer = null;
    },
  };
}

async function prepareValidateAndPublish({
  attempt,
  now,
  outputRootPath,
  loadBaseScanner,
  loadBaseSnapshot,
  loadBaseVersion,
  validateSnapshot,
  persistReviewPointer,
  persistMarker,
  saveStatus,
  getStatus,
  holdActiveVersion,
  maxAttempts,
  retryDelayMs,
}: {
  attempt: number;
  now: () => Date;
  outputRootPath: string;
  loadBaseScanner: (() => Promise<ScannerOutputWithMeta>) | undefined;
  loadBaseSnapshot: (() => Promise<ScannerOutputWithMeta>) | undefined;
  loadBaseVersion: (() => Promise<ProductVersion>) | undefined;
  validateSnapshot: (snapshot: ScannerOutputWithMeta) => void;
  persistReviewPointer: (version: ProductVersion) => Promise<void>;
  persistMarker: (marker: ProductReviewPublicationMarker) => Promise<void>;
  saveStatus: (status: ProductReviewPublicationStatus) => Promise<void>;
  getStatus: () => ProductReviewPublicationStatus;
  holdActiveVersion: (version: ProductVersion) => void;
  maxAttempts: number;
  retryDelayMs: number;
}): Promise<({ published: true; marker: ProductReviewPublicationMarker; snapshot: ScannerOutputWithMeta; status: ProductReviewPublicationStatus } | { published: false; status: ProductReviewPublicationStatus })> {
  const startedAt = now().toISOString();
  let sourceRunId: string | null = null;
  let targetRunId: string | null = null;
  const writeStatus = async (
    next: ProductReviewPublicationStatus["status"],
    extras: Partial<ProductReviewPublicationStatus> = {},
  ): Promise<ProductReviewPublicationStatus> => {
    const timerStatus = getStatus();
    const nextStatus: ProductReviewPublicationStatus = {
      ...createStatus(next, attempt),
      started_at: startedAt,
      source_run_id: sourceRunId,
      target_run_id: targetRunId,
      timer_scheduled_at: timerStatus.timer_scheduled_at,
      timer_due_at: timerStatus.timer_due_at,
      timer_fired_at: timerStatus.timer_fired_at,
      ...extras,
    };
    await saveStatus(nextStatus);
    return nextStatus;
  };

  try {
    if (!loadBaseScanner || !loadBaseVersion || !outputRootPath) {
      throw new PublicationStepError("LOAD_BASE_SCANNER", "REVIEW_PUBLICATION_CONFIG_INVALID");
    }
    await writeStatus("PREPARING");
    const sourceScanner = await runStep("LOAD_BASE_SCANNER", () => loadBaseScanner());
    sourceRunId = (sourceScanner as unknown as ReviewScannerSnapshot).scan_run.run_id;
    if (!isSafeRunId(sourceRunId)) throw new PublicationStepError("LOAD_BASE_SCANNER", "SOURCE_RUN_ID_INVALID");

    const sourceSnapshot = await runStep(
      "LOAD_BASE_SNAPSHOT",
      () => loadBaseSnapshot ? loadBaseSnapshot() : readRawSnapshot(outputRootPath, sourceScanner),
    );
    const source = sourceSnapshot as unknown as ReviewScannerSnapshot;
    if (!isSafeRunId(source.scan_run.run_id)) throw new PublicationStepError("LOAD_BASE_SNAPSHOT", "SOURCE_SNAPSHOT_RUN_ID_INVALID");

    const sourceVersion = await runStep("LOAD_BASE_VERSION", () => loadBaseVersion());
    if (sourceVersion.scanner_run_id !== source.scan_run.run_id) {
      throw new PublicationStepError("SOURCE_VERSION_MATCH", "SOURCE_VERSION_RUN_ID_MISMATCH");
    }

    targetRunId = withReviewSuffix(sourceRunId, attempt);
    const snapshot = await runStep("CREATE_REVIEW_SNAPSHOT", () => Promise.resolve(createReviewSnapshot(source, targetRunId!, now().toISOString())));
    await writeStatus("VALIDATING");
    await runStep("VALIDATE", () => Promise.resolve(validateSnapshot(snapshot as unknown as ScannerOutputWithMeta)));

    const version: ProductVersion = {
      ...sourceVersion,
      scanner_run_id: targetRunId,
      scanner_generated_at: snapshot.scan_run.finished_at,
    };
    holdActiveVersion(sourceVersion);
    const marker: ProductReviewPublicationMarker = {
      schema_version: "pc1_review_publication_v1",
      review_version_id: `pc1-review-${attempt}`,
      generated_at: snapshot.scan_run.finished_at,
      lifecycle_updated_at: version.lifecycle_updated_at,
      version,
      provider_calls: 0,
      openai_calls: 0,
      canonical_mutations: 0,
    };

    await writeStatus("PUBLISHING");
    await runStep("PERSIST_SNAPSHOT", () => persistSnapshot(outputRootPath, targetRunId!, snapshot));
    const persistedSnapshot = await runStep("READ_BACK_VALIDATE", () => readPersistedSnapshot(outputRootPath, targetRunId!));
    if (persistedSnapshot.scan_run.run_id !== targetRunId) {
      throw new PublicationStepError("READ_BACK_VALIDATE", "PERSISTED_SNAPSHOT_RUN_ID_MISMATCH");
    }
    await runStep("READ_BACK_VALIDATE", () => Promise.resolve(validateSnapshot(persistedSnapshot as unknown as ScannerOutputWithMeta)));
    await runStep("PERSIST_POINTER", () => persistReviewPointer(version));
    try {
      await runStep("PERSIST_MARKER", () => persistMarker(marker));
    } catch (error) {
      try {
        await persistReviewPointer(sourceVersion);
      } catch {
        // The original safe failure is still reported without disclosing storage details.
      }
      throw error;
    }

    const publishedStatus = await writeStatus("PUBLISHED", { finished_at: now().toISOString() });
    return { published: true, marker, snapshot: persistedSnapshot as unknown as ScannerOutputWithMeta, status: publishedStatus };
  } catch (error) {
    const failure = normalizeFailure(error);
    const retry = attempt < maxAttempts;
    const failedStatus = await writeStatus(retry ? "RETRY_WAIT" : "FAILED", {
      finished_at: now().toISOString(),
      failure_stage: failure.stage,
      reason_code: failure.reasonCode,
      next_retry_at: retry ? new Date(now().getTime() + retryDelayMs).toISOString() : null,
    });
    return { published: false, status: failedStatus };
  }
}

async function runStep<T>(stage: ProductReviewPublicationStage, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof PublicationStepError) throw error;
    throw new PublicationStepError(stage, safeReasonCode(error));
  }
}

function normalizeFailure(error: unknown): PublicationStepError {
  return error instanceof PublicationStepError
    ? error
    : new PublicationStepError("CREATE_REVIEW_SNAPSHOT", safeReasonCode(error));
}

function safeReasonCode(error: unknown): string {
  if (error instanceof Error) {
    if (/SCANNER_DISPLAY_VALIDATION_FAILED|DISPLAY.*VALIDATION/i.test(error.message)) return "SCANNER_DISPLAY_VALIDATION_FAILED";
    if (/ENOENT|not found/i.test(error.message)) return "REVIEW_ARTIFACT_MISSING";
    if (/EACCES|EPERM/i.test(error.message)) return "REVIEW_STORAGE_UNAVAILABLE";
    if (/JSON/i.test(error.message)) return "REVIEW_SNAPSHOT_JSON_INVALID";
  }
  return "REVIEW_PUBLICATION_STEP_FAILED";
}

function createStatus(
  status: ProductReviewPublicationStatus["status"],
  attempt: number,
): ProductReviewPublicationStatus {
  return {
    schema_version: "pc1_review_publication_status_v1",
    status,
    attempt,
    started_at: null,
    finished_at: null,
    source_run_id: null,
    target_run_id: null,
    failure_stage: null,
    reason_code: null,
    next_retry_at: null,
    timer_scheduled_at: null,
    timer_due_at: null,
    timer_fired_at: null,
    provider_calls: 0,
    openai_calls: 0,
    canonical_mutations: 0,
  };
}

async function readRawSnapshot(outputRootPath: string, scanner: ScannerOutputWithMeta): Promise<ScannerOutputWithMeta> {
  const runId = scanner._source_meta?.selected_run_id;
  if (!isSafeRunId(runId)) throw new PublicationStepError("LOAD_BASE_SNAPSHOT", "SOURCE_SELECTED_RUN_ID_INVALID");
  return readSnapshotFile(outputRootPath, runId, "LOAD_BASE_SNAPSHOT");
}

async function readPersistedSnapshot(outputRootPath: string, runId: string): Promise<ReviewScannerSnapshot> {
  return await readSnapshotFile(outputRootPath, runId, "READ_BACK_VALIDATE") as unknown as ReviewScannerSnapshot;
}

async function readSnapshotFile(
  outputRootPath: string,
  runId: string,
  stage: ProductReviewPublicationStage,
): Promise<ScannerOutputWithMeta> {
  try {
    return JSON.parse(await readFile(resolve(outputRootPath, runId, "full_output.json"), "utf8")) as ScannerOutputWithMeta;
  } catch (error) {
    throw new PublicationStepError(stage, safeReasonCode(error));
  }
}

function validateCanonicalDisplaySnapshot(snapshot: ScannerOutputWithMeta): void {
  const { _source_meta: _sourceMeta, ...displaySnapshot } = snapshot;
  void _sourceMeta;
  validateDisplayEligibleScannerSnapshot(displaySnapshot as unknown as DisplayEligibleScannerSnapshot);
}

function createReviewSnapshot(
  source: ReviewScannerSnapshot,
  reviewRunId: string,
  publishedAt: string,
): ReviewScannerSnapshot {
  return {
    ...source,
    scan_run: { ...source.scan_run, run_id: reviewRunId, finished_at: publishedAt },
    ...(isRecord(source.provenance)
      ? { provenance: { ...source.provenance, run_id: reviewRunId, generated_at: publishedAt, finished_at: publishedAt } }
      : {}),
    candidates: withReviewRun(source.candidates, reviewRunId),
    security_checks: withReviewRun(source.security_checks, reviewRunId),
    scorecards: withReviewRun(source.scorecards, reviewRunId),
  };
}

function withPublicationSourceMetadata(
  snapshot: ScannerOutputWithMeta,
  sourceMeta: ScannerSourceMeta,
): ScannerOutputWithMeta {
  const reviewSnapshot = snapshot as unknown as ReviewScannerSnapshot;
  return {
    ...reviewSnapshot,
    _source_meta: {
      ...sourceMeta,
      selected_run_id: reviewSnapshot.scan_run.run_id,
    },
  };
}

async function persistSnapshot(outputRootPath: string, runId: string, snapshot: ReviewScannerSnapshot): Promise<void> {
  const snapshotPath = resolve(outputRootPath, runId, "full_output.json");
  await mkdir(resolve(snapshotPath, ".."), { recursive: true });
  await writeAtomically(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

async function writeAtomically(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, path);
}

function withReviewSuffix(runId: string, revision: number): string {
  const suffix = `-review-${revision}`;
  return `${runId.slice(0, Math.max(1, 128 - suffix.length))}${suffix}`;
}

function isSafeRunId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withReviewRun<T extends { run_id: string }>(value: T[], reviewRun: string): T[] {
  return value.map((entry) => ({ ...entry, run_id: reviewRun }));
}

function configuredAutoPublicationDelay(): number {
  const configured = Number.parseInt(process.env.CRYPTO_EDGE_PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS ?? "", 10);
  return Number.isFinite(configured) && configured >= 1_000
    ? configured
    : PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS;
}
