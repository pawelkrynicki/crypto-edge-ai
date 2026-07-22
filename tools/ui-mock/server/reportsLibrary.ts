import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeEstablishedAddress,
  normalizeEstablishedChain,
} from "../../data-poc/src/establishedAddressUniverse.js";
import type {
  ReportCandidate,
  ReportDefiSnapshot,
  ReportDetail,
  ReportListItem,
  ReportReviewNote,
  ReportSourceCoverage,
  ReportsLibraryStatus,
  ReportsListResponse,
} from "../src/types/reportTypes.js";

export const SUPPORTED_REPORT_VERSIONS = [1] as const;
export const DEFAULT_MAX_REPORT_BYTES = 1_000_000;
export const DEFAULT_MAX_REPORT_ARTIFACTS = 500;
export const MAX_PUBLIC_REPORTS = 100;

const DEFAULT_REPORTS_ROOT = fileURLToPath(new URL("../.local/reports", import.meta.url));
const REPORT_FILE_PATTERN = /^analyst-report-[A-Za-z0-9_-]+\.json$/;
const REPORT_ID_PATTERN = /^rpt_[a-f0-9]{40}$/;
const AUXILIARY_REPORT_FILE_PATTERN = /^analyst-report-[A-Za-z0-9_-]+\.md$/;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_TEXT_LENGTH = 4_000;
const MAX_SHORT_TEXT_LENGTH = 300;
const MAX_LIST_LENGTH = 100;
const MAX_OBJECT_KEYS = 200;
const MAX_STRUCTURE_DEPTH = 12;
const MAX_STRUCTURE_NODES = 10_000;
const REPORT_TITLE = "Crypto Edge AI Analyst Report";
const NOT_AVAILABLE = "not_available";

export type ReportsLibraryOptions = {
  reportsRootPath?: string;
  maxReportBytes?: number;
  maxArtifacts?: number;
  now?: Date;
};

export type ReportsLibraryIndex = {
  status: ReportsLibraryStatus;
  reports: ReportListItem[];
  detailsById: ReadonlyMap<string, ReportDetail>;
};

export async function readReportsLibraryStatus(
  options: ReportsLibraryOptions = {},
): Promise<ReportsLibraryStatus> {
  return (await buildReportsLibraryIndex(options)).status;
}

export async function readReportsList(
  options: ReportsLibraryOptions = {},
): Promise<ReportsListResponse> {
  return { reports: (await buildReportsLibraryIndex(options)).reports };
}

export async function readReportDetail(
  reportId: string,
  options: ReportsLibraryOptions = {},
): Promise<ReportDetail | null> {
  if (!isSafeReportId(reportId)) return null;
  return (await buildReportsLibraryIndex(options)).detailsById.get(reportId) ?? null;
}

export function isSafeReportId(value: string): boolean {
  return REPORT_ID_PATTERN.test(value);
}

