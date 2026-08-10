import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ScannerOutputWithMeta } from "./latestScannerOutput.js";
import type { ProductVersion } from "./productVersion.js";

export const PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS = 60_000;
const REVIEW_PUBLICATION_MARKER_FILE = "pc1-review-publication.json";

export type ProductReviewPublicationMarker = {
  schema_version: "pc1_review_publication_v1";
  review_version_id: string;
  generated_at: string;
  lifecycle_updated_at: string;
  provider_calls: 0;
  openai_calls: 0;
  canonical_mutations: 0;
};

export type ProductReviewPublicationOptions = {
  now?: () => Date;
  enabled?: boolean;
  reviewRootPath?: string;
  autoPublicationDelayMs?: number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  persistMarker?: (marker: ProductReviewPublicationMarker) => Promise<void>;
};

export type ProductReviewPublication = {
  readonly enabled: boolean;
  readonly autoPublicationDelayMs: number;
  publishNext: () => Promise<boolean>;
  decorateVersion: (version: ProductVersion) => ProductVersion;
  decorateScanner: (scanner: ScannerOutputWithMeta) => ScannerOutputWithMeta;
  getMarker: () => ProductReviewPublicationMarker | null;
  stop: () => void;
};

export function createProductReviewPublication(options: ProductReviewPublicationOptions = {}): ProductReviewPublication {
  const now = options.now ?? (() => new Date());
  const reviewRootPath = options.reviewRootPath ?? process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT?.trim() ?? "";
  const enabled = options.enabled ?? (process.env.CRYPTO_EDGE_PC1_REVIEW_MODE === "1" && Boolean(reviewRootPath));
  const autoPublicationDelayMs = options.autoPublicationDelayMs ?? configuredAutoPublicationDelay();
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  const markerPath = reviewRootPath ? resolve(reviewRootPath, REVIEW_PUBLICATION_MARKER_FILE) : null;
  const persistMarker = options.persistMarker ?? (async (marker: ProductReviewPublicationMarker) => {
    if (!markerPath || !reviewRootPath) return;
    await mkdir(reviewRootPath, { recursive: true });
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  });

  let revision = 0;
  let marker: ProductReviewPublicationMarker | null = null;
  let publishing: Promise<boolean> | null = null;
  let autoTimer: ReturnType<typeof setTimeout> | null = null;

  const reviewRunId = (runId: string | null): string | null => {
    if (!marker || !runId) return runId;
    const suffix = `-review-${revision}`;
    return `${runId.slice(0, Math.max(1, 128 - suffix.length))}${suffix}`;
  };

  const publishNext = (): Promise<boolean> => {
    if (!enabled || marker) return Promise.resolve(false);
    if (publishing) return publishing;
    const nextRevision = revision + 1;
    const publishedAt = now().toISOString();
    const nextMarker: ProductReviewPublicationMarker = {
      schema_version: "pc1_review_publication_v1",
      review_version_id: `pc1-review-${nextRevision}`,
      generated_at: publishedAt,
      lifecycle_updated_at: publishedAt,
      provider_calls: 0,
      openai_calls: 0,
      canonical_mutations: 0,
    };
    publishing = persistMarker(nextMarker).then(() => {
      revision = nextRevision;
      marker = nextMarker;
      return true;
    }).finally(() => {
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
    decorateVersion: (version) => !marker ? version : {
      ...version,
      scanner_run_id: reviewRunId(version.scanner_run_id),
      scanner_generated_at: marker.generated_at,
      lifecycle_updated_at: marker.lifecycle_updated_at,
    },
    decorateScanner: (scanner) => {
      if (!marker || !isRecord(scanner.scan_run)) return scanner;
      const reviewRun = reviewRunId(typeof scanner.scan_run.run_id === "string" ? scanner.scan_run.run_id : null);
      if (!reviewRun) return scanner;
      return {
        ...scanner,
        scan_run: { ...scanner.scan_run, run_id: reviewRun, finished_at: marker.generated_at },
        ...(isRecord(scanner.provenance)
          ? { provenance: { ...scanner.provenance, run_id: reviewRun, generated_at: marker.generated_at, finished_at: marker.generated_at } }
          : {}),
        candidates: withReviewRun(scanner.candidates, reviewRun),
        security_checks: withReviewRun(scanner.security_checks, reviewRun),
        scorecards: withReviewRun(scanner.scorecards, reviewRun),
        _source_meta: isRecord(scanner._source_meta)
          ? { ...scanner._source_meta, selected_run_id: reviewRun }
          : scanner._source_meta,
      };
    },
    getMarker: () => marker,
    stop: () => {
      if (autoTimer) clearTimer(autoTimer);
      autoTimer = null;
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withReviewRun(value: unknown, reviewRun: string): unknown {
  return Array.isArray(value)
    ? value.map((entry) => isRecord(entry) ? { ...entry, run_id: reviewRun } : entry)
    : value;
}

function configuredAutoPublicationDelay(): number {
  const configured = Number.parseInt(process.env.CRYPTO_EDGE_PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS ?? "", 10);
  return Number.isFinite(configured) && configured >= 1_000
    ? configured
    : PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS;
}
