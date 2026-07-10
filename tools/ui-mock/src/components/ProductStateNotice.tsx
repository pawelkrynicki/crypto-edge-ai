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
    eyebrow: "Data Gap",
    boundary: "Data Gap",
  },
  partial: {
    eyebrow: "Partial Source Coverage",
    boundary: "Partial Source Coverage",
  },
  error: {
    eyebrow: "Manual Verification Required",
    boundary: "Not Verified",
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

      <div className="product-state-status-grid" aria-label="Data Gap and Next Review Step summary">
        <ProductStateMetric label="State" value={status} detail={copy.boundary} />
        <ProductStateMetric label="Data Gap" value="Data Gap" detail="Not Verified" />
        <ProductStateMetric label="Cannot Infer Safety" value="Cannot Infer Safety" detail="Manual Review Only" />
        <ProductStateMetric label="Next Review Step" value={nextReviewStep} detail="Manual Verification Required" />
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
