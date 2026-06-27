import React from "react";

interface WorkspaceOverviewProps {
  marketContext: React.ReactNode;
  workflowPanel: React.ReactNode;
  statCards: React.ReactNode;
}

export const WorkspaceOverview: React.FC<WorkspaceOverviewProps> = ({
  marketContext,
  workflowPanel,
  statCards,
}) => (
  <div className="overview-layout">
    <section className="overview-intro-panel">
      <div className="section-label">Workspace status</div>
      <h3>Local MVP workspace overview</h3>
      <p>Scanner label, local review status and analyst report are separate layers.</p>
      <p>Scanner label and local review status are separate workflow layers.</p>
      <p>
        Use <code>scripts\win\check-local-mvp.cmd</code> before merge/freeze decisions.
      </p>
      <p>
        Analyst report remains a local command: <code>scripts\win\generate-analyst-report.cmd</code>.
      </p>
    </section>

    <section className="overview-stat-section" aria-label="Scanner summary">
      {statCards}
    </section>

    <section className="overview-panel" aria-label="Market context">
      {marketContext}
    </section>

    <section className="overview-panel" aria-label="Local MVP workflow">
      {workflowPanel}
    </section>
  </div>
);
