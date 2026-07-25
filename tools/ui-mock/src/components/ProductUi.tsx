import React, { useEffect, useState, type ReactNode } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.

export type ProductStatusTone =
  | "neutral"
  | "accent"
  | "ready"
  | "partial"
  | "warning"
  | "not-ready"
  | "manual"
  | "critical";

export function StatusBadge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: ProductStatusTone;
  className?: string;
}) {
  return (
    <span className={`product-status-badge ${tone} ${className}`.trim()} data-status-tone={tone}>
      <span className="product-status-indicator" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

export function CopyableAddress({
  value,
  displayValue,
  copyLabel,
  copiedLabel,
  buttonLabel,
  className = "",
}: {
  value: string;
  displayValue?: string;
  copyLabel: string;
  copiedLabel: string;
  buttonLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copy = () => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value).then(() => setCopied(true));
  };

  return (
    <span className={`copyable-address ${copied ? "copied" : ""} ${className}`.trim()}>
      <code title={value}>{displayValue ?? value}</code>
      <button type="button" onClick={copy} aria-label={copyLabel}>
        {copied ? copiedLabel : buttonLabel ?? copyLabel}
      </button>
      <span className="copyable-address-feedback" role="status" aria-live="polite">
        {copied ? copiedLabel : ""}
      </span>
    </span>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="product-loading-state" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="product-loading-heading" aria-hidden="true" />
      <div className="product-loading-copy" aria-hidden="true" />
      <div className="product-loading-grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
