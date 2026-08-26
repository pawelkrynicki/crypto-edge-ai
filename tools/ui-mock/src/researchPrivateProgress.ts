import type { PrivateResearchProgressState } from "./researchChecklistTypes";

export function privateResearchProgressLabel(state: PrivateResearchProgressState, locale: "pl" | "en"): string {
  const labels: Record<PrivateResearchProgressState, Record<"pl" | "en", string>> = {
    NOT_STARTED: { pl: "Nie rozpoczęto", en: "Not started" },
    IN_PROGRESS: { pl: "W trakcie", en: "In progress" },
    REVIEWED: { pl: "Sprawdzone przeze mnie", en: "Reviewed by me" },
  };
  return labels[state][locale];
}
