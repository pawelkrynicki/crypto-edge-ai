import {
  AI_RESEARCH_ACTION_TYPES,
  AI_RESEARCH_COVERAGE_STATES,
  AI_RESEARCH_PROMPT_VERSION,
  AI_RESEARCH_RISK_SEVERITIES,
  AI_RESEARCH_SCHEMA_VERSION,
  AI_RESEARCH_STATES,
  type AIResearchBrief,
  type AIResearchBilingualText,
  type AIResearchKnownFact,
  type AIResearchNextAction,
  type AIResearchRiskFactor,
  type AIResearchState,
} from "../src/types/aiResearchTypes.js";
import { getAIResearchCapability, isCapabilitySourceSupported } from "./aiResearchCapabilities.js";
import { sha256, stableJson, type AIResearchContext } from "./aiResearchContext.js";
import { AI_RESEARCH_NARRATIVE_VERSION, aiResearchNarrativeId } from "./aiResearchNarrativeContract.js";

const narrativeBindingSchema = (maxLength: number) => ({
  type: "object",
  additionalProperties: false,
  required: ["id", "en", "pl"],
  properties: {
    id: { type: "string", maxLength: 120 },
    en: { type: "string", maxLength },
    pl: { type: "string", maxLength },
  },
}) as const;

export const AI_RESEARCH_PROVIDER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "narrative_version",
    "summary",
    "fact_narratives",
    "risk_narratives",
    "missing_narratives",
    "action_narratives",
    "status_change_narratives",
  ],
  properties: {
    narrative_version: { type: "string", enum: [AI_RESEARCH_NARRATIVE_VERSION] },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["en", "pl"],
      properties: { en: { type: "string", maxLength: 600 }, pl: { type: "string", maxLength: 600 } },
    },
    fact_narratives: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: narrativeBindingSchema(280),
    },
    risk_narratives: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: narrativeBindingSchema(360),
    },
    missing_narratives: {
      type: "array",
      maxItems: 5,
      items: narrativeBindingSchema(280),
    },
    action_narratives: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: narrativeBindingSchema(280),
    },
    status_change_narratives: {
      type: "array",
      maxItems: 3,
      items: narrativeBindingSchema(280),
    },
  },
} as const;

export type AIResearchNarrativeBinding = { id: string; en: string; pl: string };

export type AIResearchProviderNarrative = {
  narrative_version: typeof AI_RESEARCH_NARRATIVE_VERSION;
  summary: AIResearchBilingualText;
  fact_narratives: AIResearchNarrativeBinding[];
  risk_narratives: AIResearchNarrativeBinding[];
  missing_narratives: AIResearchNarrativeBinding[];
  action_narratives: AIResearchNarrativeBinding[];
  status_change_narratives: AIResearchNarrativeBinding[];
};

export type AIResearchSemanticViolation =
  | "SCHEMA_MISMATCH"
  | "UNSUPPORTED_MISSING_CAPABILITY"
  | "MISSING_SOURCE_MISMATCH"
  | "UNKNOWN_SOURCE_REFERENCE"
  | "KNOWN_FACT_MISMATCH"
  | "RESEARCH_STATE_MISMATCH"
  | "RISK_SKELETON_MISMATCH"
  | "MISSING_SKELETON_MISMATCH"
  | "ACTION_SKELETON_MISMATCH"
  | "STATUS_CONDITION_MISMATCH"
  | "RAW_ENUM_IN_NARRATIVE"
  | "MACHINE_VALUE_IN_NARRATIVE"
  | "LANGUAGE_MISMATCH"
  | "FORBIDDEN_CONTENT"
  | "GENERATED_URL"
  | "INVENTED_NUMBER";

export class AIResearchValidationError extends Error {
  readonly code:
    | "INVALID_JSON"
    | "SCHEMA_MISMATCH"
    | "SKELETON_MISMATCH"
    | "UNKNOWN_SOURCE_REFERENCE"
    | "UNKNOWN_FACT"
    | "FORBIDDEN_ACTION"
    | "FORBIDDEN_CONTENT"
    | "RAW_MACHINE_VALUE"
    | "LANGUAGE_MISMATCH"
    | "SEMANTIC_MISMATCH";
  readonly violations: AIResearchSemanticViolation[];

