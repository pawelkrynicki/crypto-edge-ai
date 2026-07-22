export const REPORT_LIBRARY_STATUSES = ["READY", "PARTIAL", "NOT_READY"] as const;

export type ReportLibraryStatusValue = (typeof REPORT_LIBRARY_STATUSES)[number];

export type ReportsLibraryStatus = {
  library_available: boolean;
  library_status: ReportLibraryStatusValue;
  report_count: number;
  valid_report_count: number;
  skipped_report_count: number;
  latest_report_generated_at: string | null;
  supported_report_versions: number[];
  last_indexed_at: string;
};

export type ReportValidationStatus = "VALID";

export type ReportListItem = {
  report_id: string;
  report_version: number;
  title: string;
  generated_at: string;
  candidate_name?: string;
  project_name?: string;
  symbol?: string;
  chain?: string;
  contract_address?: string;
  basket?: string;
  scanner_run_id?: string;
  review_status?: string;
  report_format: "json";
  detail_available: true;
  validation_status: ReportValidationStatus;
};

export type ReportsListResponse = {
  reports: ReportListItem[];
};

export type ReportCandidate = {
  candidate_id: string;
  symbol: string;
  name: string;
  chain: string;
  final_label: string;
  security_label: string;
  reason: string;
};

export type ReportReviewNote = {
  candidate_id: string;
  symbol: string;
  name: string;
  final_label: string;
  review_status: string;
  note: string;
  updated_at: string;
  matched_current_scan: boolean;
};

export type ReportSourceCoverage = {
  source_id: string;
  source_name: string;
  mode: string;
  fetched_at: string;
  data_category: string;
  records_count: number;
  warnings_count: number;
  errors_count: number;
};

export type ReportDefiSnapshot = {
  name: string;
  chain: string;
  tvl_usd: number | null;
  change_1d: number | null;
  change_7d: number | null;
  source_name: string;
};

export type ReportDetail = ReportListItem & {
  research_summary: {
    candidates_count: number;
    review_entries_count: number;
    scanner_source: string;
    context_source: string;
  };
  source_freshness: {
    scanner_finished_at: string | null;
    context_generated_at: string | null;
    context_loaded_at: string | null;
  };
  source_coverage: ReportSourceCoverage[];
  market_context: {
    fear_greed_value: number | null;
    fear_greed_classification: string | null;
    defi_snapshots: ReportDefiSnapshot[];
  };
  security_observations: {
    by_security_label: Array<{ label: string; count: number }>;
    security_checked: number;
    security_passed: number;
  };
  risk_flags: Array<{ label: string; count: number }>;
  manual_verification_requirements: ReportCandidate[];
  candidates: ReportCandidate[];
  review_notes: ReportReviewNote[];
  open_questions: string[];
  next_review_step: string | null;
  missing_sections: string[];
};
