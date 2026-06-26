import type { ReviewSessionState } from "../src/types/reviewSessionTypes.js";

export type ReviewSessionStorageSourceMeta = {
  source_kind: "file-backed-review-session";
  storage_file: string;
  loaded_at: string;
  warning?: string;
};

export type ReviewSessionStorageResult = {
  state: ReviewSessionState;
  _source_meta: ReviewSessionStorageSourceMeta;
};

export type ReviewSessionStorageDiagnostics = {
  source_kind: "file-backed-review-session-diagnostics";
  storage_file: string;
  checked_at: string;
  file_exists: boolean;
  file_size_bytes: number | null;
  entries_count: number;
  valid: boolean;
  warning?: string;
};

export class ReviewSessionStorageProviderError extends Error {
  readonly code: "invalid_review_session" | "write_failed";

  constructor(code: ReviewSessionStorageProviderError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type ReviewSessionStorageProvider = {
  read(): Promise<ReviewSessionStorageResult>;
  write(state: unknown): Promise<ReviewSessionStorageResult>;
  diagnostics(): Promise<ReviewSessionStorageDiagnostics>;
};