export async function buildReportsLibraryIndex(
  options: ReportsLibraryOptions = {},
): Promise<ReportsLibraryIndex> {
  const lastIndexedAt = normalizeNow(options.now);
  const unavailable = (): ReportsLibraryIndex => ({
    status: {
      library_available: false,
      library_status: "NOT_READY",
      report_count: 0,
      valid_report_count: 0,
      skipped_report_count: 0,
      latest_report_generated_at: null,
      supported_report_versions: [...SUPPORTED_REPORT_VERSIONS],
      last_indexed_at: lastIndexedAt,
    },
    reports: [],
    detailsById: new Map(),
  });

  const configuredRoot = resolve(options.reportsRootPath ?? DEFAULT_REPORTS_ROOT);
  const rootStat = await stat(configuredRoot).catch(() => null);
  if (!rootStat?.isDirectory()) return unavailable();

  const reportsRoot = await realpath(configuredRoot).catch(() => null);
  if (!reportsRoot) return unavailable();

  const entries = await readdir(reportsRoot, { withFileTypes: true }).catch(() => null);
  if (!entries) return unavailable();

  const maxArtifacts = normalizeLimit(options.maxArtifacts, DEFAULT_MAX_REPORT_ARTIFACTS);
  const maxReportBytes = normalizeLimit(options.maxReportBytes, DEFAULT_MAX_REPORT_BYTES);
  const candidateEntries = entries
    .filter((entry) => entry.name !== ".gitkeep" && !AUXILIARY_REPORT_FILE_PATTERN.test(entry.name))
    .sort((left, right) => compareText(left.name, right.name));
  let skippedReportCount = Math.max(candidateEntries.length - maxArtifacts, 0);
  const indexedEntries = candidateEntries.slice(0, maxArtifacts);
  const valid: Array<{ summary: ReportListItem; detail: ReportDetail }> = [];

  for (const entry of indexedEntries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".json" || !REPORT_FILE_PATTERN.test(entry.name)) {
      skippedReportCount += 1;
      continue;
    }

    const reportPath = resolve(reportsRoot, entry.name);
    if (!isContainedPath(reportsRoot, reportPath)) {
      skippedReportCount += 1;
      continue;
    }

    const reportLstat = await lstat(reportPath).catch(() => null);
    if (!reportLstat?.isFile() || reportLstat.isSymbolicLink()) {
      skippedReportCount += 1;
      continue;
    }

    const canonicalReportPath = await realpath(reportPath).catch(() => null);
    if (!canonicalReportPath || !isContainedPath(reportsRoot, canonicalReportPath)) {
      skippedReportCount += 1;
      continue;
    }

    const reportStat = await stat(canonicalReportPath).catch(() => null);
    if (!reportStat?.isFile() || reportStat.size <= 0 || reportStat.size > maxReportBytes) {
      skippedReportCount += 1;
      continue;
    }

    const raw = await readFile(canonicalReportPath, "utf8").catch(() => null);
    if (raw === null || Buffer.byteLength(raw, "utf8") > maxReportBytes) {
      skippedReportCount += 1;
      continue;
    }

    const parsed = parseJson(raw);
    const reportId = buildReportId(entry.name);
    const detail = parsed === null ? null : validateAndMapReport(parsed, reportId);
    if (!detail) {
      skippedReportCount += 1;
      continue;
    }

    valid.push({ summary: toSummary(detail), detail });
  }

  valid.sort((left, right) => compareReports(left.summary, right.summary));
  const visible = valid.slice(0, MAX_PUBLIC_REPORTS);
  const reports = visible.map(({ summary }) => summary);
  const detailsById = new Map(visible.map(({ detail }) => [detail.report_id, detail]));
  const validReportCount = valid.length;
  const reportCount = validReportCount + skippedReportCount;
  const libraryStatus = skippedReportCount === 0
    ? "READY"
    : validReportCount > 0 ? "PARTIAL" : "NOT_READY";

  return {
    status: {
      library_available: true,
      library_status: libraryStatus,
      report_count: reportCount,
      valid_report_count: validReportCount,
      skipped_report_count: skippedReportCount,
      latest_report_generated_at: valid[0]?.summary.generated_at ?? null,
      supported_report_versions: [...SUPPORTED_REPORT_VERSIONS],
      last_indexed_at: lastIndexedAt,
    },
    reports,
    detailsById,
  };
}

