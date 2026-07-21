import React from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
import type {
  ControlCenterReadinessStatus,
  ControlCenterStatus,
} from "../controlCenterStatus";
import {
  formatProductDateTime,
  PRODUCT_TRANSLATIONS,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";

type Translator = (
  key: keyof typeof PRODUCT_TRANSLATIONS.en,
  variables?: Record<string, string | number>,
) => string;

export function ProductControlCenter({ status }: { status: ControlCenterStatus | null }) {
  const { locale, t } = useProductLocale();
  const overallStatus = status?.overallStatus ?? "NOT_READY";

  return (
    <div className="control-center product-control-center">
      <section className="control-center-hero product-control-center-hero">
        <div className="control-center-hero-copy">
          <span className="section-label">{t("control.previewReadiness")}</span>
          <h3>{t("control.trustedTesterPreview")}</h3>
          <p>{t("control.summaryExplanation")}</p>
        </div>
        <StatusBadge status={overallStatus} t={t} />
      </section>

      <p className="control-center-research-note product-control-boundary">
        {t("control.researchBoundary")}
      </p>

      {status ? (
        <section className="control-card-grid" aria-label={t("control.areas") }>
          <ControlCard
            title={t("control.runtime.title")}
            status={status.runtimeApi.status}
            explanation={t("control.runtime.explanation")}
            nextStep={t("control.runtime.next")}
            details={[
              [t("control.field.runtimeMode"), status.runtimeApi.runtimeMode],
              [t("control.field.apiConnected"), booleanValue(status.runtimeApi.apiConnected, t)],
              [t("control.field.readiness"), readinessValue(status.runtimeApi.readiness, t)],
              [t("control.field.buildSha"), status.runtimeApi.buildSha ?? t("app.noData")],
              [t("control.field.dataStatus"), statusLabel(status.runtimeApi.dataStatus, t)],
            ]}
            t={t}
          />
          <ControlCard
            title={t("control.data.title")}
            status={status.dataSnapshots.status}
            explanation={t("control.data.explanation")}
            nextStep={t("control.data.next")}
            details={[
              [t("control.field.scannerSnapshot"), dateValue(status.dataSnapshots.scanner.generatedAt, locale, t)],
              [t("control.field.contextSnapshot"), dateValue(status.dataSnapshots.context.generatedAt, locale, t)],
              [t("control.field.scannerFreshness"), freshnessValue(status.dataSnapshots.scanner.freshness, t)],
              [t("control.field.contextFreshness"), freshnessValue(status.dataSnapshots.context.freshness, t)],
              [t("control.field.lastKnownGood"), booleanValue(
                status.dataSnapshots.scanner.lastKnownGood || status.dataSnapshots.context.lastKnownGood,
                t,
              )],
              [t("control.field.newObservation"), String(status.dataSnapshots.scanner.newObservationCount)],
              [t("control.field.establishedAfterFilters"), String(status.dataSnapshots.scanner.establishedAfterFilters)],
            ]}
            t={t}
          />
          <ControlCard
            title={t("control.sources.title")}
            status={status.sources.status}
            explanation={t("control.sources.explanation")}
            nextStep={t("control.sources.next")}
            details={[
              [t("control.field.availability"), sourceAvailabilityValue(status.sources.availability, t)],
              [t("app.sources"), status.sources.sourceIds.join(", ") || t("app.noData")],
              [t("control.field.affectedSources"), status.sources.affectedSourceIds.join(", ") || t("app.noData")],
            ]}
            t={t}
          />
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
            title={t("control.universe.title")}
            status={status.establishedUniverse.status}
            explanation={t("control.universe.explanation")}
            nextStep={t("control.universe.next")}
            details={[
              [t("radar.validationStatus"), validationValue(status.establishedUniverse.validationStatus, t)],
              [t("radar.universeVersion"), status.establishedUniverse.universeVersion ?? t("app.noData")],
              [t("radar.activeEntries"), String(status.establishedUniverse.entriesEnabled)],
              [t("control.field.lastChange"), dateValue(status.establishedUniverse.lastChangeAt, locale, t)],
            ]}
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
            details={[[t("control.field.libraryStatus"), statusLabel(status.reports.status, t)]]}
            t={t}
          />
          <ControlCard
            title={t("control.access.title")}
            status={status.accessDeployment.status}
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
          <ControlCard
            title={t("control.feedback.title")}
            status={status.feedback.status}
            explanation={t("control.feedback.explanation")}
            nextStep={t("control.feedback.next")}
            details={[[t("control.field.persistentCapture"), statusLabel(status.feedback.status, t)]]}
            t={t}
          />
        </section>
      ) : (
        <section className="control-section product-control-unavailable" role="alert">
          <h3>{t("control.unavailable.title")}</h3>
          <p>{t("control.unavailable.explanation")}</p>
        </section>
      )}

      <section className="control-section product-control-blockers">
        <header className="control-section-header">
          <h3>{t("control.blockers.title")}</h3>
          <p>{t("control.blockers.explanation")}</p>
        </header>
        <ol>
          {([
            "control.blockers.reportsFeedback",
            "control.blockers.previewMode",
            "control.blockers.deployment",
            "control.blockers.accessSmoke",
            "control.blockers.rollback",
            "control.blockers.ownerApproval",
          ] as const).map((key) => <li key={key}>{t(key)}</li>)}
        </ol>
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
  t,
}: {
  title: string;
  status: ControlCenterReadinessStatus;
  explanation: string;
  nextStep: string;
  details: Array<[string, string]>;
  t: Translator;
}) {
  return (
    <article className={`control-status-card product-control-card ${statusClass(status)}`}>
      <div className="control-status-card-topline">
        <h4>{title}</h4>
        <StatusBadge status={status} t={t} />
      </div>
      <p className="product-control-explanation">{explanation}</p>
      <dl className="product-control-details">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {status !== "READY" && (
        <p className="product-control-next"><strong>{t("control.nextStep")}:</strong> {nextStep}</p>
      )}
    </article>
  );
}

function StatusBadge({ status, t }: { status: ControlCenterReadinessStatus; t: Translator }) {
  return <span className={`control-status-badge ${statusClass(status)}`}>{statusLabel(status, t)}</span>;
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

function resultValue(value: "SUCCESS" | "FAILED" | null, t: Translator): string {
  if (value === "SUCCESS") return t("control.value.success");
  if (value === "FAILED") return t("control.value.failed");
  return t("app.noData");
}

function validationValue(value: "valid" | "invalid" | "unavailable", t: Translator): string {
  if (value === "valid") return t("control.value.valid");
  if (value === "invalid") return t("control.value.invalid");
  return t("status.unavailable");
}
