import React from "react";
import type { DataSourceKey } from "../services/scannerDataSource";
import type { ResolvedProductRuntimeMode } from "../runtimeMode";

export type WorkspaceSectionId =
  | "overview"
  | "control-center"
  | "candidate-results"
  | "candidate-detail"
  | "token-lookup"
  | "external-checks"
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

export interface WorkspaceNavGroup {
  id: string;
  label: string;
  description: string;
  items: WorkspaceNavItem[];
}

interface DataSourceOption {
  key: DataSourceKey;
  label: string;
}

interface WorkspaceShellProps {
  navGroups: WorkspaceNavGroup[];
  activeSection: WorkspaceSectionId;
  onSectionChange: (sectionId: WorkspaceSectionId) => void;
  dataSource: DataSourceKey;
  dataSourceOptions: DataSourceOption[];
  onDataSourceChange: (source: DataSourceKey) => void;
  loading: boolean;
  sourceStatusText: string;
  fallbackMsg?: string | null;
  dataUnavailableReasonCode?: string | null;
  runtimeMode?: ResolvedProductRuntimeMode;
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
  navGroups,
  activeSection,
  onSectionChange,
  dataSource,
  dataSourceOptions,
  onDataSourceChange,
  loading,
  sourceStatusText,
  fallbackMsg,
  dataUnavailableReasonCode,
  runtimeMode = "DEVELOPMENT_DEMO",
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
            <span className="source-status">WATCHLIST means Manual Review Only.</span>
          </>
        ) : (
          <>
            {dataSourceOptions.length > 0 ? (
              <div className="source-control" aria-label="Source Freshness">
                <span>Source Freshness</span>
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
            ) : (
              <span className="source-status">API only · fail-closed</span>
            )}
            <span className="badge badge-context">{runtimeMode}</span>
            <span className="badge badge-context">Research only</span>
            <span className="source-status">{sourceStatusText}</span>
          </>
        )}
      </div>
    </header>

    <div className="workspace-shell-body">
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        <nav className="workspace-nav">
          {navGroups.map((group) => (
            <section
              className="workspace-nav-group"
              key={group.id}
              data-nav-group={group.label}
              aria-label={group.label}
            >
              <div className="workspace-nav-group-header">
                <span>{group.label}</span>
                <small>{group.description}</small>
              </div>

              {group.items.map((item) => {
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
            </section>
          ))}
        </nav>
      </aside>

      <div className="workspace-main">
        {fallbackMsg && !presentationMode && (
          <div className="app-notice workspace-notice">
            <span>{dataUnavailableReasonCode ? `Data Unavailable · ${dataUnavailableReasonCode}` : "Development demo data notice"}</span>
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
          <span>Manual Review boundary.</span>
        </>
      ) : trustedPreviewMode ? (
        <>
          <p>Research-only preview. Scanner context and local review do not change labels or scoring.</p>
          <span>WATCHLIST means Manual Review Only.</span>
        </>
      ) : (
        <>
          <p>Research workspace only. Scanner context and local review do not change labels or scoring.</p>
          <span>Manual Review Only.</span>
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
