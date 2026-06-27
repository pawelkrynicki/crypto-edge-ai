import type {
  DefiContextRecord,
  FearGreedIndexRecord,
  MarketContextApiOutput,
  NormalizedContextRecord,
} from "../types/contextTypes";
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_OPTIONS,
  type AnalystReviewStatus,
  type CandidateReviewRecord,
  type ReviewSessionState,
} from "../types/reviewSessionTypes";
import type {
  PersistableScannerOutput,
  ScannerSourceMeta,
  UiTokenCandidate,
} from "../types/scannerTypes";

const REPORT_VERSION = 1;
const DEFAULT_CANDIDATE_SNAPSHOT_LIMIT = 25;
const NOT_AVAILABLE = "not_available";

export type AnalystReportReviewSourceMeta = {
  source_kind: string;
  storage_file: string;
  loaded_at?: string;
  warning?: string;
} | null;

export type AnalystReportReviewDiagnostics = {
  source_kind: string;
  storage_file: string;
  checked_at: string;
  file_exists: boolean;
  file_size_bytes: number | null;
  entries_count: number;
  valid: boolean;
  warning?: string;
} | null;

export type AnalystReportInput = {
  generatedAt: string;
  scannerOutput: PersistableScannerOutput;
  uiCandidates: UiTokenCandidate[];
  scannerSourceMeta?: ScannerSourceMeta | null;
  contextOutput: MarketContextApiOutput;
  reviewSession: ReviewSessionState;
  reviewSourceMeta?: AnalystReportReviewSourceMeta;
  reviewDiagnostics?: AnalystReportReviewDiagnostics;
  candidateSnapshotLimit?: number;
};

export type AnalystReportCandidateSnapshot = {
  candidate_id: string;
  symbol: string;
  name: string;
  chain: string;
  final_label: string;
  security_label: string;
  reason: string;
};

export type AnalystReportReviewEntry = {
  candidate_id: string;
  symbol: string;
  name: string;
  final_label: string;
  status: AnalystReviewStatus;
  note: string;
  updated_at: string;
  matched_current_scan: boolean;
};

export type AnalystReportStoredReview = {
  candidate_id: string;
  status: AnalystReviewStatus;
  note: string;
  updated_at: string;
};

export type AnalystReportData = {
  report_version: 1;
  generated_at: string;
  candidates_count: number;
  review_entries_count: number;
  scanner_source: string;
  context_source: string;
  metadata: {
    scanner_source: string;
    scanner_source_path: string;
    scanner_run_id: string;
    scanner_loaded_at: string;
    context_source: string;
    context_run_id: string;
    context_generated_at: string;
    context_loaded_at: string;
    context_output_file: string;
    review_storage_source: string;
    review_storage_file: string;
    review_loaded_at: string;
    review_diagnostics_checked_at: string;
  };
  scanner_summary: {
    candidates_count: number;
    by_final_label: Record<string, number>;
    by_security_label: Record<string, number>;
    watchlist_count: number;
    reject_count: number;
    critical_risk_count: number;
    needs_manual_verification_count: number;
    scan_run: {
      run_id: string;
      source: string;
      mode: string;
      finished_at: string;
      total_raw: number;
      passed_basic_filter: number;
      rejected_basic_filter: number;
      security_checked: number;
      security_passed: number;
      watchlist_candidates: number;
    };
  };
  review_summary: {
    review_entries_count: number;
    by_status: Record<AnalystReviewStatus, number>;
    entries: AnalystReportReviewEntry[];
    stored_reviews_not_in_current_scan: AnalystReportStoredReview[];
    diagnostics: AnalystReportReviewDiagnostics;
  };
  market_context_summary: {
    source_kind: string;
    run_id: string;
    generated_at: string;
    loaded_at: string;
    environment: string;
    summary: MarketContextApiOutput["summary"];
    fear_greed: {
      value: number | typeof NOT_AVAILABLE;
      value_classification: string;
      timestamp: string;
      source_name: string;
    };
    defi_snapshots: Array<{
      name: string;
      chain: string;
      tvl_usd: number | typeof NOT_AVAILABLE;
      change_1d: number | typeof NOT_AVAILABLE;
      change_7d: number | typeof NOT_AVAILABLE;
      source_name: string;
    }>;
    defi_snapshots_omitted_count: number;
    sources: Array<{
      source_id: string;
      source_name: string;
      mode: string;
      fetched_at: string;
      data_category: string;
      records_count: number;
      warnings_count: number;
      errors_count: number;
    }>;
  };
  candidate_snapshot: {
    limit: number;
    truncated: boolean;
    omitted_count: number;
    candidates: AnalystReportCandidateSnapshot[];
  };
  compliance: {
    local_research_workflow: string;
    research_only: string;
    buy_sell_signal: string;
    review_status_scope: string;
  };
};

