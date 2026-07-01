import React from "react";
import type { ResolvedScannerSource } from "../services/scannerDataSource";
import type { MarketContextPanelState } from "./MarketContextPanel";

export type PreviewReadinessStatus =
  | "Ready"
  | "Partial"
  | "Not ready"
  | "Manual check required";

export interface TrustedTesterReadinessItem {
  label: string;
  status: PreviewReadinessStatus;
  detail: string;
}

export interface ControlCenterStatus {
  trustedTesterPreview: PreviewReadinessStatus;
  readinessItems: TrustedTesterReadinessItem[];
}

type ReviewStorageStatus = {
  tone: "ready" | "fallback" | "warning" | "error";
  text: string;
  detail?: string;
};

interface ControlCenterProps {
  candidateCount: number;
  resolvedScannerSource: ResolvedScannerSource;
  scannerSourceText: string;
  scannerFallbackReason?: string | null;
  scannerGeneratedAt?: string | null;
  scannerMode?: string | null;
  contextSourceText: string;
  contextSourceDetail?: string | null;
  marketContextState: MarketContextPanelState;
  reviewStorageStatus: ReviewStorageStatus;
}

const NEXT_BUILD_STEPS = [
  "12B.2 - Control Center actions / operator workflow",
  "12C - Trusted Tester Preview Mode",
  "12D - Reports Library + Feedback Loop",
  "12E - Lightweight Private Preview Deployment",
  "12F - Pawel Gradziuk Test Session / Feedback Fixes",
];

const SAFETY_ITEMS = [
  "Research-only.",
  "No investment advice.",
  "No trading CTA: buy, sell, entry, signal.",
  "WATCHLIST = manual review only.",
  "Missing data = manual verification required.",
  "No paid source activation.",
];

