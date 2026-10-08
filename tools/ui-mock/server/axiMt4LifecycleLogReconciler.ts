import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateAxiCryptoSignal,
  type AxiCryptoSignal,
} from "./axiCryptoSignalContract.js";
import type { AxiSignalLifecycleEvent } from "./axiSignalLifecycle.js";

const DEFAULT_POLL_MS = 1_000;
const DEFAULT_LOOKBACK_DAYS = 7;
const SIGNAL_TIME_MATCH_MS = 5 * 60 * 1_000;

export type AxiMt4LifecycleLogReconcilerConfig = {
  bridgeRoot: string;
  terminalRoot: string;
  pollMs: number;
  lookbackDays: number;
};

export type AxiMt4LifecycleLogReconcileResult = {
  signals_examined: number;
  lifecycle_events_written: number;
  fills_written: number;
  closes_written: number;
  cancelled_written: number;
  expired_written: number;
  source_only: number;
};

type EngineEvent = {
  kind: "SIGNAL" | "MARKET_OPEN" | "LIMIT_PLACED" | "LIMIT_REMOVED" | "CLOSE_SUMMARY";
  at: number;
  setup: string;
  symbol: string;
  side?: "BUY" | "SELL";
  orderType?: "MARKET" | "LIMIT";
  entry?: number;
  ticket?: string;
  reason?: string;
};

type BrokerEvent = {
  kind: "ORDER_OPENED" | "LIMIT_ACTIVATED" | "ORDER_CLOSED";
  at: number;
  ticket: string;
  symbol?: string;
  side?: "BUY" | "SELL";
  price?: number;
  closeReason?: "TP" | "SL" | "OTHER";
};

type ReconcilePlan = {
  signal: AxiCryptoSignal;
  events: AxiSignalLifecycleEvent[];
  sourceOnly: boolean;
};

export class AxiMt4LifecycleLogReconcilerError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AxiMt4LifecycleLogReconcilerError";
    this.code = code;
  }
}

export function resolveAxiMt4LifecycleLogReconcilerConfig(
  env: NodeJS.ProcessEnv = process.env,
): AxiMt4LifecycleLogReconcilerConfig {
  const bridgeRoot = env.CRYPTO_EDGE_MT4_BRIDGE_ROOT?.trim();
  const terminalRoot = env.CRYPTO_EDGE_MT4_TERMINAL_ROOT?.trim();
  if (!bridgeRoot) throw new AxiMt4LifecycleLogReconcilerError("MT4_RECONCILER_BRIDGE_ROOT_REQUIRED");
  if (!terminalRoot) throw new AxiMt4LifecycleLogReconcilerError("MT4_RECONCILER_TERMINAL_ROOT_REQUIRED");
  return {
    bridgeRoot: resolve(bridgeRoot),
    terminalRoot: resolve(terminalRoot),
    pollMs: parseBoundedInt(
      env.CRYPTO_EDGE_MT4_LIFECYCLE_RECONCILER_POLL_MS,
      DEFAULT_POLL_MS,
      250,
      60_000,
      "MT4_RECONCILER_POLL_MS_INVALID",
    ),
    lookbackDays: parseBoundedInt(
      env.CRYPTO_EDGE_MT4_LIFECYCLE_RECONCILER_LOOKBACK_DAYS,
      DEFAULT_LOOKBACK_DAYS,
      1,
      30,
      "MT4_RECONCILER_LOOKBACK_INVALID",
    ),
  };
}