export function buildAnalystReportData(input: AnalystReportInput): AnalystReportData {
  const limit = normalizeSnapshotLimit(input.candidateSnapshotLimit);
  const candidatesById = new Map(input.uiCandidates.map((candidate) => [candidate.id, candidate]));
  const reviewEntries = buildReviewEntries(input.reviewSession, candidatesById);
  const storedReviewsNotInCurrentScan = reviewEntries
    .filter((entry) => !entry.matched_current_scan)
    .map(({ candidate_id, status, note, updated_at }) => ({
      candidate_id,
      status,
      note,
      updated_at,
    }));
  const scannerSource = input.scannerSourceMeta?.source ?? NOT_AVAILABLE;
  const contextSource = input.contextOutput._source_meta.source_kind;
  const candidateSnapshotSource = [...input.uiCandidates].sort(compareCandidatesForSnapshot);
  const candidateSnapshot = candidateSnapshotSource.slice(0, limit).map(toCandidateSnapshot);
  const reviewStorageSource = input.reviewSourceMeta?.source_kind
    ?? input.reviewDiagnostics?.source_kind
    ?? NOT_AVAILABLE;

  return {
    report_version: REPORT_VERSION,
    generated_at: input.generatedAt,
    candidates_count: input.uiCandidates.length,
    review_entries_count: reviewEntries.length,
    scanner_source: scannerSource,
    context_source: contextSource,
    metadata: {
      scanner_source: scannerSource,
      scanner_source_path: input.scannerSourceMeta?.path ?? NOT_AVAILABLE,
      scanner_run_id: input.scannerSourceMeta?.selected_run_id
        ?? input.scannerOutput.scan_run.run_id
        ?? NOT_AVAILABLE,
      scanner_loaded_at: input.scannerSourceMeta?.loaded_at ?? NOT_AVAILABLE,
      context_source: contextSource,
      context_run_id: input.contextOutput.run_id ?? NOT_AVAILABLE,
      context_generated_at: input.contextOutput.generated_at ?? NOT_AVAILABLE,
      context_loaded_at: input.contextOutput._source_meta.loaded_at ?? NOT_AVAILABLE,
      context_output_file: input.contextOutput._source_meta.output_file ?? NOT_AVAILABLE,
      review_storage_source: reviewStorageSource,
      review_storage_file: input.reviewSourceMeta?.storage_file
        ?? input.reviewDiagnostics?.storage_file
        ?? NOT_AVAILABLE,
      review_loaded_at: input.reviewSourceMeta?.loaded_at ?? NOT_AVAILABLE,
      review_diagnostics_checked_at: input.reviewDiagnostics?.checked_at ?? NOT_AVAILABLE,
    },
    scanner_summary: {
      candidates_count: input.uiCandidates.length,
      by_final_label: countBy(input.uiCandidates, (candidate) => candidate.finalLabel),
      by_security_label: countBy(input.uiCandidates, (candidate) => candidate.securityLabel),
      watchlist_count: countWhere(input.uiCandidates, (candidate) => candidate.finalLabel === "WATCHLIST"),
      reject_count: countWhere(input.uiCandidates, (candidate) => candidate.finalLabel === "REJECT"),
      critical_risk_count: countWhere(input.uiCandidates, (candidate) => candidate.finalLabel === "CRITICAL_RISK"),
      needs_manual_verification_count: countWhere(
        input.uiCandidates,
        (candidate) => candidate.finalLabel === "NEEDS_MANUAL_VERIFICATION",
      ),
      scan_run: {
        run_id: input.scannerOutput.scan_run.run_id,
        source: input.scannerOutput.scan_run.source,
        mode: input.scannerOutput.scan_run.mode,
        finished_at: input.scannerOutput.scan_run.finished_at,
        total_raw: input.scannerOutput.scan_run.total_raw,
        passed_basic_filter: input.scannerOutput.scan_run.passed_basic_filter,
        rejected_basic_filter: input.scannerOutput.scan_run.rejected_basic_filter,
        security_checked: input.scannerOutput.scan_run.security_checked,
        security_passed: input.scannerOutput.scan_run.security_passed,
        watchlist_candidates: input.scannerOutput.scan_run.watchlist_candidates,
      },
    },
    review_summary: {
      review_entries_count: reviewEntries.length,
      by_status: countReviewStatuses(reviewEntries),
      entries: reviewEntries,
      stored_reviews_not_in_current_scan: storedReviewsNotInCurrentScan,
      diagnostics: input.reviewDiagnostics ?? null,
    },
    market_context_summary: buildMarketContextSummary(input.contextOutput),
    candidate_snapshot: {
      limit,
      truncated: candidateSnapshotSource.length > limit,
      omitted_count: Math.max(candidateSnapshotSource.length - limit, 0),
      candidates: candidateSnapshot,
    },
    compliance: {
      local_research_workflow: "This report is a local analyst research workflow export.",
      research_only: "It is not investment advice or a recommendation.",
      buy_sell_signal: "This is not a buy/sell signal.",
      review_status_scope: "Review status does not change scanner label, scoring, final_label, or WATCHLIST meaning.",
    },
  };
}

