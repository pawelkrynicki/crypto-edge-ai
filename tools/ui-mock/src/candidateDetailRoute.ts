import { isCandidateDetailTabId, type CandidateDetailTabId } from "./candidateDetailTabs";
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

export function resolveDetailTab(): CandidateDetailTabId {
  if (typeof window === "undefined") return "summary";
  const value = new URLSearchParams(window.location.search).get("detail");
  return isCandidateDetailTabId(value) ? value : "summary";
}

export function writeCandidateDetailRoute(identity: RouteTokenIdentity, tab: CandidateDetailTabId) {
  writeTokenRoute(identity, "candidate-detail", tab);
}

export function writeVerificationRoute(identity: RouteTokenIdentity) {
  writeTokenRoute(identity, "external-checks", null);
}

export function writeVerificationListRoute() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("chain");
  url.searchParams.delete("contract");
  url.searchParams.delete("detail");
  url.hash = "external-checks";
  window.history.pushState(null, "", url);
}

function writeTokenRoute(
  identity: RouteTokenIdentity,
  section: "candidate-detail" | "external-checks",
  tab: CandidateDetailTabId | null,
) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("chain", identity.chain);
  url.searchParams.set("contract", identity.contract_address);
  if (tab) url.searchParams.set("detail", tab);
  else url.searchParams.delete("detail");
  url.hash = section;
  window.history.pushState(null, "", url);
}