  constructor(code: AIResearchValidationError["code"], violations: AIResearchSemanticViolation[] = []) {
    super(violations.length > 0 ? `${code}:${violations.join(",")}` : code);
    this.name = "AIResearchValidationError";
    this.code = code;
    this.violations = violations;
  }
}

export function parseAIResearchProviderNarrative(raw: string, context: AIResearchContext): AIResearchProviderNarrative {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AIResearchValidationError("INVALID_JSON");
  }
  if (!isRecord(value) || !hasExactKeys(value, [
    "narrative_version", "summary", "fact_narratives", "risk_narratives", "missing_narratives",
    "action_narratives", "status_change_narratives",
  ]) || value.narrative_version !== AI_RESEARCH_NARRATIVE_VERSION) fail();

  const result: AIResearchProviderNarrative = {
    narrative_version: AI_RESEARCH_NARRATIVE_VERSION,
    summary: bilingualText(value.summary, 1, 600),
    fact_narratives: parseBindings(
      value.fact_narratives,
      context.fact_candidates.map((fact) => aiResearchNarrativeId("fact", fact.key)),
      280,
    ),
    risk_narratives: parseBindings(
      value.risk_narratives,
      context.risk_candidates.map((_risk, index) => aiResearchNarrativeId("risk", index)),
      360,
    ),
    missing_narratives: parseBindings(
      value.missing_narratives,
      context.missing_information.map((item) => aiResearchNarrativeId("missing", item.key)),
      280,
    ),
    action_narratives: parseBindings(
      value.action_narratives,
      context.action_catalog.map((_action, index) => aiResearchNarrativeId("action", index)),
      280,
    ),
    status_change_narratives: parseBindings(
      value.status_change_narratives,
      context.status_change_conditions.map((condition) => aiResearchNarrativeId("condition", condition.key)),
      280,
    ),
  };
  assertNarrativePolicy(narrativeStringsFromProvider(result, "en"), "en", context);
  assertNarrativePolicy(narrativeStringsFromProvider(result, "pl"), "pl", context);
  return result;
}