export function renderAnalystReportMarkdown(report: AnalystReportData): string {
  const lines = [
    "# Crypto Edge AI Analyst Report",
    "",
    `Generated at: ${report.generated_at}`,
    `Report version: ${report.report_version}`,
    "",
    "## Compliance",
    "",
    `- ${report.compliance.local_research_workflow}`,
    `- ${report.compliance.research_only}`,
    `- ${report.compliance.buy_sell_signal}`,
    `- ${report.compliance.review_status_scope}`,
    "",
    "## Metadata",
    "",
    markdownTable(
      ["Field", "Value"],
      [
        ["Scanner source", report.metadata.scanner_source],
        ["Scanner source path", report.metadata.scanner_source_path],
        ["Scanner run id", report.metadata.scanner_run_id],
        ["Scanner loaded at", report.metadata.scanner_loaded_at],
        ["Context source", report.metadata.context_source],
        ["Context run id", report.metadata.context_run_id],
        ["Context generated at", report.metadata.context_generated_at],
        ["Context loaded at", report.metadata.context_loaded_at],
        ["Context output file", report.metadata.context_output_file],
        ["Review storage source", report.metadata.review_storage_source],
        ["Review storage file", report.metadata.review_storage_file],
        ["Review loaded at", report.metadata.review_loaded_at],
        ["Review diagnostics checked at", report.metadata.review_diagnostics_checked_at],
      ],
    ),
    "",
    "## Scanner Summary",
    "",
    markdownTable(
      ["Metric", "Value"],
      [
        ["Candidates", String(report.scanner_summary.candidates_count)],
        ["WATCHLIST", String(report.scanner_summary.watchlist_count)],
        ["REJECT", String(report.scanner_summary.reject_count)],
        ["CRITICAL_RISK", String(report.scanner_summary.critical_risk_count)],
        ["NEEDS_MANUAL_VERIFICATION", String(report.scanner_summary.needs_manual_verification_count)],
        ["Scan run source", report.scanner_summary.scan_run.source],
        ["Scan run mode", report.scanner_summary.scan_run.mode],
        ["Scan run finished at", report.scanner_summary.scan_run.finished_at],
        ["Total raw", String(report.scanner_summary.scan_run.total_raw)],
        ["Passed basic filter", String(report.scanner_summary.scan_run.passed_basic_filter)],
        ["Rejected basic filter", String(report.scanner_summary.scan_run.rejected_basic_filter)],
        ["Security checked", String(report.scanner_summary.scan_run.security_checked)],
        ["Security passed", String(report.scanner_summary.scan_run.security_passed)],
      ],
    ),
    "",
    "### Candidates By final_label",
    "",
    renderCountMap(report.scanner_summary.by_final_label),
    "",
    "### Candidates By securityLabel",
    "",
    renderCountMap(report.scanner_summary.by_security_label),
    "",
    "## Review Summary",
    "",
    markdownTable(
      ["Metric", "Value"],
      [
        ["Review entries", String(report.review_summary.review_entries_count)],
        ["Diagnostics valid", report.review_summary.diagnostics ? String(report.review_summary.diagnostics.valid) : NOT_AVAILABLE],
        ["Diagnostics file exists", report.review_summary.diagnostics ? String(report.review_summary.diagnostics.file_exists) : NOT_AVAILABLE],
      ],
    ),
    "",
    "### Review Status Counts",
    "",
    markdownTable(
      ["Status", "Count"],
      REVIEW_STATUS_OPTIONS.map((status) => [
        REVIEW_STATUS_LABELS[status],
        String(report.review_summary.by_status[status] ?? 0),
      ]),
    ),
    "",
    "### Review Entries",
    "",
    renderReviewEntries(report.review_summary.entries),
    "",
    "### Stored Reviews Not In Current Scan",
    "",
    renderStoredReviews(report.review_summary.stored_reviews_not_in_current_scan),
    "",
    "## Market Context Summary",
    "",
    markdownTable(
      ["Field", "Value"],
      [
        ["Source kind", report.market_context_summary.source_kind],
        ["Run id", report.market_context_summary.run_id],
        ["Generated at", report.market_context_summary.generated_at],
        ["Loaded at", report.market_context_summary.loaded_at],
        ["Environment", report.market_context_summary.environment],
        ["Sources requested", String(report.market_context_summary.summary.sources_requested)],
        ["Sources allowed", String(report.market_context_summary.summary.sources_allowed)],
        ["Sources denied", String(report.market_context_summary.summary.sources_denied)],
        ["Records total", String(report.market_context_summary.summary.records_total)],
        ["Warnings total", String(report.market_context_summary.summary.warnings_total)],
        ["Errors total", String(report.market_context_summary.summary.errors_total)],
        ["Fear & Greed value", String(report.market_context_summary.fear_greed.value)],
        ["Fear & Greed classification", report.market_context_summary.fear_greed.value_classification],
        ["Fear & Greed timestamp", report.market_context_summary.fear_greed.timestamp],
      ],
    ),
    "",
    "### Context Sources",
    "",
    markdownTable(
      ["Source", "Mode", "Fetched at", "Category", "Records", "Warnings", "Errors"],
      report.market_context_summary.sources.map((source) => [
        source.source_name,
        source.mode,
        source.fetched_at,
        source.data_category,
        String(source.records_count),
        String(source.warnings_count),
        String(source.errors_count),
      ]),
    ),
    "",
    "### DeFi Context Snapshots",
    "",
    renderDefiSnapshots(report.market_context_summary.defi_snapshots),
    report.market_context_summary.defi_snapshots_omitted_count > 0
      ? `_${report.market_context_summary.defi_snapshots_omitted_count} context rows omitted._`
      : "",
    "",
    "## Candidate Snapshot",
    "",
    renderCandidateSnapshot(report.candidate_snapshot.candidates),
    report.candidate_snapshot.truncated
      ? `_${report.candidate_snapshot.omitted_count} candidates omitted from this snapshot limit (${report.candidate_snapshot.limit})._`
      : "",
    "",
  ];

  return `${lines.filter((line, index, allLines) => {
    if (line !== "") return true;
    return allLines[index - 1] !== "";
  }).join("\n")}\n`;
}

