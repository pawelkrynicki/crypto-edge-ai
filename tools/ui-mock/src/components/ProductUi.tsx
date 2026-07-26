import React, {
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { useProductLocale } from "../productI18n";

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

export type ActionVariant = "primary" | "secondary" | "tertiary" | "danger";
export type ProductIconName = "arrow" | "check" | "chevron" | "copy" | "download" | "external" | "lock" | "refresh";

type ActionPresentationProps = {
  children: ReactNode;
  className?: string;
  icon?: ProductIconName;
  iconPosition?: "start" | "end";
  loading?: boolean;
  loadingLabel?: string;
  variant?: ActionVariant;
};

export type ActionButtonProps = ActionPresentationProps
  & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

export function ActionButton({
  children,
  className = "",
  icon,
  iconPosition = "start",
  loading = false,
  loadingLabel,
  type = "button",
  variant = "primary",
  disabled,
  ...props
}: ActionButtonProps) {
  const label = loading && loadingLabel ? loadingLabel : children;
  return (
    <button
      {...props}
      type={type}
      className={`action-button action-button--${variant} ${className}`.trim()}
      data-action-variant={variant}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
    >
      {icon && iconPosition === "start" && <ProductIcon name={icon} />}
      {label}
      {icon && iconPosition === "end" && <ProductIcon name={icon} />}
    </button>
  );
}

type LinkPresentationProps = Omit<ActionPresentationProps, "loading" | "loadingLabel">;

export type ActionLinkProps = LinkPresentationProps
  & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className" | "href"> & {
    href: string;
  };

export function ActionLink({
  children,
  className = "",
  href,
  icon,
  iconPosition = "start",
  variant = "primary",
  ...props
}: ActionLinkProps) {
  return (
    <a
      {...props}
      href={href}
      className={`action-button action-button--${variant} ${className}`.trim()}
      data-action-variant={variant}
    >
      {icon && iconPosition === "start" && <ProductIcon name={icon} />}
      {children}
      {icon && iconPosition === "end" && <ProductIcon name={icon} />}
    </a>
  );
}

export type ExternalLinkActionProps = LinkPresentationProps
  & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className" | "href"> & {
    href: string;
  };

export function ExternalLinkAction({
  children,
  className = "",
  href,
  icon = "external",
  iconPosition = "end",
  variant = "secondary",
  target = "_blank",
  rel = "noreferrer noopener",
  ...props
}: ExternalLinkActionProps) {
  return (
    <a
      {...props}
      href={href}
      target={target}
      rel={rel}
      className={`action-button action-button--${variant} external-link-action ${className}`.trim()}
      data-action-variant={variant}
      data-external-link="true"
    >
      {icon && iconPosition === "start" && <ProductIcon name={icon} />}
      {children}
      {icon && iconPosition === "end" && <ProductIcon name={icon} />}
    </a>
  );
}

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
    <span
      className={`product-status-badge ${tone} ${className}`.trim()}
      data-status-tone={tone}
      data-interaction="status"
    >
      <span className="product-status-indicator" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

export function CopyButton({
  value,
  label,
  copiedLabel,
  className = "",
}: {
  value: string;
  label: string;
  copiedLabel: string;
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
    <span className={`copy-button-control ${copied ? "copied" : ""} ${className}`.trim()}>
      <ActionButton
        variant="tertiary"
        icon={copied ? "check" : "copy"}
        onClick={copy}
        aria-label={label}
      >
        {copied ? copiedLabel : label}
      </ActionButton>
      <span className="copy-action-feedback" role="status" aria-live="polite">
        {copied ? copiedLabel : ""}
      </span>
    </span>
  );
}

export function CopyableAddress({
  value,
  displayValue,
  copyLabel,
  copiedLabel,
  className = "",
}: {
  value: string;
  displayValue?: string;
  copyLabel: string;
  copiedLabel: string;
  buttonLabel?: string;
  className?: string;
}) {
  return (
    <span className={`copyable-address ${className}`.trim()} data-interaction="read-only-field">
      <code title={value}>{displayValue ?? value}</code>
      <CopyButton value={value} label={copyLabel} copiedLabel={copiedLabel} />
    </span>
  );
}

export function ReadOnlyCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={`read-only-card ${className}`.trim()} data-interaction="read-only">
      {children}
    </article>
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

export function TechnicalDetails({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const { locale } = useProductLocale();
  const [open, setOpen] = useState(false);
  const stateLabel = open
    ? (locale === "pl" ? "Zwiń" : "Collapse")
    : (locale === "pl" ? "Rozwiń" : "Expand");

  return (
    <details
      className={`product-technical-details ${className}`.trim()}
      data-interaction="disclosure"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-expanded={open}>
        <span>{label}</span>
        <span className="disclosure-state">{stateLabel}</span>
        <ProductIcon name="chevron" />
      </summary>
      <div className="product-technical-details-content">{children}</div>
    </details>
  );
}

export function ProductIcon({ name }: { name: ProductIconName }) {
  const common = { viewBox: "0 0 20 20", focusable: false, "aria-hidden": true } as const;
  if (name === "copy") return <svg {...common}><rect x="7" y="7" width="9" height="9" rx="2" /><path d="M13 7V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1" /></svg>;
  if (name === "external") return <svg {...common}><path d="M11 4h5v5M9 11l7-7" /><path d="M14 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" /></svg>;
  if (name === "chevron") return <svg {...common}><path d="m6 8 4 4 4-4" /></svg>;
  if (name === "refresh") return <svg {...common}><path d="M15 7a6 6 0 1 0 1 5" /><path d="M15 3v4h-4" /></svg>;
  if (name === "download") return <svg {...common}><path d="M10 3v9m-4-4 4 4 4-4M4 16h12" /></svg>;
  if (name === "check") return <svg {...common}><path d="m4 10 4 4 8-8" /></svg>;
  if (name === "lock") return <svg {...common}><rect x="4" y="8" width="12" height="9" rx="2" /><path d="M7 8V6a3 3 0 0 1 6 0v2" /></svg>;
  return <svg {...common}><path d="M4 10h12m-4-4 4 4-4 4" /></svg>;
}
