import React from "react";

void React;
import {
  TOKEN_LIFECYCLE_STAGES,
  type TokenLifecycleBlockingCondition,
  type TokenLifecycleNextActionType,
  type TokenLifecycleStage,
  type TokenLifecycleStageState,
  type TokenLifecycleTrackingStatus,
  type TokenLifecycleViewModel,
} from "../tokenLifecycle";
import { useProductLocale, type ProductLocale } from "../productI18n";

type TokenLifecycleFlowProps = {
  model: TokenLifecycleViewModel;
  compact?: boolean;
  showCheckpoints?: boolean;
  className?: string;
};

const FLOW_COPY = {
  en: {
    aria: "Token lifecycle",
    stages: {
      new: "New",
      follow_up: "Follow-up",
      candidate: "Candidate for Established",
      established: "Main Radar",
    },
    states: {
      completed: "Completed",
      current: "Current",
      pending: "Pending",
      blocked: "Blocked",
      unavailable: "Unavailable",
    },
    tracking: {
      active: ["Automatic tracking active", "No manual move is required. The central collector manages the next checkpoint."],
      waiting: ["Waiting for follow-up enrollment", "Enrollment will happen during the next central data cycle."],
      candidate: ["Candidate for Established", "Basic filters were met. It was not promoted automatically; an owner decision is required."],
      established: ["Main Radar", "The enabled Established Universe is the source of truth for this status."],
      blocked: ["Tracking cannot start", "Complete the token identity before automatic tracking can begin."],
      unavailable: ["Follow-up data unavailable", "Tracking status cannot be confirmed until the read-only Follow-up data returns."],
      complete: ["Follow-up complete", "The checkpoint plan ended without automatic promotion to Established."],
    },
    checkpoints: "Checkpoint path",
    checkpointState: {
      completed: "Completed",
      current: "Expected now",
      future: "Future",
      skipped: "Data unavailable — pending retry",
    },
    nextAction: "Next action",
    action: {
      automatic_enrollment: "Automatic enrollment during the next central data cycle",
      automatic_checkpoint: "Automatic checkpoint",
      owner_decision: "Owner decision",
      main_radar_monitoring: "Main Radar monitoring",
      resolve_identity: "Complete chain and contract address",
      restore_follow_up_data: "Restore read-only Follow-up data",
      observation_complete: "Keep the completed Follow-up history",
    },
    blocking: {
      INCOMPLETE_IDENTITY: "Incomplete token identity",
      INVALID_CONTRACT_ADDRESS: "Invalid contract address",
      UNSUPPORTED_CHAIN: "Unsupported network",
      FOLLOW_UP_DATA_UNAVAILABLE: "Follow-up data unavailable",
      FILTERS_NOT_MET: "Basic filters are not currently met",
      DATA_INCOMPLETE: "Some checkpoint data is unavailable",
      OWNER_DECISION_PENDING: "Owner decision pending",
      OBSERVATION_COMPLETE_NO_CANDIDATE: "Observation ended without candidate status",
    },
    noBlockers: "No blocker reported for the current automatic step",
    noBlockersShort: "No blockers",
    cardSummary: {
      active: "Automatic tracking is active; the next checkpoint will run automatically.",
      waiting: "Waiting for automatic Follow-up enrollment during the next data cycle.",
      candidate: "Basic filters are met; the next step is an owner decision.",
      established: "This token is in Main Radar; the Established Universe is the source of truth.",
      blocked: "Automatic Follow-up enrollment is blocked until the technical identity is valid.",
      unavailable: "Automatic tracking cannot be confirmed while Follow-up data is unavailable.",
      complete: "The Follow-up checkpoint plan is complete.",
    },
  },
  pl: {
    aria: "Przepływ obserwacji tokena",
    stages: {
      new: "Nowe",
      follow_up: "Dalsza obserwacja",
      candidate: "Kandydat do Established",
      established: "Główny Radar",
    },
    states: {
      completed: "Ukończony",
      current: "Aktualny",
      pending: "Oczekujący",
      blocked: "Zablokowany",
      unavailable: "Niedostępny",
    },
    tracking: {
      active: ["Automatyczne śledzenie aktywne", "Nie wymaga ręcznego przenoszenia. Centralny collector zarządza następnym checkpointem."],
      waiting: ["Oczekuje na zapis do dalszej obserwacji", "Zapis nastąpi podczas najbliższego centralnego cyklu danych."],
      candidate: ["Kandydat do Established", "Podstawowe filtry zostały spełnione. Nie dodano automatycznie; wymagana jest decyzja właściciela."],
      established: ["Główny Radar", "Źródłem prawdy dla tego statusu jest aktywny wpis w Established Universe."],
      blocked: ["Nie można rozpocząć śledzenia", "Uzupełnij tożsamość tokena, aby rozpocząć automatyczne śledzenie."],
      unavailable: ["Dane Follow-up niedostępne", "Statusu śledzenia nie można potwierdzić do powrotu danych Follow-up tylko do odczytu."],
      complete: ["Dalsza obserwacja zakończona", "Plan checkpointów zakończył się bez automatycznej promocji do Established."],
    },
    checkpoints: "Oś checkpointów",
    checkpointState: {
      completed: "Ukończony",
      current: "Oczekiwany teraz",
      future: "Przyszły",
      skipped: "Brak danych — oczekuje na ponowienie",
    },
    nextAction: "Następny krok",
    action: {
      automatic_enrollment: "Automatyczny zapis w najbliższym centralnym cyklu danych",
      automatic_checkpoint: "Automatyczny checkpoint",
      owner_decision: "Decyzja właściciela",
      main_radar_monitoring: "Monitoring w Głównym Radarze",
      resolve_identity: "Uzupełnienie chain i contract_address",
      restore_follow_up_data: "Przywrócenie danych Follow-up tylko do odczytu",
      observation_complete: "Zachowanie zakończonej historii Follow-up",
    },
    blocking: {
      INCOMPLETE_IDENTITY: "Niepełna tożsamość tokena",
      INVALID_CONTRACT_ADDRESS: "Brak poprawnego adresu kontraktu",
      UNSUPPORTED_CHAIN: "Nieobsługiwana sieć",
      FOLLOW_UP_DATA_UNAVAILABLE: "Dane Follow-up są niedostępne",
      FILTERS_NOT_MET: "Podstawowe filtry nie są obecnie spełnione",
      DATA_INCOMPLETE: "Część danych checkpointu jest niedostępna",
      OWNER_DECISION_PENDING: "Oczekuje na decyzję właściciela",
      OBSERVATION_COMPLETE_NO_CANDIDATE: "Obserwacja zakończona bez statusu kandydata",
    },
    noBlockers: "Brak blokad dla automatycznego zapisu.",
    noBlockersShort: "Brak blokad",
    cardSummary: {
      active: "Automatyczne śledzenie jest aktywne; następny checkpoint wykona się automatycznie.",
      waiting: "Oczekuje na automatyczny zapis do Dalszej obserwacji podczas najbliższego cyklu danych.",
      candidate: "Podstawowe filtry są spełnione; następnym krokiem jest decyzja właściciela.",
      established: "Token znajduje się w Głównym Radarze; źródłem prawdy jest Established Universe.",
      blocked: "Automatyczny zapis do Dalszej obserwacji jest zablokowany do czasu poprawienia tożsamości technicznej.",
      unavailable: "Nie można potwierdzić automatycznego śledzenia, gdy dane Follow-up są niedostępne.",
      complete: "Plan checkpointów Dalszej obserwacji został zakończony.",
    },
  },
} as const;

