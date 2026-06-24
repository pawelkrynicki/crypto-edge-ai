import { alternativeMeFngAdapter } from "./alternativeMeFngAdapter.js";
import { defillamaAdapter } from "./defillamaAdapter.js";
import type { SourceAdapter } from "./sourceAdapterTypes.js";

export const APPROVED_SOURCE_ADAPTERS: SourceAdapter[] = [alternativeMeFngAdapter, defillamaAdapter];

export function getApprovedSourceAdapters(): SourceAdapter[] {
  return [...APPROVED_SOURCE_ADAPTERS];
}

export function getSourceAdapter(sourceId: string): SourceAdapter | null {
  return APPROVED_SOURCE_ADAPTERS.find((adapter) => adapter.sourceId === sourceId) ?? null;
}