export async function runAxiMt4LifecycleLogReconcilerCycle(
  config: AxiMt4LifecycleLogReconcilerConfig,
): Promise<AxiMt4LifecycleLogReconcileResult> {
  const bridgeRoot = resolve(config.bridgeRoot);
  const sentDir = join(bridgeRoot, "sent");
  const outboxDir = join(bridgeRoot, "outbox");
  const rejectedDir = join(bridgeRoot, "rejected");
  await Promise.all([sentDir, outboxDir, rejectedDir].map((path) => mkdir(path, { recursive: true })));

  const [signals, existingEventIds, engineEvents, brokerEvents] = await Promise.all([
    readAcceptedSourceSignals(sentDir),
    readKnownLifecycleEventIds([sentDir, outboxDir, rejectedDir]),
    readEngineEvents(config.terminalRoot, config.lookbackDays),
    readBrokerEvents(config.terminalRoot, config.lookbackDays),
  ]);

  const result: AxiMt4LifecycleLogReconcileResult = {
    signals_examined: signals.length,
    lifecycle_events_written: 0,
    fills_written: 0,
    closes_written: 0,
    cancelled_written: 0,
    expired_written: 0,
    source_only: 0,
  };

  for (const signal of signals) {
    const plan = buildReconcilePlan(signal, engineEvents, brokerEvents, existingEventIds);
    if (plan.sourceOnly) result.source_only += 1;
    for (const event of plan.events) {
      if (existingEventIds.has(event.event_id)) continue;
      await writeLifecycleEvent(outboxDir, event);
      existingEventIds.add(event.event_id);
      result.lifecycle_events_written += 1;
      if (event.event_type === "ORDER_FILLED") result.fills_written += 1;
      else if (event.event_type === "POSITION_CLOSED") result.closes_written += 1;
      else if (event.event_type === "SIGNAL_CANCELLED") result.cancelled_written += 1;
      else if (event.event_type === "SIGNAL_EXPIRED") result.expired_written += 1;
    }
  }

  return result;
}

export function buildReconcilePlan(
  signal: AxiCryptoSignal,
  engineEvents: EngineEvent[],
  brokerEvents: BrokerEvent[],
  existingEventIds: ReadonlySet<string> = new Set(),
): ReconcilePlan {
  const sourceAt = Date.parse(signal.trade.source_signal_time);
  const source = nearestSourceEvent(signal, engineEvents, sourceAt);
  if (!source) return { signal, events: [], sourceOnly: true };

  const nextSourceAt = engineEvents
    .filter((event) => event.kind === "SIGNAL"
      && event.setup === signal.setup.setup_id
      && event.symbol === signal.trade.symbol
      && event.at > source.at)
    .sort((a, b) => a.at - b.at)[0]?.at ?? Number.POSITIVE_INFINITY;

  const related = engineEvents.filter((event) =>
    event.setup === signal.setup.setup_id
      && event.symbol === signal.trade.symbol
      && event.at >= source.at
      && event.at < nextSourceAt,
  );

  const events: AxiSignalLifecycleEvent[] = [];
  const filledId = eventId(signal.signal_id, "ORDER_FILLED");
  const closedId = eventId(signal.signal_id, "POSITION_CLOSED");
  const cancelledId = eventId(signal.signal_id, "SIGNAL_CANCELLED");
  const expiredId = eventId(signal.signal_id, "SIGNAL_EXPIRED");
  const alreadyFilled = existingEventIds.has(filledId);

  let ticket: string | undefined;
  let fillPrice: number | undefined;
  let fillAt: number | undefined;

  if (signal.trade.order_type === "MARKET") {
    const opened = related
      .filter((event) => event.kind === "MARKET_OPEN"
        && event.side === signal.trade.side
        && priceMatches(event.entry, signal.trade.entry_price))
      .sort((a, b) => a.at - b.at)[0];
    if (opened?.ticket && opened.entry !== undefined) {
      ticket = opened.ticket;
      fillPrice = opened.entry;
      fillAt = sourceAt + Math.max(1_000, opened.at - source.at);
    }
  } else {
    const placed = related
      .filter((event) => event.kind === "LIMIT_PLACED"
        && event.side === signal.trade.side
        && priceMatches(event.entry, signal.trade.entry_price))
      .sort((a, b) => a.at - b.at)[0];
    ticket = placed?.ticket;

    const removed = related
      .filter((event) => event.kind === "LIMIT_REMOVED")
      .sort((a, b) => a.at - b.at)[0];
    if (removed && !existingEventIds.has(cancelledId) && !existingEventIds.has(expiredId)) {
      const expired = /wygas/i.test(removed.reason ?? "");
      events.push({
        schema_version: "axi_signal_lifecycle_v1",
        event_type: expired ? "SIGNAL_EXPIRED" : "SIGNAL_CANCELLED",
        event_id: expired ? expiredId : cancelledId,
        signal_id: signal.signal_id,
        source_event_time: eventTimeFromDelta(sourceAt, source.at, removed.at),
      });
      return { signal, events, sourceOnly: false };
    }

    if (ticket) {
      const activation = brokerEvents
        .filter((event) => event.ticket === ticket && event.kind === "LIMIT_ACTIVATED")
        .sort((a, b) => a.at - b.at)[0];
      const brokerClose = brokerEvents
        .filter((event) => event.ticket === ticket && event.kind === "ORDER_CLOSED")
        .sort((a, b) => a.at - b.at)[0];
      if (activation?.price !== undefined) {
        fillPrice = activation.price;
        fillAt = eventTimeMsFromDelta(sourceAt, source.at, activation.at);
      } else if (brokerClose) {
        fillPrice = signal.trade.entry_price;
        fillAt = sourceAt + 1_000;
      }
    }
  }

  if (ticket && fillPrice !== undefined && fillAt !== undefined && !alreadyFilled) {
    events.push({
      schema_version: "axi_signal_lifecycle_v1",
      event_type: "ORDER_FILLED",
      event_id: filledId,
      signal_id: signal.signal_id,
      source_event_time: new Date(fillAt).toISOString(),
      fill_price: fillPrice,
    });
  }

  if (!ticket) {
    return { signal, events, sourceOnly: events.length === 0 };
  }

  const brokerClose = brokerEvents
    .filter((event) => event.ticket === ticket && event.kind === "ORDER_CLOSED" && event.price !== undefined)
    .sort((a, b) => a.at - b.at)[0];

  if (brokerClose?.price !== undefined && !existingEventIds.has(closedId)) {
    const effectiveFillAt = fillAt ?? sourceAt + 1_000;
    const closeAt = Math.max(
      effectiveFillAt + 1_000,
      eventTimeMsFromDelta(sourceAt, source.at, brokerClose.at),
    );
    const summary = related
      .filter((event) => event.kind === "CLOSE_SUMMARY")
      .sort((a, b) => Math.abs(a.at - brokerClose.at) - Math.abs(b.at - brokerClose.at))[0];
    events.push({
      schema_version: "axi_signal_lifecycle_v1",
      event_type: "POSITION_CLOSED",
      event_id: closedId,
      signal_id: signal.signal_id,
      source_event_time: new Date(closeAt).toISOString(),
      close_price: brokerClose.price,
      close_reason: closeReason(brokerClose.closeReason, summary?.reason),
    });
  }

  return { signal, events, sourceOnly: false };
}

