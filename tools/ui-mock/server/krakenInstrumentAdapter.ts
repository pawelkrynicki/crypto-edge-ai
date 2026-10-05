import type { AxiCryptoSignal } from "./axiCryptoSignalContract.js";

export const KRAKEN_FUTURES_INSTRUMENTS_URL =
  "https://futures.kraken.com/derivatives/api/v3/instruments" as const;

export type KrakenInstrumentFacts = {
  source_symbol: string;
  kraken_symbol: string;
  type: "flexible_futures";
  tradeable: boolean;
  base: string;
  quote: "USD";
  tick_size: number;
  contract_size: number;
  contract_value_trade_precision: number;
  quantity_step: number;
  max_position_size: number | null;
};

export type KrakenInstrumentSource = {
  getInstrument(sourceSymbol: string): Promise<KrakenInstrumentFacts>;
};

export class KrakenInstrumentError extends Error {
  readonly code:
    | "KRAKEN_INSTRUMENT_SOURCE_SYMBOL_UNSUPPORTED"
    | "KRAKEN_INSTRUMENT_FETCH_FAILED"
    | "KRAKEN_INSTRUMENT_RESPONSE_INVALID"
    | "KRAKEN_INSTRUMENT_NOT_FOUND"
    | "KRAKEN_INSTRUMENT_NOT_FLEXIBLE_FUTURES";

  constructor(code: KrakenInstrumentError["code"]) {
    super(code);
    this.name = "KrakenInstrumentError";
    this.code = code;
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const SOURCE_TO_KRAKEN = new Map<string, string>([
  ["BTCUSD", "PF_XBTUSD"],
  ["XBTUSD", "PF_XBTUSD"],
  ["ETHUSD", "PF_ETHUSD"],
  ["SOLUSD", "PF_SOLUSD"],
]);

export function mapSourceSymbolToKrakenFlexibleFutures(sourceSymbol: string): string {
  const mapped = SOURCE_TO_KRAKEN.get(normalizeSourceSymbol(sourceSymbol));
  if (!mapped) throw new KrakenInstrumentError("KRAKEN_INSTRUMENT_SOURCE_SYMBOL_UNSUPPORTED");
  return mapped;
}

export function createKrakenPublicInstrumentSource(options: {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
} = {}): KrakenInstrumentSource {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = sanitizeTimeout(options.timeoutMs ?? 5_000);

  return {
    async getInstrument(sourceSymbol: string): Promise<KrakenInstrumentFacts> {
      const krakenSymbol = mapSourceSymbolToKrakenFlexibleFutures(sourceSymbol);
      let response: Response;
      try {
        response = await fetchWithTimeout(fetchImpl, KRAKEN_FUTURES_INSTRUMENTS_URL, timeoutMs);
      } catch {
        throw new KrakenInstrumentError("KRAKEN_INSTRUMENT_FETCH_FAILED");
      }
      if (!response.ok) throw new KrakenInstrumentError("KRAKEN_INSTRUMENT_FETCH_FAILED");

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new KrakenInstrumentError("KRAKEN_INSTRUMENT_RESPONSE_INVALID");
      }
      if (!isRecord(payload) || !Array.isArray(payload.instruments)) {
        throw new KrakenInstrumentError("KRAKEN_INSTRUMENT_RESPONSE_INVALID");
      }

      const raw = payload.instruments.find(
        (item) => isRecord(item) && item.symbol === krakenSymbol,
      );
      if (!raw) throw new KrakenInstrumentError("KRAKEN_INSTRUMENT_NOT_FOUND");
      return normalizeInstrument(sourceSymbol, raw);
    },
  };
}

export function createStaticKrakenInstrumentSource(
  instruments: readonly KrakenInstrumentFacts[],
): KrakenInstrumentSource {
  const bySource = new Map(
    instruments.map((instrument) => [normalizeSourceSymbol(instrument.source_symbol), instrument]),
  );
  return {
    async getInstrument(sourceSymbol: string): Promise<KrakenInstrumentFacts> {
      mapSourceSymbolToKrakenFlexibleFutures(sourceSymbol);
      const found = bySource.get(normalizeSourceSymbol(sourceSymbol));
      if (!found) throw new KrakenInstrumentError("KRAKEN_INSTRUMENT_NOT_FOUND");
      return { ...found };
    },
  };
}

export function sourceSymbolFromSignal(signal: AxiCryptoSignal): string {
  return signal.trade.symbol;
}

export function quantityStepFromPrecision(precision: number): number {
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 12) {
    throw new KrakenInstrumentError("KRAKEN_INSTRUMENT_RESPONSE_INVALID");
  }
  return 10 ** (-precision);
}

function normalizeInstrument(
  sourceSymbol: string,
  raw: Record<string, unknown>,
): KrakenInstrumentFacts {
  if (typeof raw.type !== "string") {
    throw new KrakenInstrumentError("KRAKEN_INSTRUMENT_RESPONSE_INVALID");
  }
  if (raw.type !== "flexible_futures") {
    throw new KrakenInstrumentError("KRAKEN_INSTRUMENT_NOT_FLEXIBLE_FUTURES");
  }

  const krakenSymbol = stringField(raw.symbol);
  const base = stringField(raw.base);
  const quote = stringField(raw.quote);
  const tickSize = finitePositive(raw.tickSize);
  const contractSize = finitePositive(raw.contractSize);
  const precision = integerField(raw.contractValueTradePrecision);
  const maxPositionSize = nullablePositive(raw.maxPositionSize);
  const tradeable = raw.tradeable;

  if (
    !krakenSymbol
    || !base
    || quote !== "USD"
    || tickSize === null
    || contractSize === null
    || precision === null
    || typeof tradeable !== "boolean"
  ) {
    throw new KrakenInstrumentError("KRAKEN_INSTRUMENT_RESPONSE_INVALID");
  }

  return {
    source_symbol: sourceSymbol,
    kraken_symbol: krakenSymbol,
    type: "flexible_futures",
    tradeable,
    base,
    quote: "USD",
    tick_size: tickSize,
    contract_size: contractSize,
    contract_value_trade_precision: precision,
    quantity_step: quantityStepFromPrecision(precision),
    max_position_size: maxPositionSize,
  };
}

function normalizeSourceSymbol(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function fetchWithTimeout(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeTimeout(value: number): number {
  return Number.isSafeInteger(value) && value >= 100 && value <= 30_000 ? value : 5_000;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function nullablePositive(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return finitePositive(value);
}

function integerField(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
