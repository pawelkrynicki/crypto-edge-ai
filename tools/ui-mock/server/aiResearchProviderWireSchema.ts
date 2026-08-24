import type { AIResearchContext } from "./aiResearchContext.js";
import { sha256, stableJson } from "./aiResearchContext.js";
import { buildAIResearchProviderJsonSchema } from "./aiResearchSchema.js";

/**
 * Version the grammar sent to the provider separately from the narrative and
 * public-result contracts. Dynamic enum values remain covered by the canonical
 * evidence snapshot in the queue identity.
 */
export const AI_RESEARCH_PROVIDER_WIRE_SCHEMA_VERSION = "ai_research_wire_schema_v2" as const;

const MAX_NESTING_DEPTH = 12;
const MAX_OBJECT_PROPERTIES = 128;
const MAX_ENUM_VALUES = 512;
const MAX_SCHEMA_BYTES = 64 * 1024;
const ALLOWED_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "anyOf",
  "description",
  "$defs",
  "$ref",
  "const",
  "minItems",
  "maxItems",
]);
const ALLOWED_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean"]);

export type AIResearchProviderWireSchemaAudit = {
  root_type: string | null;
  nesting_depth: number;
  object_property_count: number;
  enum_value_count: number;
  schema_bytes: number;
  keyword_inventory: string[];
  array_keyword_inventory: string[];
  object_keyword_inventory: string[];
  composition_keyword_inventory: string[];
  required_fields_valid: boolean;
  additional_properties_valid: boolean;
  required_field_checks: Array<{ path: string; valid: boolean }>;
  additional_properties_checks: Array<{ path: string; valid: boolean }>;
  reference_targets: string[];
};

export class AIResearchProviderWireSchemaError extends Error {
  readonly code:
    | "WIRE_SCHEMA_INVALID"
    | "WIRE_SCHEMA_UNSUPPORTED_KEYWORD"
    | "WIRE_SCHEMA_MISSING_REQUIRED"
    | "WIRE_SCHEMA_ADDITIONAL_PROPERTIES"
    | "WIRE_SCHEMA_ROOT_ANY_OF"
    | "WIRE_SCHEMA_BROKEN_REF"
    | "WIRE_SCHEMA_RECURSIVE_REF"
    | "WIRE_SCHEMA_LIMIT_EXCEEDED";
  readonly audit: AIResearchProviderWireSchemaAudit;

  constructor(code: AIResearchProviderWireSchemaError["code"], audit: AIResearchProviderWireSchemaAudit) {
    super(code);
    this.name = "AIResearchProviderWireSchemaError";
    this.code = code;
    this.audit = audit;
  }
}

export type AIResearchProviderWireSchema = {
  version: typeof AI_RESEARCH_PROVIDER_WIRE_SCHEMA_VERSION;
  digest: string;
  schema: Record<string, unknown>;
  audit: AIResearchProviderWireSchemaAudit;
};

/** Builds and validates the exact schema object supplied to OpenAI text.format. */
export function buildAIResearchProviderWireSchema(context: AIResearchContext): AIResearchProviderWireSchema {
  const schema = buildAIResearchProviderJsonSchema(context);
  const audit = validateAIResearchProviderWireSchema(schema);
  return {
    version: AI_RESEARCH_PROVIDER_WIRE_SCHEMA_VERSION,
    digest: sha256(stableJson(schema)),
    schema,
    audit,
  };
}

/**
 * Strict Structured Outputs compatibility gate. It validates the wire object,
 * rather than a TypeScript type or an intermediate builder representation.
 */
