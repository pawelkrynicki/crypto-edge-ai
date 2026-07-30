import React, { useEffect, useState, type ReactNode } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
import {
  formatProductDateTime,
  PRODUCT_TRANSLATIONS,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";
import {
  type ProductSourceHealthResolution,
} from "../productSourceHealth";
import type { ResolvedProductRuntimeMode } from "../runtimeMode";
import type { ResolvedScannerSource } from "../services/scannerDataSource";
import type { AutomationStatus } from "../services/automationStatusDataSource";
import type { EstablishedUniverseStatus } from "../services/establishedUniverseStatusDataSource";
import type { ProductReadinessOutput } from "../types/scannerTypes";
import { ActionButton } from "./ProductUi";

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
  workspaceMode?: "default" | "tabbed";
};

export function ProductWorkspaceShell({
  navItems,
  activeSection,
  onSectionChange,
  loading,
  resolvedSource,
  generatedAt,
  freshnessStatus,
  sourceHealth,
  dataUnavailableMessage,
  onRefresh,
  automationStatus,
  children,
}: ProductWorkspaceShellProps) {
  const { locale, setLocale, t } = useProductLocale();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const activeNavItem = navItems.find((item) => item.id === activeSection);
  const clientDataAlert = resolveClientDataAlert({
    resolvedSource,
    freshnessStatus,
    sourceHealth,
    automationStatus,
    dataUnavailable: Boolean(dataUnavailableMessage),
    locale,
  });

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
            <h1>Crypto Edge AI</h1>
          </div>
        </div>

        <div className="product-header-update" aria-label={t("app.generated")}>
          <span>{t("app.generated")}</span>
          <strong>{generatedAt ? formatProductDateTime(generatedAt, locale) : t("app.noData")}</strong>
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
          <ActionButton variant="primary" icon="refresh" className="product-refresh-button" onClick={onRefresh} loading={loading} loadingLabel={t("app.refreshing")}>
            {t("app.refresh")}
          </ActionButton>
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
          {clientDataAlert && <div className="product-client-data-alert" role="status"><strong>{clientDataAlert.title}</strong><p>{clientDataAlert.detail}</p></div>}

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

function resolveClientDataAlert({
  resolvedSource,
  freshnessStatus,
  sourceHealth,
  automationStatus,
  dataUnavailable,
  locale,
}: {
  resolvedSource: ResolvedScannerSource;
  freshnessStatus: "FRESH" | "STALE" | null;
  sourceHealth: ProductSourceHealthResolution;
  automationStatus: AutomationStatus | null | undefined;
  dataUnavailable: boolean;
  locale: ProductLocale;
}): { title: string; detail: string } | null {
  const pl = locale === "pl";
  if (dataUnavailable || resolvedSource === "unavailable" || sourceHealth.status === "unavailable") {
    return {
      title: pl ? "Dane są chwilowo niedostępne." : "Data is temporarily unavailable.",
      detail: pl ? "Spróbuj ponownie później lub sprawdź ostatni prawidłowy widok." : "Try again later or use the last valid view.",
    };
  }
  if (sourceHealth.status === "partial" || automationStatus?.data_status === "PARTIAL") {
    return {
      title: pl ? "Część danych jest chwilowo niedostępna." : "Some data is temporarily unavailable.",
      detail: pl ? "Braki są oznaczone bez ukrywania dostępnych informacji." : "Missing fields are marked without hiding the available information.",
    };
  }
  if (freshnessStatus === "STALE" || ["STALE", "LAST_KNOWN_GOOD"].includes(automationStatus?.data_status ?? "")) {
    return {
      title: pl ? "Dane mogą być nieaktualne." : "Data may be out of date.",
      detail: pl ? "Wyświetlany jest ostatni prawidłowy stan." : "The last valid state remains visible.",
    };
  }
  return null;
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

export function ProductWorkspaceSection({
  title,
  description,
  children,
  workspaceMode = "default",
}: ProductWorkspaceSectionProps) {
  const { t } = useProductLocale();
  return (
    <section className={`workspace-section ${workspaceMode === "tabbed" ? "tabbed-workspace-section" : ""}`}>
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
