import React from "react";
import type { DataSourceKey } from "../services/scannerDataSource";

export type WorkspaceSectionId =
  | "overview"
  | "control-center"
  | "trusted-preview"
  | "feedback-notes"
  | "webinar-teaser"
  | "scanner"
  | "watchlist"
  | "research"
  | "risks"
  | "methodology";

export interface WorkspaceNavItem {
  id: WorkspaceSectionId;
  label: string;
  icon: string;
  description: string;
}

interface DataSourceOption {
  key: DataSourceKey;
  label: string;
}

interface WorkspaceShellProps {
  navItems: WorkspaceNavItem[];
  activeSection: WorkspaceSectionId;
  onSectionChange: (sectionId: WorkspaceSectionId) => void;
  dataSource: DataSourceKey;
  dataSourceOptions: DataSourceOption[];
  onDataSourceChange: (source: DataSourceKey) => void;
  loading: boolean;
  sourceStatusText: string;
  fallbackMsg?: string | null;
  presentationMode?: boolean;
  trustedPreviewMode?: boolean;
  children: React.ReactNode;
}

interface WorkspaceSectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  navItems,
  activeSection,
  onSectionChange,
  dataSource,
  dataSourceOptions,
  onDataSourceChange,
  loading,
  sourceStatusText,
  fallbackMsg,
  presentationMode = false,
  trustedPreviewMode = false,
  children,
}) => (
  <div className={`app-shell ${presentationMode ? "presentation-mode" : ""} ${trustedPreviewMode ? "trusted-preview-mode" : ""}`}>
    <header className="app-header workspace-header">
      <div className="product-mark">
        <div className="product-logo">CE</div>
        <div className="min-w-0">
          <h1>Crypto Edge AI</h1>
          <p>{presentationMode ? "Research preview" : trustedPreviewMode ? "Trusted reviewer preview" : "Local MVP / Research only"}</p>
        </div>
      </div>

      <div className="header-actions">
        {presentationMode ? (
          <>
            <span className="badge badge-context">Webinar Teaser</span>
            <span className="badge badge-context">Research only</span>
          </>
        ) : trustedPreviewMode ? (
          <>
            <span className="badge badge-context">Trusted Preview</span>
            <span className="badge badge-context">Research only</span>
            <span className="source-status">WATCHLIST means manual review only.</span>
          </>
        ) : (
          <>
            <div className="source-control" aria-label="Data source">
              <span>Data source</span>
              <div className="source-segment">
                {dataSourceOptions.map((opt) => (
                  <button
                    type="button"
                    key={opt.key}
                    onClick={() => onDataSourceChange(opt.key)}
                    className={dataSource === opt.key ? "active" : ""}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {loading && <em>loading...</em>}
            </div>
            <span className="badge badge-context">Local MVP</span>
            <span className="badge badge-context">Research only</span>
            <span className="source-status">{sourceStatusText}</span>
          </>
        )}
      </div>
    </header>

    <div className="workspace-shell-body">
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        <nav className="workspace-nav">
          {navItems.map((item) => {
            const active = activeSection === item.id;

            return (
              <button
                type="button"
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`workspace-nav-item ${active ? "active" : ""}`}
              >
                <span className="workspace-nav-icon">{item.icon}</span>
                <span className="workspace-nav-copy">
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="workspace-main">
        {fallbackMsg && !presentationMode && (
          <div className="app-notice workspace-notice">
            <span>Scanner fixture fallback</span>
            <p>{fallbackMsg}</p>
          </div>
        )}

        <main className="workspace-content">
          {children}
        </main>
      </div>
    </div>

    <footer className="app-footer">
      {presentationMode ? (
        <>
          <p>Research preview only. Context, risks and review steps stay analyst-controlled.</p>
          <span>Manual review boundary.</span>
        </>
      ) : trustedPreviewMode ? (
        <>
          <p>Research-only preview. Scanner context and local review do not change labels or scoring.</p>
          <span>WATCHLIST means manual review only.</span>
        </>
      ) : (
        <>
          <p>Research workspace only. Scanner context and local review do not change labels or scoring.</p>
          <span>This is not a buy/sell signal.</span>
        </>
      )}
    </footer>
  </div>
);

export const WorkspaceSection: React.FC<WorkspaceSectionProps> = ({
  title,
  description,
  children,
}) => (
  <section className="workspace-section">
    <header className="workspace-section-header">
      <div className="min-w-0">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
    <div className="workspace-section-body">
      {children}
    </div>
  </section>
);
