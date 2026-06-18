import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  PersistableCandidate,
  PersistableScannerOutput,
  PersistableScanRun,
  PersistableScorecard,
  PersistableSecurityCheck
} from "./persistableScannerModel.js";

export type StorageValidationIssue = {
  code: string;
  message: string;
  path: string;
};

export type StorageValidationResult = {
  valid: boolean;
  errors: StorageValidationIssue[];
  warnings: StorageValidationIssue[];
  summary: {
    scan_run_present: boolean;
    candidates_count: number;
    security_checks_count: number;
    scorecards_count: number;
    full_output_present: boolean;
  };
};

const BASIC_FILTER_STATUSES = new Set(["passed_basic_filter", "rejected_basic_filter"]);
const FINAL_LABELS = new Set(["REJECT", "WATCHLIST", "CRITICAL_RISK", "NEEDS_MANUAL_VERIFICATION"]);
const SECURITY_LABELS = new Set(["SECURITY_PASSED", "NEEDS_MANUAL_VERIFICATION", "CRITICAL_RISK", "NOT_CHECKED"]);
const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);

export async function validateStorageOutputDir(outputDir: string): Promise<StorageValidationResult> {
  const errors: StorageValidationIssue[] = [];
  const warnings: StorageValidationIssue[] = [];
  const scanRun = await readJsonFile<PersistableScanRun>(resolve(outputDir, "scan_run.json"), "scan_run", errors);
  const candidates = await readJsonlFile<PersistableCandidate>(resolve(outputDir, "candidates.jsonl"), "candidates", errors, warnings, { required: true, emptyWarning: false });
  const securityChecks = await readJsonlFile<PersistableSecurityCheck>(resolve(outputDir, "security_checks.jsonl"), "security_checks", errors, warnings, {
    required: false,
    emptyWarning: true
  });
  const scorecards = await readJsonlFile<PersistableScorecard>(resolve(outputDir, "scorecards.jsonl"), "scorecards", errors, warnings, { required: true, emptyWarning: false });
  const fullOutput = await readOptionalFullOutput(resolve(outputDir, "full_output.json"), warnings, errors);

  return validateStorageParts({
    scanRun,
    candidates,
    securityChecks,
    scorecards,
    fullOutput,
    errors,
    warnings
  });
}

export function validatePersistableScannerOutput(output: PersistableScannerOutput): StorageValidationResult {
  return validateStorageParts({
    scanRun: output.scan_run,
    candidates: output.candidates,
    securityChecks: output.security_checks,
    scorecards: output.scorecards,
    fullOutput: output,
    errors: [],
    warnings: []
  });
}

function validateStorageParts(input: {
  scanRun: PersistableScanRun | null;
  candidates: PersistableCandidate[];
  securityChecks: PersistableSecurityCheck[];
  scorecards: PersistableScorecard[];
  fullOutput: PersistableScannerOutput | null;
  errors: StorageValidationIssue[];
  warnings: StorageValidationIssue[];
}): StorageValidationResult {
  const { scanRun, candidates, securityChecks, scorecards, fullOutput, errors, warnings } = input;

  if (!scanRun) {
    addError(errors, "SCAN_RUN_MISSING", "scan_run.json is required", "scan_run");
  } else {
    validateScanRun(scanRun, errors);
  }

  const runId = isRecord(scanRun) && typeof scanRun.run_id === "string" ? scanRun.run_id : null;
  validateCandidates(candidates, runId, errors);
  validateSecurityChecks(securityChecks, candidates, runId, errors);
  validateScorecards(scorecards, candidates, runId, errors);
  validateCrossChecks(candidates, scorecards, fullOutput, errors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      scan_run_present: Boolean(scanRun),
      candidates_count: candidates.length,
      security_checks_count: securityChecks.length,
      scorecards_count: scorecards.length,
      full_output_present: Boolean(fullOutput)
    }
  };
}

function validateScanRun(scanRun: PersistableScanRun, errors: StorageValidationIssue[]): void {
  const required = [
    "run_id",
    "source",
    "mode",
    "query",
    "finished_at",
    "total_raw",
    "passed_basic_filter",
    "rejected_basic_filter",
    "security_checked",
    "security_passed",
    "needs_manual_verification",
    "critical_risk",
    "watchlist_candidates"
  ];

  for (const field of required) {
    if (!hasValue(scanRun, field)) {
      addError(errors, "SCAN_RUN_FIELD_MISSING", `scan_run.${field} is required`, `scan_run.${field}`);
    }
  }
}

