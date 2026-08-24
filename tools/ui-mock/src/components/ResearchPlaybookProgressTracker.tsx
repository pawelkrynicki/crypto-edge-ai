import React from "react";
import { RESEARCH_PLAYBOOK_STAGE_COUNT, RESEARCH_PLAYBOOK_STAGES, type ResearchPlaybookLocale } from "../researchPlaybookStages";
import type { ResearchStepNumber } from "../researchChecklistTypes";
import { resolveResearchPlaybookProgressState, type ResearchPlaybookProgressState } from "../researchPlaybookProgressState";

void React;

/**
 * Read-only presentation of the server-owned guidance. It deliberately has no
 * controls: seeing a later stage cannot change the current step or write data.
 */
export function ResearchPlaybookProgressTracker({
  currentStep,
  unlockConditions,
  locale,
}: {
  currentStep: ResearchStepNumber;
  unlockConditions: readonly string[];
  locale: ResearchPlaybookLocale;
}) {
  const pl = locale === "pl";
  const hasNextStep = currentStep < RESEARCH_PLAYBOOK_STAGE_COUNT;
  const unlockHeading = pl ? "Co odblokuje kolejny etap" : "What unlocks the next stage";
  const fallback = pl
    ? "Ukończ bieżący krok zgodnie z widocznymi wymaganiami."
    : "Complete the current step using the requirements shown here.";
  return <section className="research-playbook-progress-tracker" data-research-playbook-progress-tracker aria-label={pl ? "Ścieżka siedmiu etapów Research Playbook" : "Seven-stage Research Playbook path"}>
    <div className="research-playbook-progress-heading">
      <span>{pl ? "ŚCIEŻKA RESEARCHU" : "RESEARCH PATH"}</span>
      <strong>{pl ? `${RESEARCH_PLAYBOOK_STAGE_COUNT} etapów` : `${RESEARCH_PLAYBOOK_STAGE_COUNT} stages`}</strong>
    </div>
    <ol className="research-playbook-progress-stages">
      {RESEARCH_PLAYBOOK_STAGES.map((stage) => {
        const state = resolveResearchPlaybookProgressState(stage.number, currentStep);
        const stateLabel = progressStateLabel(state, locale);
        return <li
          key={stage.number}
          className={`research-playbook-progress-stage ${state.toLowerCase()}`}
          data-research-playbook-progress-stage={stage.number}
          data-research-playbook-progress-state={state}
          aria-current={state === "CURRENT" ? "step" : undefined}
          aria-label={pl
            ? `Etap ${stage.number} z ${RESEARCH_PLAYBOOK_STAGE_COUNT}: ${stage.labels.pl} — ${stateLabel}`
            : `Stage ${stage.number} of ${RESEARCH_PLAYBOOK_STAGE_COUNT}: ${stage.labels.en} — ${stateLabel}`}
        >
          <span className="research-playbook-progress-marker" aria-hidden="true">{progressStateMarker(state)}</span>
          <span className="research-playbook-progress-name"><b>{stage.number}</b>{stage.labels[locale]}</span>
          <span className="research-playbook-progress-state-label">{stateLabel}</span>
        </li>;
      })}
    </ol>
    <div className="research-playbook-progress-unlock" data-research-playbook-progress-unlock>
      <strong>{hasNextStep ? unlockHeading : (pl ? "Ostatni etap" : "Final stage")}</strong>
      {hasNextStep
        ? <ul>{unlockConditions.length > 0
          ? unlockConditions.map((condition, index) => <li key={`${condition}-${index}`}>{condition}</li>)
          : <li>{fallback}</li>}</ul>
        : <p>{pl ? "Nie ma kolejnego etapu do odblokowania." : "There is no later stage to unlock."}</p>}
    </div>
  </section>;
}

function progressStateLabel(state: ResearchPlaybookProgressState, locale: ResearchPlaybookLocale): string {
  const labels: Record<ResearchPlaybookProgressState, Record<ResearchPlaybookLocale, string>> = {
    COMPLETED: { pl: "Ukończony", en: "Completed" },
    CURRENT: { pl: "Bieżący", en: "Current" },
    LOCKED: { pl: "Zablokowany", en: "Locked" },
  };
  return labels[state][locale];
}

function progressStateMarker(state: ResearchPlaybookProgressState): string {
  if (state === "COMPLETED") return "✓";
  if (state === "CURRENT") return "●";
  return "⌁";
}