export function TokenLifecycleFlow({
  model,
  compact = false,
  showCheckpoints = false,
  className = "",
}: TokenLifecycleFlowProps) {
  const { locale } = useProductLocale();
  const copy = FLOW_COPY[locale];
  return (
    <div className={`token-lifecycle-flow ${compact ? "compact" : ""} ${className}`.trim()}>
      <ol className="token-lifecycle-stages" aria-label={copy.aria}>
        {model.stages.map((stage, index) => (
          <li
            key={stage.id}
            className={`token-lifecycle-stage ${stage.state}`}
            aria-current={stage.state === "current" ? "step" : undefined}
            data-stage={stage.id}
            data-state={stage.state}
          >
            <span className="token-lifecycle-index" aria-hidden="true">{index + 1}</span>
            <span className="token-lifecycle-stage-copy">
              <strong>{stageLabel(stage.id, locale)}</strong>
              <small>{stageStateLabel(stage.state, locale)}</small>
            </span>
          </li>
        ))}
      </ol>
      {showCheckpoints && <TokenCheckpointAxis model={model} />}
    </div>
  );
}

export function TokenLifecycleStatus({ model }: { model: TokenLifecycleViewModel }) {
  const { locale } = useProductLocale();
  const copy = FLOW_COPY[locale];
  const [title, detail] = copy.tracking[model.tracking_status];
  return (
    <div className={`token-lifecycle-status ${model.tracking_status}`} role="status">
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <dl>
        <div>
          <dt>{copy.nextAction}</dt>
          <dd>{actionLabel(model.next_action_type, locale)}</dd>
        </div>
        <div>
          <dt>{locale === "pl" ? "Co blokuje przejście" : "What blocks progress"}</dt>
          <dd>{model.blocking_conditions.length > 0
            ? model.blocking_conditions.map((condition) => blockingLabel(condition, locale)).join(" · ")
            : copy.noBlockers}</dd>
        </div>
      </dl>
    </div>
  );
}

