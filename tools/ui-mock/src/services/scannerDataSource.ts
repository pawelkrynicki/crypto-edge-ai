import type {
  PersistableCandidate,
  PersistableScanRun,
  PersistableScorecard,
  PersistableSecurityCheck,
  ProductReadinessOutput,
  ScannerApiOutput,
} from "../types/scannerTypes";
import {
  getProductRuntimeMode,
  type ResolvedProductRuntimeMode,
} from "../runtimeMode";

export type DataSourceKey = "fixture" | "static-json" | "api";
export type ResolvedScannerSource =
  | "built-in-fixture"
  | "static-json"
  | "real-output"
  | "fixture-fallback"
  | "unavailable";

export interface ScannerDataSourceResult {
  status: "ready";
  source: DataSourceKey;
  resolvedSource: Exclude<ResolvedScannerSource, "unavailable">;
  usedFallback: boolean;
  fallbackReason?: string;
  output: ScannerApiOutput;
}

export interface ScannerDataSourceErrorResult {
  status: "error";
  source: DataSourceKey;
  resolvedSource: "unavailable";
  usedFallback: false;
  reasonCode: string;
  error: string;
  output: null;
}

export type ScannerDataSourceLoadResult = ScannerDataSourceResult | ScannerDataSourceErrorResult;

export type ScannerDataSourceOptions = {
  runtimeMode?: ResolvedProductRuntimeMode;
};

export type ScannerReadinessResult =
  | { status: "ready"; output: ProductReadinessOutput }
  | { status: "error"; reasonCode: string; error: string; output: null };

type ViteImportMeta = ImportMeta & {
  env?: {
    VITE_SCANNER_API_URL?: string;
  };
};

class ScannerDataSourceHttpError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string, message: string) {
    super(message);
    this.reasonCode = reasonCode;
  }
}

async function fetchJson(url: string): Promise<ScannerApiOutput> {
  const res = await fetch(url);
  const body = await parseJsonResponse(res);

  if (!res.ok) {
    const reasonCode = isRecord(body) && typeof body.reason_code === "string"
      ? body.reason_code
      : `HTTP_${res.status}`;
    throw new ScannerDataSourceHttpError(reasonCode, `HTTP ${res.status} ${res.statusText} - ${url}`);
  }

  return validateScannerApiOutput(body);
}

export function interpretScannerApiOutput(output: unknown): ScannerDataSourceResult {
  const validated = validateScannerApiOutput(output);
  const meta = validated._source_meta;

  if (meta?.source === "real-output") {
    return {
      status: "ready",
      source: "api",
      resolvedSource: "real-output",
      usedFallback: false,
      output: validated,
    };
  }

  return {
    status: "ready",
    source: "api",
    resolvedSource: "fixture-fallback",
    usedFallback: true,
    fallbackReason: meta?.reason ?? "API response did not include scanner source metadata.",
    output: validated,
  };
}

export function validateScannerApiOutput(value: unknown): ScannerApiOutput {
  if (!isRecord(value)) invalidScannerResponse("top-level object");
  if (!isPersistableScanRun(value.scan_run)) invalidScannerResponse("scan_run");
  if (!Array.isArray(value.candidates)) invalidScannerResponse("candidates array");
  if (!Array.isArray(value.security_checks)) invalidScannerResponse("security_checks array");
  if (!Array.isArray(value.scorecards)) invalidScannerResponse("scorecards array");
  if (value.candidates.some((candidate) => !isPersistableCandidate(candidate))) {
    invalidScannerResponse("candidate record");
  }
  if (value.security_checks.some((securityCheck) => !isPersistableSecurityCheck(securityCheck))) {
    invalidScannerResponse("security_check record");
  }
  if (value.scorecards.some((scorecard) => !isPersistableScorecard(scorecard))) {
    invalidScannerResponse("scorecard record");
  }
  if (value.provenance !== undefined && !isScannerProvenance(value.provenance)) {
    invalidScannerResponse("provenance");
  }
  if (value._source_meta !== undefined && !isScannerSourceMeta(value._source_meta)) {
    invalidScannerResponse("source metadata");
  }

  validateScannerSnapshotIntegrity(value as Record<string, unknown>);

  return value as ScannerApiOutput;
}

