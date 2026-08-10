import type { ScannerOutputWithMeta } from "./latestScannerOutput.js";
import type { ProductVersion } from "./productVersion.js";

export type ProductReviewPublication = {
  readonly enabled: boolean;
  publishNext: () => void;
  decorateVersion: (version: ProductVersion) => ProductVersion;
  decorateScanner: (scanner: ScannerOutputWithMeta) => ScannerOutputWithMeta;
};

export function createProductReviewPublication(
  now: () => Date = () => new Date(),
  enabled = process.env.CRYPTO_EDGE_PC1_REVIEW_MODE === "1"
    && Boolean(process.env.CRYPTO_EDGE_PC1_REVIEW_ROOT?.trim()),
): ProductReviewPublication {
  let revision = 0;
  let publishedAt: string | null = null;

  const reviewRunId = (runId: string | null): string | null => {
    if (revision === 0 || !runId) return runId;
    const suffix = `-review-${revision}`;
    return `${runId.slice(0, Math.max(1, 128 - suffix.length))}${suffix}`;
  };

  return {
    enabled,
    publishNext: () => {
      if (!enabled) return;
      revision += 1;
      publishedAt = now().toISOString();
    },
    decorateVersion: (version) => revision === 0 ? version : {
      ...version,
      scanner_run_id: reviewRunId(version.scanner_run_id),
      scanner_generated_at: publishedAt ?? version.scanner_generated_at,
    },
    decorateScanner: (scanner) => {
      if (revision === 0 || !publishedAt || !isRecord(scanner.scan_run)) return scanner;
      const reviewRun = reviewRunId(typeof scanner.scan_run.run_id === "string" ? scanner.scan_run.run_id : null);
      if (!reviewRun) return scanner;
      return {
        ...scanner,
        scan_run: { ...scanner.scan_run, run_id: reviewRun, finished_at: publishedAt },
        ...(isRecord(scanner.provenance)
          ? { provenance: { ...scanner.provenance, run_id: reviewRun, generated_at: publishedAt, finished_at: publishedAt } }
          : {}),
        candidates: withReviewRun(scanner.candidates, reviewRun),
        security_checks: withReviewRun(scanner.security_checks, reviewRun),
        scorecards: withReviewRun(scanner.scorecards, reviewRun),
        _source_meta: isRecord(scanner._source_meta)
          ? { ...scanner._source_meta, selected_run_id: reviewRun }
          : scanner._source_meta,
      };
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