export function TokenLifecycleCardSummary({ model }: { model: TokenLifecycleViewModel }) {
  const { locale } = useProductLocale();
  const copy = FLOW_COPY[locale];
  const blockers = model.blocking_conditions.map((condition) => blockingLabel(condition, locale));
  return (
    <div className={`token-lifecycle-card-summary ${model.tracking_status}`} role="status">
      <p>{copy.cardSummary[model.tracking_status]}</p>
      <span className={blockers.length > 0 ? "has-blockers" : "no-blockers"}>
        {blockers.length > 0 ? blockers.join(" · ") : copy.noBlockersShort}
      </span>
    </div>
  );
}

export function TokenCheckpointAxis({ model }: { model: TokenLifecycleViewModel }) {
  const { locale } = useProductLocale();
  const copy = FLOW_COPY[locale];
  return (
    <div className="token-checkpoint-axis">
      <strong>{copy.checkpoints}</strong>
      <ol aria-label={copy.checkpoints}>
        {model.checkpoints.map((checkpoint) => (
          <li key={checkpoint.day} className={checkpoint.state} data-checkpoint-state={checkpoint.state}>
            <span>{checkpoint.day}</span>
            <strong>{checkpoint.day === 1 ? (locale === "pl" ? "dzień" : "day") : (locale === "pl" ? "dni" : "days")}</strong>
            <small>{copy.checkpointState[checkpoint.state]}</small>
          </li>
        ))}
      </ol>
      <p>{locale === "pl"
        ? "Checkpoint oznacza termin ponownej oceny danych, a nie akceptację tokena."
        : "A checkpoint is a data reassessment date, not token acceptance."}</p>
    </div>
  );
}

export function lifecycleStageLabel(stage: TokenLifecycleStage, locale: ProductLocale): string {
  return stageLabel(stage, locale);
}

export function lifecycleActionLabel(action: TokenLifecycleNextActionType, locale: ProductLocale): string {
  return actionLabel(action, locale);
}

export function lifecycleBlockingLabel(
  condition: TokenLifecycleBlockingCondition,
  locale: ProductLocale,
): string {
  return blockingLabel(condition, locale);
}

export function lifecycleTrackingTitle(
  status: TokenLifecycleTrackingStatus,
  locale: ProductLocale,
): string {
  return FLOW_COPY[locale].tracking[status][0];
}

function stageLabel(stage: TokenLifecycleStage, locale: ProductLocale): string {
  return FLOW_COPY[locale].stages[stage];
}

function stageStateLabel(state: TokenLifecycleStageState, locale: ProductLocale): string {
  return FLOW_COPY[locale].states[state];
}

function actionLabel(action: TokenLifecycleNextActionType, locale: ProductLocale): string {
  return FLOW_COPY[locale].action[action];
}

function blockingLabel(condition: TokenLifecycleBlockingCondition, locale: ProductLocale): string {
  return FLOW_COPY[locale].blocking[condition];
}

export function hasCompleteLifecycle(model: TokenLifecycleViewModel): boolean {
  return TOKEN_LIFECYCLE_STAGES.every((stage) => (
    stage === "established"
      ? model.current_stage === "established"
      : model.completed_stages.includes(stage)
  ));
}