export function auditAIResearchSemanticQuality(value: unknown, context: AIResearchContext): AIResearchSemanticViolation[] {
  if (!isRecord(value)) return ["SCHEMA_MISMATCH"];
  const violations = new Set<AIResearchSemanticViolation>();
  if (value.research_state !== context.research_state) violations.add("RESEARCH_STATE_MISMATCH");

  const facts = Array.isArray(value.known_facts) ? value.known_facts : [];
  if (facts.length !== context.fact_candidates.length || facts.some((item, index) => {
    const expected = context.fact_candidates[index];
    return !isRecord(item) || !expected
      || item.key !== expected.key
      || item.label !== expected.label
      || !samePrimitive(item.value, expected.value)
      || !sameStringArray(item.source_reference_ids, expected.source_reference_ids);
  })) violations.add("KNOWN_FACT_MISMATCH");

  const risks = Array.isArray(value.risk_factors) ? value.risk_factors : [];
  if (risks.length !== context.risk_candidates.length || risks.some((item, index) => {
    const expected = context.risk_candidates[index];
    return !isRecord(item) || !expected
      || item.category !== expected.category
      || item.severity !== expected.severity
      || item.title !== expected.title
      || !sameStringArray(item.evidence_reference_ids, expected.evidence_reference_ids);
  })) violations.add("RISK_SKELETON_MISMATCH");

  const missing = Array.isArray(value.missing_information) ? value.missing_information : [];
  const sourceCatalog = new Map(context.source_references.map((source) => [source.id, source]));
  for (const item of missing) {
    if (!isRecord(item) || typeof item.key !== "string" || !Array.isArray(item.source_reference_ids)) {
      violations.add("MISSING_SKELETON_MISMATCH");
      continue;
    }
    const sourceIds = item.source_reference_ids.filter((id): id is string => typeof id === "string");
    const capability = getAIResearchCapability(item.key);
    if (!capability) violations.add("UNSUPPORTED_MISSING_CAPABILITY");
    if (sourceIds.some((id) => !sourceCatalog.has(id))) violations.add("UNKNOWN_SOURCE_REFERENCE");
    if (!capability || !isCapabilitySourceSupported({ key: item.key, source_reference_ids: sourceIds }, context.source_references)) {
      violations.add("MISSING_SOURCE_MISMATCH");
    }
  }
  if (missing.length !== context.missing_information.length || missing.some((item, index) => {
    const expected = context.missing_information[index];
    return !isRecord(item) || !expected
      || item.key !== expected.key
      || item.label !== expected.label
      || !sameStringArray(item.source_reference_ids, expected.source_reference_ids);
  })) violations.add("MISSING_SKELETON_MISMATCH");

  const actions = Array.isArray(value.next_actions) ? value.next_actions : [];
  if (actions.length !== context.action_catalog.length || actions.some((item, index) => {
    const expected = context.action_catalog[index];
    return !isRecord(item) || !expected
      || item.action_type !== expected.action_type
      || item.label !== expected.label
      || item.priority !== expected.priority
      || item.target_type !== expected.target_type
      || item.target_reference !== expected.target_reference;
  })) violations.add("ACTION_SKELETON_MISMATCH");

  const conditions = Array.isArray(value.status_change_conditions) ? value.status_change_conditions : [];
  if (conditions.length !== context.status_change_conditions.length || conditions.some((item, index) => {
    const expected = context.status_change_conditions[index];
    return !isRecord(item) || !expected
      || item.key !== expected.key
      || item.label !== expected.label
      || !sameStringArray(item.source_reference_ids, expected.source_reference_ids);
  })) violations.add("STATUS_CONDITION_MISMATCH");

  for (const locale of ["en", "pl"] as const) {
    const narratives = narrativeStringsFromSemantic(value, locale);
    if (hasRawEnum(narratives)) violations.add("RAW_ENUM_IN_NARRATIVE");
    if (hasMachineValue(narratives, locale)) violations.add("MACHINE_VALUE_IN_NARRATIVE");
    if (hasLanguageMismatch(narratives, locale)) violations.add("LANGUAGE_MISMATCH");
    if (hasForbiddenContent(narratives)) violations.add("FORBIDDEN_CONTENT");
    if (hasGeneratedUrl(narratives)) violations.add("GENERATED_URL");
    if (hasInventedNumber(narratives, context)) violations.add("INVENTED_NUMBER");
  }
  return [...violations];
}

export function assertAIResearchSemanticQuality(value: unknown, context: AIResearchContext): void {
  const violations = auditAIResearchSemanticQuality(value, context);
  if (violations.length > 0) throw new AIResearchValidationError("SEMANTIC_MISMATCH", violations);
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
  if (value.analysis_language !== "bilingual") fail();
  if (!isHash(value.snapshot_fingerprint) || !isHash(value.input_hash) || !isHash(value.output_hash)) fail();
  if (!isResearchState(value.research_state)) fail();
  const knownFacts = array(value.known_facts, 3, 5).map((item) => parseStoredFact(item));
  const risks = array(value.risk_factors, 1, 5).map((item) => parseStoredRisk(item));
  const missing = array(value.missing_information, 0, 5).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["key", "label", "explanation", "source_reference_ids"])) fail();
    return { key: text(item.key, 1, 80), label: text(item.label, 1, 140), explanation: bilingualText(item.explanation, 1, 280), source_reference_ids: stringArray(item.source_reference_ids, 1, 4, 80) };
  });
  const actions = array(value.next_actions, 1, 4).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["action_type", "label", "priority", "reason", "target_type", "target_reference"])) fail();
    if (!AI_RESEARCH_ACTION_TYPES.includes(item.action_type as never)) throw new AIResearchValidationError("FORBIDDEN_ACTION");
    if (item.priority !== "primary" && item.priority !== "secondary" && item.priority !== "tertiary") fail();
    if (item.target_type !== "internal_route" && item.target_type !== "external_url" && item.target_type !== "status") fail();
    const target = text(item.target_reference, 1, 2048);
    if (item.target_type === "external_url" && !isAllowedPublicUrl(target)) fail();
    if (item.target_type === "internal_route" && !target.startsWith("#")) fail();
    return { action_type: item.action_type, label: text(item.label, 1, 140), priority: item.priority, reason: bilingualText(item.reason, 1, 280), target_type: item.target_type, target_reference: target } as AIResearchNextAction;
  });
  const conditions = array(value.status_change_conditions, 0, 3).map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["key", "label", "explanation", "source_reference_ids"])) fail();
    return { key: text(item.key, 1, 80), label: text(item.label, 1, 140), explanation: bilingualText(item.explanation, 1, 280), source_reference_ids: stringArray(item.source_reference_ids, 1, 4, 80) };
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
  const capabilityViolations = missing.flatMap((item) => {
    const result: AIResearchSemanticViolation[] = [];
    if (!getAIResearchCapability(item.key)) result.push("UNSUPPORTED_MISSING_CAPABILITY");
    if (!isCapabilitySourceSupported(item, sources)) result.push("MISSING_SOURCE_MISMATCH");
    return result;
  });
  if (capabilityViolations.length > 0) throw new AIResearchValidationError("SEMANTIC_MISMATCH", [...new Set(capabilityViolations)]);
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
    summary: bilingualText(value.summary, 1, 600),
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
  assertNarrativePolicy(narrativeStringsFromSemantic(result, "en"), "en");
  assertNarrativePolicy(narrativeStringsFromSemantic(result, "pl"), "pl");
  return result;
}

