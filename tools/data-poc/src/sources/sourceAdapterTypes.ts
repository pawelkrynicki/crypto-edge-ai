import type { SourceAction } from "../sourcePolicy.js";

export type SourceAdapterMode = "fixture" | "live";
export type SourceDataCategory = "sentiment" | "defi_context" | "market_context";

export type NormalizedSourcePolicy = {
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

export type NormalizedSourceRecord = FearGreedIndexRecord | DefiContextRecord;

export type NormalizedSourceOutput = {
  source_id: string;
  source_name: string;
  mode: SourceAdapterMode;
  fetched_at: string;
  policy: NormalizedSourcePolicy;
  data_category: SourceDataCategory;
  records: NormalizedSourceRecord[];
  warnings: string[];
  errors: string[];
};

export type ApprovedSourcesRunOutput = {
  run_id: string;
  generated_at: string;
  environment: string;
  sources: NormalizedSourceOutput[];
  summary: {
    sources_requested: number;
    sources_allowed: number;
    sources_denied: number;
    records_total: number;
    warnings_total: number;
    errors_total: number;
  };
};

export type SourceAdapter = {
  sourceId: string;
  displayName: string;
  supportedActions: SourceAction[];
  fetchFixture(): Promise<NormalizedSourceOutput>;
  fetchLive(options: { environment?: string }): Promise<NormalizedSourceOutput>;
};
