import React, { type ReactNode } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
import {
  formatProductAge,
  formatProductDateTime,
  PRODUCT_TRANSLATIONS,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";
import { formatStatusReason } from "../productPresentation";
import {
  type ProductSourceHealthResolution,
} from "../productSourceHealth";
import { presentProductSourceHealth } from "../productSourceHealthPresentation";
import type { ResolvedProductRuntimeMode } from "../runtimeMode";
import type { ResolvedScannerSource } from "../services/scannerDataSource";
import type { AutomationStatus } from "../services/automationStatusDataSource";
import type { EstablishedUniverseStatus } from "../services/establishedUniverseStatusDataSource";
import type { ProductReadinessOutput } from "../types/scannerTypes";

export type ProductSectionId =
  | "candidate-results"
  | "candidate-detail"
  | "external-checks"
  | "reports"
  | "feedback"
  | "methodology"
  | "control-center";

export type ProductNavItem = {
  id: ProductSectionId;
  label: string;
  icon: string;
  description: string;
  groupLabel?: string;
  groupDescription?: string;
};

type ProductWorkspaceShellProps = {
  navItems: ProductNavItem[];
  activeSection: ProductSectionId;
  onSectionChange: (sectionId: ProductSectionId) => void;
  onSendFeedback: () => void;
  loading: boolean;
  runtimeMode: ResolvedProductRuntimeMode;
  resolvedSource: ResolvedScannerSource;
  runId: string | null;
  generatedAt: string | null;
  ageSeconds: number | null;
  freshnessStatus: "FRESH" | "STALE" | null;
  viewRefreshedAt: string | null;
  sourceIds: string[];
  sourceHealth: ProductSourceHealthResolution;
  readiness: ProductReadinessOutput | null;
  readinessReasonCode?: string | null;
  dataUnavailableMessage?: string | null;
  dataUnavailableReasonCode?: string | null;
  onRefresh: () => void;
  automationStatus?: AutomationStatus | null;
  establishedUniverseStatus?: EstablishedUniverseStatus | null;
  children: ReactNode;
};

type ProductWorkspaceSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ProductWorkspaceShell({
  navItems,
  activeSection,
  onSectionChange,
  onSendFeedback,
  loading,
  runtimeMode,
  resolvedSource,
  runId,
  generatedAt,
  ageSeconds,
  freshnessStatus,
  viewRefreshedAt,
  sourceIds,
  sourceHealth,
  readiness,
  readinessReasonCode,
  dataUnavailableMessage,
  dataUnavailableReasonCode,
  onRefresh,
  automationStatus,
  establishedUniverseStatus,
  children,
}: ProductWorkspaceShellProps) {
  const { locale, setLocale, t } = useProductLocale();
  const apiPresentation = getApiReadinessPresentation(loading, resolvedSource, readiness, locale);
  const freshnessPresentation = getFreshnessPresentation(ageSeconds, freshnessStatus, locale);
  const sourcePresentation = presentProductSourceHealth(sourceHealth, locale, "header");
  const technicalCodes = unique([
    readinessReasonCode,
    dataUnavailableReasonCode,
    ...(readiness?.reason_codes ?? []),
  ].filter((value): value is string => Boolean(value)));

  return (
    <div className="app-shell product-shell">
      <header className="app-header workspace-header product-header">
        <div className="product-mark">
          <div className="product-logo" aria-hidden="true">CE</div>
          <div className="min-w-0">
            <h1>Crypto Edge AI</h1>
            <p>{t("app.tagline")}</p>
          </div>
        </div>

        <div className="product-header-status" aria-label={t("app.statusLabel")}>
          <HeaderFact label={t("app.api")} value={apiPresentation.value} tone={apiPresentation.tone} />
          <HeaderFact
            label={t("app.freshness")}
            value={freshnessPresentation.value}
            detail={ageSeconds == null ? undefined : formatProductAge(ageSeconds, locale)}
            tone={freshnessPresentation.tone}
          />
          <HeaderFact label={t("app.sources")} value={sourcePresentation.value} tone={sourcePresentation.tone} />
          <HeaderFact
            label={t("app.generated")}
            value={generatedAt ? formatProductDateTime(generatedAt, locale) : t("app.noData")}
            tone={freshnessPresentation.tone}
          />
          <HeaderFact
            label={t("app.viewRefreshed")}
            value={viewRefreshedAt ? formatProductDateTime(viewRefreshedAt, locale) : t("app.noData")}
          />
        </div>

        <div className="product-header-actions">
          <div className="product-locale-switch" role="group" aria-label={t("app.language")}>
            {(["en", "pl"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={locale === option ? "active" : ""}
                aria-pressed={locale === option}
                onClick={() => setLocale(option)}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className="product-feedback-button" onClick={onSendFeedback}>
            {t("feedback.quickAction")}
          </button>
          <button type="button" className="product-refresh-button" onClick={onRefresh} disabled={loading}>
            {loading ? t("app.refreshing") : t("app.refresh")}
          </button>
          <details className="product-header-technical">
            <summary>{t("app.technicalDetails")}</summary>
            <dl>
              <div><dt>{t("app.environment")}</dt><dd>{runtimeMode}</dd></div>
              <div><dt>{t("app.runId")}</dt><dd>{runId ?? t("app.noData")}</dd></div>
              <div><dt>{t("app.sources")}</dt><dd>{sourceIds.length > 0 ? sourceIds.join(", ") : t("app.noData")}</dd></div>
              <div><dt>{t("radar.universeVersion")}</dt><dd>{establishedUniverseStatus?.universe_version ?? t("app.noData")}</dd></div>
              <div><dt>{t("radar.activeEntries")}</dt><dd>{establishedUniverseStatus?.entries_enabled ?? t("app.noData")}</dd></div>
              <div><dt>{t("radar.validationStatus")}</dt><dd>{establishedUniverseStatus?.validation_status ?? t("app.noData")}</dd></div>
              {technicalCodes.length > 0 && <div><dt>{t("app.codes")}</dt><dd>{technicalCodes.join(", ")}</dd></div>}
              <div><dt>{t("automation.title")}</dt><dd>{automationPresentation(automationStatus, t)}</dd></div>
              <div><dt>{t("automation.lastRun")}</dt><dd>{automationStatus?.last_attempt_at ? formatProductDateTime(automationStatus.last_attempt_at, locale) : t("app.noData")}</dd></div>
              <div><dt>{t("automation.nextRun")}</dt><dd>{nextAutomationRunPresentation(automationStatus, locale, t)}</dd></div>
              {automationStatus && !automationStatus.enabled && automationStatus.next_due_at && (
                <div>
                  <dt>{t("automation.nextDueAfterActivation")}</dt>
                  <dd>{formatProductDateTime(automationStatus.next_due_at, locale)}</dd>
                </div>
              )}
            </dl>
          </details>
        </div>
      </header>

      <div className="workspace-shell-body product-shell-body">
        <aside className="workspace-sidebar product-sidebar" aria-label={t("app.navigation")}>
          <nav className="workspace-nav">
            {groupProductNavItems(navItems).map((group) => (
              <section className="workspace-nav-group" aria-label={group.label} key={group.label}>
                <div className="workspace-nav-group-header">
                  <span>{group.label}</span>
                  <small>{group.description}</small>
                </div>

                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onSectionChange(item.id)}
                    className={`workspace-nav-item ${activeSection === item.id ? "active" : ""}`}
                    aria-current={activeSection === item.id ? "page" : undefined}
                  >
                    <span className="workspace-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span className="workspace-nav-copy">
                      <span>{item.label}</span>
                      <small>{item.description}</small>
                    </span>
                  </button>
                ))}
              </section>
            ))}
          </nav>
        </aside>

        <div className="workspace-main">
          {dataUnavailableMessage && (
            <div className="product-global-error" role="alert">
              <div>
                <strong>{t("app.unavailableTitle")}</strong>
                <p>{formatStatusReason(dataUnavailableReasonCode, locale)}</p>
              </div>
              <p>{t("app.unavailableMessage")}</p>
              <details>
                <summary>{t("app.technicalDetails")}</summary>
                <code>{dataUnavailableReasonCode ?? "SCANNER_OUTPUT_UNAVAILABLE"}</code>
                <p>{dataUnavailableMessage}</p>
              </details>
            </div>
          )}

          <main className="workspace-content">{children}</main>
        </div>
      </div>

      <footer className="app-footer product-footer">
        <p>{t("app.researchBoundary")}</p>
        <span>{t("app.watchlistBoundary")}</span>
      </footer>
    </div>
  );
}

