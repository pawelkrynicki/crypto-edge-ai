import React, { type ReactNode } from "react";

void React;

export type TokenDetailTab<T extends string> = {
  id: T;
  label: ReactNode;
};

type TokenDetailTabsProps<T extends string> = {
  tabs: readonly TokenDetailTab<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  idPrefix: string;
  ariaLabel: string;
};

/**
 * The single horizontal tab interaction used by token detail workspaces.
 * Consumers only provide labels and content; keyboard behaviour and the
 * accessible tab/panel relationship stay consistent across surfaces.
 */
export function TokenDetailTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  idPrefix,
  ariaLabel,
}: TokenDetailTabsProps<T>) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: T) => {
    const currentIndex = tabs.findIndex((item) => item.id === tab);
    let nextIndex: number;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[nextIndex]!.id;
    onChange(nextTab);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${nextTab}`)?.focus();
  };

  return (
    <div className="token-detail-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={`${idPrefix}-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          className={activeTab === tab.id ? "active" : ""}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

type TokenDetailTabPanelProps<T extends string> = {
  activeTab: T;
  idPrefix: string;
  children: ReactNode;
};

export function TokenDetailTabPanel<T extends string>({ activeTab, idPrefix, children }: TokenDetailTabPanelProps<T>) {
  return (
    <section
      id={`${idPrefix}-panel-${activeTab}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${activeTab}`}
      tabIndex={0}
      className="token-detail-tabpanel"
    >
      {children}
    </section>
  );
}
