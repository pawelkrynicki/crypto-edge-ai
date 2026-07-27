import {
  AI_RESEARCH_ACTION_TYPES,
  AI_RESEARCH_COVERAGE_STATES,
  AI_RESEARCH_PROMPT_VERSION,
  AI_RESEARCH_RISK_SEVERITIES,
  AI_RESEARCH_SCHEMA_VERSION,
  AI_RESEARCH_STATES,
  type AIResearchBrief,
  type AIResearchKnownFact,
  type AIResearchNextAction,
  type AIResearchRiskFactor,
  type AIResearchState,
} from "../src/types/aiResearchTypes.js";
import { sha256, stableJson, type AIResearchContext } from "./aiResearchContext.js";

export const AI_RESEARCH_PROVIDER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "research_state",
    "summary",
    "known_facts",
    "risk_factors",
    "missing_information",
    "next_actions",
    "status_change_conditions",
  ],
  properties: {
    schema_version: { type: "string", enum: [AI_RESEARCH_SCHEMA_VERSION] },
    research_state: { type: "string", enum: [...AI_RESEARCH_STATES] },
    summary: { type: "string", maxLength: 600 },
    known_facts: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "value", "interpretation", "source_reference_ids"],
        properties: {
          key: { type: "string", maxLength: 80 },
          label: { type: "string", maxLength: 120 },
          value: { type: ["string", "number", "boolean", "null"] },
          interpretation: { type: "string", maxLength: 280 },
          source_reference_ids: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", maxLength: 80 } },
        },
      },
    },
    risk_factors: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "category", "title", "explanation", "evidence_reference_ids"],
        properties: {
          severity: { type: "string", enum: [...AI_RESEARCH_RISK_SEVERITIES] },
          category: { type: "string", maxLength: 80 },
          title: { type: "string", maxLength: 140 },
          explanation: { type: "string", maxLength: 360 },
          evidence_reference_ids: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", maxLength: 80 } },
        },
      },
    },
    missing_information: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "explanation", "source_reference_ids"],
        properties: {
          key: { type: "string", maxLength: 80 },
          label: { type: "string", maxLength: 140 },
          explanation: { type: "string", maxLength: 280 },
          source_reference_ids: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", maxLength: 80 } },
        },
      },
    },
    next_actions: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action_type", "reason"],
        properties: {
          action_type: { type: "string", enum: [...AI_RESEARCH_ACTION_TYPES] },
          reason: { type: "string", maxLength: 280 },
        },
      },
    },
    status_change_conditions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "explanation", "source_reference_ids"],
        properties: {
          key: { type: "string", maxLength: 80 },
          label: { type: "string", maxLength: 140 },
          explanation: { type: "string", maxLength: 280 },
          source_reference_ids: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", maxLength: 80 } },
        },
      },
    },
  },
} as const;

export type AIResearchProviderDraft = {
  schema_version: typeof AI_RESEARCH_SCHEMA_VERSION;
  research_state: AIResearchState;
  summary: string;
  known_facts: AIResearchKnownFact[];
  risk_factors: AIResearchRiskFactor[];
  missing_information: AIResearchBrief["missing_information"];
  next_actions: Array<Pick<AIResearchNextAction, "action_type" | "reason">>;
  status_change_conditions: AIResearchBrief["status_change_conditions"];
};

export class AIResearchValidationError extends Error {
  readonly code:
    | "INVALID_JSON"
    | "SCHEMA_MISMATCH"
    | "UNKNOWN_SOURCE_REFERENCE"
    | "UNKNOWN_FACT"
    | "FORBIDDEN_ACTION"
    | "FORBIDDEN_CONTENT";

  constructor(code: AIResearchValidationError["code"]) {
    super(code);
    this.name = "AIResearchValidationError";
    this.code = code;
  }
}

