import React from "react";
import { RESEARCH_PLAYBOOK_STAGE_COUNT, RESEARCH_PLAYBOOK_STAGES, type ResearchPlaybookLocale } from "../researchPlaybookStages";
import type { ResearchChecklistState, ResearchStepNumber } from "../researchChecklistTypes";
import { resolveResearchPlaybookProgressState, type ResearchPlaybookProgressState } from "../researchPlaybookProgressState";

void React;

/**
 * Read-only presentation of the canonical Checklist view. It deliberately has
 * no controls: seeing a later stage cannot change the current step or write data.
 */
export function ResearchPlaybookProgressTracker({
  currentStep,
  stageStates,
  locale,
}: {
  currentStep: ResearchStepNumber;
  stageStates?: ReadonlyMap<ResearchStepNumber, ResearchChecklistState>;
  locale: ResearchPlaybookLocale;
}) {
  const pl = locale === "pl";
  const hasNextStep = currentStep < RESEARCH_PLAYBOOK_STAGE_COUNT;
  return <section className="research-playbook-progress-tracker" data-research-playbook-progress-tracker aria-label={pl ? "Ścieżka siedmiu etapów Research Playbook" : "Seven-stage Research Playbook path"}>
    <div className="research-playbook-progress-heading">
      <span>{pl ? "ŚCIEŻKA RESEARCHU" : "RESEARCH PATH"}</span>
      <strong>{pl ? `${RESEARCH_PLAYBOOK_STAGE_COUNT} etapów` : `${RESEARCH_PLAYBOOK_STAGE_COUNT} stages`}</strong>
    </div>
    <ol className="research-playbook-progress-stages">
      {RESEARCH_PLAYBOOK_STAGES.map((stage) => {
        const state = resolveResearchPlaybookProgressState(stage.number, currentStep);
        const canonicalItemState = stageStates?.get(stage.number);
        const completedWithPartialData = state === "COMPLETED"
          && (canonicalItemState === "MISSING_DATA" || canonicalItemState === "OPEN_EXTERNAL_TOOL");
        const stateLabel = progressStateLabel(state, locale, completedWithPartialData);
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
          {canonicalItemState && !completedWithPartialData && <span className="research-playbook-progress-evidence" data-research-playbook-stage-evidence={stage.number}>{canonicalStateLabel(canonicalItemState, locale)}</span>}
        </li>;
      })}
    </ol>
    <p className="research-playbook-progress-unlock" data-research-playbook-progress-unlock>
      {hasNextStep
        ? (pl ? "Otwórz dowolny etap, aby zobaczyć dostępne fakty i wymagania." : "Open any stage to see its available facts and requirements.")
        : (pl ? "Ostatni etap pozostaje dostępny do przeglądu." : "The final stage remains available for review.")}
    </p>
  </section>;
}

function progressStateLabel(state: ResearchPlaybookProgressState, locale: ResearchPlaybookLocale, completedWithPartialData = false): string {
  if (state === "COMPLETED" && completedWithPartialData) return locale === "pl" ? "Ukończony, częściowe dane" : "Completed, partial data";
  const labels: Record<ResearchPlaybookProgressState, Record<ResearchPlaybookLocale, string>> = {
    COMPLETED: { pl: "Ukończony", en: "Completed" },
    CURRENT: { pl: "Bieżący", en: "Current" },
    PENDING: { pl: "Kolejny etap", en: "Later stage" },
  };
  return labels[state][locale];
}

function progressStateMarker(state: ResearchPlaybookProgressState): string {
  if (state === "COMPLETED") return "✓";
  if (state === "CURRENT") return "●";
  return "○";
}

function canonicalStateLabel(state: ResearchChecklistState, locale: ResearchPlaybookLocale): string {
  const labels: Record<ResearchChecklistState, Record<ResearchPlaybookLocale, string>> = {
    AUTO_VERIFIED: { pl: "Sprawdzone automatycznie", en: "Automatically checked" },
    MANUAL_VERIFIED: { pl: "Sprawdzone ręcznie", en: "Manually checked" },
    MISSING_DATA: { pl: "Brak danych", en: "Missing data" },
    RED_FLAG: { pl: "Czerwona flaga", en: "Red flag" },
    NOT_APPLICABLE: { pl: "Nie dotyczy", en: "Not applicable" },
    OPEN_EXTERNAL_TOOL: { pl: "Wymaga kontroli", en: "Needs review" },
  };
  return labels[state][locale];
}
