import {
  createFileReviewSessionStorageProvider,
  type ReviewSessionFileStoreOptions,
} from "./reviewSessionFileStore.js";
import {
  createSqliteReviewSessionStorageProvider,
} from "./reviewSessionSqliteStore.js";
import type { ReviewSessionStorageProvider } from "./reviewSessionStorageProvider.js";

const REVIEW_STORAGE_PROVIDER_ENV = "CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER";
const REVIEW_SQLITE_PATH_ENV = "CRYPTO_EDGE_REVIEW_SQLITE_PATH";

export type ReviewSessionProviderConfigOptions = {
  reviewSession?: ReviewSessionFileStoreOptions;
};

export function createConfiguredReviewSessionStorageProvider(
  options: ReviewSessionProviderConfigOptions = {},
): ReviewSessionStorageProvider {
  const providerKind = process.env[REVIEW_STORAGE_PROVIDER_ENV]?.trim().toLowerCase();

  if (providerKind === "sqlite") {
    return createSqliteReviewSessionStorageProvider({
      databaseFilePath: process.env[REVIEW_SQLITE_PATH_ENV],
    });
  }

  return createFileReviewSessionStorageProvider(options.reviewSession);
}
