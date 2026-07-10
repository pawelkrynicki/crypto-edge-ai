import React from "react";

export type ProductStateNoticeVariant = "empty" | "partial" | "error";

export interface ProductStateNoticeItem {
  label: string;
  value: string;
  detail?: string;
}

export interface ProductStateNoticeProps {
  variant: ProductStateNoticeVariant;
  title: string;
  status: string;
  detail: string;
  nextReviewStep: string;
  items?: ProductStateNoticeItem[];
  compact?: boolean;
}

const VARIANT_COPY: Record<ProductStateNoticeVariant, { eyebrow: string; boundary: string }> = {
  empty: {
    eyebrow: "empty state",
    boundary: "data gap",
  },
  partial: {
    eyebrow: "partial state",
    boundary: "partial source coverage",
  },
  error: {
    eyebrow: "error state",
    boundary: "not verified",
  },
};

export const ProductStateNotice: React.FC<ProductStateNoticeProps> = ({
  variant,
  title,
  status,
  detail,
  nextReviewStep,
  items = [],
  compact = false,
}) => {
  const copy = VARIANT_COPY[variant];

  return (
    <section
      className={`product-state-notice ${variant} ${compact ? "compact" : ""}`}
      aria-label={`${copy.eyebrow} notice`}
    >
      <div className="product-state-notice-header">
        <span className="product-state-eyebrow">{copy.eyebrow}</span>
        <h4>{title}</h4>
        <p>{detail}</p>
      </div>

      <div className="product-state-status-grid" aria-label="empty error partial state summary">
        <ProductStateMetric label="state" value={status} detail={copy.boundary} />
        <ProductStateMetric label="data gap" value="data gap" detail="not verified" />
        <ProductStateMetric label="safety boundary" value="cannot infer safety" detail="manual review only" />
        <ProductStateMetric label="next review step" value={nextReviewStep} detail="manual verification required" />
      </div>

      {items.length > 0 && (
        <div className="product-state-item-grid">
          {items.map((item) => (
            <ProductStateMetric
              key={`${item.label}-${item.value}`}
              label={item.label}
              value={item.value}
              detail={item.detail}
            />
          ))}
        </div>
      )}
    </section>
  );
};

function ProductStateMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="product-state-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}