function automationPresentation(
  status: AutomationStatus | null | undefined,
  t: (key: keyof typeof PRODUCT_TRANSLATIONS.en) => string,
): string {
  if (!status || !status.enabled) return t("automation.disabled");
  if (status.active_run_id) return t("automation.inProgress");
  if (status.last_result === "FAILED" || status.scheduler_status === "STATE_UNAVAILABLE") return t("automation.error");
  return t("automation.active");
}

function nextAutomationRunPresentation(
  status: AutomationStatus | null | undefined,
  locale: ProductLocale,
  t: (key: keyof typeof PRODUCT_TRANSLATIONS.en) => string,
): string {
  if (!status) return t("app.noData");
  if (!status.enabled) return t("automation.notScheduled");
  return status.next_run_at ? formatProductDateTime(status.next_run_at, locale) : t("app.noData");
}

export function getApiReadinessPresentation(
  loading: boolean,
  resolvedSource: ResolvedScannerSource,
  readiness: ProductReadinessOutput | null,
  locale: ProductLocale = "en",
): { value: string; tone: "neutral" | "ready" | "warning" | "error" } {
  const copy = PRODUCT_TRANSLATIONS[locale];
  if (loading && resolvedSource !== "real-output") return { value: copy["status.loading"], tone: "neutral" };
  if (resolvedSource === "real-output") return { value: copy["status.connected"], tone: "ready" };
  if (readiness !== null) return { value: copy["status.connected"], tone: "warning" };
  return { value: copy["status.unavailable"], tone: "error" };
}