export function parseAIResearchProviderDraft(raw: string, context: AIResearchContext): AIResearchProviderDraft {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AIResearchValidationError("INVALID_JSON");
  }
  if (!isRecord(value) || !hasExactKeys(value, [
    "schema_version", "research_state", "summary", "known_facts", "risk_factors",
    "missing_information", "next_actions", "status_change_conditions",
  ])) throw new AIResearchValidationError("SCHEMA_MISMATCH");
  if (value.schema_version !== AI_RESEARCH_SCHEMA_VERSION || value.research_state !== context.research_state) {
    throw new AIResearchValidationError("SCHEMA_MISMATCH");
  }
  const summary = text(value.summary, 1, 600);
  const knownFacts = array(value.known_facts, 3, 5).map((item) => parseFact(item, context));
  const risks = array(value.risk_factors, 1, 5).map((item) => parseRisk(item, context));
  const missing = array(value.missing_information, 0, 5).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["key", "label", "explanation", "source_reference_ids"])) fail();
    const candidate = context.missing_information.find(({ key }) => key === item.key);
    if (!candidate || candidate.label !== item.label) fail();
    const parsed = {
      ...candidate,
      explanation: text(item.explanation, 1, 280),
      source_reference_ids: refs(item.source_reference_ids, context),
    };
    if (!sameSet(parsed.source_reference_ids, candidate.source_reference_ids)) throw new AIResearchValidationError("UNKNOWN_SOURCE_REFERENCE");
    return parsed;
  });
  if (missing.length !== context.missing_information.length || !sameSet(missing.map(({ key }) => key), context.missing_information.map(({ key }) => key))) fail();
  const actions = array(value.next_actions, 1, 4).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["action_type", "reason"])) fail();
    const action = context.action_catalog.find(({ action_type }) => action_type === item.action_type);
    if (!action) throw new AIResearchValidationError("FORBIDDEN_ACTION");
    return { action_type: action.action_type, reason: text(item.reason, 1, 280) };
  });
  const actionIndexes = actions.map(({ action_type }) => context.action_catalog.findIndex((item) => item.action_type === action_type));
  if (
    actions[0]?.action_type !== context.action_catalog[0]?.action_type
    || new Set(actionIndexes).size !== actionIndexes.length
    || actionIndexes.some((index, position) => position > 0 && index <= actionIndexes[position - 1])
  ) throw new AIResearchValidationError("FORBIDDEN_ACTION");
  const conditions = array(value.status_change_conditions, 0, 3).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["key", "label", "explanation", "source_reference_ids"])) fail();
    const condition = context.status_change_conditions.find(({ key }) => key === item.key);
    if (!condition || condition.label !== item.label) fail();
    const sourceIds = refs(item.source_reference_ids, context);
    if (!sameSet(sourceIds, condition.source_reference_ids)) throw new AIResearchValidationError("UNKNOWN_SOURCE_REFERENCE");
    return { ...condition, explanation: text(item.explanation, 1, 280), source_reference_ids: sourceIds };
  });
  if (conditions.length !== context.status_change_conditions.length || !sameSet(conditions.map(({ key }) => key), context.status_change_conditions.map(({ key }) => key))) fail();
  const narrative = { summary, knownFacts, risks, missing, actions, conditions };
  assertNoForbiddenContent(narrative);
  assertNoGeneratedUrls(narrative);
  assertNoInventedNumbers(narrative, context);
  return {
    schema_version: AI_RESEARCH_SCHEMA_VERSION,
    research_state: context.research_state,
    summary,
    known_facts: knownFacts,
    risk_factors: risks,
    missing_information: missing,
    next_actions: actions,
    status_change_conditions: conditions,
  };
}

