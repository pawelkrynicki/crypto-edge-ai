import React from "react";

interface Props {
  scannerSourceText: string;
  scannerFallbackReason?: string | null;
  contextSourceText: string;
  contextSourceDetail?: string | null;
  reviewStorageText: string;
  reviewStorageDetail?: string | null;
}

const WORKFLOW_STEPS = [
  "Scanner latest",
  "Market context",
  "Candidate detail",
  "Local review",
  "Review queue",
  "Analyst report",
  "Local MVP health check",
];

const ANALYST_REPORT_COMMAND = "scripts\\win\\generate-analyst-report.cmd";
const LOCAL_MVP_HEALTH_COMMAND = "scripts\\win\\check-local-mvp.cmd";

export const LocalMvpWorkflowPanel: React.FC<Props> = ({
  scannerSourceText,
  scannerFallbackReason,
  contextSourceText,
  contextSourceDetail,
  reviewStorageText,
  reviewStorageDetail,
}) => (
  <section className="card local-mvp-workflow-card">
    <div className="local-mvp-workflow-header">
      <div className="min-w-0">
        <h2>Local MVP workflow</h2>
        <p>
          Local research workflow from scanner latest output to report export and health check.
        </p>
      </div>
      <span className="badge badge-context">Research only</span>
    </div>

    <div className="local-mvp-workflow-steps" aria-label="Local MVP workflow steps">
      {WORKFLOW_STEPS.map((step, index) => (
        <div key={step} className="local-mvp-workflow-step">
          <span className="local-mvp-workflow-step-index">{index + 1}</span>
          <span>{step}</span>
        </div>
      ))}
    </div>

    <div className="local-mvp-status-grid">
      <StatusItem label="Scanner source" value={scannerSourceText} detail={scannerFallbackReason} />
      <StatusItem label="Context source" value={contextSourceText} detail={contextSourceDetail} />
      <StatusItem label="Review storage" value={reviewStorageText} detail={reviewStorageDetail} />
      <StatusItem
        label="Analyst report"
        value="Generate report from CMD"
        detail={ANALYST_REPORT_COMMAND}
        command
      />
      <StatusItem
        label="Local MVP health"
        value="Full local health check"
        detail={LOCAL_MVP_HEALTH_COMMAND}
        command
      />
    </div>

    <div className="local-mvp-workflow-note">
      <span>Scanner label and local review status are separate workflow layers.</span>
      <span>This is not a buy/sell signal.</span>
    </div>
  </section>
);

function StatusItem({
  label,
  value,
  detail,
  command = false,
}: {
  label: string;
  value: string;
  detail?: string | null;
  command?: boolean;
}) {
  return (
    <div className="local-mvp-status-item">
      <div className="section-label">{label}</div>
      <div className="local-mvp-status-value">{value}</div>
      {detail && (
        <div className={command ? "local-mvp-status-command" : "local-mvp-status-detail"}>
          {detail}
        </div>
      )}
    </div>
  );
}
