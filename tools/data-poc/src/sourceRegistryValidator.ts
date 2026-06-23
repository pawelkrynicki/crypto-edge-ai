import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCESS_STATUS_VALUES,
  CONFIDENCE_VALUES,
  USAGE_SCOPE_VALUES,
  type SourceRegistry,
  type SourceRegistryValidationIssue,
  type SourceRegistryValidationResult
} from "./sourceRegistryTypes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_RELATIVE_PATH = "docs/compliance/data_source_registry_v1.json";

export function loadSourceRegistry(path = resolveRepoFile(REGISTRY_RELATIVE_PATH)): SourceRegistry {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as SourceRegistry;
}

export function validateSourceRegistry(registry: unknown): SourceRegistryValidationResult {
  const errors: SourceRegistryValidationIssue[] = [];

  if (!isRecord(registry)) {
    addError(errors, "REGISTRY_NOT_OBJECT", "registry must be a JSON object", "$");
    return { valid: false, source_count: 0, errors };
  }

  requireString(registry, "registry_version", errors);
  requireString(registry, "reviewed_at", errors);

  if (!Array.isArray(registry.sources)) {
    addError(errors, "SOURCES_NOT_ARRAY", "sources must be an array", "$.sources");
    return { valid: false, source_count: 0, errors };
  }

  const sourceIds = new Set<string>();
  for (let index = 0; index < registry.sources.length; index += 1) {
    const source = registry.sources[index];
    const path = `$.sources[${index}]`;

    if (!isRecord(source)) {
      addError(errors, "SOURCE_NOT_OBJECT", "source must be an object", path);
      continue;
    }

    const sourceId = source.source_id;
    if (typeof sourceId !== "string" || sourceId.trim() === "") {
      addError(errors, "SOURCE_ID_INVALID", "source_id must be a non-empty string", `${path}.source_id`);
    } else if (sourceIds.has(sourceId)) {
      addError(errors, "SOURCE_ID_DUPLICATE", `source_id must be unique: ${sourceId}`, `${path}.source_id`);
    } else {
      sourceIds.add(sourceId);
    }

    requireEnum(source, "access_status", ACCESS_STATUS_VALUES, errors, path);
    requireEnum(source, "usage_scope", USAGE_SCOPE_VALUES, errors, path);
    requireEnum(source, "confidence", CONFIDENCE_VALUES, errors, path);
    requireArray(source, "approved_endpoints", errors, path);
    requireArray(source, "current_code_files", errors, path);
    requireArray(source, "implementation_changes_required", errors, path);
    requireArray(source, "open_questions", errors, path);
  }

  validateSourceReferenceArray(registry, "sources_ready_for_camp_beta", sourceIds, errors);
  validateSourceReferenceArray(registry, "sources_blocked_or_pending", sourceIds, errors);

  return {
    valid: errors.length === 0,
    source_count: registry.sources.length,
    errors
  };
}

export function validateDefaultSourceRegistry(): SourceRegistryValidationResult {
  return validateSourceRegistry(loadSourceRegistry());
}

export function resolveRepoFile(relativePath: string): string {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), "..", "..", relativePath),
    resolve(__dirname, "..", "..", "..", "..", relativePath)
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  return found ?? candidates[0];
}

function validateSourceReferenceArray(
  registry: Record<string, unknown>,
  key: "sources_ready_for_camp_beta" | "sources_blocked_or_pending",
  sourceIds: Set<string>,
  errors: SourceRegistryValidationIssue[]
): void {
  const value = registry[key];
  if (!Array.isArray(value)) {
    addError(errors, "SOURCE_REFERENCE_ARRAY_INVALID", `${key} must be an array`, `$.${key}`);
    return;
  }

  value.forEach((sourceId, index) => {
    if (typeof sourceId !== "string" || sourceId.trim() === "") {
      addError(errors, "SOURCE_REFERENCE_INVALID", `${key} entries must be source_id strings`, `$.${key}[${index}]`);
      return;
    }
    if (!sourceIds.has(sourceId)) {
      addError(errors, "SOURCE_REFERENCE_UNKNOWN", `${key} references unknown source_id: ${sourceId}`, `$.${key}[${index}]`);
    }
  });
}

function requireString(record: Record<string, unknown>, key: string, errors: SourceRegistryValidationIssue[]): void {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    addError(errors, "FIELD_REQUIRED_STRING", `${key} must be a non-empty string`, `$.${key}`);
  }
}

function requireEnum(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
  errors: SourceRegistryValidationIssue[],
  pathPrefix: string
): void {
  const value = record[key];
  if (typeof value !== "string" || !allowed.includes(value)) {
    addError(errors, "FIELD_INVALID_ENUM", `${key} must be one of: ${allowed.join(", ")}`, `${pathPrefix}.${key}`);
  }
}

function requireArray(record: Record<string, unknown>, key: string, errors: SourceRegistryValidationIssue[], pathPrefix: string): void {
  if (!Array.isArray(record[key])) {
    addError(errors, "FIELD_REQUIRED_ARRAY", `${key} must be an array`, `${pathPrefix}.${key}`);
  }
}

function addError(errors: SourceRegistryValidationIssue[], code: string, message: string, path: string): void {
  errors.push({ code, message, path });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
