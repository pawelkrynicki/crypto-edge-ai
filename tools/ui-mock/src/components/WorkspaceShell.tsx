import React from "react";
import type { DataSourceKey } from "../services/scannerDataSource";

export type WorkspaceSectionId =
  | "overview"
  | "control-center"
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
  children,
}) => (
  <div className="app-shell">
    <header className="app-header workspace-header">
      <div className="product-mark">
        <div className="product-logo">CE</div>
        <div className="min-w-0">
          <h1>Crypto Edge AI</h1>
          <p>Local MVP / Research only</p>
        </div>
      </div>

      <div className="header-actions">
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
        {fallbackMsg && (
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
      <p>Research workspace only. Scanner context and local review do not change labels or scoring.</p>
      <span>This is not a buy/sell signal.</span>
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
