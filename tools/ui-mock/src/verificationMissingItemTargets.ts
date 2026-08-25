export type VerificationMissingTarget =
  | "honeypot"
  | "liquidity_lock"
  | "top10_wallets"
  | "tokensniffer"
  | "defi_scanner"
  | "bubblemaps"
  | "contract"
  | "ownership"
  | "taxes";

export type VerificationMissingTargetMapping = {
  target: VerificationMissingTarget;
  tab: "security" | "data" | "identity";
  label: { pl: string; en: string };
};

const MAP: Record<string, VerificationMissingTargetMapping> = {
  honeypot_status: { target: "honeypot", tab: "security", label: { pl: "Honeypot", en: "Honeypot" } },
  honeypot_missing: { target: "honeypot", tab: "security", label: { pl: "Honeypot", en: "Honeypot" } },
  liquidity_locked: { target: "liquidity_lock", tab: "security", label: { pl: "Blokada płynności", en: "Liquidity lock" } },
  liquidity_lock_missing: { target: "liquidity_lock", tab: "security", label: { pl: "Blokada płynności", en: "Liquidity lock" } },
  top_10_wallets_pct: { target: "top10_wallets", tab: "security", label: { pl: "Udział Top 10 portfeli", en: "Top 10 wallet share" } },
  top_10_wallets_pct_missing: { target: "top10_wallets", tab: "security", label: { pl: "Udział Top 10 portfeli", en: "Top 10 wallet share" } },
  top_wallet_pct: { target: "top10_wallets", tab: "security", label: { pl: "Udział największego portfela", en: "Largest wallet share" } },
  tokensniffer: { target: "tokensniffer", tab: "data", label: { pl: "TokenSniffer", en: "TokenSniffer" } },
  defi_scanner: { target: "defi_scanner", tab: "data", label: { pl: "De.Fi Scanner", en: "De.Fi Scanner" } },
  bubblemaps: { target: "bubblemaps", tab: "data", label: { pl: "Bubblemaps", en: "Bubblemaps" } },
  wallet_clustering: { target: "bubblemaps", tab: "data", label: { pl: "Bubblemaps", en: "Bubblemaps" } },
  contract_verified: { target: "contract", tab: "identity", label: { pl: "Zweryfikowany kontrakt", en: "Contract verification" } },
  ownership_status: { target: "ownership", tab: "security", label: { pl: "Własność", en: "Ownership" } },
  ownership_unknown: { target: "ownership", tab: "security", label: { pl: "Własność", en: "Ownership" } },
  buy_tax: { target: "taxes", tab: "security", label: { pl: "Podatki", en: "Taxes" } },
  sell_tax: { target: "taxes", tab: "security", label: { pl: "Podatki", en: "Taxes" } },
};

export function resolveVerificationMissingTarget(value: string): VerificationMissingTargetMapping | null {
  return MAP[value.trim().toLowerCase()] ?? null;
}

export function isVerificationMissingTarget(value: string | null): value is VerificationMissingTarget {
  return Object.values(MAP).some((entry) => entry.target === value);
}

export function getVerificationMissingTargetPresentation(target: VerificationMissingTarget): VerificationMissingTargetMapping {
  const match = Object.values(MAP).find((entry) => entry.target === target);
  if (!match) throw new Error("Unknown verification target");
  return match;
}