export const ControlCenter: React.FC<ControlCenterProps> = ({
  candidateCount,
  resolvedScannerSource,
  scannerSourceText,
  scannerFallbackReason,
  scannerGeneratedAt,
  scannerMode,
  contextSourceText,
  contextSourceDetail,
  marketContextState,
  reviewStorageStatus,
}) => {
  const status = buildControlCenterStatus(candidateCount);
  const scannerDataKind = getScannerDataKind(resolvedScannerSource);
  const scannerFreshness = scannerGeneratedAt
    ? formatDate(scannerGeneratedAt)
    : "Manual verification required";
  const contextFreshness = getContextFreshness(marketContextState);
  const contextKind = getContextKind(marketContextState);
  const sourceState = getSourceState(resolvedScannerSource, marketContextState);

  return (
    <div className="control-center">
      <section className="control-center-hero">
        <div className="control-center-hero-copy">
          <span className="section-label">Standalone readiness</span>
          <h3>Control Center</h3>
          <p>
            Standalone preview status hub for product readiness, source freshness, review flow, reports and trusted tester preparation.
          </p>
        </div>
        <div className="control-center-research-note">
          Research-only. WATCHLIST means manual review only.
        </div>
      </section>

      <section className="control-center-summary-card">
        <div>
          <span className="section-label">Trusted Tester Readiness</span>
          <h3>External trusted tester preview</h3>
          <p>
            This shell makes status visible in the UI, but it does not create access, deployment, refresh actions, or a feedback path.
          </p>
        </div>
        <StatusBadge status={status.trustedTesterPreview} />
      </section>

      <section className="control-section">
        <ControlSectionHeader
          title="Trusted Tester Readiness"
          description="P0 checklist for a standalone preview path. Missing runtime proof stays manual or not ready."
        />
        <div className="control-readiness-grid">
          {status.readinessItems.map((item) => (
            <article key={item.label} className="control-status-card">
              <div className="control-status-card-topline">
                <h4>{item.label}</h4>
                <StatusBadge status={item.status} />
              </div>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="control-section">
        <ControlSectionHeader
          title="Data & Source Freshness"
          description="Current preview data status from the existing local UI contracts."
        />
        <div className="control-status-grid">
          <StatusCard
            label="Scanner data"
            status={scannerDataKind.status}
            value={scannerDataKind.value}
            detail={scannerFallbackReason ?? scannerSourceText}
          />
          <StatusCard
            label="Scanner freshness"
            status={scannerGeneratedAt ? "Partial" : "Manual check required"}
            value={scannerFreshness}
            detail={scannerMode ? `scan_run.mode: ${scannerMode}` : "Runtime scanner metadata is not fully available in the UI."}
          />
          <StatusCard
            label="Context data"
            status={contextKind.status}
            value={contextKind.value}
            detail={contextSourceDetail ?? contextSourceText}
          />
          <StatusCard
            label="Context freshness"
            status={contextFreshness.status}
            value={contextFreshness.value}
            detail={contextFreshness.detail}
          />
          <StatusCard
            label="Source status summary"
            status={sourceState.status}
            value={sourceState.value}
            detail={sourceState.detail}
          />
          <StatusCard
            label="Stale / partial / unknown state"
            status="Manual check required"
            value="Preview data / mock state"
            detail="Unknown or fixture-backed data must be manually verified before tester use."
          />
        </div>
      </section>

      <section className="control-section">
        <ControlSectionHeader
          title="Review & Reports"
          description="Review storage, scanner label separation, and report readiness."
        />
        <div className="control-status-grid">
          <StatusCard
            label="Review storage"
            status={reviewStorageStatus.tone === "ready" ? "Partial" : "Manual check required"}
            value={reviewStorageStatus.text}
            detail={reviewStorageStatus.detail ?? "Browser fallback or local API status must be verified for the preview session."}
          />
          <StatusCard
            label="Review semantics"
            status="Ready"
            value="Review is separate from scanner label"
            detail="Review status does not change scanner labels, scoring, final_label, or WATCHLIST meaning."
          />
          <StatusCard
            label="Report/export status"
            status="Manual check required"
            value="Local report export exists; preview is not wired"
            detail="Report generation remains a local command path in 12B.1. No UI command execution is added."
          />
        </div>
      </section>

      <section className="control-section">
        <ControlSectionHeader
          title="Safety & Compliance"
          description="Product boundaries that stay visible before any trusted tester session."
        />
        <div className="control-safety-grid">
          {SAFETY_ITEMS.map((item) => (
            <div key={item} className="control-safety-item">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="control-section">
        <ControlSectionHeader
          title="Next Build Steps"
          description="Informational roadmap only. This panel does not execute commands."
        />
        <div className="control-next-steps">
          {NEXT_BUILD_STEPS.map((step, index) => (
            <div key={step} className="control-next-step">
              <span>{index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
        <div className="control-center-ai-note">
          AI KINTEL remains a later integration stage, not the next standalone implementation target.
        </div>
      </section>
    </div>
  );
};

function buildControlCenterStatus(candidateCount: number): ControlCenterStatus {
  return {
    trustedTesterPreview: "Not ready",
    readinessItems: [
      {
        label: "Private access / simple launch",
        status: "Not ready",
        detail: "No access gate, private deployment, or simple external launch path exists in 12B.1.",
      },
      {
        label: "No-CMD tester path",
        status: "Not ready",
        detail: "The tester path still depends on local owner setup outside this shell.",
      },
      {
        label: "Clear dashboard",
        status: "Partial",
        detail: "Overview and Control Center expose status, but trusted tester mode is not complete.",
      },
      {
        label: "Candidate list/detail",
        status: candidateCount > 0 ? "Ready" : "Manual check required",
        detail: candidateCount > 0
          ? `${candidateCount} current preview candidates render in the scanner workspace.`
          : "No current UI candidate count is available.",
      },
      {
        label: "Data freshness visible",
        status: "Partial",
        detail: "Scanner and context freshness are visible when local metadata exists; fixture state remains manual.",
      },
      {
        label: "Source status visible",
        status: "Partial",
        detail: "Scanner, context, and review storage status are displayed from existing local contracts.",
      },
      {
        label: "Review semantics clear",
        status: "Ready",
        detail: "Local review is documented as separate from scanner label, scoring, final_label, and WATCHLIST meaning.",
      },
      {
        label: "Report preview accessible",
        status: "Manual check required",
        detail: "Report export exists as a local workflow, but an in-UI report preview/library is not wired.",
      },
      {
        label: "Feedback path",
        status: "Not ready",
        detail: "No trusted tester feedback capture path is implemented in 12B.1.",
      },
      {
        label: "Not public/open",
        status: "Manual check required",
        detail: "No preview deployment exists here, so exposure must be checked manually before any session.",
      },
      {
        label: "No secrets",
        status: "Manual check required",
        detail: "This UI shell adds no secrets, but deployment/session secrets still require manual review.",
      },
      {
        label: "No browser provider calls",
        status: "Manual check required",
        detail: "The shell uses existing local UI contracts only; browser/provider policy still requires review.",
      },
      {
        label: "No paid source activation",
        status: "Manual check required",
        detail: "12B.1 does not activate paid sources; source activation must remain explicitly blocked.",
      },
    ],
  };
}

function StatusCard({
  label,
  status,
  value,
  detail,
}: {
  label: string;
  status: PreviewReadinessStatus;
  value: string;
  detail?: string | null;
}) {
  return (
    <article className="control-status-card">
      <div className="control-status-card-topline">
        <h4>{label}</h4>
        <StatusBadge status={status} />
      </div>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </article>
  );
}

function ControlSectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="control-section-header">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </header>
  );
}

function StatusBadge({ status }: { status: PreviewReadinessStatus }) {
  return (
    <span className={`control-status-badge ${statusClass(status)}`}>
      {status}
    </span>
  );
}

function statusClass(status: PreviewReadinessStatus): string {
  if (status === "Ready") return "ready";
  if (status === "Partial") return "partial";
  if (status === "Not ready") return "not-ready";
  return "manual";
}

function getScannerDataKind(source: ResolvedScannerSource): { status: PreviewReadinessStatus; value: string } {
  if (source === "real-output") {
    return { status: "Partial", value: "real-output" };
  }

  if (source === "fixture-fallback") {
    return { status: "Manual check required", value: "fixture-fallback" };
  }

  return { status: "Manual check required", value: "Preview data / mock state" };
}

function getContextKind(state: MarketContextPanelState): { status: PreviewReadinessStatus; value: string } {
  if (state.status === "ready") {
    return {
      status: state.context._source_meta.source_kind === "approved-sources-output" ? "Partial" : "Manual check required",
      value: state.context._source_meta.source_kind,
    };
  }

  if (state.status === "loading") {
    return { status: "Manual check required", value: "Loading local context" };
  }

  return { status: "Manual check required", value: "unknown" };
}

function getContextFreshness(state: MarketContextPanelState): {
  status: PreviewReadinessStatus;
  value: string;
  detail: string;
} {
  if (state.status === "ready") {
    return {
      status: "Partial",
      value: formatDate(state.context._source_meta.loaded_at || state.context.generated_at),
      detail: `generated_at: ${formatDate(state.context.generated_at)}`,
    };
  }

  if (state.status === "loading") {
    return {
      status: "Manual check required",
      value: "Loading",
      detail: "Context freshness is not available yet.",
    };
  }

  return {
    status: "Manual check required",
    value: "unknown",
    detail: state.message,
  };
}

function getSourceState(
  scannerSource: ResolvedScannerSource,
  contextState: MarketContextPanelState,
): { status: PreviewReadinessStatus; value: string; detail: string } {
  const contextSource = contextState.status === "ready"
    ? contextState.context._source_meta.source_kind
    : contextState.status;

  const hasPreviewFallback = scannerSource !== "real-output" || contextSource !== "approved-sources-output";

  return {
    status: hasPreviewFallback ? "Manual check required" : "Partial",
    value: hasPreviewFallback ? "partial / unknown" : "local outputs visible",
    detail: `Scanner: ${scannerSource}; context: ${contextSource}.`,
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