export function parseEngineLogLine(line: string, fileDate: string): EngineEvent | null {
  const at = parseLogTimestamp(line, fileDate);
  if (at === null || !line.includes("ALLinCrypto:")) return null;
  const message = line.slice(line.lastIndexOf("ALLinCrypto:") + "ALLinCrypto:".length).trim();

  let match = message.match(/^SYGNA\S*\s+([A-Z0-9]+)\s+(\S+)\s+\S+\s+(BUY|SELL)(\s+LIMIT)?\s+@([0-9.]+)/i);
  if (match) {
    return {
      kind: "SIGNAL",
      at,
      setup: match[1]!,
      symbol: match[2]!,
      side: match[3]!.toUpperCase() as "BUY" | "SELL",
      orderType: match[4] ? "LIMIT" : "MARKET",
      entry: Number(match[5]),
    };
  }

  match = message.match(/^([A-Z0-9]+)\s+(\S+):\s+otwarto\s+(BUY|SELL).*?@([0-9.]+).*ticket\s+(\d+)/i);
  if (match) {
    return {
      kind: "MARKET_OPEN",
      at,
      setup: match[1]!,
      symbol: match[2]!,
      side: match[3]!.toUpperCase() as "BUY" | "SELL",
      entry: Number(match[4]),
      ticket: match[5]!,
    };
  }

  match = message.match(/^([A-Z0-9]+)\s+(\S+):\s+(BUY|SELL)\s+LIMIT\s+.*?@([0-9.]+).*ticket\s+(\d+)/i);
  if (match) {
    return {
      kind: "LIMIT_PLACED",
      at,
      setup: match[1]!,
      symbol: match[2]!,
      side: match[3]!.toUpperCase() as "BUY" | "SELL",
      orderType: "LIMIT",
      entry: Number(match[4]),
      ticket: match[5]!,
    };
  }

  match = message.match(/^([A-Z0-9]+)\s+(\S+):\s+limit\s+usuni\S*\s+-\s+(.+)$/i);
  if (match) {
    return {
      kind: "LIMIT_REMOVED",
      at,
      setup: match[1]!,
      symbol: match[2]!,
      reason: match[3]!,
    };
  }

  match = message.match(/^([A-Z0-9]+)\s+(\S+):\s+zamkni\S*\s+\(([^)]+)\)/i);
  if (match) {
    return {
      kind: "CLOSE_SUMMARY",
      at,
      setup: match[1]!,
      symbol: match[2]!,
      reason: match[3]!,
    };
  }

  return null;
}

