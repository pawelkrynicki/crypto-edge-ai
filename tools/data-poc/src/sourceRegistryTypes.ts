export const ACCESS_STATUS_VALUES = [
  "APPROVED_API",
  "APPROVED_PUBLIC_FEED",
  "MANUAL_ONLY",
  "PENDING_TERMS_REVIEW",
  "BLOCKED_NO_PERMISSION"
] as const;

export const USAGE_SCOPE_VALUES = [
  "POC_ONLY",
  "INTERNAL_BETA",
  "PUBLIC_BETA",
  "COMMERCIAL_PENDING",
  "COMMERCIAL_ALLOWED",
  "NOT_ALLOWED"
] as const;

export const CONFIDENCE_VALUES = ["HIGH", "MEDIUM", "LOW"] as const;

export type AccessStatus = (typeof ACCESS_STATUS_VALUES)[number];
export type UsageScope = (typeof USAGE_SCOPE_VALUES)[number];
export type Confidence = (typeof CONFIDENCE_VALUES)[number];

export type SourceRegistrySource = {
  source_id: string;
  name?: string;
  access_status: AccessStatus;
  usage_scope: UsageScope;
  confidence: Confidence;
  approved_endpoints: string[];
  current_code_files: string[];
  implementation_changes_required: string[];
  open_questions: string[];
  branding_requirements?: unknown;
  [key: string]: unknown;
};

export type SourceRegistry = {
  registry_version: string;
  reviewed_at: string;
  sources_ready_for_camp_beta: string[];
  sources_blocked_or_pending: string[];
  sources: SourceRegistrySource[];
  [key: string]: unknown;
};

export type SourceRegistryValidationIssue = {
  code: string;
  message: string;
  path: string;
};

export type SourceRegistryValidationResult = {
  valid: boolean;
  source_count: number;
  errors: SourceRegistryValidationIssue[];
};
