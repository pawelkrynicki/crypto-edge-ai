import type { ResearchStepNumber } from "./researchChecklistTypes";

export type ResearchPlaybookProgressState = "COMPLETED" | "CURRENT" | "PENDING";

/** Maps the server-owned current step into a display-only playbook state. */
export function resolveResearchPlaybookProgressState(
  step: ResearchStepNumber,
  currentStep: ResearchStepNumber,
): ResearchPlaybookProgressState {
  if (step === currentStep) return "CURRENT";
  return step < currentStep ? "COMPLETED" : "PENDING";
}