function validateAndMapReport(value: unknown, reportId: string): ReportDetail | null {
  if (!isRecord(value) || hasUnsafeStructure(value)) return null;
  if (value.report_version !== 1) return null;

  const generatedAt = normalizeDate(value.generated_at);
  const candidatesCount = nonNegativeInteger(value.candidates_count);
  const reviewEntriesCount = nonNegativeInteger(value.review_entries_count);
  const scannerSource = boundedString(value.scanner_source, MAX_SHORT_TEXT_LENGTH);
  const contextSource = boundedString(value.context_source, MAX_SHORT_TEXT_LENGTH);
  const metadata = value.metadata;
  const scannerSummary = value.scanner_summary;
  const reviewSummary = value.review_summary;
  const marketContext = value.market_context_summary;
  const candidateSnapshot = value.candidate_snapshot;
  const compliance = value.compliance;

  if (
    !generatedAt
    || candidatesCount === null
    || reviewEntriesCount === null
    || scannerSource === null
    || contextSource === null
    || !isRecord(metadata)
    || !isRecord(scannerSummary)
    || !isRecord(reviewSummary)
    || !isRecord(marketContext)
    || !isRecord(candidateSnapshot)
    || !isRecord(compliance)
  ) return null;

  if (!hasRequiredCompliance(compliance)) return null;
  const scannerRunId = optionalAvailableString(metadata.scanner_run_id, MAX_SHORT_TEXT_LENGTH);
  const scanRun = scannerSummary.scan_run;
  if (!isRecord(scanRun)) return null;
  const scannerFinishedAt = normalizeOptionalDate(scanRun.finished_at);
  const contextGeneratedAt = normalizeOptionalDate(marketContext.generated_at);
  const contextLoadedAt = normalizeOptionalDate(marketContext.loaded_at);
  if (scannerFinishedAt === undefined || contextGeneratedAt === undefined || contextLoadedAt === undefined) return null;

  const securityChecked = nonNegativeInteger(scanRun.security_checked);
  const securityPassed = nonNegativeInteger(scanRun.security_passed);
  const bySecurityLabel = countMap(scannerSummary.by_security_label);
  const byFinalLabel = countMap(scannerSummary.by_final_label);
  if (securityChecked === null || securityPassed === null || bySecurityLabel === null || byFinalLabel === null) return null;

  const candidates = mapCandidates(candidateSnapshot.candidates);
  const reviewNotes = mapReviewNotes(reviewSummary.entries);
  const sourceCoverage = mapSourceCoverage(marketContext.sources);
  const defiSnapshots = mapDefiSnapshots(marketContext.defi_snapshots);
  if (!candidates || !reviewNotes || !sourceCoverage || !defiSnapshots) return null;

  const fearGreed = isRecord(marketContext.fear_greed) ? marketContext.fear_greed : null;
  if (!fearGreed) return null;
  const fearGreedValue = optionalNumber(fearGreed.value);
  const fearGreedClassification = optionalAvailableString(fearGreed.value_classification, MAX_SHORT_TEXT_LENGTH);
  if (fearGreedValue === undefined || fearGreedClassification === undefined) return null;

  const manualVerificationRequirements = candidates.filter((candidate) => (
    candidate.final_label === "WATCHLIST" || candidate.final_label === "NEEDS_MANUAL_VERIFICATION"
  ));
  const riskFlags = byFinalLabel.filter(({ label }) => (
    label === "CRITICAL_RISK" || label === "NEEDS_MANUAL_VERIFICATION" || label === "REJECT"
  ));
  const summary: ReportListItem = {
    report_id: reportId,
    report_version: 1,
    title: REPORT_TITLE,
    generated_at: generatedAt,
    ...(scannerRunId ? { scanner_run_id: scannerRunId } : {}),
    report_format: "json",
    detail_available: true,
    validation_status: "VALID",
  };

  return {
    ...summary,
    research_summary: {
      candidates_count: candidatesCount,
      review_entries_count: reviewEntriesCount,
      scanner_source: scannerSource,
      context_source: contextSource,
    },
    source_freshness: {
      scanner_finished_at: scannerFinishedAt,
      context_generated_at: contextGeneratedAt,
      context_loaded_at: contextLoadedAt,
    },
    source_coverage: sourceCoverage,
    market_context: {
      fear_greed_value: fearGreedValue,
      fear_greed_classification: fearGreedClassification,
      defi_snapshots: defiSnapshots,
    },
    security_observations: {
      by_security_label: bySecurityLabel,
      security_checked: securityChecked,
      security_passed: securityPassed,
    },
    risk_flags: riskFlags,
    manual_verification_requirements: manualVerificationRequirements,
    candidates,
    review_notes: reviewNotes,
    open_questions: [],
    next_review_step: null,
    missing_sections: ["open_questions", "next_review_step", "contract_address"],
  };
}

