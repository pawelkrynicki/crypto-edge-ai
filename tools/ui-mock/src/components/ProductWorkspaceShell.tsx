import type { ReactNode } from "react";
import type { ResolvedProductRuntimeMode } from "../runtimeMode";
import type { ResolvedScannerSource } from "../services/scannerDataSource";
import type { ProductReadinessOutput } from "../types/scannerTypes";

export type ProductSectionId =
  | "candidate-results"
  | "candidate-detail"
  | "external-checks"
  | "methodology";

export type ProductNavItem = {
  id: ProductSectionId;
  label: string;
  icon: string;
  description: string;
};

type ProductWorkspaceShellProps = {
  navItems: ProductNavItem[];
  activeSection: ProductSectionId;
  onSectionChange: (sectionId: ProductSectionId) => void;
  loading: boolean;
  runtimeMode: ResolvedProductRuntimeMode;
  resolvedSource: ResolvedScannerSource;
  runId: string | null;
  generatedAt: string | null;
  ageSeconds: number | null;
  sourceIds: string[];
  readiness: ProductReadinessOutput | null;
  readinessReasonCode?: string | null;
  dataUnavailableMessage?: string | null;
  dataUnavailableReasonCode?: string | null;
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
  loading,
  runtimeMode,
  resolvedSource,
  runId,
  generatedAt,
  ageSeconds,
  sourceIds,
  readiness,
  readinessReasonCode,
  dataUnavailableMessage,
  dataUnavailableReasonCode,
  children,
}: ProductWorkspaceShellProps) {
  const apiReady = resolvedSource === "real-output";
  const contextReady = readiness?.context.ready ?? false;
  const readinessCode = readinessReasonCode
    ?? readiness?.reason_codes[0]
    ?? (apiReady ? null : dataUnavailableReasonCode);

  return (
    <div className="app-shell product-shell">
      <header className="app-header workspace-header product-header">
        <div className="product-mark">
          <div className="product-logo" aria-hidden="true">CE</div>
          <div className="min-w-0">
            <h1>Crypto Edge AI</h1>
            <p>Product Radar · bez rekomendacji inwestycyjnych</p>
          </div>
        </div>

        <div className="product-header-status" aria-label="Status danych Product Radar">
          <HeaderFact label="Środowisko" value={runtimeMode} tone="accent" />
          <HeaderFact
            label="API / readiness"
            value={loading ? "Ładowanie" : apiReady ? "Dostępne" : "Niedostępne"}
            detail={readinessCode ?? undefined}
            tone={apiReady ? "ready" : "error"}
          />
          <HeaderFact
            label="Dane wygenerowane"
            value={generatedAt ? formatTimestamp(generatedAt) : "Brak"}
            detail={ageSeconds == null ? undefined : `${formatAge(ageSeconds)} temu`}
            tone={ageSeconds != null && ageSeconds <= 1800 ? "ready" : "warning"}
          />
          <HeaderFact
            label="Run ID"
            value={runId ? shortenRunId(runId) : "Brak"}
            detail={runId ?? undefined}
          />
          <HeaderFact
            label="Źródła"
            value={sourceIds.length > 0 ? sourceIds.join(", ") : "Brak"}
            detail={contextReady ? "Context dostępny" : readiness?.context.reason_code ?? "Context niedostępny"}
            tone={contextReady ? "neutral" : "warning"}
          />
        </div>
      </header>

      <div className="workspace-shell-body product-shell-body">
        <aside className="workspace-sidebar product-sidebar" aria-label="Nawigacja Product Radar">
          <nav className="workspace-nav">
            <section className="workspace-nav-group" aria-label="Crypto Edge AI">
              <div className="workspace-nav-group-header">
                <span>Product Radar</span>
                <small>Real-data · Manual Review Only</small>
              </div>

              {navItems.map((item) => (
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
          </nav>
        </aside>

        <div className="workspace-main">
          {dataUnavailableMessage && (
            <div className="product-global-error" role="alert">
              <strong>Radar jest obecnie niedostępny</strong>
              <span>{dataUnavailableReasonCode ?? "SCANNER_OUTPUT_UNAVAILABLE"}</span>
              <p>{dataUnavailableMessage}</p>
            </div>
          )}

          <main className="workspace-content">{children}</main>
        </div>
      </div>

      <footer className="app-footer product-footer">
        <p>Narzędzie badawcze. Brak automatycznych rekomendacji i działań transakcyjnych.</p>
        <span>WATCHLIST — wyłącznie ręczna analiza.</span>
      </footer>
    </div>
  );
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

function shortenRunId(runId: string): string {
  if (runId.length <= 18) return runId;
  return `${runId.slice(0, 9)}…${runId.slice(-6)}`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} godz.`;
}
