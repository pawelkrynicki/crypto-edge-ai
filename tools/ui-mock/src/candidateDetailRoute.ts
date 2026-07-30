import { isCandidateDetailLayerId, type CandidateDetailLayerId } from "./candidateDetailLayers";
import { resolveTokenIdentity } from "./tokenLifecycle";

export type RouteTokenIdentity = {
  chain: string;
  contract_address: string;
};

export function resolveRouteTokenIdentity(): RouteTokenIdentity | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const identity = resolveTokenIdentity(params.get("chain") ?? "", params.get("contract") ?? "");
  if (identity.status !== "valid") return null;
  return { chain: identity.chain, contract_address: identity.contract_address };
}

export function resolveDetailLayer(): CandidateDetailLayerId | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("detail");
  return isCandidateDetailLayerId(value) ? value : null;
}