export async function loadScannerDataSourceResult(
  source: DataSourceKey,
  options: ScannerDataSourceOptions = {},
): Promise<ScannerDataSourceLoadResult> {
  const runtimeMode = options.runtimeMode ?? getProductRuntimeMode();

  if (runtimeMode !== "DEVELOPMENT_DEMO" && source !== "api") {
    return errorResult(source, "SCANNER_DEMO_SOURCE_FORBIDDEN", "Fixture and static sample sources require DEVELOPMENT_DEMO.");
  }

  if (source === "api") {
    return loadScannerApiDataSourceResult({ runtimeMode });
  }

  try {
    if (source === "fixture") {
      return {
        status: "ready",
        source,
        resolvedSource: "built-in-fixture",
        usedFallback: false,
        output: await fetchJson("/fixtures/persistableScannerSample.json"),
      };
    }

    if (source === "static-json") {
      return {
        status: "ready",
        source,
        resolvedSource: "static-json",
        usedFallback: false,
        output: await fetchJson("/fixtures/persistableScannerSample.json"),
      };
    }

    return errorResult(source, "SCANNER_SOURCE_UNSUPPORTED", "Unsupported scanner data source.");

  } catch (error) {
    const reasonCode = error instanceof ScannerDataSourceHttpError
      ? error.reasonCode
      : "SCANNER_API_UNAVAILABLE";
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(source, reasonCode, message);
  }
}

export async function loadScannerApiDataSourceResult(
  options: ScannerDataSourceOptions = {},
): Promise<ScannerDataSourceLoadResult> {
  const runtimeMode = options.runtimeMode ?? getProductRuntimeMode();

  if (runtimeMode !== "DEVELOPMENT_DEMO" && runtimeMode !== "INTERNAL_BETA") {
    return errorResult(
      "api",
      "SCANNER_RUNTIME_MODE_UNCONFIGURED",
      "A recognized product runtime mode is required before scanner data can be loaded.",
    );
  }

  try {
    const apiBaseUrl = getApiBaseUrl();
    const result = interpretScannerApiOutput(await fetchJson(`${apiBaseUrl}/api/scanner/latest`));

    if (runtimeMode !== "DEVELOPMENT_DEMO" && result.usedFallback) {
      return errorResult(
        "api",
        "SCANNER_FIXTURE_RESPONSE_FORBIDDEN",
        "INTERNAL_BETA rejected a scanner response without real-output provenance.",
      );
    }

    return result;
  } catch (error) {
    const reasonCode = error instanceof ScannerDataSourceHttpError
      ? error.reasonCode
      : "SCANNER_API_UNAVAILABLE";
    const message = error instanceof Error ? error.message : String(error);
    return errorResult("api", reasonCode, message);
  }
}