function validateCandidates(candidates: PersistableCandidate[], runId: string | null, errors: StorageValidationIssue[]): void {
  const seen = new Set<string>();

  candidates.forEach((candidate, index) => {
    const path = `candidates[${index}]`;
    for (const field of ["run_id", "candidate_id", "symbol", "chain", "source", "basic_filter_status", "final_label", "created_at"]) {
      if (!hasValue(candidate, field)) {
        addError(errors, "CANDIDATE_FIELD_MISSING", `${path}.${field} is required`, `${path}.${field}`);
      }
    }

    if (runId && candidate.run_id !== runId) {
      addError(errors, "CANDIDATE_RUN_ID_MISMATCH", `${path}.run_id must match scan_run.run_id`, `${path}.run_id`);
    }
    if (candidate.candidate_id) {
      if (seen.has(candidate.candidate_id)) {
        addError(errors, "CANDIDATE_ID_DUPLICATE", `${path}.candidate_id must be unique within run`, `${path}.candidate_id`);
      }
      seen.add(candidate.candidate_id);
    }
    if (candidate.basic_filter_status && !BASIC_FILTER_STATUSES.has(candidate.basic_filter_status)) {
      addError(errors, "CANDIDATE_BASIC_FILTER_STATUS_INVALID", `${path}.basic_filter_status has invalid value`, `${path}.basic_filter_status`);
    }
    if (candidate.final_label && !FINAL_LABELS.has(candidate.final_label)) {
      addError(errors, "CANDIDATE_FINAL_LABEL_INVALID", `${path}.final_label has invalid value`, `${path}.final_label`);
    }
  });
}

function validateSecurityChecks(securityChecks: PersistableSecurityCheck[], candidates: PersistableCandidate[], runId: string | null, errors: StorageValidationIssue[]): void {
  const candidateIds = new Set(candidates.map((candidate) => candidate.candidate_id));

  securityChecks.forEach((check, index) => {
    const path = `security_checks[${index}]`;
    for (const field of ["run_id", "candidate_id", "security_label", "checked_at"]) {
      if (!hasValue(check, field)) {
        addError(errors, "SECURITY_CHECK_FIELD_MISSING", `${path}.${field} is required`, `${path}.${field}`);
      }
    }

    if (runId && check.run_id !== runId) {
      addError(errors, "SECURITY_CHECK_RUN_ID_MISMATCH", `${path}.run_id must match scan_run.run_id`, `${path}.run_id`);
    }
    if (check.candidate_id && !candidateIds.has(check.candidate_id)) {
      addError(errors, "SECURITY_CHECK_CANDIDATE_MISSING", `${path}.candidate_id must exist in candidates`, `${path}.candidate_id`);
    }
    if (check.security_label && !SECURITY_LABELS.has(check.security_label)) {
      addError(errors, "SECURITY_LABEL_INVALID", `${path}.security_label has invalid value`, `${path}.security_label`);
    }
  });
}

function validateScorecards(scorecards: PersistableScorecard[], candidates: PersistableCandidate[], runId: string | null, errors: StorageValidationIssue[]): void {
  const candidateIds = new Set(candidates.map((candidate) => candidate.candidate_id));
  const scorecardsByCandidate = new Map<string, number>();

  scorecards.forEach((scorecard, index) => {
    const path = `scorecards[${index}]`;
    for (const field of ["run_id", "candidate_id", "decision_label", "created_at"]) {
      if (!hasValue(scorecard, field)) {
        addError(errors, "SCORECARD_FIELD_MISSING", `${path}.${field} is required`, `${path}.${field}`);
      }
    }

    if (runId && scorecard.run_id !== runId) {
      addError(errors, "SCORECARD_RUN_ID_MISMATCH", `${path}.run_id must match scan_run.run_id`, `${path}.run_id`);
    }
    if (scorecard.candidate_id && !candidateIds.has(scorecard.candidate_id)) {
      addError(errors, "SCORECARD_CANDIDATE_MISSING", `${path}.candidate_id must exist in candidates`, `${path}.candidate_id`);
    }
    if (scorecard.decision_label && !FINAL_LABELS.has(scorecard.decision_label)) {
      addError(errors, "SCORECARD_DECISION_LABEL_INVALID", `${path}.decision_label has invalid value`, `${path}.decision_label`);
    }
    if (scorecard.risk_level !== null && scorecard.risk_level !== undefined && !RISK_LEVELS.has(scorecard.risk_level)) {
      addError(errors, "SCORECARD_RISK_LEVEL_INVALID", `${path}.risk_level has invalid value`, `${path}.risk_level`);
    }
    if (scorecard.candidate_id) {
      scorecardsByCandidate.set(scorecard.candidate_id, (scorecardsByCandidate.get(scorecard.candidate_id) ?? 0) + 1);
    }
  });

  for (const candidate of candidates) {
    const count = scorecardsByCandidate.get(candidate.candidate_id) ?? 0;
    if (count === 0) {
      addError(errors, "SCORECARD_MISSING_FOR_CANDIDATE", "Each candidate must have exactly one scorecard", `scorecards.${candidate.candidate_id}`);
    }
    if (count > 1) {
      addError(errors, "SCORECARD_DUPLICATE_FOR_CANDIDATE", "Each candidate must have exactly one scorecard", `scorecards.${candidate.candidate_id}`);
    }
  }
}

