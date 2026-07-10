import React, { useEffect, useMemo, useState } from "react";
import {
  ManualVerificationFallback,
  buildLookupVerificationGaps,
} from "./ManualVerificationFallback";
import { ProductStateNotice } from "./ProductStateNotice";
import { ResearchActionPanel } from "./ResearchActionPanel";

interface TokenContractLookupViewProps {
  initialInput?: string;
  onOpenExternalChecks?: (input: string) => void;
}

type LookupClassification =
  | "Likely Symbol"
  | "Likely Project Name"
  | "Likely EVM Contract Address"
  | "Likely URL"
  | "Unknown Format";

type LookupTone = "neutral" | "manual" | "risk";

interface LookupRow {
  label: string;
  value: string;
  detail: string;
  tone?: LookupTone;
}

interface LookupResult {
  classification: LookupClassification;
  summary: string;
  rows: LookupRow[];
  reviewSteps: string[];
}

const QUICK_EXAMPLES = [
  { label: "Symbol", value: "PEPE" },
  { label: "Project Name", value: "Lido Finance" },
  { label: "Contract", value: "0x1111111111111111111111111111111111111111" },
  { label: "URL", value: "https://example.org/project" },
  { label: "Chain + Address", value: "base: 0x2222222222222222222222222222222222222222" },
];

const EVM_ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/;
const SYMBOL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,11}$/;
const PROJECT_NAME_PATTERN = /[A-Za-z]/;
const CHAIN_HINT_PATTERN = /\b(ethereum|eth|base|bsc|binance|polygon|arbitrum|optimism)\b/i;