export function validateStoredAIResearchBrief(value: unknown): AIResearchBrief {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schema_version", "analysis_id", "identity", "analysis_language", "snapshot_fingerprint",
    "prompt_version", "model", "generated_at", "data_generated_at", "research_state", "summary",
    "known_facts", "risk_factors", "missing_information", "next_actions", "status_change_conditions",
    "source_references", "coverage", "checkpoints", "token_usage", "input_hash", "output_hash", "render_preview",
  ])) fail();
  if (value.schema_version !== AI_RESEARCH_SCHEMA_VERSION || value.prompt_version !== AI_RESEARCH_PROMPT_VERSION) fail();
  const analysisId = text(value.analysis_id, 40, 40);
  if (!/^air_[0-9a-f-]{36}$/.test(analysisId)) fail();
  if (!isRecord(value.identity) || !hasExactKeys(value.identity, ["chain", "contract_address"])) fail();
  const identity = { chain: text(value.identity.chain, 1, 32), contract_address: text(value.identity.contract_address, 1, 64) };
  if (value.analysis_language !== "pl" && value.analysis_language !== "en") fail();
  if (!isHash(value.snapshot_fingerprint) || !isHash(value.input_hash) || !isHash(value.output_hash)) fail();
  if (!isResearchState(value.research_state)) fail();
  const knownFacts = array(value.known_facts, 3, 5).map((item) => parseStoredFact(item));
  const risks = array(value.risk_factors, 1, 5).map((item) => parseStoredRisk(item));
  const missing = array(value.missing_information, 0, 5).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["key", "label", "explanation", "source_reference_ids"])) fail();
    return { key: text(item.key, 1, 80), label: text(item.label, 1, 140), explanation: text(item.explanation, 1, 280), source_reference_ids: stringArray(item.source_reference_ids, 1, 4, 80) };
  });
  const actions = array(value.next_actions, 1, 4).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["action_type", "label", "priority", "reason", "target_type", "target_reference"])) fail();
    if (!AI_RESEARCH_ACTION_TYPES.includes(item.action_type as never)) throw new AIResearchValidationError("FORBIDDEN_ACTION");
    if (item.priority !== "primary" && item.priority !== "secondary" && item.priority !== "tertiary") fail();
    if (item.target_type !== "internal_route" && item.target_type !== "external_url" && item.target_type !== "status") fail();
    const target = text(item.target_reference, 1, 2048);
    if (item.target_type === "external_url" && !isAllowedPublicUrl(target)) fail();
    if (item.target_type === "internal_route" && !target.startsWith("#")) fail();
    return { action_type: item.action_type, label: text(item.label, 1, 140), priority: item.priority, reason: text(item.reason, 1, 280), target_type: item.target_type, target_reference: target } as AIResearchNextAction;
  });
  const conditions = array(value.status_change_conditions, 0, 3).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["key", "label", "explanation", "source_reference_ids"])) fail();
    return { key: text(item.key, 1, 80), label: text(item.label, 1, 140), explanation: text(item.explanation, 1, 280), source_reference_ids: stringArray(item.source_reference_ids, 1, 4, 80) };
  });
  const sources = array(value.source_references, 1, 16).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["id", "source_type", "label", "observed_at", "completeness", "url"])) fail();
    const sourceTypes = ["scanner_snapshot", "follow_up_checkpoint", "basic_filters", "security_status", "established_membership", "methodology", "dexscreener", "explorer", "report"];
    if (!sourceTypes.includes(String(item.source_type))) fail();
    if (item.completeness !== "complete" && item.completeness !== "partial" && item.completeness !== "unavailable") fail();
    if (item.observed_at !== null && !isUtc(item.observed_at)) fail();
    if (item.url !== null && (typeof item.url !== "string" || (!item.url.startsWith("#") && !isAllowedPublicUrl(item.url)))) fail();
    return { id: text(item.id, 1, 80), source_type: item.source_type, label: text(item.label, 1, 140), observed_at: item.observed_at, completeness: item.completeness, url: item.url } as AIResearchBrief["source_references"][number];
  });
  const sourceIds = new Set(sources.map(({ id }) => id));
  for (const id of [...knownFacts.flatMap(({ source_reference_ids }) => source_reference_ids), ...risks.flatMap(({ evidence_reference_ids }) => evidence_reference_ids), ...missing.flatMap(({ source_reference_ids }) => source_reference_ids), ...conditions.flatMap(({ source_reference_ids }) => source_reference_ids)]) {
    if (!sourceIds.has(id)) throw new AIResearchValidationError("UNKNOWN_SOURCE_REFERENCE");
  }
  const coverage = array(value.coverage, 4, 4).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["area", "state", "explanation"])) fail();
    if (!["market_data", "basic_filters", "security_coverage", "information_completeness"].includes(String(item.area))) fail();
    if (!AI_RESEARCH_COVERAGE_STATES.includes(item.state as never)) fail();
    return { area: item.area, state: item.state, explanation: text(item.explanation, 1, 240) } as AIResearchBrief["coverage"][number];
  });
  const checkpoints = array(value.checkpoints, 5, 5).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["day", "state"]) || ![1, 3, 7, 14, 30].includes(Number(item.day)) || !["completed", "current", "future", "skipped"].includes(String(item.state))) fail();
    return { day: item.day, state: item.state } as AIResearchBrief["checkpoints"][number];
  });
  if (!isRecord(value.token_usage) || !hasExactKeys(value.token_usage, ["prompt_tokens", "completion_tokens", "total_tokens"])) fail();
  const tokenUsage = {
    prompt_tokens: integer(value.token_usage.prompt_tokens),
    completion_tokens: integer(value.token_usage.completion_tokens),
    total_tokens: integer(value.token_usage.total_tokens),
  };
  if (tokenUsage.total_tokens !== tokenUsage.prompt_tokens + tokenUsage.completion_tokens) fail();
  if (value.render_preview !== true && value.render_preview !== false) fail();
  const result: AIResearchBrief = {
    schema_version: AI_RESEARCH_SCHEMA_VERSION,
    analysis_id: analysisId,
    identity,
    analysis_language: value.analysis_language,
    snapshot_fingerprint: value.snapshot_fingerprint,
    prompt_version: AI_RESEARCH_PROMPT_VERSION,
    model: text(value.model, 1, 128),
    generated_at: utc(value.generated_at),
    data_generated_at: utc(value.data_generated_at),
    research_state: value.research_state,
    summary: text(value.summary, 1, 600),
    known_facts: knownFacts,
    risk_factors: risks,
    missing_information: missing,
    next_actions: actions,
    status_change_conditions: conditions,
    source_references: sources,
    coverage,
    checkpoints,
    token_usage: tokenUsage,
    input_hash: value.input_hash,
    output_hash: value.output_hash,
    render_preview: value.render_preview,
  };
  const expectedOutputHash = sha256(stableJson({ ...result, output_hash: "0".repeat(64) }));
  if (result.output_hash !== expectedOutputHash) fail();
  assertNoForbiddenContent(result);
  return result;
}

