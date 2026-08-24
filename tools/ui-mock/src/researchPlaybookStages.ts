import type { ResearchStepNumber } from "./researchChecklistTypes";

export type ResearchPlaybookLocale = "pl" | "en";

/**
 * Canonical public names for the fixed seven-step Research Playbook. Step
 * numbers remain the contract IDs used by the resolver and persisted evidence.
 */
export const RESEARCH_PLAYBOOK_STAGES = [
  { number: 1, labels: { pl: "Szybki filtr", en: "Quick filter" } },
  { number: 2, labels: { pl: "Deal Breakers", en: "Deal breakers" } },
  { number: 3, labels: { pl: "Bezpieczeństwo / 3 kontrole", en: "Security / 3 checks" } },
  { number: 4, labels: { pl: "On-chain", en: "On-chain" } },
  { number: 5, labels: { pl: "Social", en: "Social" } },
  { number: 6, labels: { pl: "Scorecard", en: "Scorecard" } },
  { number: 7, labels: { pl: "Finalna checklista", en: "Final research checklist" } },
] as const satisfies readonly { number: ResearchStepNumber; labels: Record<ResearchPlaybookLocale, string> }[];

export const RESEARCH_PLAYBOOK_STAGE_COUNT = RESEARCH_PLAYBOOK_STAGES.length;

export function researchPlaybookStageName(step: ResearchStepNumber, locale: ResearchPlaybookLocale): string {
  return RESEARCH_PLAYBOOK_STAGES.find((stage) => stage.number === step)?.labels[locale] ?? String(step);
}
