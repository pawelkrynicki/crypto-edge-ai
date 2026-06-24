export type ContextSourceKind = "approved-sources-output" | "fixture-fallback";

export type ContextSourceMeta = {
  source_kind: ContextSourceKind;
  output_file: string | null;
  loaded_at: string;
};

export type ContextPolicy = {
  environment: string;
  action: string;
  allowed: boolean;
  reason: string;
};

export type FearGreedIndexRecord = {
  record_type: "fear_greed_index";
  value: number;
  value_classification: string;
  timestamp: string | null;
  time_until_update: string | null;
};

export type DefiContextRecord = {
  record_type: "defi_protocol_snapshot" | "chain_tvl_snapshot";
  name: string;
  chain: string | null;
  tvl_usd: number | null;
  change_1d: number | null;
  change_7d: number | null;
  url: string | null;
};

export type NormalizedContextRecord = FearGreedIndexRecord | DefiContextRecord;

export type NormalizedSourceOutput = {
  source_id: "alternative_me_fng" | "defillama_api";
  source_name: string;
  mode: "fixture" | "live";
  fetched_at: string;
  policy: ContextPolicy;
  data_category: "sentiment" | "defi_context" | "market_context";
  records: NormalizedContextRecord[];
  warnings: string[];
  errors: string[];
};

export type MarketContextSummary = {
  sources_requested: number;
  sources_allowed: number;
  sources_denied: number;
  records_total: number;
  warnings_total: number;
  errors_total: number;
};

export type MarketContextApiOutput = {
  run_id: string;
  generated_at: string;
  environment: string;
  sources: NormalizedSourceOutput[];
  summary: MarketContextSummary;
  _source_meta: ContextSourceMeta;
};