function buildReviewEntries(
  reviewSession: ReviewSessionState,
  candidatesById: Map<string, UiTokenCandidate>,
): AnalystReportReviewEntry[] {
  return Object.values(reviewSession.entries)
    .map((record) => toReviewEntry(record, candidatesById.get(record.candidate_id)))
    .sort((a, b) => compareText(a.updated_at, b.updated_at) || compareText(a.candidate_id, b.candidate_id));
}

function toReviewEntry(
  record: CandidateReviewRecord,
  candidate: UiTokenCandidate | undefined,
): AnalystReportReviewEntry {
  return {
    candidate_id: record.candidate_id,
    symbol: candidate?.symbol ?? NOT_AVAILABLE,
    name: candidate?.name ?? NOT_AVAILABLE,
    final_label: candidate?.finalLabel ?? NOT_AVAILABLE,
    status: record.status,
    note: record.note || NOT_AVAILABLE,
    updated_at: record.updated_at,
    matched_current_scan: Boolean(candidate),
  };
}

function countReviewStatuses(entries: AnalystReportReviewEntry[]): Record<AnalystReviewStatus, number> {
  const counts = Object.fromEntries(
    REVIEW_STATUS_OPTIONS.map((status) => [status, 0]),
  ) as Record<AnalystReviewStatus, number>;

  for (const entry of entries) {
    counts[entry.status] += 1;
  }

  return counts;
}

