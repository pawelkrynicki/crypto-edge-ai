import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateDisplayEligibleScannerSnapshot } from "../../data-poc/src/displaySnapshotValidator.js";
import type { PersistableScannerOutput as DisplayEligibleScannerSnapshot } from "../../data-poc/src/persistableScannerModel.js";
import type { ProductVersion } from "../src/productVersion.js";
import type { PersistableScannerOutput, ScannerSourceMeta } from "../src/types/scannerTypes.js";
import type { ScannerOutputWithMeta } from "./latestScannerOutput.js";

export const PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS = 60_000;
const REVIEW_PUBLICATION_MARKER_FILE = "pc1-review-publication.json";

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

export type ProductReviewPublicationOptions = {
  now?: () => Date;
  enabled?: boolean;
  reviewRootPath?: string;
  outputRootPath?: string;
  autoPublicationDelayMs?: number;
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
};

export type ProductReviewPublication = {
  readonly enabled: boolean;
  readonly autoPublicationDelayMs: number;
  /** Prepares, validates and publishes the complete V2 snapshot before changing its pointer. */
  publishNext: () => Promise<boolean>;
  decorateVersion: (version: ProductVersion) => ProductVersion;
  decorateScanner: (scanner: ScannerOutputWithMeta) => ScannerOutputWithMeta;
  getMarker: () => ProductReviewPublicationMarker | null;
  stop: () => void;
};

type ReviewScannerSnapshot = PersistableScannerOutput & { _source_meta?: ScannerSourceMeta };

