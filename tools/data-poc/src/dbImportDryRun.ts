import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  PersistableCandidate,
  PersistableScannerOutput,
  PersistableScanRun,
  PersistableScorecard,
  PersistableSecurityCheck
} from "./persistableScannerModel.js";
import { validatePersistableScannerOutput, validateStorageOutputDir, type StorageValidationIssue, type StorageValidationResult } from "./storageValidator.js";

export type DbImportDryRunMode = "fixture" | "dir" | "live";

export type DbImportDryRunResult = {
  source: "db-import-dry-run-poc";
  mode: DbImportDryRunMode;
  valid: boolean;
  import_ready: boolean;
  output_dir: string;
  errors: StorageValidationIssue[];
  warnings: StorageValidationIssue[];
  plan: DbImportPlan | null;
};

export type DbImportPlan = {
  target_tables: Array<{
    table: string;
    operation: "insert" | "upsert";
    record_count: number;
    logical_key: string[];
    conflict_policy: string;
  }>;
  records: {
    scan_runs: PersistableScanRun[];
    candidates: PersistableCandidate[];
    security_checks: PersistableSecurityCheck[];
    scorecards: PersistableScorecard[];
  };
  summary: {
    scan_runs: number;
    candidates: number;
    security_checks: number;
    scorecards: number;
    watchlist_candidates: number;
    critical_risk: number;
    needs_manual_verification: number;
    rejected: number;
  };
  readiness: {
    can_import_to_db_later: boolean;
    blocking_reasons: string[];
    warnings: string[];
  };
  idempotency: {
    safe_to_rerun_same_output: boolean;
    strategy: string[];
    risks: string[];
  };
};

export function buildDbImportDryRunFromOutput(input: {
  output: PersistableScannerOutput;
  mode: DbImportDryRunMode;
  outputDir: string;
  validation?: StorageValidationResult;
}): DbImportDryRunResult {
  const validation = input.validation ?? validatePersistableScannerOutput(input.output);
  if (!validation.valid) {
    return invalidDryRun(input.mode, input.outputDir, validation);
  }

  return validDryRun(input.output, input.mode, input.outputDir, validation);
}

export async function buildDbImportDryRunFromDir(outputDir: string): Promise<DbImportDryRunResult> {
  const validation = await validateStorageOutputDir(outputDir);
  if (!validation.valid) {
    return invalidDryRun("dir", outputDir, validation);
  }

  const output = await readPersistableScannerOutputDir(outputDir);
  return validDryRun(output, "dir", outputDir, validation);
}

export async function readPersistableScannerOutputDir(outputDir: string): Promise<PersistableScannerOutput> {
  const fullOutput = await readOptionalJson<PersistableScannerOutput>(resolve(outputDir, "full_output.json"));
  if (fullOutput) return fullOutput;

  return {
    scan_run: await readJson<PersistableScanRun>(resolve(outputDir, "scan_run.json")),
    candidates: await readJsonl<PersistableCandidate>(resolve(outputDir, "candidates.jsonl")),
    security_checks: await readJsonl<PersistableSecurityCheck>(resolve(outputDir, "security_checks.jsonl")),
    scorecards: await readJsonl<PersistableScorecard>(resolve(outputDir, "scorecards.jsonl"))
  };
}

