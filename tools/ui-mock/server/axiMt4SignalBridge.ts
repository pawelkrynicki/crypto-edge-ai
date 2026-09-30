import { copyFile, lstat, mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ENDPOINT = "http://127.0.0.1:4180/api/v1/trading/signals/axi";
const DEFAULT_POLL_MS = 1_000;
const REQUEST_TIMEOUT_MS = 15_000;

export type AxiMt4SignalBridgeConfig = {
  root: string;
  endpoint: string;
  token: string;
  pollMs: number;
};

export type AxiMt4SignalBridgeCycleResult = {
  scanned: number;
  sent: number;
  rejected: number;
  retryable: number;
};

type FetchLike = typeof fetch;
type BridgeLogger = Pick<Console, "info" | "warn" | "error">;

export class AxiMt4SignalBridgeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function resolveAxiMt4SignalBridgeConfig(
  env: NodeJS.ProcessEnv = process.env,
): AxiMt4SignalBridgeConfig {
  const configuredRoot = env.CRYPTO_EDGE_MT4_BRIDGE_ROOT?.trim();
  const appData = env.APPDATA?.trim();
  if (!configuredRoot && !appData) throw new AxiMt4SignalBridgeError("MT4_BRIDGE_ROOT_REQUIRED");

  const endpoint = (env.CRYPTO_EDGE_AXI_SIGNAL_ENDPOINT?.trim() || DEFAULT_ENDPOINT);
  assertLocalHttpEndpoint(endpoint);

  const token = env.CRYPTO_EDGE_AXI_SIGNAL_TOKEN?.trim();
  if (!token) throw new AxiMt4SignalBridgeError("AXI_SIGNAL_TOKEN_REQUIRED");

  return {
    root: resolve(configuredRoot || resolve(appData!, "MetaQuotes", "Terminal", "Common", "Files", "CryptoEdge")),
    endpoint,
    token,
    pollMs: parsePollMs(env.CRYPTO_EDGE_MT4_BRIDGE_POLL_MS),
  };
}

export async function runAxiMt4SignalBridgeCycle(
  config: AxiMt4SignalBridgeConfig,
  options: {
    fetchImpl?: FetchLike;
    logger?: BridgeLogger;
    signal?: AbortSignal;
  } = {},
): Promise<AxiMt4SignalBridgeCycleResult> {
  const root = resolve(config.root);
  const outbox = resolveChildPath(root, "outbox");
  const sent = resolveChildPath(root, "sent");
  const rejected = resolveChildPath(root, "rejected");
  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? console;
  const result: AxiMt4SignalBridgeCycleResult = { scanned: 0, sent: 0, rejected: 0, retryable: 0 };

  await mkdir(outbox, { recursive: true });
  const entries = await readdir(outbox, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const filename of jsonFiles) {
    if (options.signal?.aborted) break;
    const source = resolveChildPath(outbox, filename);
    result.scanned += 1;

    // A readdir entry can change between listing and use; do not follow links or leave the configured outbox.
    let fileInfo;
    try {
      fileInfo = await lstat(source);
    } catch {
      result.retryable += 1;
      continue;
    }
    if (!fileInfo.isFile()) {
      result.retryable += 1;
      continue;
    }

    let payload: Buffer;
    try {
      payload = await readFile(source);
      JSON.parse(payload.toString("utf8"));
    } catch {
      // MT4 may still be writing the file. JSON parse failures stay retryable too.
      result.retryable += 1;
      log(logger, "warn", `AXI MT4 bridge deferred unreadable JSON: ${basename(source)}`);
      continue;
    }

    let response: Response;
    try {
      response = await postSignal(fetchImpl, config, payload, options.signal);
    } catch {
      result.retryable += 1;
      log(logger, "warn", `AXI MT4 bridge will retry delivery: ${basename(source)}`);
      continue;
    }

    if (response.status === 200 || response.status === 201) {
      if (await sourceStillMatches(source, payload)) {
        try {
          await moveWithoutOverwrite(source, sent);
          result.sent += 1;
          log(logger, "info", `AXI MT4 bridge delivered: ${basename(source)} (${response.status})`);
        } catch {
          result.retryable += 1;
          log(logger, "warn", `AXI MT4 bridge could not archive delivery: ${basename(source)}`);
        }
      } else {
        result.retryable += 1;
        log(logger, "warn", `AXI MT4 bridge deferred changed source: ${basename(source)}`);
      }
      continue;
    }

    if (response.status === 400 || response.status === 409 || response.status === 413) {
      if (await sourceStillMatches(source, payload)) {
        try {
          await moveWithoutOverwrite(source, rejected);
          result.rejected += 1;
          log(logger, "warn", `AXI MT4 bridge rejected: ${basename(source)} (${response.status})`);
        } catch {
          result.retryable += 1;
          log(logger, "warn", `AXI MT4 bridge could not archive rejection: ${basename(source)}`);
        }
      } else {
        result.retryable += 1;
        log(logger, "warn", `AXI MT4 bridge deferred changed source: ${basename(source)}`);
      }
      continue;
    }

    // Authentication, disabled routes, server failures, and every unexpected status are retryable.
    result.retryable += 1;
    log(logger, "warn", `AXI MT4 bridge will retry gateway response: ${basename(source)} (${response.status})`);
  }

  return result;
}

export function startAxiMt4SignalBridge(
  config: AxiMt4SignalBridgeConfig,
  options: { fetchImpl?: FetchLike; logger?: BridgeLogger } = {},
): () => void {
  const controller = new AbortController();
  const logger = options.logger ?? console;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const tick = async () => {
    try {
      await runAxiMt4SignalBridgeCycle(config, { ...options, logger, signal: controller.signal });
    } catch {
      log(logger, "warn", "AXI MT4 bridge cycle failed; it will retry");
    }
    if (!stopped) timer = setTimeout(() => { void tick(); }, config.pollMs);
  };
  void tick();

  return () => {
    stopped = true;
    controller.abort();
    if (timer) clearTimeout(timer);
  };
}

async function postSignal(
  fetchImpl: FetchLike,
  config: AxiMt4SignalBridgeConfig,
  payload: Buffer,
  shutdownSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const onShutdown = () => controller.abort();
  shutdownSignal?.addEventListener("abort", onShutdown, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: Uint8Array.from(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    shutdownSignal?.removeEventListener("abort", onShutdown);
  }
}

async function sourceStillMatches(source: string, payload: Buffer): Promise<boolean> {
  try {
    return (await readFile(source)).equals(payload);
  } catch {
    return false;
  }
}

async function moveWithoutOverwrite(source: string, destinationDirectory: string): Promise<string> {
  await mkdir(destinationDirectory, { recursive: true });
  const extension = extname(source);
  const stem = basename(source, extension);
  for (let collision = 0; ; collision += 1) {
    const filename = collision === 0 ? `${stem}${extension}` : `${stem}.${collision}${extension}`;
    const destination = resolveChildPath(destinationDirectory, filename);
    try {
      // Exclusive copy plus unlink prevents an existing archive from ever being replaced.
      await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
      await unlink(source);
      return destination;
    } catch (error) {
      if (isAlreadyExists(error)) continue;
      throw error;
    }
  }
}

function resolveChildPath(parent: string, child: string): string {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(resolvedParent, child);
  const pathRelative = relative(resolvedParent, resolvedChild);
  if (pathRelative === "" || pathRelative === ".." || pathRelative.startsWith(`..${sep}`)) {
    throw new AxiMt4SignalBridgeError("MT4_BRIDGE_PATH_OUTSIDE_ROOT");
  }
  return resolvedChild;
}

function assertLocalHttpEndpoint(endpoint: string): void {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new AxiMt4SignalBridgeError("AXI_SIGNAL_ENDPOINT_INVALID");
  }
  if (
    parsed.protocol !== "http:"
    || parsed.username
    || parsed.password
    || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
  ) {
    throw new AxiMt4SignalBridgeError("AXI_SIGNAL_ENDPOINT_MUST_BE_LOCAL_HTTP");
  }
}

function parsePollMs(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_POLL_MS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 60_000) {
    throw new AxiMt4SignalBridgeError("MT4_BRIDGE_POLL_MS_INVALID");
  }
  return parsed;
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function log(logger: BridgeLogger, level: "info" | "warn", message: string): void {
  logger[level](message);
}

async function main(): Promise<void> {
  const config = resolveAxiMt4SignalBridgeConfig();
  if (process.argv.includes("--once")) {
    await runAxiMt4SignalBridgeCycle(config);
    return;
  }
  const stop = startAxiMt4SignalBridge(config);
  const shutdown = () => stop();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "AXI_MT4_BRIDGE_START_FAILED";
    console.error(`AXI MT4 bridge failed to start: ${message}`);
    process.exitCode = 1;
  });
}