export function createProductReviewPublication(options: ProductReviewPublicationOptions = {}): ProductReviewPublication {
  const now = options.now ?? (() => new Date());
  const reviewRootPath = options.reviewRootPath ?? process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT?.trim() ?? "";
  const outputRootPath = options.outputRootPath ?? (reviewRootPath ? resolve(reviewRootPath, "output") : "");
  const enabled = options.enabled ?? (process.env.CRYPTO_EDGE_PC1_REVIEW_MODE === "1" && Boolean(reviewRootPath));
  const autoPublicationDelayMs = options.autoPublicationDelayMs ?? configuredAutoPublicationDelay();
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  const markerPath = reviewRootPath ? resolve(reviewRootPath, REVIEW_PUBLICATION_MARKER_FILE) : null;
  const persistMarker = options.persistMarker ?? (async (marker: ProductReviewPublicationMarker) => {
    if (!markerPath || !reviewRootPath) throw new Error("PC1_REVIEW_ROOT_REQUIRED");
    await mkdir(reviewRootPath, { recursive: true });
    await writeAtomically(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
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

  let revision = 0;
  let marker: ProductReviewPublicationMarker | null = null;
  let activeVersion: ProductVersion | null = null;
  let publishedSnapshot: ScannerOutputWithMeta | null = null;
  let publishing: Promise<boolean> | null = null;
  let autoTimer: ReturnType<typeof setTimeout> | null = null;

  const publishNext = (): Promise<boolean> => {
    if (!enabled || marker || publishing || !options.loadBaseScanner || !options.loadBaseVersion || !outputRootPath) {
      return publishing ?? Promise.resolve(false);
    }
    const nextRevision = revision + 1;
    const loadBaseSnapshot = options.loadBaseSnapshot ?? createRawSnapshotLoader(options.loadBaseScanner, outputRootPath);
    publishing = prepareValidateAndPublish({
      nextRevision,
      publishedAt: now().toISOString(),
      outputRootPath,
      loadBaseSnapshot,
      loadBaseVersion: options.loadBaseVersion,
      validateSnapshot: options.validateSnapshot ?? validateCanonicalDisplaySnapshot,
      persistReviewPointer,
      persistMarker,
      holdActiveVersion: (version) => { activeVersion = version; },
    }).then((publication) => {
      if (!publication) return false;
      revision = nextRevision;
      marker = publication.marker;
      publishedSnapshot = publication.snapshot;
      return true;
    }).catch(() => false).finally(() => {
      publishing = null;
    });
    return publishing;
  };

  if (enabled) {
    autoTimer = setTimer(() => { void publishNext(); }, autoPublicationDelayMs);
    if (typeof autoTimer === "object" && autoTimer !== null && "unref" in autoTimer && typeof autoTimer.unref === "function") {
      autoTimer.unref();
    }
  }

  return {
    enabled,
    autoPublicationDelayMs,
    publishNext,
    decorateVersion: (version) => marker?.version ?? activeVersion ?? version,
    decorateScanner: (scanner) => publishedSnapshot ?? scanner,
    getMarker: () => marker,
    stop: () => {
      if (autoTimer) clearTimer(autoTimer);
      autoTimer = null;
    },
  };
}

async function prepareValidateAndPublish({
  nextRevision,
  publishedAt,
  outputRootPath,
  loadBaseSnapshot,
  loadBaseVersion,
  validateSnapshot,
  persistReviewPointer,
  persistMarker,
  holdActiveVersion,
}: {
  nextRevision: number;
  publishedAt: string;
  outputRootPath: string;
  loadBaseSnapshot: () => Promise<ScannerOutputWithMeta>;
  loadBaseVersion: () => Promise<ProductVersion>;
  validateSnapshot: (snapshot: ScannerOutputWithMeta) => void;
  persistReviewPointer: (version: ProductVersion) => Promise<void>;
  persistMarker: (marker: ProductReviewPublicationMarker) => Promise<void>;
  holdActiveVersion: (version: ProductVersion) => void;
}): Promise<{ marker: ProductReviewPublicationMarker; snapshot: ScannerOutputWithMeta } | null> {
  const [sourceSnapshot, sourceVersion] = await Promise.all([loadBaseSnapshot(), loadBaseVersion()]);
  const source = sourceSnapshot as unknown as ReviewScannerSnapshot;
  const sourceRunId = source.scan_run.run_id;
  if (!isSafeRunId(sourceRunId) || sourceVersion.scanner_run_id !== sourceRunId) return null;

  const reviewRunId = withReviewSuffix(sourceRunId, nextRevision);
  const snapshot = createReviewSnapshot(source, reviewRunId, publishedAt);
  validateSnapshot(snapshot as unknown as ScannerOutputWithMeta);

  const version: ProductVersion = {
    ...sourceVersion,
    scanner_run_id: reviewRunId,
    scanner_generated_at: publishedAt,
  };
  holdActiveVersion(sourceVersion);
  const marker: ProductReviewPublicationMarker = {
    schema_version: "pc1_review_publication_v1",
    review_version_id: `pc1-review-${nextRevision}`,
    generated_at: publishedAt,
    lifecycle_updated_at: version.lifecycle_updated_at,
    version,
    provider_calls: 0,
    openai_calls: 0,
    canonical_mutations: 0,
  };

  await persistSnapshot(outputRootPath, reviewRunId, snapshot);
  await persistMarker(marker);
  await persistReviewPointer(version);
  return { marker, snapshot: snapshot as unknown as ScannerOutputWithMeta };
}

function createRawSnapshotLoader(
  loadBaseScanner: (() => Promise<ScannerOutputWithMeta>) | undefined,
  outputRootPath: string,
): () => Promise<ScannerOutputWithMeta> {
  return async () => {
    if (!loadBaseScanner) throw new Error("PC1_REVIEW_BASE_SCANNER_REQUIRED");
    const scanner = await loadBaseScanner();
    const runId = scanner._source_meta?.selected_run_id;
    if (!isSafeRunId(runId)) throw new Error("PC1_REVIEW_BASE_RUN_ID_INVALID");
    return JSON.parse(await readFile(resolve(outputRootPath, runId, "full_output.json"), "utf8")) as ScannerOutputWithMeta;
  };
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
    _source_meta: isRecord(source._source_meta)
      ? {
        ...source._source_meta,
        selected_run_id: reviewRunId,
      }
      : source._source_meta,
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