function parseBindings(
  value: unknown,
  expectedIds: string[],
  maxLength: number,
): AIResearchNarrativeBinding[] {
  const items = array(value, expectedIds.length, expectedIds.length);
  return items.map((item, index) => {
    if (!isRecord(item) || !hasExactKeys(item, ["id", "en", "pl"])) fail();
    const id = text(item.id, 1, 120);
    if (id !== expectedIds[index]) throw new AIResearchValidationError("SKELETON_MISMATCH");
    return { id, en: text(item.en, 1, maxLength), pl: text(item.pl, 1, maxLength) };
  });
}

function parseStoredFact(value: unknown): AIResearchKnownFact {
  if (!isRecord(value) || !hasExactKeys(value, ["key", "label", "value", "interpretation", "source_reference_ids"])) fail();
  const primitive = value.value;
  if (primitive !== null && typeof primitive !== "string" && typeof primitive !== "number" && typeof primitive !== "boolean") fail();
  if (typeof primitive === "string" && primitive.length > 200) fail();
  if (typeof primitive === "number" && !Number.isFinite(primitive)) fail();
  return { key: text(value.key, 1, 80), label: text(value.label, 1, 140), value: primitive, interpretation: bilingualText(value.interpretation, 1, 280), source_reference_ids: stringArray(value.source_reference_ids, 1, 4, 80) };
}

function parseStoredRisk(value: unknown): AIResearchRiskFactor {
  if (!isRecord(value) || !hasExactKeys(value, ["severity", "category", "title", "explanation", "evidence_reference_ids"])) fail();
  if (!AI_RESEARCH_RISK_SEVERITIES.includes(value.severity as never)) fail();
  return { severity: value.severity, category: text(value.category, 1, 80), title: text(value.title, 1, 140), explanation: bilingualText(value.explanation, 1, 360), evidence_reference_ids: stringArray(value.evidence_reference_ids, 1, 4, 80) } as AIResearchRiskFactor;
}

function narrativeStringsFromProvider(value: AIResearchProviderNarrative, locale: "pl" | "en"): string[] {
  return [
    value.summary[locale],
    ...value.fact_narratives.map((item) => item[locale]),
    ...value.risk_narratives.map((item) => item[locale]),
    ...value.missing_narratives.map((item) => item[locale]),
    ...value.action_narratives.map((item) => item[locale]),
    ...value.status_change_narratives.map((item) => item[locale]),
  ];
}

function narrativeStringsFromSemantic(value: Record<string, unknown> | AIResearchBrief, locale: "pl" | "en"): string[] {
  const result: string[] = [];
  if (isBilingualText(value.summary)) result.push(value.summary[locale]);
  for (const [field, narrativeKeys] of [
    ["known_facts", ["interpretation"]],
    ["risk_factors", ["explanation"]],
    ["missing_information", ["explanation"]],
    ["next_actions", ["reason"]],
    ["status_change_conditions", ["explanation"]],
  ] as const) {
    const items = value[field];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!isRecord(item)) continue;
      for (const key of narrativeKeys) if (isBilingualText(item[key])) result.push(item[key][locale]);
    }
  }
  return result;
}

