import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewSessionState } from "../src/types/reviewSessionTypes.js";
import {
  createEmptyReviewSession,
  validateReviewSessionState,
} from "../src/services/reviewSessionValidation.js";

export type ReviewSessionSourceMeta = {
  source_kind: "file-backed-review-session";
  storage_file: string;
  loaded_at: string;
  warning?: string;
};

export type ReviewSessionFileStoreResult = {
  state: ReviewSessionState;
  _source_meta: ReviewSessionSourceMeta;
};

export type ReviewSessionFileStoreOptions = {
  storageFilePath?: string;
};

export class ReviewSessionFileStoreError extends Error {
  readonly code: "invalid_review_session" | "write_failed";

  constructor(code: ReviewSessionFileStoreError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

const defaultStorageFilePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".local",
  "review-session.json",
);

export function getDefaultReviewSessionStorageFilePath(): string {
  return defaultStorageFilePath;
}

export async function readReviewSessionFile(
  options: ReviewSessionFileStoreOptions = {},
): Promise<ReviewSessionFileStoreResult> {
  const storageFile = resolveStorageFile(options);

  try {
    const raw = await readFile(storageFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const validation = validateReviewSessionState(parsed, "Review session storage");

    if (!validation.ok) {
      return emptyResult(storageFile, validation.error);
    }

    return {
      state: validation.state,
      _source_meta: buildSourceMeta(storageFile),
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        state: createEmptyReviewSession(),
        _source_meta: buildSourceMeta(storageFile),
      };
    }

    return emptyResult(storageFile, "Review session storage file could not be read or parsed.");
  }
}

export async function writeReviewSessionFile(
  state: unknown,
  options: ReviewSessionFileStoreOptions = {},
): Promise<ReviewSessionFileStoreResult> {
  const validation = validateReviewSessionState(state, "Review session");

  if (!validation.ok) {
    throw new ReviewSessionFileStoreError("invalid_review_session", validation.error);
  }

  const storageFile = resolveStorageFile(options);
  const tempFile = `${storageFile}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await mkdir(dirname(storageFile), { recursive: true });
    await writeFile(tempFile, `${JSON.stringify(validation.state, null, 2)}\n`, "utf8");
    await rename(tempFile, storageFile);

    return {
      state: validation.state,
      _source_meta: buildSourceMeta(storageFile),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ReviewSessionFileStoreError("write_failed", `Review session storage write failed: ${message}`);
  }
}

function resolveStorageFile(options: ReviewSessionFileStoreOptions): string {
  return resolve(options.storageFilePath ?? defaultStorageFilePath);
}

function emptyResult(storageFile: string, warning: string): ReviewSessionFileStoreResult {
  return {
    state: createEmptyReviewSession(),
    _source_meta: buildSourceMeta(storageFile, warning),
  };
}

function buildSourceMeta(storageFile: string, warning?: string): ReviewSessionSourceMeta {
  return {
    source_kind: "file-backed-review-session",
    storage_file: storageFile,
    loaded_at: new Date().toISOString(),
    ...(warning ? { warning } : {}),
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