function mapCandidates(value: unknown): ReportCandidate[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST_LENGTH) return null;
  const candidates: ReportCandidate[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const candidateId = boundedString(item.candidate_id, MAX_SHORT_TEXT_LENGTH);
    const symbol = boundedString(item.symbol, MAX_SHORT_TEXT_LENGTH);
    const name = boundedString(item.name, MAX_SHORT_TEXT_LENGTH);
    const chain = boundedString(item.chain, MAX_SHORT_TEXT_LENGTH);
    const finalLabel = boundedString(item.final_label, MAX_SHORT_TEXT_LENGTH);
    const securityLabel = boundedString(item.security_label, MAX_SHORT_TEXT_LENGTH);
    const reason = boundedString(item.reason, MAX_TEXT_LENGTH);
    if (candidateId === null || symbol === null || name === null || chain === null || finalLabel === null || securityLabel === null || reason === null) return null;
    if (chain !== NOT_AVAILABLE && !isValidChain(chain)) return null;
    candidates.push({
      candidate_id: candidateId!,
      symbol: symbol!,
      name: name!,
      chain: chain!,
      final_label: finalLabel!,
      security_label: securityLabel!,
      reason: reason!,
    });
  }
  return candidates;
}

function mapReviewNotes(value: unknown): ReportReviewNote[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST_LENGTH) return null;
  const notes: ReportReviewNote[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const candidateId = boundedString(item.candidate_id, MAX_SHORT_TEXT_LENGTH);
    const symbol = boundedString(item.symbol, MAX_SHORT_TEXT_LENGTH);
    const name = boundedString(item.name, MAX_SHORT_TEXT_LENGTH);
    const finalLabel = boundedString(item.final_label, MAX_SHORT_TEXT_LENGTH);
    const reviewStatus = boundedString(item.status, MAX_SHORT_TEXT_LENGTH);
    const note = boundedString(item.note, MAX_TEXT_LENGTH);
    const updatedAt = normalizeDate(item.updated_at);
    if (!candidateId || symbol === null || name === null || finalLabel === null || !reviewStatus || note === null || !updatedAt) return null;
    if (typeof item.matched_current_scan !== "boolean") return null;
    notes.push({
      candidate_id: candidateId,
      symbol,
      name,
      final_label: finalLabel,
      review_status: reviewStatus,
      note,
      updated_at: updatedAt,
      matched_current_scan: item.matched_current_scan,
    });
  }
  return notes;
}

function mapSourceCoverage(value: unknown): ReportSourceCoverage[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST_LENGTH) return null;
  const sources: ReportSourceCoverage[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const sourceId = boundedString(item.source_id, MAX_SHORT_TEXT_LENGTH);
    const sourceName = boundedString(item.source_name, MAX_SHORT_TEXT_LENGTH);
    const mode = boundedString(item.mode, MAX_SHORT_TEXT_LENGTH);
    const fetchedAt = normalizeDate(item.fetched_at);
    const category = boundedString(item.data_category, MAX_SHORT_TEXT_LENGTH);
    const recordsCount = nonNegativeInteger(item.records_count);
    const warningsCount = nonNegativeInteger(item.warnings_count);
    const errorsCount = nonNegativeInteger(item.errors_count);
    if (!sourceId || !sourceName || !mode || !fetchedAt || !category || recordsCount === null || warningsCount === null || errorsCount === null) return null;
    sources.push({
      source_id: sourceId,
      source_name: sourceName,
      mode,
      fetched_at: fetchedAt,
      data_category: category,
      records_count: recordsCount,
      warnings_count: warningsCount,
      errors_count: errorsCount,
    });
  }
  return sources;
}

function mapDefiSnapshots(value: unknown): ReportDefiSnapshot[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST_LENGTH) return null;
  const snapshots: ReportDefiSnapshot[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const name = boundedString(item.name, MAX_SHORT_TEXT_LENGTH);
    const chain = boundedString(item.chain, MAX_SHORT_TEXT_LENGTH);
    const sourceName = boundedString(item.source_name, MAX_SHORT_TEXT_LENGTH);
    const tvlUsd = optionalNumber(item.tvl_usd);
    const change1d = optionalNumber(item.change_1d);
    const change7d = optionalNumber(item.change_7d);
    if (!name || chain === null || !sourceName || tvlUsd === undefined || change1d === undefined || change7d === undefined) return null;
    if (chain !== NOT_AVAILABLE && !isValidChain(chain)) return null;
    snapshots.push({ name, chain, source_name: sourceName, tvl_usd: tvlUsd, change_1d: change1d, change_7d: change7d });
  }
  return snapshots;
}