function parseFact(value: unknown, context: AIResearchContext): AIResearchKnownFact {
  if (!isRecord(value) || !hasExactKeys(value, ["key", "label", "value", "interpretation", "source_reference_ids"])) fail();
  const candidate = context.fact_candidates.find(({ key }) => key === value.key);
  if (!candidate || candidate.label !== value.label || candidate.value !== value.value) throw new AIResearchValidationError("UNKNOWN_FACT");
  const sourceIds = refs(value.source_reference_ids, context);
  if (!sameSet(sourceIds, candidate.source_reference_ids)) throw new AIResearchValidationError("UNKNOWN_SOURCE_REFERENCE");
  return { ...candidate, interpretation: text(value.interpretation, 1, 280), source_reference_ids: sourceIds };
}

function parseRisk(value: unknown, context: AIResearchContext): AIResearchRiskFactor {
  const parsed = parseStoredRisk(value);
  refs(parsed.evidence_reference_ids, context);
  const candidate = context.risk_candidates.find(({ category, severity }) => category === parsed.category && severity === parsed.severity);
  if (!candidate) fail();
  return parsed;
}

function parseStoredFact(value: unknown): AIResearchKnownFact {
  if (!isRecord(value) || !hasExactKeys(value, ["key", "label", "value", "interpretation", "source_reference_ids"])) fail();
  const primitive = value.value;
  if (primitive !== null && typeof primitive !== "string" && typeof primitive !== "number" && typeof primitive !== "boolean") fail();
  if (typeof primitive === "string" && primitive.length > 200) fail();
  if (typeof primitive === "number" && !Number.isFinite(primitive)) fail();
  return { key: text(value.key, 1, 80), label: text(value.label, 1, 140), value: primitive, interpretation: text(value.interpretation, 1, 280), source_reference_ids: stringArray(value.source_reference_ids, 1, 4, 80) };
}

