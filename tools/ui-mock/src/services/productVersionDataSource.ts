import type { ProductVersion } from "../productVersion";

type ViteImportMeta = ImportMeta & {
  env?: { VITE_SCANNER_API_URL?: string };
};

export type { ProductVersion };

export async function loadProductVersion(): Promise<ProductVersion | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/product/version`, { credentials: "same-origin" });
    const value = await response.json() as unknown;
    return response.ok && isProductVersion(value) ? value : null;
  } catch {
    return null;
  }
}

export function isProductVersion(value: unknown): value is ProductVersion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const fields = [
    "scanner_run_id", "scanner_generated_at", "context_run_id", "context_generated_at",
    "lifecycle_cycle_id", "lifecycle_updated_at",
  ];
  return Object.keys(record).length === fields.length
    && fields.every((field) => Object.hasOwn(record, field) && isNullableText(record[field]));
}

function getApiBaseUrl(): string {
  const configured = (import.meta as ViteImportMeta).env?.VITE_SCANNER_API_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : "";
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
