import React, { useEffect, useState, type ReactNode } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
import {
  formatProductAge,
  formatProductDateTime,
  PRODUCT_TRANSLATIONS,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";
import { formatProductRuntimeMode, formatStatusReason } from "../productPresentation";
import {
  type ProductSourceHealthResolution,
} from "../productSourceHealth";
import { presentProductSourceHealth } from "../productSourceHealthPresentation";
import type { ResolvedProductRuntimeMode } from "../runtimeMode";
import type { ResolvedScannerSource } from "../services/scannerDataSource";
import type { AutomationStatus } from "../services/automationStatusDataSource";
import type { EstablishedUniverseStatus } from "../services/establishedUniverseStatusDataSource";
import type { ProductReadinessOutput } from "../types/scannerTypes";
import { ActionButton, TechnicalDetails } from "./ProductUi";

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
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const apiPresentation = getApiReadinessPresentation(loading, resolvedSource, readiness, locale);
  const sourcePresentation = presentProductSourceHealth(sourceHealth, locale, "header");
  const technicalCodes = unique([
    readinessReasonCode,
    dataUnavailableReasonCode,
    ...(readiness?.reason_codes ?? []),
  ].filter((value): value is string => Boolean(value)));
  const activeNavItem = navItems.find((item) => item.id === activeSection);

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [activeSection]);

  return (
    <div className="app-shell product-shell">
      <header className="app-header workspace-header product-header">
        <div className="product-mark">
          <div className="product-logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" focusable="false">
              <path d="M6 21.5 12.5 15l4 4L26 9.5" />
              <path d="M20 9.5h6v6" />
            </svg>
          </div>
          <div className="min-w-0">
            <span className="product-mark-eyebrow">{t("app.productEyebrow")}</span>
            <h1>Crypto Edge AI</h1>
            <p>{t("app.tagline")}</p>
          </div>
          <span className="product-runtime-badge">{formatProductRuntimeMode(runtimeMode, locale)}</span>
        </div>

        <div className="product-header-status" aria-label={t("app.statusLabel")}>
          <HeaderFact label={t("app.api")} value={apiPresentation.value} tone={apiPresentation.tone} />
          <HeaderFact
            label={t("app.freshness")}
            value={ageSeconds == null ? t("app.noData") : formatProductAge(ageSeconds, locale)}
          />
          <HeaderFact label={t("app.sources")} value={sourcePresentation.value} tone={sourcePresentation.tone} />
          <HeaderFact
            label={t("app.generated")}
            value={generatedAt ? formatProductDateTime(generatedAt, locale) : t("app.noData")}
          />
          <HeaderFact
            label={t("app.viewRefreshed")}
            value={viewRefreshedAt ? formatProductDateTime(viewRefreshedAt, locale) : t("app.noData")}
          />
        </div>

        <div className="product-header-actions">
          <ActionButton
            variant="tertiary"
            className="product-mobile-nav-toggle"
            aria-expanded={mobileNavigationOpen}
            aria-controls="product-navigation"
            onClick={() => setMobileNavigationOpen((open) => !open)}
          >
            <span aria-hidden="true">{mobileNavigationOpen ? "×" : "≡"}</span>
            {mobileNavigationOpen ? t("app.closeNavigation") : t("app.openNavigation")}
          </ActionButton>
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
          <ActionButton variant="secondary" className="product-feedback-button" onClick={onSendFeedback}>
            {t("feedback.quickAction")}
          </ActionButton>
          <ActionButton variant="primary" icon="refresh" className="product-refresh-button" onClick={onRefresh} loading={loading} loadingLabel={t("app.refreshing")}>
            {t("app.refresh")}
          </ActionButton>
          <TechnicalDetails label={t("app.technicalDetails")} className="product-header-technical">
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
          </TechnicalDetails>
        </div>
      </header>

      <div className="workspace-shell-body product-shell-body">
        <aside
          id="product-navigation"
          className={`workspace-sidebar product-sidebar ${mobileNavigationOpen ? "open" : ""}`}
          aria-label={t("app.navigation")}
        >
          {activeNavItem && (
            <div className="product-sidebar-context">
              <span>{t("app.currentContext")}</span>
              <strong>{activeNavItem.label}</strong>
              <small>{activeNavItem.description}</small>
            </div>
          )}
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
                    onClick={() => {
                      onSectionChange(item.id);
                      setMobileNavigationOpen(false);
                    }}
                    className={`workspace-nav-item ${activeSection === item.id ? "active" : ""}`}
                    aria-current={activeSection === item.id ? "page" : undefined}
                  >
                    <span className="workspace-nav-icon" aria-hidden="true"><ProductNavIcon id={item.id} /></span>
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
              <TechnicalDetails label={t("app.technicalDetails")}>
                <code>{dataUnavailableReasonCode ?? "SCANNER_OUTPUT_UNAVAILABLE"}</code>
                <p>{dataUnavailableMessage}</p>
              </TechnicalDetails>
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
  const { t } = useProductLocale();
  return (
    <section className="workspace-section">
      <header className="workspace-section-header">
        <div className="min-w-0">
          <span className="workspace-section-eyebrow">{t("app.workspaceEyebrow")}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="workspace-section-body">{children}</div>
    </section>
  );
}

function ProductNavIcon({ id }: { id: ProductSectionId }) {
  if (id === "candidate-results") return <svg viewBox="0 0 24 24"><path d="M4 18V9m5 9V5m5 13v-7m5 7V3" /></svg>;
  if (id === "candidate-detail") return <svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="5" /><path d="m14 14 5 5" /></svg>;
  if (id === "external-checks") return <svg viewBox="0 0 24 24"><path d="M12 3 4.5 6v5.5c0 4.7 3 7.8 7.5 9.5 4.5-1.7 7.5-4.8 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (id === "reports") return <svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z" /><path d="M9 10h6M9 14h6M9 18h4" /></svg>;
  if (id === "feedback") return <svg viewBox="0 0 24 24"><path d="M4 5h16v12H9l-5 4z" /><path d="M8 9h8M8 13h5" /></svg>;
  if (id === "methodology") return <svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  return <svg viewBox="0 0 24 24"><path d="M4 12h4l2-5 4 10 2-5h4" /></svg>;
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