export function getFreshnessPresentation(
  ageSeconds: number | null,
  freshnessStatus: "FRESH" | "STALE" | null,
  locale: ProductLocale = "en",
): { value: string; tone: "ready" | "warning" } {
  const copy = PRODUCT_TRANSLATIONS[locale];
  if (freshnessStatus === "STALE" || (ageSeconds !== null && ageSeconds > 1800)) {
    return { value: copy["status.delayed"], tone: "warning" };
  }
  if (freshnessStatus === "FRESH" || ageSeconds !== null) {
    return { value: copy["status.current"], tone: "ready" };
  }
  return { value: copy["status.unavailable"], tone: "warning" };
}

function HeaderFact({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "accent" | "ready" | "warning" | "error";
}) {
  return (
    <div className={`product-header-fact ${tone}`} title={detail}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ProductWorkspaceSection({
  title,
  description,
  children,
}: ProductWorkspaceSectionProps) {
  return (
    <section className="workspace-section">
      <header className="workspace-section-header">
        <div className="min-w-0">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="workspace-section-body">{children}</div>
    </section>
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function groupProductNavItems(items: ProductNavItem[]): Array<{
  label: string;
  description: string;
  items: ProductNavItem[];
}> {
  const groups = new Map<string, { label: string; description: string; items: ProductNavItem[] }>();
  for (const item of items) {
    const label = item.groupLabel ?? "Product Radar";
    const existing = groups.get(label) ?? {
      label,
      description: item.groupDescription ?? "",
      items: [],
    };
    existing.items.push(item);
    groups.set(label, existing);
  }
  return [...groups.values()];
}