function buildMarketContextSummary(
  contextOutput: MarketContextApiOutput,
): AnalystReportData["market_context_summary"] {
  const fearGreed = contextOutput.sources.flatMap((source) => (
    source.records
      .filter(isFearGreedRecord)
      .map((record) => ({
        ...record,
        source_name: source.source_name,
      }))
  ))[0];
  const defiRecords = contextOutput.sources.flatMap((source) => (
    source.records
      .filter(isDefiContextRecord)
      .map((record) => ({
        ...record,
        source_name: source.source_name,
      }))
  ));
  const defiLimit = 5;

  return {
    source_kind: contextOutput._source_meta.source_kind,
    run_id: contextOutput.run_id ?? NOT_AVAILABLE,
    generated_at: contextOutput.generated_at ?? NOT_AVAILABLE,
    loaded_at: contextOutput._source_meta.loaded_at ?? NOT_AVAILABLE,
    environment: contextOutput.environment ?? NOT_AVAILABLE,
    summary: contextOutput.summary,
    fear_greed: {
      value: fearGreed?.value ?? NOT_AVAILABLE,
      value_classification: fearGreed?.value_classification ?? NOT_AVAILABLE,
      timestamp: fearGreed?.timestamp ?? NOT_AVAILABLE,
      source_name: fearGreed?.source_name ?? NOT_AVAILABLE,
    },
    defi_snapshots: defiRecords.slice(0, defiLimit).map((record) => ({
      name: record.name,
      chain: record.chain ?? NOT_AVAILABLE,
      tvl_usd: record.tvl_usd ?? NOT_AVAILABLE,
      change_1d: record.change_1d ?? NOT_AVAILABLE,
      change_7d: record.change_7d ?? NOT_AVAILABLE,
      source_name: record.source_name,
    })),
    defi_snapshots_omitted_count: Math.max(defiRecords.length - defiLimit, 0),
    sources: contextOutput.sources.map((source) => ({
      source_id: source.source_id,
      source_name: source.source_name,
      mode: source.mode,
      fetched_at: source.fetched_at,
      data_category: source.data_category,
      records_count: source.records.length,
      warnings_count: source.warnings.length,
      errors_count: source.errors.length,
    })),
  };
}

