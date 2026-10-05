import { createHash } from "node:crypto";
import type { KrakenAccountSnapshot } from "./krakenAccount.js";
import type { KrakenExecutionLedger, KrakenExecutionLedgerRecord } from "./krakenExecutionLedger.js";
import {
  evaluateKrakenLivePilotGate,
  type KrakenLivePilotGateDecision,
} from "./krakenLiveExecutionGate.js";
import {
  buildKrakenLivePilotEntryPlan,
  type KrakenLivePilotEntryPlan,
  type KrakenSendOrderRequest,
} from "./krakenLiveRequestBuilder.js";
import type {
  KrakenLiveOrderTransport,
  KrakenLiveOrderTransportResult,
} from "./krakenLiveOrderTransport.js";
import type {
  KrakenOrderReconciliationResult,
  KrakenOrderReconciliationTransport,
} from "./krakenOrderReconciliation.js";
import type { KrakenOrderIntent } from "./krakenOrderIntent.js";

export type KrakenLiveExecutionServiceResult =
  | {
      status: "BLOCKED";
      gate: KrakenLivePilotGateDecision;
      pilot_plan: null;
      ledger: null;
      transport: null;
      reconciliation_required: false;
    }
  | {
      status: "READY";
      gate: KrakenLivePilotGateDecision;
      pilot_plan: KrakenLivePilotEntryPlan;
      ledger: null;
      transport: null;
      reconciliation_required: false;
    }
  | {
      status: "DUPLICATE";
      gate: KrakenLivePilotGateDecision;
      pilot_plan: KrakenLivePilotEntryPlan;
      ledger: KrakenExecutionLedgerRecord;
      transport: null;
      reconciliation_required: boolean;
    }
  | {
      status: "PLACED" | "FAILED";
      gate: KrakenLivePilotGateDecision;
      pilot_plan: KrakenLivePilotEntryPlan;
      ledger: KrakenExecutionLedgerRecord;
      transport: KrakenLiveOrderTransportResult;
      reconciliation_required: boolean;
    };

export function createKrakenLiveExecutionService(options: {
  env?: Readonly<Record<string, string | undefined>>;
  ledger: KrakenExecutionLedger;
  transport: KrakenLiveOrderTransport;
  reconciliationTransport?: KrakenOrderReconciliationTransport;
}) {
  const env = options.env ?? process.env;

  function prepare(input: {
    role: string;
    account: KrakenAccountSnapshot;
    intent: KrakenOrderIntent;
  }): KrakenLiveExecutionServiceResult {
    const gate = evaluateKrakenLivePilotGate({
      env,
      role: input.role,
      account: input.account,
      intent: input.intent,
    });

    if (!gate.allowed || gate.config.configured_max_notional_usd === null) {
      return {
        status: "BLOCKED",
        gate,
        pilot_plan: null,
        ledger: null,
        transport: null,
        reconciliation_required: false,
      };
    }

    const pilotPlan = buildKrakenLivePilotEntryPlan(
      input.intent,
      gate.config.configured_max_notional_usd,
    );

    return {
      status: "READY",
      gate,
      pilot_plan: pilotPlan,
      ledger: null,
      transport: null,
      reconciliation_required: false,
    };
  }

  async function execute(input: {
    role: string;
    account: KrakenAccountSnapshot;
    intent: KrakenOrderIntent;
  }): Promise<KrakenLiveExecutionServiceResult> {
    const prepared = prepare(input);
    if (prepared.status !== "READY") return prepared;

    const pilotPlan = prepared.pilot_plan;
    const fingerprint = requestFingerprint(pilotPlan.request);
    const reservation = options.ledger.reserve({
      intent_id: input.intent.intent_id,
      signal_id: input.intent.signal_id,
      cli_ord_id: pilotPlan.request.cliOrdId,
      request_fingerprint: fingerprint,
    });

    if (!reservation.reserved) {
      return {
        status: "DUPLICATE",
        gate: prepared.gate,
        pilot_plan: pilotPlan,
        ledger: reservation.record,
        transport: null,
        reconciliation_required: needsReconciliation(reservation.record.status),
      };
    }

    const transport = await options.transport.submit(pilotPlan.request);
    const ledger = options.ledger.complete(input.intent.intent_id, {
      status: transport.status,
      provider_order_id: transport.order_id,
      provider_status: transport.provider_status,
      error_code: transport.error_code,
    });

    return {
      status: transport.status === "PLACED" ? "PLACED" : "FAILED",
      gate: prepared.gate,
      pilot_plan: pilotPlan,
      ledger,
      transport,
      reconciliation_required: needsReconciliation(transport.status),
    };
  }

  async function reconcile(intentId: string): Promise<{
    ledger: KrakenExecutionLedgerRecord | null;
    reconciliation: KrakenOrderReconciliationResult | null;
  }> {
    const ledger = options.ledger.get(intentId);
    if (!ledger || !options.reconciliationTransport) {
      return { ledger, reconciliation: null };
    }
    const reconciliation = await options.reconciliationTransport.queryByCliOrdId(ledger.cli_ord_id);
    return { ledger, reconciliation };
  }

  return { prepare, execute, reconcile };
}

export function requestFingerprint(request: KrakenSendOrderRequest): string {
  const canonical = JSON.stringify({
    orderType: request.orderType,
    symbol: request.symbol,
    side: request.side,
    size: request.size,
    cliOrdId: request.cliOrdId,
    limitPrice: request.limitPrice ?? null,
    stopPrice: request.stopPrice ?? null,
    triggerSignal: request.triggerSignal ?? null,
    reduceOnly: request.reduceOnly ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function needsReconciliation(status: string): boolean {
  return status === "RESERVED"
    || status === "TRANSPORT_ERROR"
    || status === "HTTP_ERROR"
    || status === "INVALID_RESPONSE";
}
