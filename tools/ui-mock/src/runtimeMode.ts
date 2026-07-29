export const PRODUCT_RUNTIME_MODES = ["DEVELOPMENT_DEMO", "INTERNAL_BETA"] as const;

export type ProductRuntimeMode = (typeof PRODUCT_RUNTIME_MODES)[number];
export type ResolvedProductRuntimeMode = ProductRuntimeMode | "UNCONFIGURED";

declare const __CRYPTO_EDGE_RUNTIME_MODE__: string | undefined;
declare const __CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW__: boolean | undefined;

export function resolveProductRuntimeMode(value: unknown): ResolvedProductRuntimeMode {
  return typeof value === "string"
    && PRODUCT_RUNTIME_MODES.includes(value as ProductRuntimeMode)
    ? value as ProductRuntimeMode
    : "UNCONFIGURED";
}

export function getProductRuntimeMode(): ResolvedProductRuntimeMode {
  const configured = typeof __CRYPTO_EDGE_RUNTIME_MODE__ === "undefined"
    ? undefined
    : __CRYPTO_EDGE_RUNTIME_MODE__;

  return resolveProductRuntimeMode(configured);
}

export function isAIResearchRenderPreviewMode(): boolean {
  return typeof __CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW__ !== "undefined"
    && __CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW__ === true;
}

export function isDevelopmentDemoMode(mode: ResolvedProductRuntimeMode): boolean {
  return mode === "DEVELOPMENT_DEMO";
}
