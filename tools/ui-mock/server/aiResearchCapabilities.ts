import type { AIResearchMissingInformation, AIResearchSourceReference } from "../src/types/aiResearchTypes.js";

export type AIResearchCapabilityId =
  | "security"
  | "history"
  | "next_checkpoint"
  | "fresh_data"
  | "source_verification";

export type AIResearchCapability = {
  id: AIResearchCapabilityId;
  source_reference_ids: readonly string[];
  source_types: readonly AIResearchSourceReference["source_type"][];
};

export const AI_RESEARCH_CAPABILITY_REGISTRY: Readonly<Record<AIResearchCapabilityId, AIResearchCapability>> = {
  security: {
    id: "security",
    source_reference_ids: ["security_status"],
    source_types: ["security_status"],
  },
  history: {
    id: "history",
    source_reference_ids: ["follow_up_checkpoints"],
    source_types: ["follow_up_checkpoint"],
  },
  next_checkpoint: {
    id: "next_checkpoint",
    source_reference_ids: ["follow_up_checkpoints"],
    source_types: ["follow_up_checkpoint"],
  },
  fresh_data: {
    id: "fresh_data",
    source_reference_ids: ["scanner_snapshot"],
    source_types: ["scanner_snapshot"],
  },
  source_verification: {
    id: "source_verification",
    source_reference_ids: ["scanner_snapshot"],
    source_types: ["scanner_snapshot"],
  },
};

export function getAIResearchCapability(value: string): AIResearchCapability | null {
  return Object.prototype.hasOwnProperty.call(AI_RESEARCH_CAPABILITY_REGISTRY, value)
    ? AI_RESEARCH_CAPABILITY_REGISTRY[value as AIResearchCapabilityId]
    : null;
}

export function isCapabilitySourceSupported(
  missing: Pick<AIResearchMissingInformation, "key" | "source_reference_ids">,
  sources: AIResearchSourceReference[],
): boolean {
  const capability = getAIResearchCapability(missing.key);
  if (!capability || missing.source_reference_ids.length === 0) return false;
  const catalog = new Map(sources.map((source) => [source.id, source]));
  return missing.source_reference_ids.every((id) => {
    const source = catalog.get(id);
    return Boolean(source)
      && capability.source_reference_ids.includes(id)
      && capability.source_types.includes(source!.source_type);
  });
}
