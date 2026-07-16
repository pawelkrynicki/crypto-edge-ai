import type {
  ContextPolicy,
  MarketContextApiOutput,
  NormalizedContextRecord,
  NormalizedSourceOutput,
} from "../types/contextTypes";
import { getProductRuntimeMode } from "../runtimeMode";

export type ResolvedMarketContextSource = "approved-sources-output" | "fixture-fallback";

export type MarketContextDataSourceResult =
  | {
      status: "ready";
      resolvedSource: ResolvedMarketContextSource;
      usedFallback: boolean;
      fallbackReason?: string;
      output: MarketContextApiOutput;
    }
  | {
      status: "error";
      reasonCode: string;
      error: string;
      output: null;
    };

type ViteImportMeta = ImportMeta & {
  env?: {
    VITE_SCANNER_API_URL?: string;
  };
};

class ContextDataSourceHttpError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string, message: string) {
    super(message);
    this.reasonCode = reasonCode;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  let body: unknown = null;
  try {
    body = await res.json() as unknown;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const reasonCode = isRecord(body) && typeof body.reason_code === "string"
      ? body.reason_code
      : `HTTP_${res.status}`;
    throw new ContextDataSourceHttpError(reasonCode, `HTTP ${res.status} ${res.statusText} - ${url}`);
  }

  return body;
}

export function parseMarketContextApiOutput(value: unknown): MarketContextApiOutput {
  if (!isMarketContextApiOutput(value)) {
    throw new Error("Context API response did not match the expected shape.");
  }

  return value;
}

export function interpretContextApiOutput(output: MarketContextApiOutput): MarketContextDataSourceResult {
  const usedFallback = output._source_meta.source_kind === "fixture-fallback";

  return {
    status: "ready",
    resolvedSource: output._source_meta.source_kind,
    usedFallback,
    fallbackReason: usedFallback ? "Market context is using the local sample fallback." : undefined,
    output,
  };
}

export async function loadLatestMarketContext(): Promise<MarketContextDataSourceResult> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const output = parseMarketContextApiOutput(await fetchJson(`${apiBaseUrl}/api/context/latest`));
    if (getProductRuntimeMode() !== "DEVELOPMENT_DEMO" && output._source_meta.source_kind === "fixture-fallback") {
      return {
        status: "error",
        reasonCode: "CONTEXT_FIXTURE_FORBIDDEN",
        error: "Context fixture is not eligible outside DEVELOPMENT_DEMO.",
        output: null,
      };
    }
    return interpretContextApiOutput(output);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      reasonCode: err instanceof ContextDataSourceHttpError ? err.reasonCode : "CONTEXT_API_UNAVAILABLE",
      error: `Context API unavailable: ${msg}`,
      output: null,
    };
  }
}

function getApiBaseUrl(): string {
  const viteEnv = (import.meta as ViteImportMeta).env;
  return viteEnv?.VITE_SCANNER_API_URL?.replace(/\/$/, "") ?? "";
}

function isMarketContextApiOutput(value: unknown): value is MarketContextApiOutput {
  if (!isRecord(value)) return false;

  return (
    typeof value.run_id === "string"
    && typeof value.generated_at === "string"
    && typeof value.environment === "string"
    && Array.isArray(value.sources)
    && value.sources.every(isNormalizedSourceOutput)
    && isMarketContextSummary(value.summary)
    && isContextSourceMeta(value._source_meta)
  );
}

function isNormalizedSourceOutput(value: unknown): value is NormalizedSourceOutput {
  if (!isRecord(value)) return false;

  return (
    (value.source_id === "alternative_me_fng" || value.source_id === "defillama_api")
    && typeof value.source_name === "string"
    && (value.mode === "fixture" || value.mode === "live")
    && typeof value.fetched_at === "string"
    && isContextPolicy(value.policy)
    && isDataCategory(value.data_category)
    && Array.isArray(value.records)
    && value.records.every(isNormalizedContextRecord)
    && isStringArray(value.warnings)
    && isStringArray(value.errors)
  );
}

function isContextPolicy(value: unknown): value is ContextPolicy {
  if (!isRecord(value)) return false;

  return (
    typeof value.environment === "string"
    && typeof value.action === "string"
    && typeof value.allowed === "boolean"
    && typeof value.reason === "string"
  );
}

function isNormalizedContextRecord(value: unknown): value is NormalizedContextRecord {
  if (!isRecord(value)) return false;

  if (value.record_type === "fear_greed_index") {
    return (
      typeof value.value === "number"
      && typeof value.value_classification === "string"
      && isNullableString(value.timestamp)
      && isNullableString(value.time_until_update)
    );
  }

  if (value.record_type === "defi_protocol_snapshot" || value.record_type === "chain_tvl_snapshot") {
    return (
      typeof value.name === "string"
      && isNullableString(value.chain)
      && isNullableNumber(value.tvl_usd)
      && isNullableNumber(value.change_1d)
      && isNullableNumber(value.change_7d)
      && isNullableString(value.url)
    );
  }

  return false;
}

function isMarketContextSummary(value: unknown): value is MarketContextApiOutput["summary"] {
  if (!isRecord(value)) return false;

  return (
    typeof value.sources_requested === "number"
    && typeof value.sources_allowed === "number"
    && typeof value.sources_denied === "number"
    && typeof value.records_total === "number"
    && typeof value.warnings_total === "number"
    && typeof value.errors_total === "number"
  );
}

function isContextSourceMeta(value: unknown): value is MarketContextApiOutput["_source_meta"] {
  if (!isRecord(value)) return false;

  return (
    (value.source_kind === "approved-sources-output" || value.source_kind === "fixture-fallback")
    && isNullableString(value.output_file)
    && typeof value.loaded_at === "string"
    && (value.runtime_mode === undefined || value.runtime_mode === "DEVELOPMENT_DEMO" || value.runtime_mode === "INTERNAL_BETA" || value.runtime_mode === "UNCONFIGURED")
    && (value.age_seconds === undefined || isNullableNumber(value.age_seconds))
    && (value.source_ids === undefined || isStringArray(value.source_ids))
  );
}

function isDataCategory(value: unknown): value is NormalizedSourceOutput["data_category"] {
  return value === "sentiment" || value === "defi_context" || value === "market_context";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}
