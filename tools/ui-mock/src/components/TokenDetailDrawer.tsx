import React, { type ReactNode } from "react";

void React;

type TokenDetailDrawerProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  summary?: ReactNode;
  meta?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  tabBar?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Shared token card shell for Details and Verification.
 * It intentionally owns only presentation; all token data and mutations stay
 * with the caller's established flow.
 */
export function TokenDetailDrawer({
  title,
  subtitle,
  badge,
  summary,
  meta,
  onClose,
  closeLabel = "Close token detail",
  tabBar,
  bodyClassName = "",
  children,
  className = "",
}: TokenDetailDrawerProps) {
  const hasInformation = Boolean(summary || meta);

  return (
    <div className={`detail-panel token-detail-drawer ${className}`.trim()} data-token-detail-drawer="true">
      <header className={`detail-header ${hasInformation ? "detail-header--with-information" : ""}`.trim()} data-token-drawer-section="token-header">
        <div className="detail-header-top">
          <div className="detail-title">
            <strong>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {badge}
            {onClose && (
              <button type="button" onClick={onClose} className="detail-close" aria-label={closeLabel}>
                x
              </button>
            )}
          </div>
        </div>
      </header>
      {hasInformation && <div className="detail-header-information" data-token-drawer-section="metadata">{summary && <div className="detail-header-summary">{summary}</div>}{meta && <div className="detail-header-meta">{meta}</div>}</div>}
      {tabBar && <div className="detail-tab-bar" data-token-drawer-section="tabs">{tabBar}</div>}
      <div className={`detail-body token-detail-drawer-body ${bodyClassName}`.trim()}>{children}</div>
    </div>
  );
}
