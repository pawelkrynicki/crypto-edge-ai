import React, { useState } from "react";
import type { MockCandidate } from "../mockData";

interface ResearchActionPanelProps {
  candidate?: MockCandidate | null;
  tokenInput?: string;
  variant?: "default" | "compact";
  onOpenCandidateDetail?: () => void;
  onOpenTokenLookup?: () => void;
  onOpenExternalChecks?: () => void;
}

type PanelAction =
  | {
      type: "link";
      label: string;
      href: string;
      detail: string;
      onClick?: () => void;
    }
  | {
      type: "button";
      label: string;
      detail: string;
      disabled?: boolean;
      disabledReason?: string;
      onClick?: () => void;
    };

const EVM_ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/;
const CHAIN_HINT_PATTERN = /\b(ethereum|eth|base|bsc|binance|polygon|arbitrum|optimism|solana)\b/i;

export const ResearchActionPanel: React.FC<ResearchActionPanelProps> = ({
  candidate,
  tokenInput = "",
  variant = "default",
  onOpenCandidateDetail,
  onOpenTokenLookup,
  onOpenExternalChecks,
}) => {
  const [markedForManualReview, setMarkedForManualReview] = useState(false);
  const panelState = buildResearchActionPanelState(candidate, tokenInput);
  const actions: PanelAction[] = [
    {
      type: "link",
      label: "Open Candidate Detail",
      href: "#candidate-detail",
      detail: candidate ? "next review step" : "manual verification required",
      onClick: onOpenCandidateDetail,
    },
    {
      type: "link",
      label: "Open Token Lookup",
      href: "#token-lookup",
      detail: panelState.tokenInput ? "copy token input" : "manual verification required",
      onClick: onOpenTokenLookup,
    },
    {
      type: "link",
      label: "Open External Checks",
      href: "#external-checks",
      detail: panelState.hasContract ? "not verified" : "contract required",
      onClick: onOpenExternalChecks,
    },
    {
      type: "button",
      label: "Copy Contract",
      detail: panelState.hasContract ? "not verified" : "contract required",
      disabled: !panelState.hasContract,
      disabledReason: "contract required",
      onClick: () => copyManualValue(panelState.contractAddress),
    },
    {
      type: "button",
      label: "Copy Token Input",
      detail: panelState.tokenInput ? "not verified" : "manual verification required",
      disabled: !panelState.tokenInput,
      disabledReason: "manual verification required",
      onClick: () => copyManualValue(panelState.tokenInput),
    },
    panelState.hasCandidate
      ? {
          type: "link",
          label: "View Source Freshness",
          href: "#candidate-detail",
          detail: panelState.sourceFreshnessDetail,
          onClick: onOpenCandidateDetail,
        }
      : {
          type: "button",
          label: "View Source Freshness",
          detail: panelState.sourceFreshnessDetail,
          disabled: true,
          disabledReason: panelState.sourceFreshnessStatus,
        },
    {
      type: "button",
      label: markedForManualReview ? "Manual Review Only" : "Mark For Manual Review",
      detail: "manual review only",
      onClick: () => setMarkedForManualReview(true),
    },
    {
      type: "link",
      label: "Send Feedback",
      href: "#feedback-notes",
      detail: "manual verification required",
    },
    {
      type: "link",
      label: "Add Review Note",
      href: "#feedback-notes",
      detail: "manual review only",
    },
  ];

  return (
    <section className={`research-action-panel ${variant}`} aria-label="research action panel">
      <div className="research-action-panel-header">
        <div>
          <span className="research-action-eyebrow">Research Action Panel</span>
          <h4>Next Review Step</h4>
          <p>Not Verified. Manual Verification Required. Data Gap: Cannot Infer Safety.</p>
        </div>
        <div className="research-action-panel-token">
          <span>{panelState.displayName}</span>
          <strong>{panelState.chain || "chain unknown"}</strong>
        </div>
      </div>

      <div className="research-action-status-grid" aria-label="research action panel states">
        <ResearchActionStatus label="Manual Review Only" value={panelState.manualReviewState} />
        <ResearchActionStatus label="Contract" value={panelState.hasContract ? "not verified" : "contract required"} />
        <ResearchActionStatus label="Chain" value={panelState.chain || "chain unknown"} />
        <ResearchActionStatus label="Source Freshness" value={panelState.sourceFreshnessStatus} />
        <ResearchActionStatus label="Cannot Infer Safety" value="cannot infer safety" />
      </div>

      <div className="research-action-grid">
        {actions.map((action) => (
          <ResearchActionControl key={action.label} action={action} />
        ))}
      </div>
    </section>
  );
};

function ResearchActionControl({ action }: { action: PanelAction }) {
  if (action.type === "link") {
    return (
      <a
        className="research-action-control"
        href={action.href}
        onClick={(event) => {
          if (!action.onClick) return;
          event.preventDefault();
          action.onClick();
        }}
      >
        <span>{action.label}</span>
        <small>{action.detail}</small>
      </a>
    );
  }

  return (
    <button
      type="button"
      className={`research-action-control ${action.disabled ? "disabled" : ""}`}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      <span>{action.label}</span>
      <small>{action.disabled ? action.disabledReason : action.detail}</small>
    </button>
  );
}

function ResearchActionStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="research-action-status">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildResearchActionPanelState(candidate: MockCandidate | null | undefined, rawTokenInput: string) {
  const tokenInput = buildTokenInput(candidate, rawTokenInput);
  const contractAddress = candidate?.contract_address.trim() || extractContractAddress(rawTokenInput);
  const chain = candidate?.chain.trim().toLowerCase() || inferChain(rawTokenInput);
  const sourceFreshness = getSourceFreshness(candidate);

  return {
    displayName: candidate?.symbol || candidate?.name || tokenInput || "token input",
    hasCandidate: Boolean(candidate),
    tokenInput,
    contractAddress,
    hasContract: Boolean(contractAddress),
    chain,
    manualReviewState: candidate?.final_label === "WATCHLIST" ? "manual review only" : "manual verification required",
    sourceFreshnessStatus: sourceFreshness.status,
    sourceFreshnessDetail: sourceFreshness.detail,
  };
}

function buildTokenInput(candidate: MockCandidate | null | undefined, rawTokenInput: string): string {
  const input = rawTokenInput.trim();
  if (input) return input;
  return candidate?.symbol || candidate?.name || "";
}

function getSourceFreshness(candidate: MockCandidate | null | undefined): { status: string; detail: string } {
  if (!candidate?.source_url.trim() || !candidate.last_checked.trim()) {
    return {
      status: "source freshness unknown",
      detail: "source freshness unknown",
    };
  }

  const checkedAt = new Date(candidate.last_checked);
  if (Number.isNaN(checkedAt.getTime())) {
    return {
      status: "source freshness unknown",
      detail: "source freshness unknown",
    };
  }

  return {
    status: "not verified",
    detail: `last scanner check ${checkedAt.toISOString().slice(0, 10)}`,
  };
}

function extractContractAddress(input: string): string {
  return input.match(EVM_ADDRESS_PATTERN)?.[0] ?? "";
}

function inferChain(input: string): string {
  const hint = input.match(CHAIN_HINT_PATTERN)?.[0].toLowerCase() ?? "";
  if (hint === "eth") return "ethereum";
  if (hint === "binance") return "bsc";
  return hint;
}

function copyManualValue(value: string): void {
  if (!value) return;
  if (typeof navigator === "undefined" || !navigator.clipboard) return;

  void navigator.clipboard.writeText(value);
}