export function validateAIResearchProviderWireSchema(schema: unknown): AIResearchProviderWireSchemaAudit {
  const audit = emptyAudit(schema);
  if (!isRecord(schema)) fail("WIRE_SCHEMA_INVALID", audit);
  if (schema.type !== "object") fail("WIRE_SCHEMA_INVALID", audit);
  if ("anyOf" in schema) fail("WIRE_SCHEMA_ROOT_ANY_OF", audit);

  const definitions = isRecord(schema.$defs) ? schema.$defs : {};
  const seenReferences = new Set<string>();
  const activeReferences = new Set<string>();

  const visit = (node: unknown, depth: number, path: string): void => {
    if (!isRecord(node)) fail("WIRE_SCHEMA_INVALID", audit);
    if (depth > MAX_NESTING_DEPTH) fail("WIRE_SCHEMA_LIMIT_EXCEEDED", audit);
    audit.nesting_depth = Math.max(audit.nesting_depth, depth);

    for (const keyword of Object.keys(node)) {
      auditKeyword(audit, keyword, node.type);
      if (!ALLOWED_KEYWORDS.has(keyword)) fail("WIRE_SCHEMA_UNSUPPORTED_KEYWORD", audit);
    }

    if (typeof node.$ref === "string") {
      if (Object.keys(node).some((key) => key !== "$ref" && key !== "description")) fail("WIRE_SCHEMA_INVALID", audit);
      const target = resolveReference(node.$ref, definitions);
      audit.reference_targets = [...new Set([...audit.reference_targets, node.$ref])].sort();
      if (!target) fail("WIRE_SCHEMA_BROKEN_REF", audit);
      if (activeReferences.has(node.$ref)) fail("WIRE_SCHEMA_RECURSIVE_REF", audit);
      if (!seenReferences.has(`${path}:${node.$ref}`)) {
        seenReferences.add(`${path}:${node.$ref}`);
        activeReferences.add(node.$ref);
        visit(target, depth + 1, node.$ref);
        activeReferences.delete(node.$ref);
      }
      return;
    }

    if ("anyOf" in node) {
      if (Object.keys(node).some((key) => key !== "anyOf" && key !== "description")) fail("WIRE_SCHEMA_INVALID", audit);
      if (!Array.isArray(node.anyOf) || node.anyOf.length < 2) fail("WIRE_SCHEMA_INVALID", audit);
      for (const branch of node.anyOf) visit(branch, depth + 1, `${path}.anyOf`);
      return;
    }

    if (!ALLOWED_TYPES.has(String(node.type))) fail("WIRE_SCHEMA_INVALID", audit);
    if ("description" in node && (typeof node.description !== "string" || node.description.length > 1_024)) fail("WIRE_SCHEMA_INVALID", audit);
    if ("const" in node && !isScalar(node.const)) fail("WIRE_SCHEMA_INVALID", audit);

    if (node.type === "object") {
      const properties = node.properties;
      const required = node.required;
      if (!isRecord(properties) || !Array.isArray(required) || node.additionalProperties !== false) {
        audit.additional_properties_valid = false;
        audit.additional_properties_checks.push({ path, valid: false });
        fail("WIRE_SCHEMA_ADDITIONAL_PROPERTIES", audit);
      }
      audit.additional_properties_checks.push({ path, valid: true });
      const propertyNames = Object.keys(properties).sort();
      const requiredNames = required.filter((value): value is string => typeof value === "string").sort();
      if (propertyNames.length !== required.length || new Set(requiredNames).size !== requiredNames.length || propertyNames.join("\u0000") !== requiredNames.join("\u0000")) {
        audit.required_fields_valid = false;
        audit.required_field_checks.push({ path, valid: false });
        fail("WIRE_SCHEMA_MISSING_REQUIRED", audit);
      }
      audit.required_field_checks.push({ path, valid: true });
      audit.object_property_count += propertyNames.length;
      if (audit.object_property_count > MAX_OBJECT_PROPERTIES) fail("WIRE_SCHEMA_LIMIT_EXCEEDED", audit);
      for (const propertyName of propertyNames) visit(properties[propertyName], depth + 1, `${path}.properties.${propertyName}`);
    } else if ("properties" in node || "required" in node || "additionalProperties" in node) {
      fail("WIRE_SCHEMA_INVALID", audit);
    }

    if (node.type === "array") {
      if (!("items" in node)) fail("WIRE_SCHEMA_INVALID", audit);
      if ("minItems" in node && (!isNonNegativeInteger(node.minItems) || !isNonNegativeInteger(node.maxItems) || node.minItems > node.maxItems)) {
        fail("WIRE_SCHEMA_INVALID", audit);
      }
      if ("maxItems" in node && !isNonNegativeInteger(node.maxItems)) fail("WIRE_SCHEMA_INVALID", audit);
      visit(node.items, depth + 1, `${path}.items`);
    } else if ("items" in node || "minItems" in node || "maxItems" in node) {
      fail("WIRE_SCHEMA_INVALID", audit);
    }

    if ("enum" in node) {
      if (!Array.isArray(node.enum) || node.enum.length === 0 || node.enum.some((value) => !isScalar(value))) fail("WIRE_SCHEMA_INVALID", audit);
      audit.enum_value_count += node.enum.length;
      if (audit.enum_value_count > MAX_ENUM_VALUES) fail("WIRE_SCHEMA_LIMIT_EXCEEDED", audit);
    }

  };

  visit(schema, 1, "#");
  if (isRecord(schema.$defs)) {
    for (const [name, definition] of Object.entries(schema.$defs)) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(name)) fail("WIRE_SCHEMA_INVALID", audit);
      visit(definition, 1, `#/$defs/${name}`);
    }
  }
  return finalizeAudit(audit);
}

