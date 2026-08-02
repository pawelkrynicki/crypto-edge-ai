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
  return (
    <div className={`detail-panel token-detail-drawer ${className}`.trim()} data-token-detail-drawer="true">
      <header className="detail-header">
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
        {summary && <div className="detail-header-summary">{summary}</div>}
        {meta && <div className="detail-header-meta">{meta}</div>}
      </header>
      {tabBar}
      <div className={`detail-body token-detail-drawer-body ${bodyClassName}`.trim()}>{children}</div>
    </div>
  );
}