function hasRequiredCompliance(value: Record<string, unknown>): boolean {
  return ["local_research_workflow", "research_only", "buy_sell_signal", "review_status_scope"]
    .every((key) => boundedString(value[key], MAX_TEXT_LENGTH) !== null);
}

function countMap(value: unknown): Array<{ label: string; count: number }> | null {
  if (!isRecord(value) || Object.keys(value).length > MAX_LIST_LENGTH) return null;
  const counts: Array<{ label: string; count: number }> = [];
  for (const [labelValue, countValue] of Object.entries(value)) {
    const label = boundedString(labelValue, MAX_SHORT_TEXT_LENGTH);
    const count = nonNegativeInteger(countValue);
    if (!label || count === null) return null;
    counts.push({ label, count });
  }
  return counts.sort((left, right) => compareText(left.label, right.label));
}

function hasUnsafeStructure(value: unknown): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > MAX_STRUCTURE_NODES || current.depth > MAX_STRUCTURE_DEPTH) return true;
    if (typeof current.value === "string" && (current.value.length > MAX_TEXT_LENGTH || current.value.includes("\0"))) return true;
    if (Array.isArray(current.value)) {
      if (current.value.length > MAX_LIST_LENGTH) return true;
      for (const item of current.value) stack.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    if (!isRecord(current.value)) continue;
    const entries = Object.entries(current.value);
    if (entries.length > MAX_OBJECT_KEYS) return true;
    for (const [key, item] of entries) {
      if (DANGEROUS_KEYS.has(key) || key.length > MAX_SHORT_TEXT_LENGTH) return true;
      stack.push({ value: item, depth: current.depth + 1 });
    }
  }
  return false;
}

function buildReportId(relativeIdentity: string): string {
  const digest = createHash("sha256")
    .update(`crypto-edge-ai-report-v1:${relativeIdentity.toLowerCase()}`, "utf8")
    .digest("hex")
    .slice(0, 40);
  return `rpt_${digest}`;
}

function toSummary(detail: ReportDetail): ReportListItem {
  const {
    research_summary: _researchSummary,
    source_freshness: _sourceFreshness,
    source_coverage: _sourceCoverage,
    market_context: _marketContext,
    security_observations: _securityObservations,
    risk_flags: _riskFlags,
    manual_verification_requirements: _manualVerificationRequirements,
    candidates: _candidates,
    review_notes: _reviewNotes,
    open_questions: _openQuestions,
    next_review_step: _nextReviewStep,
    missing_sections: _missingSections,
    ...summary
  } = detail;
  return summary;
}

function compareReports(left: ReportListItem, right: ReportListItem): number {
  return compareText(right.generated_at, left.generated_at) || compareText(left.report_id, right.report_id);
}

function isContainedPath(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath));
  return relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function isValidChain(value: string): boolean {
  try {
    normalizeEstablishedChain(value);
    return true;
  } catch {
    return false;
  }
}

export function normalizeReportContractAddress(chain: string, value: string): string | null {
  try {
    return normalizeEstablishedAddress(normalizeEstablishedChain(chain), value);
  } catch {
    return null;
  }
}

function normalizeNow(now: Date | undefined): string {
  const selected = now ?? new Date();
  return Number.isFinite(selected.getTime()) ? selected.toISOString() : new Date(0).toISOString();
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) return null;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function normalizeOptionalDate(value: unknown): string | null | undefined {
  if (value === NOT_AVAILABLE) return null;
  const normalized = normalizeDate(value);
  return normalized ?? undefined;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || value.length > maxLength || /\0/.test(value)) return null;
  const normalized = value.replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return normalized.length > 0 ? normalized : null;
}

function optionalAvailableString(value: unknown, maxLength: number): string | null | undefined {
  if (value === NOT_AVAILABLE || value === null || value === undefined) return null;
  return boundedString(value, maxLength) ?? undefined;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === NOT_AVAILABLE || value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isSafeInteger(value) || value <= 0) return fallback;
  return value;
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
