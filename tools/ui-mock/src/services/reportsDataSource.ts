import {
  REPORT_LIBRARY_STATUSES,
  type ReportDetail,
  type ReportListItem,
  type ReportsLibraryStatus,
} from "../types/reportTypes";

export async function loadReportsLibraryStatus(): Promise<ReportsLibraryStatus | null> {
  const value = await getReportsJson("/api/reports/status");
  return isReportsLibraryStatus(value) ? value : null;
}

export async function loadReportsList(): Promise<ReportListItem[] | null> {
  const value = await getReportsJson("/api/reports");
  if (!isRecord(value) || !Array.isArray(value.reports) || !value.reports.every(isReportListItem)) return null;
  return value.reports;
}

export async function loadReportDetail(reportId: string): Promise<ReportDetail | null> {
  if (!/^rpt_[a-f0-9]{40}$/.test(reportId)) return null;
  const value = await getReportsJson(`/api/reports/${reportId}`);
  return isReportDetail(value) ? value : null;
}

async function getReportsJson(path: string): Promise<unknown | null> {
  try {
    const response = await fetch(path, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function isReportsLibraryStatus(value: unknown): value is ReportsLibraryStatus {
  if (!isRecord(value)) return false;
  return typeof value.library_available === "boolean"
    && typeof value.library_status === "string"
    && (REPORT_LIBRARY_STATUSES as readonly string[]).includes(value.library_status)
    && isNonNegativeInteger(value.report_count)
    && isNonNegativeInteger(value.valid_report_count)
    && isNonNegativeInteger(value.skipped_report_count)
    && (value.latest_report_generated_at === null || typeof value.latest_report_generated_at === "string")
    && Array.isArray(value.supported_report_versions)
    && value.supported_report_versions.every(isNonNegativeInteger)
    && typeof value.last_indexed_at === "string";
}

function isReportListItem(value: unknown): value is ReportListItem {
  if (!isRecord(value)) return false;
  return typeof value.report_id === "string"
    && /^rpt_[a-f0-9]{40}$/.test(value.report_id)
    && isNonNegativeInteger(value.report_version)
    && typeof value.title === "string"
    && typeof value.generated_at === "string"
    && value.report_format === "json"
    && value.detail_available === true
    && value.validation_status === "VALID";
}

function isReportDetail(value: unknown): value is ReportDetail {
  if (!isRecord(value) || !isReportListItem(value)) return false;
  const detail = value as Record<string, unknown>;
  return isRecord(detail.research_summary)
    && isRecord(detail.source_freshness)
    && Array.isArray(detail.source_coverage)
    && isRecord(detail.market_context)
    && isRecord(detail.security_observations)
    && Array.isArray(detail.risk_flags)
    && Array.isArray(detail.manual_verification_requirements)
    && Array.isArray(detail.candidates)
    && Array.isArray(detail.review_notes)
    && Array.isArray(detail.open_questions)
    && Array.isArray(detail.missing_sections);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