export function parseBrokerLogLine(line: string, fileDate: string): BrokerEvent | null {
  const at = parseLogTimestamp(line, fileDate);
  if (at === null) return null;

  let match = line.match(/order was opened\s*:\s*#(\d+)\s+(buy|sell)\s+[0-9.]+\s+(\S+)\s+at\s+([0-9.]+)/i);
  if (match) {
    return {
      kind: "ORDER_OPENED",
      at,
      ticket: match[1]!,
      side: match[2]!.toUpperCase() as "BUY" | "SELL",
      symbol: match[3]!,
      price: Number(match[4]),
    };
  }

  match = line.match(/(?:pending\s+)?order\s+#(\d+).*?(?:was activated|activated|triggered).*?(?:at(?: price)?\s+)([0-9.]+)/i);
  if (match) {
    return {
      kind: "LIMIT_ACTIVATED",
      at,
      ticket: match[1]!,
      price: Number(match[2]),
    };
  }

  match = line.match(/order\s+#(\d+).*?closed due take-profit at price\s+([0-9.]+)/i);
  if (match) {
    return { kind: "ORDER_CLOSED", at, ticket: match[1]!, price: Number(match[2]), closeReason: "TP" };
  }

  match = line.match(/order\s+#(\d+).*?closed due stop-loss at price\s+([0-9.]+)/i);
  if (match) {
    return { kind: "ORDER_CLOSED", at, ticket: match[1]!, price: Number(match[2]), closeReason: "SL" };
  }

  match = line.match(/order\s+#(\d+).*?closed.*?at price\s+([0-9.]+)/i);
  if (match) {
    return { kind: "ORDER_CLOSED", at, ticket: match[1]!, price: Number(match[2]), closeReason: "OTHER" };
  }

  return null;
}

async function readAcceptedSourceSignals(sentDir: string): Promise<AxiCryptoSignal[]> {
  const files = await safeJsonFiles(sentDir);
  const byId = new Map<string, AxiCryptoSignal>();
  for (const filename of files) {
    try {
      const parsed = JSON.parse(await readFile(join(sentDir, filename), "utf8"));
      if (parsed?.event_type !== "SIGNAL_CREATED") continue;
      const signal = validateAxiCryptoSignal(parsed);
      byId.set(signal.signal_id, signal);
    } catch {
      // Ignore lifecycle archives, partial evidence and older non-contract files.
    }
  }
  return [...byId.values()].sort((a, b) =>
    Date.parse(a.trade.source_signal_time) - Date.parse(b.trade.source_signal_time)
      || a.signal_id.localeCompare(b.signal_id),
  );
}

async function readKnownLifecycleEventIds(dirs: string[]): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const dir of dirs) {
    for (const filename of await safeJsonFiles(dir)) {
      try {
        const parsed = JSON.parse(await readFile(join(dir, filename), "utf8")) as { event_id?: unknown };
        if (typeof parsed.event_id === "string") ids.add(parsed.event_id);
      } catch {
        // Ignore unreadable evidence. The Bridge owns final rejection/retry semantics.
      }
    }
  }
  return ids;
}

async function readEngineEvents(terminalRoot: string, lookbackDays: number): Promise<EngineEvent[]> {
  return readParsedLogEvents(
    join(resolve(terminalRoot), "MQL4", "Logs"),
    lookbackDays,
    parseEngineLogLine,
  );
}

async function readBrokerEvents(terminalRoot: string, lookbackDays: number): Promise<BrokerEvent[]> {
  return readParsedLogEvents(
    join(resolve(terminalRoot), "logs"),
    lookbackDays,
    parseBrokerLogLine,
  );
}

async function readParsedLogEvents<T>(
  directory: string,
  lookbackDays: number,
  parser: (line: string, fileDate: string) => T | null,
): Promise<T[]> {
  const events: T[] = [];
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return events;
  }
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1_000;
  for (const name of names.filter((entry) => /^\d{8}\.log$/i.test(entry)).sort()) {
    const path = join(directory, name);
    try {
      const info = await stat(path);
      if (info.mtimeMs < cutoff) continue;
      const fileDate = basename(name, ".log");
      const contents = await readFile(path, "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const event = parser(line, fileDate);
        if (event) events.push(event);
      }
    } catch {
      // A log may rotate while reading; retry on the next cycle.
    }
  }
  return events;
}

async function safeJsonFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

async function writeLifecycleEvent(outboxDir: string, event: AxiSignalLifecycleEvent): Promise<void> {
  const filename = `${event.signal_id}.zz.${event.event_type}.json`;
  const destination = join(outboxDir, filename);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, JSON.stringify(event), "utf8");
  try {
    await rename(temporary, destination);
  } catch (error) {
    try {
      await stat(destination);
      return;
    } catch {
      throw error;
    }
  }
}

function nearestSourceEvent(
  signal: AxiCryptoSignal,
  engineEvents: EngineEvent[],
  sourceAt: number,
): EngineEvent | undefined {
  return engineEvents
    .filter((event) => event.kind === "SIGNAL"
      && event.setup === signal.setup.setup_id
      && event.symbol === signal.trade.symbol
      && event.side === signal.trade.side
      && event.orderType === signal.trade.order_type
      && priceMatches(event.entry, signal.trade.entry_price)
      && Math.abs(event.at - sourceAt) <= SIGNAL_TIME_MATCH_MS)
    .sort((a, b) => Math.abs(a.at - sourceAt) - Math.abs(b.at - sourceAt))[0];
}

function priceMatches(left: number | undefined, right: number): boolean {
  if (left === undefined || !Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= Math.max(0.01, Math.abs(right) * 0.00001);
}

function eventId(signalId: string, type: AxiSignalLifecycleEvent["event_type"]): string {
  const suffix = `-${type}`;
  return `${signalId.slice(0, Math.max(1, 128 - suffix.length))}${suffix}`;
}

function eventTimeFromDelta(sourceAt: number, logSourceAt: number, eventAt: number): string {
  return new Date(eventTimeMsFromDelta(sourceAt, logSourceAt, eventAt)).toISOString();
}

function eventTimeMsFromDelta(sourceAt: number, logSourceAt: number, eventAt: number): number {
  return sourceAt + Math.max(1_000, eventAt - logSourceAt);
}

function closeReason(
  brokerReason: BrokerEvent["closeReason"],
  engineReason: string | undefined,
): "TP" | "SL" | "TIME_EXIT" | "MANUAL" | "OTHER" {
  if (brokerReason === "TP" || brokerReason === "SL") return brokerReason;
  const normalized = engineReason?.toLowerCase() ?? "";
  if (normalized.includes("czas")) return "TIME_EXIT";
  if (normalized.includes("ręcz") || normalized.includes("recz")) return "MANUAL";
  if (normalized === "tp") return "TP";
  if (normalized === "sl") return "SL";
  return "OTHER";
}

function parseLogTimestamp(line: string, fileDate: string): number | null {
  if (!/^\d{8}$/.test(fileDate)) return null;
  const match = line.match(/(?<!\d)(\d{2}):(\d{2}):(\d{2})\.(\d{3})(?!\d)/);
  if (!match) return null;
  const year = Number(fileDate.slice(0, 4));
  const month = Number(fileDate.slice(4, 6));
  const day = Number(fileDate.slice(6, 8));
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  const millisecond = Number(match[4]);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseBoundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  code: string,
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new AxiMt4LifecycleLogReconcilerError(code);
  }
  return parsed;
}

async function runForever(config: AxiMt4LifecycleLogReconcilerConfig): Promise<void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const tick = async () => {
    try {
      const result = await runAxiMt4LifecycleLogReconcilerCycle(config);
      if (result.lifecycle_events_written > 0) {
        console.info(`AXI MT4 lifecycle reconciler: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      console.warn("AXI MT4 lifecycle reconciler cycle failed:", error instanceof Error ? error.message : String(error));
    }
    if (!stopped) timer = setTimeout(() => { void tick(); }, config.pollMs);
  };
  await tick();
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isMainModule()) {
  void runForever(resolveAxiMt4LifecycleLogReconcilerConfig()).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
