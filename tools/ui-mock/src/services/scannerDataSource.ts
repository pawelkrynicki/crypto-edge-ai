import type { ScannerApiOutput } from "../types/scannerTypes";
import {
  getProductRuntimeMode,
  type ResolvedProductRuntimeMode,
} from "../runtimeMode";

export type DataSourceKey = "fixture" | "static-json" | "api";
export type ResolvedScannerSource =
  | "built-in-fixture"
  | "static-json"
  | "real-output"
  | "fixture-fallback"
  | "unavailable";

export interface ScannerDataSourceResult {
  status: "ready";
  source: DataSourceKey;
  resolvedSource: Exclude<ResolvedScannerSource, "unavailable">;
  usedFallback: boolean;
  fallbackReason?: string;
  output: ScannerApiOutput;
}

export interface ScannerDataSourceErrorResult {
  status: "error";
  source: DataSourceKey;
  resolvedSource: "unavailable";
  usedFallback: false;
  reasonCode: string;
  error: string;
  output: null;
}

export type ScannerDataSourceLoadResult = ScannerDataSourceResult | ScannerDataSourceErrorResult;

export type ScannerDataSourceOptions = {
  runtimeMode?: ResolvedProductRuntimeMode;
};

type ViteImportMeta = ImportMeta & {
  env?: {
    VITE_SCANNER_API_URL?: string;
  };
};

class ScannerDataSourceHttpError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string, message: string) {
    super(message);
    this.reasonCode = reasonCode;
  }
}

async function fetchJson(url: string): Promise<ScannerApiOutput> {
  const res = await fetch(url);
  const body = await parseJsonResponse(res);

  if (!res.ok) {
    const reasonCode = isRecord(body) && typeof body.reason_code === "string"
      ? body.reason_code
      : `HTTP_${res.status}`;
    throw new ScannerDataSourceHttpError(reasonCode, `HTTP ${res.status} ${res.statusText} - ${url}`);
  }

  if (!isRecord(body)) {
    throw new ScannerDataSourceHttpError("SCANNER_RESPONSE_INVALID", "Scanner API response was not a JSON object.");
  }

  return body as ScannerApiOutput;
}

export function interpretScannerApiOutput(output: ScannerApiOutput): ScannerDataSourceResult {
  const meta = output._source_meta;

  if (meta?.source === "real-output") {
    return {
      status: "ready",
      source: "api",
      resolvedSource: "real-output",
      usedFallback: false,
      output,
    };
  }

  return {
    status: "ready",
    source: "api",
    resolvedSource: "fixture-fallback",
    usedFallback: true,
    fallbackReason: meta?.reason ?? "API response did not include scanner source metadata.",
    output,
  };
}

export async function loadScannerDataSourceResult(
  source: DataSourceKey,
  options: ScannerDataSourceOptions = {},
): Promise<ScannerDataSourceLoadResult> {
  const runtimeMode = options.runtimeMode ?? getProductRuntimeMode();

  if (runtimeMode !== "DEVELOPMENT_DEMO" && source !== "api") {
    return errorResult(source, "SCANNER_DEMO_SOURCE_FORBIDDEN", "Fixture and static sample sources require DEVELOPMENT_DEMO.");
  }

  if (source === "api") {
    return loadScannerApiDataSourceResult({ runtimeMode });
  }

  try {
    if (source === "fixture") {
      return {
        status: "ready",
        source,
        resolvedSource: "built-in-fixture",
        usedFallback: false,
        output: await fetchJson("/fixtures/persistableScannerSample.json"),
      };
    }

    if (source === "static-json") {
      return {
        status: "ready",
        source,
        resolvedSource: "static-json",
        usedFallback: false,
        output: await fetchJson("/fixtures/persistableScannerSample.json"),
      };
    }

    return errorResult(source, "SCANNER_SOURCE_UNSUPPORTED", "Unsupported scanner data source.");

  } catch (error) {
    const reasonCode = error instanceof ScannerDataSourceHttpError
      ? error.reasonCode
      : "SCANNER_API_UNAVAILABLE";
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(source, reasonCode, message);
  }
}

export async function loadScannerApiDataSourceResult(
  options: ScannerDataSourceOptions = {},
): Promise<ScannerDataSourceLoadResult> {
  const runtimeMode = options.runtimeMode ?? getProductRuntimeMode();

  if (runtimeMode !== "DEVELOPMENT_DEMO" && runtimeMode !== "INTERNAL_BETA") {
    return errorResult(
      "api",
      "SCANNER_RUNTIME_MODE_UNCONFIGURED",
      "A recognized product runtime mode is required before scanner data can be loaded.",
    );
  }

  try {
    const apiBaseUrl = getApiBaseUrl();
    const result = interpretScannerApiOutput(await fetchJson(`${apiBaseUrl}/api/scanner/latest`));

    if (runtimeMode !== "DEVELOPMENT_DEMO" && result.usedFallback) {
      return errorResult(
        "api",
        "SCANNER_FIXTURE_RESPONSE_FORBIDDEN",
        "INTERNAL_BETA rejected a scanner response without real-output provenance.",
      );
    }

    return result;
  } catch (error) {
    const reasonCode = error instanceof ScannerDataSourceHttpError
      ? error.reasonCode
      : "SCANNER_API_UNAVAILABLE";
    const message = error instanceof Error ? error.message : String(error);
    return errorResult("api", reasonCode, message);
  }
}

function errorResult(source: DataSourceKey, reasonCode: string, error: string): ScannerDataSourceErrorResult {
  return {
    status: "error",
    source,
    resolvedSource: "unavailable",
    usedFallback: false,
    reasonCode,
    error,
    output: null,
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getApiBaseUrl(): string {
  const viteEnv = (import.meta as ViteImportMeta).env;
  return viteEnv?.VITE_SCANNER_API_URL?.replace(/\/$/, "") ?? "";
}