function validDryRun(output: PersistableScannerOutput, mode: DbImportDryRunMode, outputDir: string, validation: StorageValidationResult): DbImportDryRunResult {
  const readiness = buildReadiness(output, validation);
  return {
    source: "db-import-dry-run-poc",
    mode,
    valid: validation.valid,
    import_ready: readiness.can_import_to_db_later,
    output_dir: outputDir,
    errors: validation.errors,
    warnings: validation.warnings,
    plan: {
      target_tables: [
        {
          table: "crypto_token_scan_runs",
          operation: "upsert",
          record_count: 1,
          logical_key: ["run_id"],
          conflict_policy: "skip_if_exists"
        },
        {
          table: "crypto_token_candidates",
          operation: "upsert",
          record_count: output.candidates.length,
          logical_key: ["candidate_id"],
          conflict_policy: "update_existing_for_same_candidate_id"
        },
        {
          table: "crypto_token_security_checks",
          operation: "insert",
          record_count: output.security_checks.length,
          logical_key: ["run_id", "candidate_id"],
          conflict_policy: "skip_duplicate_run_candidate"
        },
        {
          table: "crypto_token_scorecards",
          operation: "insert",
          record_count: output.scorecards.length,
          logical_key: ["run_id", "candidate_id"],
          conflict_policy: "replace_for_same_run_candidate"
        }
      ],
      records: {
        scan_runs: [output.scan_run],
        candidates: output.candidates,
        security_checks: output.security_checks,
        scorecards: output.scorecards
      },
      summary: {
        scan_runs: 1,
        candidates: output.candidates.length,
        security_checks: output.security_checks.length,
        scorecards: output.scorecards.length,
        watchlist_candidates: output.candidates.filter((candidate) => candidate.final_label === "WATCHLIST").length,
        critical_risk: output.candidates.filter((candidate) => candidate.final_label === "CRITICAL_RISK").length,
        needs_manual_verification: output.candidates.filter((candidate) => candidate.final_label === "NEEDS_MANUAL_VERIFICATION").length,
        rejected: output.candidates.filter((candidate) => candidate.final_label === "REJECT").length
      },
      readiness,
      idempotency: {
        safe_to_rerun_same_output: readiness.can_import_to_db_later,
        strategy: [
          "scan_run skip_if_exists by run_id",
          "candidate upsert by candidate_id",
          "security_check skip duplicate run_id+candidate_id",
          "scorecard replace by run_id+candidate_id"
        ],
        risks: readiness.can_import_to_db_later ? [] : readiness.blocking_reasons
      }
    }
  };
}

function invalidDryRun(mode: DbImportDryRunMode, outputDir: string, validation: StorageValidationResult): DbImportDryRunResult {
  return {
    source: "db-import-dry-run-poc",
    mode,
    valid: false,
    import_ready: false,
    output_dir: outputDir,
    errors: validation.errors,
    warnings: validation.warnings,
    plan: null
  };
}

function buildReadiness(output: PersistableScannerOutput, validation: StorageValidationResult): DbImportPlan["readiness"] {
  const blockingReasons: string[] = [];
  const warnings = validation.warnings.map((warning) => warning.code);
  const candidateIds = output.candidates.map((candidate) => candidate.candidate_id);
  const duplicateCandidateIds = candidateIds.filter((candidateId, index) => candidateIds.indexOf(candidateId) !== index);

  if (!validation.valid) blockingReasons.push("validation failed");
  if (!output.scan_run) blockingReasons.push("missing scan_run");
  if (output.candidates.length === 0) blockingReasons.push("no candidates");
  if (output.scorecards.length !== output.candidates.length) blockingReasons.push("scorecard count mismatch");
  if (duplicateCandidateIds.length > 0) blockingReasons.push("duplicate candidate_id");
  if (hasInvalidRelationship(output)) blockingReasons.push("invalid relationship");

  if (output.security_checks.length === 0) warnings.push("security_checks_count = 0");
  if (!validation.summary.full_output_present) warnings.push("full_output missing");
  if (output.candidates.length > 0 && output.candidates.every((candidate) => candidate.final_label === "REJECT")) warnings.push("all candidates rejected");
  if (!output.candidates.some((candidate) => candidate.final_label === "WATCHLIST")) warnings.push("no watchlist candidates");
  if (output.scan_run.mode === "live") warnings.push("live mode used best-effort sources");
  if (output.scorecards.some((scorecard) => scorecard.total_score === null)) warnings.push("scorecards partial/null");

  return {
    can_import_to_db_later: blockingReasons.length === 0,
    blocking_reasons: blockingReasons,
    warnings: unique(warnings)
  };
}

function hasInvalidRelationship(output: PersistableScannerOutput): boolean {
  const candidateIds = new Set(output.candidates.map((candidate) => candidate.candidate_id));
  return (
    output.security_checks.some((check) => !candidateIds.has(check.candidate_id)) ||
    output.scorecards.some((scorecard) => !candidateIds.has(scorecard.candidate_id))
  );
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch {
    return null;
  }
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const raw = await readFile(path, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