function parseStoredRisk(value: unknown): AIResearchRiskFactor {
  if (!isRecord(value) || !hasExactKeys(value, ["severity", "category", "title", "explanation", "evidence_reference_ids"])) fail();
  if (!AI_RESEARCH_RISK_SEVERITIES.includes(value.severity as never)) fail();
  return { severity: value.severity, category: text(value.category, 1, 80), title: text(value.title, 1, 140), explanation: text(value.explanation, 1, 360), evidence_reference_ids: stringArray(value.evidence_reference_ids, 1, 4, 80) } as AIResearchRiskFactor;
}

function refs(value: unknown, context: AIResearchContext): string[] {
  const result = stringArray(value, 1, 4, 80);
  const allowed = new Set(context.source_references.map(({ id }) => id));
  if (result.some((id) => !allowed.has(id))) throw new AIResearchValidationError("UNKNOWN_SOURCE_REFERENCE");
  return result;
}

function assertNoForbiddenContent(value: unknown): void {
  const content = JSON.stringify(value).normalize("NFKC");
  const forbidden = /\b(?:buy|sell|trade|hold|deposit|connect\s+wallet|kup|kupuj|sprzedaj|sprzedaż|trzymaj|wejdź\s+w\s+pozycj|safe|bezpieczn(?:y|a|e)|gwarantowan(?:y|a|e)|guaranteed\s+profit|prawdopodobn(?:y|a)\s+zwrot|investment\s+recommendation|rekomendacj[aą]\s+inwestycyjn[aą]|ignore\s+(?:all\s+)?previous|system\s+prompt|developer\s+message|prompt\s+injection|promot(?:e|es|ed|ing|ion)|promuj|awansuj)\b/iu;
  if (forbidden.test(content)) throw new AIResearchValidationError("FORBIDDEN_CONTENT");
}

function assertNoGeneratedUrls(value: unknown): void {
  if (/(?:https?:\/\/|www\.|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|ai|app|dev|xyz|finance|exchange|co)\b)/iu.test(JSON.stringify(value))) {
    throw new AIResearchValidationError("FORBIDDEN_CONTENT");
  }
}

function assertNoInventedNumbers(value: unknown, context: AIResearchContext): void {
  const allowed = new Set(numberTokens(stableJson(context)));
  if (numberTokens(JSON.stringify(value)).some((token) => !allowed.has(token))) {
    throw new AIResearchValidationError("UNKNOWN_FACT");
  }
}

function numberTokens(value: string): string[] {
  return [...value.matchAll(/[-+]?\d+(?:[.,]\d+)?%?/gu)].map(([token]) => token.replace(",", "."));
}

function isAllowedPublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && ["dexscreener.com", "www.dexscreener.com", "etherscan.io", "bscscan.com", "basescan.org", "arbiscan.io", "polygonscan.com", "snowtrace.io", "solscan.io"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isResearchState(value: unknown): value is AIResearchState {
  return AI_RESEARCH_STATES.includes(value as never);
}

function text(value: unknown, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail();
  return value;
}

function stringArray(value: unknown, min: number, max: number, maxLength: number): string[] {
  return array(value, min, max).map((item) => text(item, 1, maxLength));
}

function array(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail();
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail();
  return value;
}

function utc(value: unknown): string {
  if (!isUtc(value)) fail();
  return value;
}

function isUtc(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(): never {
  throw new AIResearchValidationError("SCHEMA_MISMATCH");
}
