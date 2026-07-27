export const AI_RESEARCH_NARRATIVE_VERSION = "ai_research_narrative_v2" as const;

export type AIResearchNarrativeKind = "fact" | "risk" | "missing" | "action" | "condition";

export function aiResearchNarrativeId(kind: AIResearchNarrativeKind, key: string | number): string {
  return `${kind}:${key}`;
}