export async function loadScannerReadinessResult(
  options: ScannerDataSourceOptions = {},
): Promise<ScannerReadinessResult> {
  const runtimeMode = options.runtimeMode ?? getProductRuntimeMode();

  if (runtimeMode !== "DEVELOPMENT_DEMO" && runtimeMode !== "INTERNAL_BETA") {
    return {
      status: "error",
      reasonCode: "SCANNER_RUNTIME_MODE_UNCONFIGURED",
      error: "A recognized product runtime mode is required before readiness can be loaded.",
      output: null,
    };
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/readiness`);
    const body = await parseJsonResponse(response);
    if (!isProductReadinessOutput(body)) {
      return {
        status: "error",
        reasonCode: "READINESS_RESPONSE_INVALID",
        error: "Readiness API response was not a valid product readiness object.",
        output: null,
      };
    }

    return { status: "ready", output: body };
  } catch (error) {
    return {
      status: "error",
      reasonCode: "READINESS_API_UNAVAILABLE",
      error: error instanceof Error ? error.message : String(error),
      output: null,
    };
  }
}

function errorResult(source: DataSourceKey, reasonCode: string, error: string): ScannerDataSourceErrorResult {
  return {
    status: "error",
    source,
    resolvedSource: "unavailable",
    usedFallback: false,
    reasonCode,
    error,
    output: null,
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const SCAN_RUN_COUNT_FIELDS = [
  "total_raw",
  "passed_basic_filter",
  "rejected_basic_filter",
  "security_checked",
  "security_passed",
  "needs_manual_verification",
  "critical_risk",
  "watchlist_candidates",
] as const;

const BASIC_FILTER_STATUSES = new Set(["passed_basic_filter", "rejected_basic_filter"]);
const FINAL_LABELS = new Set(["WATCHLIST", "CRITICAL_RISK", "NEEDS_MANUAL_VERIFICATION", "REJECT"]);
const SECURITY_LABELS = new Set([
  "SECURITY_PASSED",
  "NEEDS_MANUAL_VERIFICATION",
  "CRITICAL_RISK",
  "NOT_CHECKED",
  "CRITICAL RISK",
  "NEEDS MANUAL VERIFICATION",
  "SECURITY DATA UNAVAILABLE",
  "PARTIAL SECURITY COVERAGE",
]);
const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);
const CHECKLIST_SECTIONS = ["security", "distribution", "liquidity", "social", "personal"] as const;
const DANGEROUS_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/;

function isPersistableScanRun(value: unknown): value is PersistableScanRun {
  return isRecord(value)
    && isSafeString(value.run_id)
    && value.source === "combined-scanner-poc"
    && (value.mode === "fixture" || value.mode === "live")
    && isSafeString(value.query)
    && (value.filters === undefined || isSafeJsonObject(value.filters))
    && (value.limits === undefined || isSafeJsonObject(value.limits))
    && isNullableIsoTimestamp(value.started_at)
    && isIsoTimestamp(value.finished_at)
    && SCAN_RUN_COUNT_FIELDS.every((field) => isNonNegativeInteger(value[field]))
    && isSafeStringArray(value.errors);
}

function isPersistableCandidate(value: unknown): value is PersistableCandidate {
  return isRecord(value)
    && isSafeString(value.run_id)
    && isSafeString(value.candidate_id)
    && isSafeString(value.symbol)
    && isNullableSafeString(value.name)
    && isSafeString(value.chain)
    && isNullableSafeString(value.contract_address)
    && isNullableSafeString(value.pair_address)
    && isNullableSafeString(value.dex)
    && isSafeString(value.source)
    && isNullableSafeString(value.source_url)
    && isNullableFiniteNumber(value.price_usd)
    && isNullableFiniteNumber(value.market_cap_usd)
    && isNullableFiniteNumber(value.fdv_usd)
    && isNullableFiniteNumber(value.liquidity_usd)
    && isNullableFiniteNumber(value.volume_24h_usd)
    && isNullableFiniteNumber(value.volume_market_cap_ratio)
    && isNullableIsoTimestamp(value.pair_created_at)
    && isNullableFiniteNumber(value.pair_age_days)
    && BASIC_FILTER_STATUSES.has(String(value.basic_filter_status))
    && isSafeStringArray(value.filter_reasons)
    && FINAL_LABELS.has(String(value.final_label))
    && isSafeStringArray(value.final_reasons)
    && isIsoTimestamp(value.created_at)
    && (value.discovery_basket === undefined || ["new_emerging", "established"].includes(String(value.discovery_basket)))
    && (value.discovery_method === undefined
      || ["dexscreener_latest_token_profiles", "address_seeded_universe"].includes(String(value.discovery_method)))
    && (value.observation_only === undefined || typeof value.observation_only === "boolean")
    && (value.established_eligible === undefined || typeof value.established_eligible === "boolean")
    && (value.universe_version === undefined || isNullableSafeString(value.universe_version))
    && (value.universe_entry_index === undefined
      || value.universe_entry_index === null
      || isNonNegativeInteger(value.universe_entry_index))
    && (value.address_identity_verified === undefined || typeof value.address_identity_verified === "boolean");
}

function isPersistableSecurityCheck(value: unknown): value is PersistableSecurityCheck {
  return isRecord(value)
    && isSafeString(value.run_id)
    && isSafeString(value.candidate_id)
    && isSafeStringArray(value.sources)
    && (value.coverage_status === undefined
      || value.coverage_status === null
      || ["SECURITY DATA UNAVAILABLE", "PARTIAL SECURITY COVERAGE"].includes(String(value.coverage_status)))
    && isSafeString(value.honeypot_status)
    && isNullableFiniteNumber(value.buy_tax)
    && isNullableFiniteNumber(value.sell_tax)
    && isNullableBoolean(value.contract_verified)
    && isSafeString(value.ownership_status)
    && isNullableBoolean(value.liquidity_locked)
    && isNullableFiniteNumber(value.liquidity_lock_days)
    && isNullableBoolean(value.mint_risk)
    && isNullableBoolean(value.blacklist_risk)
    && isNullableBoolean(value.whitelist_risk)
    && isNullableBoolean(value.sell_restriction_risk)
    && isNullableBoolean(value.proxy_risk)
    && isNullableFiniteNumber(value.top_wallet_pct)
    && isNullableFiniteNumber(value.top_10_wallets_pct)
    && isSafeStringArray(value.risk_flags)
    && isSafeStringArray(value.missing_data)
    && SECURITY_LABELS.has(String(value.security_label))
    && isSafeStringArray(value.critical_reasons)
    && isSafeStringArray(value.warning_reasons)
    && isNullableIsoTimestamp(value.checked_at);
}

function isPersistableScorecard(value: unknown): value is PersistableScorecard {
  return isRecord(value)
    && isSafeString(value.run_id)
    && isSafeString(value.candidate_id)
    && isNullableFiniteNumber(value.security_score)
    && isNullableFiniteNumber(value.onchain_score)
    && isNullableFiniteNumber(value.social_score)
    && isNullableFiniteNumber(value.narrative_score)
    && isNullableFiniteNumber(value.total_score)
    && FINAL_LABELS.has(String(value.decision_label))
    && (value.risk_level === null || RISK_LEVELS.has(String(value.risk_level)))
    && isNullableFiniteNumber(value.confidence)
    && isScorecardChecklist(value.checklist)
    && isIsoTimestamp(value.created_at);
}

function isScorecardChecklist(value: unknown): value is PersistableScorecard["checklist"] {
  return isRecord(value) && CHECKLIST_SECTIONS.every((section) => isSafeStringArray(value[section]));
}

function isScannerProvenance(value: unknown): value is NonNullable<ScannerApiOutput["provenance"]> {
  return isRecord(value)
    && isSafeString(value.schema_version)
    && isSafeString(value.contract_version)
    && isSafeString(value.generator_version)
    && isSafeString(value.environment)
    && (value.mode === "fixture" || value.mode === "live")
    && typeof value.fixture_used === "boolean"
    && isSafeString(value.run_id)
    && isIsoTimestamp(value.generated_at)
    && isIsoTimestamp(value.finished_at)
    && isSafeStringArray(value.source_ids)
    && new Set(value.source_ids).size === value.source_ids.length
    && isPolicyDecisions(value.policy_decisions)
    && (value.metadata === undefined || isSafeJsonObject(value.metadata));
}

function isScannerSourceMeta(value: unknown): value is NonNullable<ScannerApiOutput["_source_meta"]> {
  return isRecord(value)
    && ["real-output", "fixture-fallback"].includes(String(value.source))
    && (value.path === undefined || isSafeString(value.path))
    && isSafeString(value.reason)
    && (value.selected_run_id === null || isSafeString(value.selected_run_id))
    && isIsoTimestamp(value.loaded_at)
    && (value.runtime_mode === undefined
      || ["DEVELOPMENT_DEMO", "INTERNAL_BETA", "UNCONFIGURED"].includes(String(value.runtime_mode)))
    && (value.age_seconds === undefined || value.age_seconds === null || isNonNegativeFiniteNumber(value.age_seconds))
    && (value.source_ids === undefined || isSafeStringArray(value.source_ids))
    && (value.freshness_status === undefined || ["FRESH", "STALE"].includes(String(value.freshness_status)));
}

function validateScannerSnapshotIntegrity(value: Record<string, unknown>): void {
  const scanRun = value.scan_run as PersistableScanRun;
  const candidates = value.candidates as PersistableCandidate[];
  const securityChecks = value.security_checks as PersistableSecurityCheck[];
  const scorecards = value.scorecards as PersistableScorecard[];
  const candidateIds = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.run_id !== scanRun.run_id || candidateIds.has(candidate.candidate_id)) invalidScannerResponse();
    candidateIds.add(candidate.candidate_id);
  }

  const securityCandidateIds = new Set<string>();
  for (const securityCheck of securityChecks) {
    if (securityCheck.run_id !== scanRun.run_id
      || !candidateIds.has(securityCheck.candidate_id)
      || securityCandidateIds.has(securityCheck.candidate_id)) invalidScannerResponse();
    securityCandidateIds.add(securityCheck.candidate_id);
  }

  const scorecardCandidateIds = new Set<string>();
  for (const scorecard of scorecards) {
    if (scorecard.run_id !== scanRun.run_id
      || !candidateIds.has(scorecard.candidate_id)
      || scorecardCandidateIds.has(scorecard.candidate_id)) invalidScannerResponse();
    scorecardCandidateIds.add(scorecard.candidate_id);
  }

  if (value.provenance !== undefined
    && (value.provenance as NonNullable<ScannerApiOutput["provenance"]>).run_id !== scanRun.run_id) {
    invalidScannerResponse();
  }
}

function isPolicyDecisions(value: unknown): boolean {
  return isRecord(value) && Object.entries(value).every(([sourceId, decisions]) => (
    isSafeString(sourceId)
    && isRecord(decisions)
    && Object.entries(decisions).every(([action, decision]) => (
      isSafeString(action) && (decision === "allowed" || decision === "denied")
    ))
  ));
}

function isSafeJsonObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isSafeJsonValue(value, 0);
}

function isSafeJsonValue(value: unknown, depth: number): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === "boolean" || isSafeString(value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isSafeJsonValue(item, depth + 1));
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, item]) => (
    isSafeString(key)
    && !DANGEROUS_OBJECT_KEYS.has(key)
    && isSafeJsonValue(item, depth + 1)
  ));
}

function isNullableSafeString(value: unknown): value is string | null {
  return value === null || isSafeString(value);
}

function isSafeStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => isSafeString(item));
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeFiniteNumber(value) && Number.isInteger(value);
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function isNullableIsoTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value);
}

function isSafeString(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 4_000
    && ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
    });
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(offsetHourText ?? 0);
  const offsetMinute = Number(offsetMinuteText ?? 0);
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  if (offsetHour > 23 || offsetMinute > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function invalidScannerResponse(section = "snapshot integrity"): never {
  throw new ScannerDataSourceHttpError(
    "SCANNER_RESPONSE_INVALID",
    `Scanner API response did not satisfy the scanner snapshot contract (${section}).`,
  );
}

function isProductReadinessOutput(value: unknown): value is ProductReadinessOutput {
  return isRecord(value)
    && typeof value.ready === "boolean"
    && isRecord(value.scanner)
    && isRecord(value.context)
    && isRecord(value.discovery)
    && isRecord(value.discovery.new_emerging)
    && isRecord(value.discovery.established)
    && Array.isArray(value.reason_codes);
}

function getApiBaseUrl(): string {
  const viteEnv = (import.meta as ViteImportMeta).env;
  return viteEnv?.VITE_SCANNER_API_URL?.replace(/\/$/, "") ?? "";
}