function validateCrossChecks(candidates: PersistableCandidate[], scorecards: PersistableScorecard[], fullOutput: PersistableScannerOutput | null, errors: StorageValidationIssue[]): void {
  if (fullOutput && Array.isArray(fullOutput.candidates) && fullOutput.candidates.length !== candidates.length) {
    addError(errors, "FULL_OUTPUT_CANDIDATE_COUNT_MISMATCH", "full_output candidates count must match candidates.jsonl count", "full_output.candidates");
  }

  const scorecardByCandidate = new Map(scorecards.map((scorecard) => [scorecard.candidate_id, scorecard]));
  for (const candidate of candidates) {
    const scorecard = scorecardByCandidate.get(candidate.candidate_id);
    if (!scorecard) continue;

    if (candidate.final_label === "WATCHLIST" && scorecard.decision_label !== "WATCHLIST") {
      addError(errors, "WATCHLIST_SCORECARD_MISMATCH", "WATCHLIST candidate must have WATCHLIST scorecard decision_label", `scorecards.${candidate.candidate_id}.decision_label`);
    }
    if (candidate.final_label === "CRITICAL_RISK" && scorecard.risk_level !== "critical") {
      addError(errors, "CRITICAL_RISK_LEVEL_MISMATCH", "CRITICAL_RISK candidate must have critical risk_level", `scorecards.${candidate.candidate_id}.risk_level`);
    }
    if (candidate.final_label === "NEEDS_MANUAL_VERIFICATION" && scorecard.risk_level !== "medium") {
      addError(errors, "MANUAL_RISK_LEVEL_MISMATCH", "NEEDS_MANUAL_VERIFICATION candidate must have medium risk_level", `scorecards.${candidate.candidate_id}.risk_level`);
    }
    if (candidate.final_label === "REJECT" && scorecard.risk_level !== "high") {
      addError(errors, "REJECT_RISK_LEVEL_MISMATCH", "REJECT candidate must have high risk_level", `scorecards.${candidate.candidate_id}.risk_level`);
    }
  }
}

async function readJsonFile<T>(path: string, issuePath: string, errors: StorageValidationIssue[]): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = isMissingFileError(error) ? "JSON_FILE_MISSING" : "JSON_FILE_INVALID";
    addError(errors, code, `${issuePath} file is missing or invalid JSON`, issuePath);
    return null;
  }
}

async function readOptionalFullOutput(path: string, warnings: StorageValidationIssue[], errors: StorageValidationIssue[]): Promise<PersistableScannerOutput | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as PersistableScannerOutput;
  } catch (error) {
    if (isMissingFileError(error)) {
      addWarning(warnings, "FULL_OUTPUT_MISSING", "full_output.json is missing; validating split files only", "full_output");
    } else {
      addError(errors, "FULL_OUTPUT_INVALID", "full_output.json is invalid JSON", "full_output");
    }
    return null;
  }
}

async function readJsonlFile<T>(
  path: string,
  issuePath: string,
  errors: StorageValidationIssue[],
  warnings: StorageValidationIssue[],
  options: { required: boolean; emptyWarning: boolean }
): Promise<T[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (options.required) {
      addError(errors, "JSONL_FILE_MISSING", `${issuePath}.jsonl is required`, issuePath);
    } else {
      addWarning(warnings, "JSONL_FILE_MISSING", `${issuePath}.jsonl is missing`, issuePath);
    }
    return [];
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0 && options.emptyWarning) {
    addWarning(warnings, "JSONL_FILE_EMPTY", `${issuePath}.jsonl is empty`, issuePath);
  }

  const rows: T[] = [];
  lines.forEach((line, index) => {
    try {
      rows.push(JSON.parse(line) as T);
    } catch {
      addError(errors, "JSONL_LINE_INVALID", `${issuePath}.jsonl line ${index + 1} is invalid JSON`, `${issuePath}[${index}]`);
    }
  });
  return rows;
}

function hasValue(record: unknown, field: string): boolean {
  if (!isRecord(record)) return false;
  const value = record[field];
  return value !== undefined && value !== null && value !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function addError(errors: StorageValidationIssue[], code: string, message: string, path: string): void {
  errors.push({ code, message, path });
}

function addWarning(warnings: StorageValidationIssue[], code: string, message: string, path: string): void {
  warnings.push({ code, message, path });
}