export const TokenContractLookupView: React.FC<TokenContractLookupViewProps> = ({
  initialInput = "",
  onOpenExternalChecks,
}) => {
  const [input, setInput] = useState(initialInput);

  useEffect(() => {
    setInput(initialInput);
  }, [initialInput]);

  const lookup = useMemo(() => classifyTokenLookupInput(input), [input]);
  const hasContract = lookup.classification === "Likely EVM Contract Address";
  const stateNotice = buildLookupStateNotice(input, hasContract);

  return (
    <div className="token-lookup-view">
      <section className="token-lookup-hero">
        <div className="token-lookup-hero-copy">
          <span className="token-lookup-eyebrow">Token to Verify</span>
          <h3>Token Lookup</h3>
          <p>
            Manual Verification Required. This shell classifies local input only and keeps every security, chain,
            liquidity and Source Freshness state as unknown or Not Verified.
          </p>
        </div>
        <div className="token-lookup-boundary">
          <strong>Manual Review</strong>
          <span>Not Verified until a human checks contract, chain, Source Freshness and Risk Flags.</span>
        </div>
      </section>

      <section className="token-lookup-input-panel" aria-label="Token to Verify input">
        <label className="token-lookup-input-label" htmlFor="token-lookup-input">
          Token to Verify
        </label>
        <input
          id="token-lookup-input"
          className="token-lookup-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="token to verify / contract address / URL"
        />
        <div className="token-lookup-examples" aria-label="quick examples">
          {QUICK_EXAMPLES.map((example) => (
            <button
              type="button"
              key={example.label}
              className="token-lookup-example-button"
              onClick={() => setInput(example.value)}
            >
              {example.label}
            </button>
          ))}
        </div>
      </section>

      <section className="token-lookup-result-panel" aria-label="Token Lookup result">
        <div className="token-lookup-result-topline">
          <div>
            <span className="token-lookup-eyebrow">Token Lookup</span>
            <h3>{lookup.classification}</h3>
          </div>
          <span className="token-lookup-status">Manual Verification Required</span>
        </div>
        <p>{lookup.summary}</p>

        <div className="token-lookup-grid">
          {lookup.rows.map((row) => (
            <LookupMetric
              key={`${row.label}-${row.value}`}
              label={row.label}
              value={row.value}
              detail={row.detail}
              tone={row.tone}
            />
          ))}
        </div>
      </section>

      <ProductStateNotice {...stateNotice} />

      <ManualVerificationFallback
        title="Manual Verification Required"
        gaps={buildLookupVerificationGaps(hasContract)}
      />

      <ResearchActionPanel
        tokenInput={input}
        onOpenExternalChecks={onOpenExternalChecks ? () => onOpenExternalChecks(input) : undefined}
      />

      <section className="token-lookup-review-panel">
        <div>
          <span className="token-lookup-eyebrow">Next Review Step</span>
          <h3>Manual Review</h3>
          <p>External Check Required. Contract and chain must be verified manually before any security context is trusted.</p>
        </div>
        <ul className="token-lookup-step-list">
          {lookup.reviewSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        {onOpenExternalChecks && (
          <button
            type="button"
            className="token-lookup-secondary-button"
            onClick={() => onOpenExternalChecks(input)}
          >
            Open External Checks
          </button>
        )}
      </section>
    </div>
  );
};

function LookupMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: LookupTone;
}) {
  return (
    <div className={`token-lookup-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

export function classifyTokenLookupInput(rawInput: string): LookupResult {
  const input = rawInput.trim();

  if (!input) {
    return {
      classification: "Unknown Format",
      summary: "Enter a Token to Verify. Contract Required before security checks can move past Manual Review.",
      rows: buildMissingDataRows(),
      reviewSteps: buildManualReviewSteps("Contract Required"),
    };
  }

  const evmAddress = input.match(EVM_ADDRESS_PATTERN)?.[0] ?? "";

  if (evmAddress) {
    return buildContractResult(input, evmAddress);
  }

  if (isLikelyUrl(input)) {
    return {
      classification: "Likely URL",
      summary: "Source URL not fetched. Manual Verification Required; no scraping / no automatic fetch is performed.",
      rows: [
        {
          label: "Source URL",
          value: "source URL not fetched",
          detail: "Manual Verification Required",
          tone: "manual",
        },
        {
          label: "Source Freshness",
          value: "Source Freshness Unknown",
          detail: "no automatic fetch",
          tone: "manual",
        },
        ...buildMissingDataRows(),
      ],
      reviewSteps: buildManualReviewSteps("no scraping / no automatic fetch"),
    };
  }

  if (SYMBOL_PATTERN.test(input)) {
    return {
      classification: "Likely Symbol",
      summary: "Likely symbol only. Contract Required for security checks and Chain Required for External Checks.",
      rows: buildMissingDataRows(),
      reviewSteps: buildManualReviewSteps("Contract Required"),
    };
  }

  if (PROJECT_NAME_PATTERN.test(input) && input.length >= 3) {
    return {
      classification: "Likely Project Name",
      summary: "Likely project name only. Manual Verification Required before Token Lookup can continue.",
      rows: buildMissingDataRows(),
      reviewSteps: buildManualReviewSteps("Contract Required"),
    };
  }

  return {
    classification: "Unknown Format",
    summary: "Unknown format. Manual Verification Required and missing data remains unknown.",
    rows: buildMissingDataRows(),
    reviewSteps: buildManualReviewSteps("unknown format"),
  };
}

function buildContractResult(input: string, evmAddress: string): LookupResult {
  const chainHint = input.replace(evmAddress, "").match(CHAIN_HINT_PATTERN)?.[0] ?? "";
  const rows: LookupRow[] = [
    {
      label: "Contract Address",
      value: "Not Verified",
      detail: evmAddress,
      tone: "manual",
    },
    {
      label: "Chain",
      value: "Chain Unknown",
      detail: "Chain Unknown / verify manually",
      tone: "manual",
    },
    {
      label: "External Checks",
      value: "External Check Required",
      detail: "Manual Verification Required",
      tone: "manual",
    },
    {
      label: "Security Status",
      value: "Not Verified",
      detail: "Manual Verification Required",
      tone: "manual",
    },
    {
      label: "Liquidity",
      value: "Liquidity Unknown",
      detail: "missing data cannot create a positive security status",
      tone: "manual",
    },
    {
      label: "Source Freshness",
      value: "Source Freshness Unknown",
      detail: "Manual Review",
      tone: "manual",
    },
  ];

  if (chainHint) {
    rows.splice(2, 0, {
      label: "Chain Hint",
      value: chainHint.toLowerCase(),
      detail: "Manual Review",
      tone: "neutral",
    });
  }

  return {
    classification: "Likely EVM Contract Address",
    summary: "Contract address format found locally. Address, chain, External Checks and security status are Not Verified.",
    rows,
    reviewSteps: buildManualReviewSteps("External Check Required"),
  };
}

function buildMissingDataRows(): LookupRow[] {
  return [
    {
      label: "Contract Address",
      value: "Contract Required",
      detail: "Contract Required for security checks",
      tone: "manual",
    },
    {
      label: "Chain",
      value: "Chain Unknown",
      detail: "Chain Required for External Checks / verify manually",
      tone: "manual",
    },
    {
      label: "External Checks",
      value: "External Check Required",
      detail: "Manual Verification Required",
      tone: "manual",
    },
    {
      label: "Security Status",
      value: "Not Verified",
      detail: "Security Not Verified",
      tone: "manual",
    },
    {
      label: "Liquidity",
      value: "Liquidity Unknown",
      detail: "Manual Review",
      tone: "manual",
    },
    {
      label: "Source Freshness",
      value: "Source Freshness Unknown",
      detail: "Manual Verification Required",
      tone: "manual",
    },
    {
      label: "Risk Flags",
      value: "Manual Verification Required",
      detail: "Risk Flags unknown",
      tone: "manual",
    },
  ];
}

function buildManualReviewSteps(reason: string): string[] {
  return [
    reason,
    "Chain Unknown / verify manually",
    "Security Not Verified",
    "Liquidity Unknown",
    "Source Freshness Unknown",
  ];
}

function buildLookupStateNotice(input: string, hasContract: boolean) {
  if (!input.trim()) {
    return {
      variant: "empty" as const,
      title: "Contract Required",
      status: "Contract Required",
      detail: "Data Gap: no token input is present, Chain Unknown and External Check Required states stay Not Verified.",
      nextReviewStep: "Enter a token input, then verify contract and chain manually",
      items: [
        { label: "Chain", value: "Chain Unknown", detail: "Manual Verification Required" },
        { label: "Security", value: "Security Not Verified", detail: "Cannot Infer Safety" },
        { label: "Liquidity", value: "Liquidity Unknown", detail: "Manual Review Only" },
        { label: "Source Freshness", value: "Source Freshness Unknown", detail: "Not Verified" },
      ],
    };
  }

  return {
    variant: hasContract ? "partial" as const : "error" as const,
    title: hasContract ? "Chain Unknown" : "Contract Required",
    status: hasContract ? "Chain Unknown" : "Contract Required",
    detail: "Data Gap: Token Lookup is frontend-only, so External Check Required, Security Not Verified, Liquidity Unknown, and Source Freshness Unknown remain Manual Review Only.",
    nextReviewStep: hasContract
      ? "Verify chain manually before opening External Checks"
      : "Find the contract address before External Checks",
    items: [
      { label: "External Check", value: "External Check Required", detail: "Manual Verification Required" },
      { label: "Security", value: "Security Not Verified", detail: "Cannot Infer Safety" },
      { label: "Liquidity", value: "Liquidity Unknown", detail: "Not Verified" },
      { label: "Source Freshness", value: "Source Freshness Unknown", detail: "Manual Review Only" },
    ],
  };
}

function isLikelyUrl(value: string): boolean {
  if (/^https?:\/\//i.test(value) || /^www\./i.test(value)) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
