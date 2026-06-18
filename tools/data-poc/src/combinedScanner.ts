import { normalizeSecurity } from "./normalizeSecurity.js";
import type {
  CombinedScannerCandidate,
  CombinedScannerFinalLabel,
  CombinedScannerOutput,
  CryptoEdgeCandidate,
  DexScreenerPocMode,
  GoPlusTokenSecurityResponse,
  HoneypotTokenResponse,
  NormalizedSecurity,
  SecurityCandidate,
  SecurityDecision
} from "./types.js";

export type SecurityRawProvider = (candidate: CryptoEdgeCandidate) => Promise<{
  goplusRaw: GoPlusTokenSecurityResponse | null;
  honeypotRaw: HoneypotTokenResponse | null;
}>;

export type BuildCombinedScannerInput = {
  mode: DexScreenerPocMode;
  query: string;
  candidates: CryptoEdgeCandidate[];
  maxCandidates: number;
  securityRawProvider: SecurityRawProvider;
  now?: Date;
};

export async function buildCombinedScannerOutput(input: BuildCombinedScannerInput): Promise<CombinedScannerOutput> {
  const now = input.now ?? new Date();
  const passedCandidates = input.candidates.filter((candidate) => candidate.status === "passed_basic_filter");
  const candidatesToCheck = passedCandidates.slice(0, input.maxCandidates);
  const securityByCandidateKey = new Map<string, { security: NormalizedSecurity; decision: SecurityDecision }>();

  for (const candidate of candidatesToCheck) {
    if (!candidate.contract_address) {
      continue;
    }
    const raw = await input.securityRawProvider(candidate);
    const securityOutput = normalizeSecurity({
      candidate: toSecurityCandidate(candidate),
      goplusRaw: raw.goplusRaw,
      honeypotRaw: raw.honeypotRaw,
      mode: input.mode,
      now
    });
    securityByCandidateKey.set(candidateKey(candidate), {
      security: securityOutput.security,
      decision: securityOutput.decision
    });
  }

  const combinedCandidates = input.candidates.map((candidate) => {
    const securityResult = securityByCandidateKey.get(candidateKey(candidate));
    return buildCombinedCandidate(candidate, securityResult?.security ?? null, securityResult?.decision ?? null);
  });

  return {
    source: "combined-scanner-poc",
    mode: input.mode,
    query: input.query,
    generated_at: now.toISOString(),
    limits: {
      max_candidates: input.maxCandidates
    },
    summary: buildSummary(input.candidates.length, combinedCandidates),
    candidates: combinedCandidates
  };
}

export function buildCombinedCandidate(
  candidate: CryptoEdgeCandidate,
  security: NormalizedSecurity | null,
  securityDecision: SecurityDecision | null
): CombinedScannerCandidate {
  if (candidate.status === "rejected_basic_filter") {
    return {
      candidate,
      security: null,
      decision: {
        basic_filter_status: "rejected_basic_filter",
        security_label: "NOT_CHECKED",
        final_label: "REJECT",
        final_reasons: candidate.filter_reasons
      }
    };
  }

  if (!security || !securityDecision) {
    return {
      candidate,
      security: null,
      decision: {
        basic_filter_status: "passed_basic_filter",
        security_label: "NOT_CHECKED",
        final_label: "NEEDS_MANUAL_VERIFICATION",
        final_reasons: ["security_not_checked"]
      }
    };
  }

  const finalLabel = finalLabelForSecurity(securityDecision.security_label);
  return {
    candidate,
    security,
    decision: {
      basic_filter_status: "passed_basic_filter",
      security_label: securityDecision.security_label,
      final_label: finalLabel,
      final_reasons: [...securityDecision.critical_reasons, ...securityDecision.warning_reasons, ...watchlistReason(finalLabel)]
    }
  };
}

function finalLabelForSecurity(label: SecurityDecision["security_label"]): CombinedScannerFinalLabel {
  if (label === "CRITICAL_RISK") return "CRITICAL_RISK";
  if (label === "NEEDS_MANUAL_VERIFICATION") return "NEEDS_MANUAL_VERIFICATION";
  return "WATCHLIST";
}

function watchlistReason(label: CombinedScannerFinalLabel): string[] {
  return label === "WATCHLIST" ? ["eligible_for_further_review_not_trading_signal"] : [];
}

function buildSummary(totalRaw: number, candidates: CombinedScannerCandidate[]): CombinedScannerOutput["summary"] {
  return {
    total_raw: totalRaw,
    passed_basic_filter: candidates.filter((item) => item.decision.basic_filter_status === "passed_basic_filter").length,
    rejected_basic_filter: candidates.filter((item) => item.decision.basic_filter_status === "rejected_basic_filter").length,
    security_checked: candidates.filter((item) => item.decision.security_label !== "NOT_CHECKED").length,
    security_passed: candidates.filter((item) => item.decision.security_label === "SECURITY_PASSED").length,
    needs_manual_verification: candidates.filter((item) => item.decision.final_label === "NEEDS_MANUAL_VERIFICATION").length,
    critical_risk: candidates.filter((item) => item.decision.final_label === "CRITICAL_RISK").length,
    watchlist_candidates: candidates.filter((item) => item.decision.final_label === "WATCHLIST").length
  };
}

function toSecurityCandidate(candidate: CryptoEdgeCandidate): SecurityCandidate {
  return {
    symbol: candidate.symbol,
    chain: candidate.chain,
    contract_address: candidate.contract_address
  };
}

function candidateKey(candidate: CryptoEdgeCandidate): string {
  return `${candidate.chain}:${candidate.contract_address ?? candidate.pair_address ?? candidate.symbol}`;
}
