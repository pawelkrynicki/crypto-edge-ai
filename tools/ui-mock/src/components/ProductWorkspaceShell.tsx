import type { ReactNode } from "react";
import type { ResolvedProductRuntimeMode } from "../runtimeMode";

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
  sourceStatusText: string;
  dataUnavailableMessage?: string | null;
  dataUnavailableReasonCode?: string | null;
  runtimeMode: ResolvedProductRuntimeMode;
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
  sourceStatusText,
  dataUnavailableMessage,
  dataUnavailableReasonCode,
  runtimeMode,
  children,
}: ProductWorkspaceShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header workspace-header">
        <div className="product-mark">
          <div className="product-logo">CE</div>
          <div className="min-w-0">
            <h1>Crypto Edge AI</h1>
            <p>Internal research workspace</p>
          </div>
        </div>

        <div className="header-actions">
          <span className="source-status">API only · fail-closed</span>
          <span className="badge badge-context">{runtimeMode}</span>
          <span className="badge badge-context">Research only</span>
          <span className="source-status">{sourceStatusText}</span>
          {loading && <em>loading...</em>}
        </div>
      </header>

      <div className="workspace-shell-body">
        <aside className="workspace-sidebar" aria-label="Workspace navigation">
          <nav className="workspace-nav">
            <section
              className="workspace-nav-group"
              data-nav-group="Crypto Edge AI"
              aria-label="Crypto Edge AI"
            >
              <div className="workspace-nav-group-header">
                <span>Crypto Edge AI</span>
                <small>Fail-closed real-data workspace.</small>
              </div>

              {navItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onSectionChange(item.id)}
                  className={`workspace-nav-item ${activeSection === item.id ? "active" : ""}`}
                >
                  <span className="workspace-nav-icon">{item.icon}</span>
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
            <div className="app-notice workspace-notice">
              <span>Data Unavailable · {dataUnavailableReasonCode ?? "UNKNOWN_REASON"}</span>
              <p>{dataUnavailableMessage}</p>
            </div>
          )}

          <main className="workspace-content">{children}</main>
        </div>
      </div>

      <footer className="app-footer">
        <p>Research workspace only. Published data must pass provenance, policy, allowlist and freshness checks.</p>
        <span>WATCHLIST means Manual Review Only.</span>
      </footer>
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
