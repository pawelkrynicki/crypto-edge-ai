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
  | "likely symbol"
  | "likely project name"
  | "likely EVM contract address"
  | "likely URL"
  | "unknown format";

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
  { label: "symbol", value: "PEPE" },
  { label: "project name", value: "Lido Finance" },
  { label: "contract", value: "0x1111111111111111111111111111111111111111" },
  { label: "URL", value: "https://example.org/project" },
  { label: "chain + address", value: "base: 0x2222222222222222222222222222222222222222" },
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
  const hasContract = lookup.classification === "likely EVM contract address";
  const stateNotice = buildLookupStateNotice(input, hasContract);

  return (
    <div className="token-lookup-view">
      <section className="token-lookup-hero">
        <div className="token-lookup-hero-copy">
          <span className="token-lookup-eyebrow">token to verify</span>
          <h3>contract lookup</h3>
          <p>
            Manual verification required. This shell classifies local input only and keeps every security, chain,
            liquidity and source freshness state as unknown or not verified.
          </p>
        </div>
        <div className="token-lookup-boundary">
          <strong>manual review</strong>
          <span>not verified until a human checks contract, chain, source freshness and risk flags.</span>
        </div>
      </section>

      <section className="token-lookup-input-panel" aria-label="token to verify input">
        <label className="token-lookup-input-label" htmlFor="token-lookup-input">
          token to verify
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

      <section className="token-lookup-result-panel" aria-label="contract lookup result">
        <div className="token-lookup-result-topline">
          <div>
            <span className="token-lookup-eyebrow">contract lookup</span>
            <h3>{lookup.classification}</h3>
          </div>
          <span className="token-lookup-status">manual verification required</span>
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
        title="Manual verification fallback"
        gaps={buildLookupVerificationGaps(hasContract)}
      />

      <ResearchActionPanel
        tokenInput={input}
        onOpenExternalChecks={onOpenExternalChecks ? () => onOpenExternalChecks(input) : undefined}
      />

      <section className="token-lookup-review-panel">
        <div>
          <span className="token-lookup-eyebrow">next review step</span>
          <h3>manual review</h3>
          <p>External check required. Contract and chain must be verified manually before any security context is trusted.</p>
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
            Open external checks
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
      classification: "unknown format",
      summary: "Enter a token to verify. Contract required before security checks can move past manual review.",
      rows: buildMissingDataRows(),
      reviewSteps: buildManualReviewSteps("contract required"),
    };
  }

  const evmAddress = input.match(EVM_ADDRESS_PATTERN)?.[0] ?? "";

  if (evmAddress) {
    return buildContractResult(input, evmAddress);
  }

  if (isLikelyUrl(input)) {
    return {
      classification: "likely URL",
      summary: "Source URL not fetched. Manual verification required; no scraping / no automatic fetch is performed.",
      rows: [
        {
          label: "source URL",
          value: "source URL not fetched",
          detail: "manual verification required",
          tone: "manual",
        },
        {
          label: "source freshness",
          value: "source freshness unknown",
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
      classification: "likely symbol",
      summary: "Likely symbol only. Contract required for security checks and chain required for external checks.",
      rows: buildMissingDataRows(),
      reviewSteps: buildManualReviewSteps("contract required"),
    };
  }

  if (PROJECT_NAME_PATTERN.test(input) && input.length >= 3) {
    return {
      classification: "likely project name",
      summary: "Likely project name only. Manual verification required before any contract lookup can continue.",
      rows: buildMissingDataRows(),
      reviewSteps: buildManualReviewSteps("contract required"),
    };
  }

  return {
    classification: "unknown format",
    summary: "Unknown format. Manual verification required and missing data remains unknown.",
    rows: buildMissingDataRows(),
    reviewSteps: buildManualReviewSteps("unknown format"),
  };
}

function buildContractResult(input: string, evmAddress: string): LookupResult {
  const chainHint = input.replace(evmAddress, "").match(CHAIN_HINT_PATTERN)?.[0] ?? "";
  const rows: LookupRow[] = [
    {
      label: "contract address",
      value: "not verified",
      detail: evmAddress,
      tone: "manual",
    },
    {
      label: "chain",
      value: "chain unknown",
      detail: "chain unknown / verify manually",
      tone: "manual",
    },
    {
      label: "external checks",
      value: "external check required",
      detail: "manual verification required",
      tone: "manual",
    },
    {
      label: "security status",
      value: "not verified",
      detail: "manual verification required",
      tone: "manual",
    },
    {
      label: "liquidity",
      value: "liquidity unknown",
      detail: "missing data cannot create a positive security status",
      tone: "manual",
    },
    {
      label: "source freshness",
      value: "source freshness unknown",
      detail: "manual review",
      tone: "manual",
    },
  ];

  if (chainHint) {
    rows.splice(2, 0, {
      label: "chain hint",
      value: chainHint.toLowerCase(),
      detail: "manual review",
      tone: "neutral",
    });
  }

  return {
    classification: "likely EVM contract address",
    summary: "Contract address format found locally. Address, chain, external checks and security status are not verified.",
    rows,
    reviewSteps: buildManualReviewSteps("external check required"),
  };
}

function buildMissingDataRows(): LookupRow[] {
  return [
    {
      label: "contract address",
      value: "contract required",
      detail: "contract required for security checks",
      tone: "manual",
    },
    {
      label: "chain",
      value: "chain unknown",
      detail: "chain required for external checks / verify manually",
      tone: "manual",
    },
    {
      label: "external checks",
      value: "external check required",
      detail: "manual verification required",
      tone: "manual",
    },
    {
      label: "security status",
      value: "not verified",
      detail: "security not verified",
      tone: "manual",
    },
    {
      label: "liquidity",
      value: "liquidity unknown",
      detail: "manual review",
      tone: "manual",
    },
    {
      label: "source freshness",
      value: "source freshness unknown",
      detail: "manual verification required",
      tone: "manual",
    },
    {
      label: "risk flags",
      value: "manual verification required",
      detail: "risk flags unknown",
      tone: "manual",
    },
  ];
}

function buildManualReviewSteps(reason: string): string[] {
  return [
    reason,
    "chain unknown / verify manually",
    "security not verified",
    "liquidity unknown",
    "source freshness unknown",
  ];
}

function buildLookupStateNotice(input: string, hasContract: boolean) {
  if (!input.trim()) {
    return {
      variant: "empty" as const,
      title: "contract required",
      status: "contract required",
      detail: "data gap: no token input is present, chain unknown and external check required states stay not verified.",
      nextReviewStep: "enter a token input, then verify contract and chain manually",
      items: [
        { label: "chain", value: "chain unknown", detail: "manual verification required" },
        { label: "security", value: "security not verified", detail: "cannot infer safety" },
        { label: "liquidity", value: "liquidity unknown", detail: "manual review only" },
        { label: "source freshness", value: "source freshness unknown", detail: "not verified" },
      ],
    };
  }

  return {
    variant: hasContract ? "partial" as const : "error" as const,
    title: hasContract ? "chain unknown" : "contract required",
    status: hasContract ? "chain unknown" : "contract required",
    detail: "data gap: token lookup is frontend-only, so external check required, security not verified, liquidity unknown, and source freshness unknown remain manual review only.",
    nextReviewStep: hasContract
      ? "verify chain manually before opening external checks"
      : "find the contract address before external checks",
    items: [
      { label: "external check", value: "external check required", detail: "manual verification required" },
      { label: "security", value: "security not verified", detail: "cannot infer safety" },
      { label: "liquidity", value: "liquidity unknown", detail: "not verified" },
      { label: "source freshness", value: "source freshness unknown", detail: "manual review only" },
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