function toCandidateSnapshot(candidate: UiTokenCandidate): AnalystReportCandidateSnapshot {
  return {
    candidate_id: candidate.id,
    symbol: candidate.symbol || NOT_AVAILABLE,
    name: candidate.name || NOT_AVAILABLE,
    chain: candidate.chain || NOT_AVAILABLE,
    final_label: candidate.finalLabel,
    security_label: candidate.securityLabel || NOT_AVAILABLE,
    reason: candidate.mainReason || NOT_AVAILABLE,
  };
}

function normalizeSnapshotLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_CANDIDATE_SNAPSHOT_LIMIT;
  return Math.max(1, Math.floor(value));
}

function countBy<T>(items: T[], getKey: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const item of items) {
    const key = getKey(item) || NOT_AVAILABLE;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => compareText(left, right)));
}

function countWhere<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

function compareCandidatesForSnapshot(a: UiTokenCandidate, b: UiTokenCandidate): number {
  return compareText(a.finalLabel, b.finalLabel)
    || compareText(a.symbol, b.symbol)
    || compareText(a.id, b.id);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

function isFearGreedRecord(record: NormalizedContextRecord): record is FearGreedIndexRecord {
  return record.record_type === "fear_greed_index";
}

function isDefiContextRecord(record: NormalizedContextRecord): record is DefiContextRecord {
  return record.record_type === "defi_protocol_snapshot" || record.record_type === "chain_tvl_snapshot";
}

function renderCountMap(counts: Record<string, number>): string {
  const rows = Object.entries(counts).map(([label, count]) => [label, String(count)]);
  return rows.length > 0 ? markdownTable(["Label", "Count"], rows) : "_none_";
}

function renderReviewEntries(entries: AnalystReportReviewEntry[]): string {
  if (entries.length === 0) return "_none_";

  return markdownTable(
    ["candidate_id", "Symbol", "Name", "final_label", "Review status", "Note", "updated_at", "Current scan"],
    entries.map((entry) => [
      entry.candidate_id,
      entry.symbol,
      entry.name,
      entry.final_label,
      REVIEW_STATUS_LABELS[entry.status],
      entry.note,
      entry.updated_at,
      entry.matched_current_scan ? "yes" : "no",
    ]),
  );
}

function renderStoredReviews(entries: AnalystReportStoredReview[]): string {
  if (entries.length === 0) return "_none_";

  return markdownTable(
    ["candidate_id", "Review status", "Note", "updated_at"],
    entries.map((entry) => [
      entry.candidate_id,
      REVIEW_STATUS_LABELS[entry.status],
      entry.note,
      entry.updated_at,
    ]),
  );
}

function renderDefiSnapshots(snapshots: AnalystReportData["market_context_summary"]["defi_snapshots"]): string {
  if (snapshots.length === 0) return "_none_";

  return markdownTable(
    ["Name", "Chain", "TVL USD", "1d", "7d", "Source"],
    snapshots.map((snapshot) => [
      snapshot.name,
      snapshot.chain,
      String(snapshot.tvl_usd),
      String(snapshot.change_1d),
      String(snapshot.change_7d),
      snapshot.source_name,
    ]),
  );
}

function renderCandidateSnapshot(candidates: AnalystReportCandidateSnapshot[]): string {
  if (candidates.length === 0) return "_none_";

  return markdownTable(
    ["candidate_id", "Symbol", "Name", "Chain", "final_label", "securityLabel", "Reason"],
    candidates.map((candidate) => [
      candidate.candidate_id,
      candidate.symbol,
      candidate.name,
      candidate.chain,
      candidate.final_label,
      candidate.security_label,
      candidate.reason,
    ]),
  );
}

function markdownTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.map(escapeTableCell).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyRows = rows.map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`);

  return [headerRow, separator, ...bodyRows].join("\n");
}

function escapeTableCell(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}