function assertNarrativePolicy(strings: string[], locale: "pl" | "en", context?: AIResearchContext): void {
  if (hasForbiddenContent(strings) || hasGeneratedUrl(strings)) throw new AIResearchValidationError("FORBIDDEN_CONTENT");
  if (hasRawEnum(strings) || hasMachineValue(strings, locale)) throw new AIResearchValidationError("RAW_MACHINE_VALUE");
  if (hasLanguageMismatch(strings, locale)) throw new AIResearchValidationError("LANGUAGE_MISMATCH");
  if (context && hasInventedNumber(strings, context)) throw new AIResearchValidationError("UNKNOWN_FACT");
}

function hasForbiddenContent(strings: string[]): boolean {
  const content = strings.join("\n").normalize("NFKC");
  const forbidden = /\b(?:buy|sell|trade|hold|deposit|connect\s+wallet|kup|kupuj|sprzedaj|sprzedaż|trzymaj|wejdź\s+w\s+pozycj|safe|bezpieczn(?:y|a|e)|gwarantowan(?:y|a|e)|guaranteed\s+profit|prawdopodobn(?:y|a)\s+zwrot|investment\s+recommendation|rekomendacj[aą]\s+inwestycyjn[aą]|ignore\s+(?:all\s+)?previous|system\s+prompt|developer\s+message|prompt\s+injection|promot(?:e|es|ed|ing|ion)|promuj|awansuj)\b/iu;
  return forbidden.test(content);
}

function hasGeneratedUrl(strings: string[]): boolean {
  return /(?:https?:\/\/|www\.|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|ai|app|dev|xyz|finance|exchange|co)\b)/iu.test(strings.join("\n"));
}

function hasRawEnum(strings: string[]): boolean {
  const content = strings.join("\n");
  const rawValues = [
    ...AI_RESEARCH_STATES,
    ...AI_RESEARCH_ACTION_TYPES,
    "FRESH", "DELAYED", "STALE", "UNKNOWN", "UNAVAILABLE",
    "passed_basic_filter", "rejected_basic_filter", "not_checked",
  ];
  return rawValues.some((value) => new RegExp(`\\b${escapeRegExp(value)}\\b`, "u").test(content));
}

function hasMachineValue(strings: string[], locale: "pl" | "en"): boolean {
  const content = strings.join("\n");
  if (/\b[a-z]+(?:_[a-z0-9]+)+\b/u.test(content)) return true;
  return locale === "pl" && /\b(?:new|follow[ -]?up|candidate|lifecycle|security)\b/iu.test(content);
}

function hasLanguageMismatch(strings: string[], locale: "pl" | "en"): boolean {
  const content = strings.join("\n");
  if (locale === "en") return /[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c]/u.test(content);
  return /\b(?:lifecycle|security|the\s+data|the\s+product|filters?\s+(?:are|is)|wait\s+for)\b/iu.test(content);
}

function hasInventedNumber(strings: string[], context: AIResearchContext): boolean {
  const allowed = new Set(numberTokens(stableJson(context)));
  return numberTokens(strings.join("\n")).some((token) => !allowed.has(token));
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
  if (typeof value !== "string" || value.length < min || value.length > max || hasControlCharacter(value)) fail();
  return value;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
  });
}

function bilingualText(value: unknown, min: number, max: number): AIResearchBilingualText {
  if (!isRecord(value) || !hasExactKeys(value, ["en", "pl"])) fail();
  return { en: text(value.en, min, max), pl: text(value.pl, min, max) };
}

function isBilingualText(value: unknown): value is AIResearchBilingualText {
  return isRecord(value) && typeof value.en === "string" && typeof value.pl === "string";
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

function samePrimitive(left: unknown, right: unknown): boolean {
  return left === right && (left === null || ["string", "number", "boolean"].includes(typeof left));
}

function sameStringArray(value: unknown, expected: string[]): boolean {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => item === expected[index]);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(): never {
  throw new AIResearchValidationError("SCHEMA_MISMATCH");
}
