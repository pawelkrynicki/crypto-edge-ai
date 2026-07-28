import React, { useEffect, useState } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
import type {
  ControlCenterBlocker,
  ControlCenterReadinessStatus,
  ControlCenterStatus,
} from "../controlCenterStatus";
import {
  formatProductDateTime,
  PRODUCT_TRANSLATIONS,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";
import { formatProductRuntimeMode, formatProductSourceLabel } from "../productPresentation";
import type { AutomationStatus } from "../services/automationStatusDataSource";
import { loadOwnerOperationsStatus, type OwnerOperationsStatus } from "../services/ownerOperationsDataSource";
import { OwnerOperationsPanel } from "./OwnerOperationsPanel";
import { TechnicalDetails } from "./ProductUi";

type Translator = (
  key: keyof typeof PRODUCT_TRANSLATIONS.en,
  variables?: Record<string, string | number>,
) => string;

const BLOCKER_TRANSLATION_KEYS: Record<
  ControlCenterBlocker,
  keyof typeof PRODUCT_TRANSLATIONS.en
> = {
  REPORTS_LIBRARY: "control.blockers.reportsLibrary",
  PERSISTENT_FEEDBACK_CAPTURE: "control.blockers.persistentFeedback",
  TRUSTED_TESTER_PREVIEW_MODE: "control.blockers.previewMode",
  VPS_DEPLOYMENT: "control.blockers.deployment",
  DOMAIN_ACCESS_SMOKE: "control.blockers.accessSmoke",
  ROLLBACK_TEST: "control.blockers.rollback",
  OWNER_TESTER_APPROVAL: "control.blockers.ownerApproval",
};

const RELEASE_GATE_CHECKLIST: readonly ControlCenterBlocker[] = [
  "TRUSTED_TESTER_PREVIEW_MODE",
  "VPS_DEPLOYMENT",
  "DOMAIN_ACCESS_SMOKE",
  "ROLLBACK_TEST",
  "OWNER_TESTER_APPROVAL",
];

export function ProductControlCenter({
  status,
  automationStatus,
  ownerOperationsStatus: providedOwnerOperationsStatus,
}: {
  status: ControlCenterStatus | null;
  automationStatus?: AutomationStatus | null;
  ownerOperationsStatus?: OwnerOperationsStatus | null;
}) {
  const { locale, t } = useProductLocale();
  const ui = CONTROL_UI_COPY[locale];
  const overallStatus = status?.overallStatus ?? "NOT_READY";
  const openReleaseGateCount = status
    ? RELEASE_GATE_CHECKLIST.filter((gate) => status.unmetGates.includes(gate)).length
    : RELEASE_GATE_CHECKLIST.length;
  const nextReleaseGate = RELEASE_GATE_CHECKLIST.find((gate) => (
    status === null || status.unmetGates.includes(gate)
  ));
  const [loadedOwnerOperationsStatus, setLoadedOwnerOperationsStatus] = useState<OwnerOperationsStatus | null>(null);
  const ownerOperationsStatus = providedOwnerOperationsStatus === undefined
    ? loadedOwnerOperationsStatus
    : providedOwnerOperationsStatus;

  useEffect(() => {
    if (providedOwnerOperationsStatus !== undefined) return;
    let active = true;
    void loadOwnerOperationsStatus().then((nextStatus) => {
      if (active && nextStatus) setLoadedOwnerOperationsStatus(nextStatus);
    });
    return () => { active = false; };
  }, [providedOwnerOperationsStatus]);

  return (
    <div className="control-center product-control-center">
      <section className="control-center-hero product-control-center-hero">
        <div className="control-center-hero-copy">
          <span className="section-label">{t("control.previewReadiness")}</span>
          <h3>{t("control.trustedTesterPreview")}</h3>
          <p>{t("control.summaryExplanation")}</p>
        </div>
        <div className="product-control-overall">
          <span className="product-control-release-label">{ui.testerReleaseReadiness}</span>
          <StatusBadge status={overallStatus} t={t} />
          <strong>{openReleaseGateCount}</strong>
          <span>{ui.blockerCount}</span>
        </div>
      </section>

      <p className="control-center-research-note product-control-boundary">
        {t("control.researchBoundary")}
      </p>

      {status ? (
        <div className="product-control-groups" aria-label={t("control.areas") }>
          <ControlGroup number="01" title={ui.dataReadiness} description={ui.dataReadinessHelp}>
          <ControlCard
            title={t("control.runtime.title")}
            status={status.runtimeApi.status}
            explanation={t("control.runtime.explanation")}
            nextStep={t("control.runtime.next")}
            details={[
              [t("control.field.runtimeMode"), formatProductRuntimeMode(status.runtimeApi.runtimeMode, locale)],
              [t("control.field.healthAvailable"), booleanValue(status.runtimeApi.healthAvailable, t)],
              [t("control.field.apiConnected"), booleanValue(status.runtimeApi.apiConnected, t)],
              [t("control.field.sameOriginResponse"), booleanValue(status.runtimeApi.sameOriginResponseValid, t)],
              [t("control.field.readiness"), readinessValue(status.runtimeApi.readiness, t)],
              [t("control.field.buildSha"), status.runtimeApi.buildSha ?? t("app.noData")],
            ]}
            t={t}
          />
          <ControlCard
            title={t("control.data.title")}
            status={status.dataSnapshots.status}
            badgeLabel={status.dataSnapshots.status === "READY" ? t("control.data.mechanismReady") : undefined}
            explanation={t("control.data.explanation")}
            nextStep={t("control.data.next")}
            details={[
              [t("control.field.publishedSnapshot"), publishedSnapshotValue(automationStatus, status.automation.lastResult, t)],
              [t("control.field.snapshotTime"), dateValue(
                automationStatus?.snapshot_generated_at
                  ?? status.dataSnapshots.scanner.generatedAt
                  ?? status.dataSnapshots.context.generatedAt,
                locale,
                t,
              )],
              [t("control.field.lastAttempt"), dateValue(
                automationStatus?.last_attempt_at ?? status.automation.lastRunAt,
                locale,
                t,
              )],
              [t("control.field.lastFullSuccess"), dateValue(automationStatus?.last_success_at ?? null, locale, t)],
              [t("control.field.partialSource"), partialSourceValue(automationStatus, status.sources.affectedSourceIds, t)],
              [t("control.field.scannerFreshness"), freshnessValue(status.dataSnapshots.scanner.freshness, t)],
              [t("control.field.contextFreshness"), freshnessValue(status.dataSnapshots.context.freshness, t)],
              [t("control.field.lastKnownGood"), booleanValue(
                status.dataSnapshots.scanner.lastKnownGood || status.dataSnapshots.context.lastKnownGood,
                t,
              )],
              [t("control.field.newObservation"), String(status.dataSnapshots.scanner.newObservationCount)],
              [t("control.field.establishedAfterFilters"), String(status.dataSnapshots.scanner.establishedAfterFilters)],
            ]}
            detailsVisible
            t={t}
          />
          <ControlCard
            title={t("control.sources.title")}
            status={status.sources.status}
            explanation={t("control.sources.explanation")}
            nextStep={t("control.sources.next")}
            details={[
              [t("control.field.availability"), sourceAvailabilityValue(status.sources.availability, t)],
              [t("app.sources"), status.sources.sourceIds.map(formatProductSourceLabel).join(", ") || t("app.noData")],
              [t("control.field.affectedSources"), status.sources.affectedSourceIds.map(formatProductSourceLabel).join(", ") || t("app.noData")],
            ]}
            t={t}
          />
          </ControlGroup>

          <ControlGroup number="02" title={ui.productCapabilities} description={ui.productCapabilitiesHelp}>
          <ControlCard
            title={t("control.universe.title")}
            status={status.establishedUniverse.status}
            explanation={t("control.universe.explanation")}
            nextStep={t("control.universe.next")}
            details={[
              [t("radar.validationStatus"), validationValue(status.establishedUniverse.validationStatus, t)],
              [t("radar.universeVersion"), status.establishedUniverse.universeVersion ?? t("app.noData")],
              [t("radar.activeEntries"), String(status.establishedUniverse.entriesEnabled)],
              [t("control.field.lastChange"), dateValue(status.establishedUniverse.lastChangeAt, locale, t)],
              ...(ownerOperationsStatus
                ? [[
                  locale === "pl" ? "Status decyzji właściciela" : "Owner decision status",
                  ownerCapabilityValue(ownerOperationsStatus.mode, locale),
                ] as [string, string]]
                : []),
            ]}
            detailsVisible
            t={t}
          />
          <ControlCard
            title={t("control.followUp.title")}
            status={status.followUp.status}
            explanation={t("control.followUp.explanation")}
            nextStep={t("control.followUp.next")}
            details={[
              [t("control.field.storeStatus"), statusLabel(status.followUp.status, t)],
              [t("control.field.activeFollowUp"), String(status.followUp.activeEntries)],
              [t("control.field.dueFollowUp"), String(status.followUp.dueEntries)],
              [t("control.field.candidateFollowUp"), String(status.followUp.candidateEntries)],
              [t("control.field.nextDue"), dateValue(status.followUp.nextDueAt, locale, t)],
              [locale === "pl" ? "Ostatni ingest / zapis store" : "Last ingest / store update", dateValue(status.followUp.lastUpdatedAt, locale, t)],
              [
                t("control.field.centralCycleHandling"),
                status.followUp.storeAvailable
                  && (status.followUp.validationStatus === "valid" || status.followUp.validationStatus === "recovered")
                  ? t("control.value.active")
                  : (locale === "pl" ? "Niedostępne" : "Unavailable"),
              ],
              [t("control.field.centralCycleSchedule"), t("control.value.notInstalled")],
            ]}
            detailsVisible
            t={t}
          />
          <ControlCard
            title={t("control.review.title")}
            status={status.reviewStorage.status}
            explanation={status.reviewStorage.entriesCount === 0
              ? t("control.review.noSaves")
              : t("control.review.explanation")}
            nextStep={t("control.review.next")}
            details={[
              [t("control.field.storageAvailable"), booleanValue(status.reviewStorage.available, t)],
              [t("control.field.savedReviews"), String(status.reviewStorage.entriesCount)],
              [t("control.field.lastSaved"), dateValue(status.reviewStorage.lastSavedAt, locale, t)],
            ]}
            t={t}
          />
          <ControlCard
            title={t("control.reports.title")}
            status={status.reports.status}
            explanation={t("control.reports.explanation")}
            nextStep={t("control.reports.next")}
            details={[
              [t("control.field.libraryStatus"), statusLabel(status.reports.status, t)],
              [t("control.field.reportCount"), String(status.reports.reportCount)],
              [t("control.field.latestReport"), dateValue(status.reports.latestReportGeneratedAt, locale, t)],
              ...(status.reports.skippedReportCount > 0
                ? [[t("control.field.skippedReports"), String(status.reports.skippedReportCount)] as [string, string]]
                : []),
            ]}
            t={t}
          />
          <ControlCard
            title={t("control.feedback.title")}
            status={status.feedback.status}
            explanation={t("control.feedback.explanation")}
            nextStep={t("control.feedback.next")}
            details={[
              [t("control.field.persistentCapture"), statusLabel(status.feedback.status, t)],
              [t("control.field.submissionEnabled"), booleanValue(status.feedback.submissionEnabled, t)],
              ...(status.feedback.totalCount == null ? [] : [
                [t("control.field.totalFeedback"), String(status.feedback.totalCount)] as [string, string],
                [t("control.field.newFeedback"), String(status.feedback.newCount ?? 0)] as [string, string],
                [t("control.field.blockerFeedback"), String(status.feedback.blockerCount ?? 0)] as [string, string],
                [t("control.field.latestFeedback"), dateValue(status.feedback.latestFeedbackAt ?? null, locale, t)] as [string, string],
              ]),
            ]}
            t={t}
          />
          </ControlGroup>

          <ControlGroup number="03" title={ui.accessGates} description={ui.accessGatesHelp}>
            <ControlCard
              title={t("control.automation.title")}
              status={status.automation.status}
              explanation={t("control.automation.explanation")}
              nextStep={t("control.automation.next")}
              details={[
                [t("control.field.automationState"), status.automation.enabled ? t("automation.active") : t("automation.disabled")],
                [t("automation.lastRun"), dateValue(status.automation.lastRunAt, locale, t)],
                [t("control.field.lastResult"), resultValue(status.automation.lastResult, t)],
                [t("automation.nextRun"), dateValue(status.automation.nextRunAt, locale, t)],
                [t("automation.nextDueAfterActivation"), dateValue(status.automation.nextDueAfterActivation, locale, t)],
            ]}
            t={t}
          />
            <ControlCard
              title={t("control.access.title")}
              status={status.accessDeployment.status}
              badgeLabel={status.accessDeployment.status === "NOT_READY" ? ui.finalReleaseStage : undefined}
              badgeTone={status.accessDeployment.status === "NOT_READY" ? "MANUAL_CHECK_REQUIRED" : undefined}
              explanation={t("control.access.explanation")}
              nextStep={t("control.access.next")}
              details={[
                [t("control.field.localRuntime"), availabilityValue(status.accessDeployment.localRuntimeAvailable, t)],
                [t("control.field.vpsDeployment"), status.accessDeployment.vpsDeployment === "CONFIRMED" ? t("control.value.confirmed") : t("control.value.unconfirmed")],
                [t("control.field.cloudflareAccess"), status.accessDeployment.cloudflareAccess === "VERIFIED" ? t("control.value.verified") : t("control.value.finalSmokeRequired")],
                [t("control.field.externalTesterAccess"), status.accessDeployment.externalTesterAccess],
              ]}
              t={t}
            />
          </ControlGroup>
        </div>
      ) : (
        <section className="control-section product-control-unavailable" role="alert">
          <h3>{t("control.unavailable.title")}</h3>
          <p>{t("control.unavailable.explanation")}</p>
        </section>
      )}

      {ownerOperationsStatus?.owner_controls_visible && (
        <OwnerOperationsPanel initialStatus={ownerOperationsStatus} />
      )}

      <section className="control-section product-control-blockers" data-interaction="read-only" aria-labelledby="owner-decisions-heading">
        <header className="control-section-header">
          <span className="product-control-group-number">04</span>
          <h3 id="owner-decisions-heading">{ui.ownerDecisions}</h3>
          <p>{t("control.blockers.explanation")}</p>
        </header>
        <ol className="product-control-release-checklist">
          {RELEASE_GATE_CHECKLIST.map((gate, index) => {
            const pending = status === null || status.unmetGates.includes(gate);
            return (
              <li key={gate} className={pending ? "pending" : "completed"} data-interaction="read-only">
                <span className="product-control-checklist-index" aria-hidden="true">{index + 1}</span>
                <span className="product-control-checklist-copy">
                  <strong>{t(BLOCKER_TRANSLATION_KEYS[gate])}</strong>
                  <small>{pending ? ui.conditionPending : ui.conditionCompleted}</small>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="control-section product-control-next-step" data-interaction="read-only" aria-labelledby="safe-next-step-heading">
        <span className="product-control-group-number">05</span>
        <div>
          <h3 id="safe-next-step-heading">{ui.safeNextStep}</h3>
          <p>{nextReleaseGate
            ? t(BLOCKER_TRANSLATION_KEYS[nextReleaseGate])
            : ui.safeNextStepReady}</p>
        </div>
      </section>
    </div>
  );
}

function ControlCard({
  title,
  status,
  explanation,
  nextStep,
  details,
  detailsVisible = false,
  badgeLabel,
  badgeTone,
  t,
}: {
  title: string;
  status: ControlCenterReadinessStatus;
  explanation: string;
  nextStep: string;
  details: Array<[string, string]>;
  detailsVisible?: boolean;
  badgeLabel?: string;
  badgeTone?: ControlCenterReadinessStatus;
  t: Translator;
}) {
  const presentationStatus = badgeTone ?? status;
  return (
    <article className={`control-status-card product-control-card ${statusClass(presentationStatus)}`} data-interaction="read-only">
      <div className="control-status-card-topline">
        <h4>{title}</h4>
        <StatusBadge status={presentationStatus} label={badgeLabel} t={t} />
      </div>
      <p className="product-control-explanation">{explanation}</p>
      {status !== "READY" && (
        <p className="product-control-next"><strong>{t("control.nextStep")}:</strong> {nextStep}</p>
      )}
      {detailsVisible ? (
        <dl className="product-control-details product-control-visible-details">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
      <TechnicalDetails label={t("app.technicalDetails")}>
        <dl className="product-control-details">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </TechnicalDetails>
      )}
    </article>
  );
}

function ControlGroup({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const headingId = `control-group-${number}`;
  return (
    <section className="product-control-group" aria-labelledby={headingId}>
      <header className="product-control-group-header">
        <span className="product-control-group-number">{number}</span>
        <div><h3 id={headingId}>{title}</h3><p>{description}</p></div>
      </header>
      <div className="control-card-grid">{children}</div>
    </section>
  );
}

function StatusBadge({
  status,
  label,
  t,
}: {
  status: ControlCenterReadinessStatus;
  label?: string;
  t: Translator;
}) {
  return <span className={`control-status-badge ${statusClass(status)}`}>{label ?? statusLabel(status, t)}</span>;
}

function statusClass(status: ControlCenterReadinessStatus): string {
  if (status === "READY") return "ready";
  if (status === "PARTIAL") return "partial";
  if (status === "NOT_READY") return "not-ready";
  return "manual";
}

function statusLabel(status: ControlCenterReadinessStatus, t: Translator): string {
  if (status === "READY") return t("control.status.ready");
  if (status === "PARTIAL") return t("control.status.partial");
  if (status === "NOT_READY") return t("control.status.notReady");
  return t("control.status.manualCheck");
}

function dateValue(value: string | null, locale: ProductLocale, t: Translator): string {
  return value ? formatProductDateTime(value, locale) : t("app.noData");
}

function booleanValue(value: boolean, t: Translator): string {
  return value ? t("control.value.yes") : t("control.value.no");
}

function availabilityValue(value: boolean, t: Translator): string {
  return value ? t("status.available") : t("status.unavailable");
}

function readinessValue(value: "ready" | "degraded" | "not_ready", t: Translator): string {
  if (value === "ready") return t("control.status.ready");
  if (value === "degraded") return t("control.status.partial");
  return t("control.status.notReady");
}

function freshnessValue(value: "FRESH" | "STALE" | "UNAVAILABLE", t: Translator): string {
  if (value === "FRESH") return t("status.current");
  if (value === "STALE") return t("status.delayed");
  return t("status.unavailable");
}

function sourceAvailabilityValue(
  value: "available" | "partial" | "unavailable",
  t: Translator,
): string {
  if (value === "available") return t("status.available");
  if (value === "partial") return t("status.partiallyAvailable");
  return t("status.unavailable");
}

function resultValue(value: "SUCCESS" | "PARTIAL" | "FAILED" | null, t: Translator): string {
  if (value === "SUCCESS") return t("control.value.success");
  if (value === "PARTIAL") return t("control.status.partial");
  if (value === "FAILED") return t("control.value.failed");
  return t("app.noData");
}

function publishedSnapshotValue(
  automationStatus: AutomationStatus | null | undefined,
  fallback: "SUCCESS" | "PARTIAL" | "FAILED" | null,
  t: Translator,
): string {
  const dataStatus = automationStatus?.data_status;
  const cycleStatus = automationStatus?.cycle_status ?? automationStatus?.last_result ?? fallback;
  if (dataStatus === "PARTIAL" || cycleStatus === "PARTIAL") return t("control.value.partialSnapshot");
  if (dataStatus === "FRESH" || cycleStatus === "SUCCESS") return t("control.value.fullSnapshot");
  if (dataStatus === "LAST_KNOWN_GOOD") return t("automation.lastKnownGood");
  if (dataStatus === "STALE") return t("status.delayed");
  if (dataStatus === "IN_PROGRESS" || cycleStatus === "IN_PROGRESS") return t("automation.inProgress");
  if (cycleStatus === "FAILED") return t("control.value.failed");
  return t("app.noData");
}

function partialSourceValue(
  automationStatus: AutomationStatus | null | undefined,
  fallbackSourceIds: string[],
  t: Translator,
): string {
  const cycleSourceIds = Object.entries(automationStatus?.source_statuses ?? {})
    .filter(([, sourceStatus]) => sourceStatus === "DEGRADED" || sourceStatus === "UNAVAILABLE")
    .map(([sourceId]) => sourceId);
  const sourceIds = cycleSourceIds.length > 0 ? cycleSourceIds : fallbackSourceIds;
  return sourceIds.map(formatProductSourceLabel).join(", ") || t("app.noData");
}

function validationValue(value: "valid" | "invalid" | "unavailable", t: Translator): string {
  if (value === "valid") return t("control.value.valid");
  if (value === "invalid") return t("control.value.invalid");
  return t("status.unavailable");
}

function ownerCapabilityValue(mode: OwnerOperationsStatus["mode"], locale: ProductLocale): string {
  if (mode === "REVIEW_SAFE") return locale === "pl" ? "Tryb przeglądu" : "Review mode";
  if (mode === "ENABLED") return locale === "pl" ? "Aktywna decyzja właściciela" : "Owner decision enabled";
  return locale === "pl" ? "Wyłączona" : "Disabled";
}

const CONTROL_UI_COPY = {
  pl: {
    blockerCount: "otwartych warunków",
    testerReleaseReadiness: "Gotowość udostępnienia zaufanemu testerowi",
    dataReadiness: "Gotowość danych",
    dataReadinessHelp: "Dostępność środowiska, migawek i zatwierdzonych źródeł.",
    productCapabilities: "Gotowość funkcjonalna produktu",
    productCapabilitiesHelp: "Funkcje dostępne lokalnie, niezależnie od końcowych warunków udostępnienia testerowi.",
    accessGates: "Dostęp i wdrożenie",
    accessGatesHelp: "Oddziela lokalną gotowość produktu od dostępu zewnętrznego.",
    ownerDecisions: "Decyzje właściciela i warunki udostępnienia",
    conditionPending: "Oczekuje na potwierdzenie",
    conditionCompleted: "Potwierdzono",
    safeNextStep: "Bezpieczny następny krok",
    safeNextStepReady: "Kontynuuj lokalny przegląd bez zmiany trybu runtime ani uruchamiania providerów.",
    finalReleaseStage: "Etap końcowy",
  },
  en: {
    blockerCount: "open conditions",
    testerReleaseReadiness: "Trusted tester release readiness",
    dataReadiness: "Data readiness",
    dataReadinessHelp: "Runtime, snapshot and approved-source availability.",
    productCapabilities: "Product functional readiness",
    productCapabilitiesHelp: "Features available locally, independent of the final tester release conditions.",
    accessGates: "Access and deployment",
    accessGatesHelp: "Separates local product readiness from external access.",
    ownerDecisions: "Owner decisions and release conditions",
    conditionPending: "Awaiting confirmation",
    conditionCompleted: "Confirmed",
    safeNextStep: "Safe next step",
    safeNextStepReady: "Continue local review without changing runtime mode or calling providers.",
    finalReleaseStage: "Final stage",
  },
} as const;