function emptyAudit(schema: unknown): AIResearchProviderWireSchemaAudit {
  return {
    root_type: isRecord(schema) && typeof schema.type === "string" ? schema.type : null,
    nesting_depth: 0,
    object_property_count: 0,
    enum_value_count: 0,
    schema_bytes: Buffer.byteLength(JSON.stringify(schema), "utf8"),
    keyword_inventory: [],
    array_keyword_inventory: [],
    object_keyword_inventory: [],
    composition_keyword_inventory: [],
    required_fields_valid: true,
    additional_properties_valid: true,
    required_field_checks: [],
    additional_properties_checks: [],
    reference_targets: [],
  };
}

function finalizeAudit(audit: AIResearchProviderWireSchemaAudit): AIResearchProviderWireSchemaAudit {
  if (audit.schema_bytes > MAX_SCHEMA_BYTES) throw new AIResearchProviderWireSchemaError("WIRE_SCHEMA_LIMIT_EXCEEDED", audit);
  audit.keyword_inventory.sort();
  audit.array_keyword_inventory.sort();
  audit.object_keyword_inventory.sort();
  audit.composition_keyword_inventory.sort();
  audit.reference_targets.sort();
  audit.required_field_checks.sort((left, right) => left.path.localeCompare(right.path));
  audit.additional_properties_checks.sort((left, right) => left.path.localeCompare(right.path));
  return audit;
}

function auditKeyword(audit: AIResearchProviderWireSchemaAudit, keyword: string, type: unknown): void {
  if (!audit.keyword_inventory.includes(keyword)) audit.keyword_inventory.push(keyword);
  if (["items", "minItems", "maxItems"].includes(keyword) && !audit.array_keyword_inventory.includes(keyword)) audit.array_keyword_inventory.push(keyword);
  if (["properties", "required", "additionalProperties"].includes(keyword) && !audit.object_keyword_inventory.includes(keyword)) audit.object_keyword_inventory.push(keyword);
  if (["anyOf", "$ref", "$defs"].includes(keyword) && !audit.composition_keyword_inventory.includes(keyword)) audit.composition_keyword_inventory.push(keyword);
  void type;
}

function resolveReference(reference: string, definitions: Record<string, unknown>): unknown | null {
  const match = /^#\/\$defs\/([A-Za-z0-9_-]{1,80})$/.exec(reference);
  return match && Object.hasOwn(definitions, match[1]!) ? definitions[match[1]!] : null;
}

function fail(code: AIResearchProviderWireSchemaError["code"], audit: AIResearchProviderWireSchemaAudit): never {
  throw new AIResearchProviderWireSchemaError(code, finalizeAudit(audit));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
