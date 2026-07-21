import {
  PRODUCT_TRANSLATIONS,
  type ProductLocale,
} from "./productI18n";
import type {
  ProductSourceHealthResolution,
  ProductSourceHealthStatus,
} from "./productSourceHealth";

export type ProductSourceHealthPresentation = {
  status: ProductSourceHealthStatus;
  value: string;
  detail: string;
  tone: "ready" | "warning";
};

export function presentProductSourceHealth(
  resolution: ProductSourceHealthResolution,
  locale: ProductLocale,
  surface: "header" | "summary",
): ProductSourceHealthPresentation {
  const copy = PRODUCT_TRANSLATIONS[locale];
  const value = resolution.status === "partial"
    ? copy[surface === "header" ? "status.partiallyAvailable" : "status.partial"]
    : resolution.status === "available"
      ? copy["status.available"]
      : copy["status.unavailable"];
  return {
    status: resolution.status,
    value,
    detail: resolution.detailSourceIds.join(", ") || copy["status.sourceDetailsUnavailable"],
    tone: resolution.status === "available" ? "ready" : "warning",
  };
}
