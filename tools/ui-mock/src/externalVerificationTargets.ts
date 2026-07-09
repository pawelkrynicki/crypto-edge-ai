export type ExternalVerificationTargetKind = "explorer" | "dex" | "security" | "source";

export type ExternalVerificationTargetState = "link" | "manual";

export interface ExternalVerificationInput {
  symbol?: string;
  projectName?: string;
  chain?: string;
  contractAddress?: string;
  pairAddress?: string;
  sourceUrl?: string;
  tokenInput?: string;
}

export interface ExternalVerificationTarget {
  id: ExternalVerificationTargetKind;
  title: string;
  label: string;
  status: string;
  detail: string;
  state: ExternalVerificationTargetState;
  href?: string;
  copyValue?: string;
  copyLabel?: "copy contract" | "copy token input";
  reason?: string;
}

interface ExplorerTarget {
  chainLabel: string;
  buildHref: (contractAddress: string) => string;
}

const EVM_ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/;

const EXPLORER_TARGETS: Record<string, ExplorerTarget> = {
  ethereum: {
    chainLabel: "ethereum",
    buildHref: (contractAddress) => `https://etherscan.io/address/${encodeURIComponent(contractAddress)}`,
  },
  eth: {
    chainLabel: "ethereum",
    buildHref: (contractAddress) => `https://etherscan.io/address/${encodeURIComponent(contractAddress)}`,
  },
  base: {
    chainLabel: "base",
    buildHref: (contractAddress) => `https://basescan.org/address/${encodeURIComponent(contractAddress)}`,
  },
  bsc: {
    chainLabel: "bsc",
    buildHref: (contractAddress) => `https://bscscan.com/address/${encodeURIComponent(contractAddress)}`,
  },
  binance: {
    chainLabel: "bsc",
    buildHref: (contractAddress) => `https://bscscan.com/address/${encodeURIComponent(contractAddress)}`,
  },
  polygon: {
    chainLabel: "polygon",
    buildHref: (contractAddress) => `https://polygonscan.com/address/${encodeURIComponent(contractAddress)}`,
  },
  arbitrum: {
    chainLabel: "arbitrum",
    buildHref: (contractAddress) => `https://arbiscan.io/address/${encodeURIComponent(contractAddress)}`,
  },
  optimism: {
    chainLabel: "optimism",
    buildHref: (contractAddress) => `https://optimistic.etherscan.io/address/${encodeURIComponent(contractAddress)}`,
  },
  solana: {
    chainLabel: "solana",
    buildHref: (contractAddress) => `https://solscan.io/token/${encodeURIComponent(contractAddress)}`,
  },
};

export function buildExternalVerificationTargets(input: ExternalVerificationInput): ExternalVerificationTarget[] {
  const normalized = normalizeExternalVerificationInput(input);
  const copyValue = normalized.contractAddress || normalized.tokenInput;
  const copyLabel = normalized.contractAddress ? "copy contract" : "copy token input";

  return [
    buildExplorerTarget(normalized, copyValue, copyLabel),
    buildDexTarget(normalized, copyValue, copyLabel),
    buildSecurityTarget(normalized, copyValue, copyLabel),
    buildSourceTarget(normalized, copyValue, copyLabel),
  ];
}

export function normalizeExternalVerificationInput(input: ExternalVerificationInput): Required<ExternalVerificationInput> {
  const tokenInput = (input.tokenInput ?? "").trim();
  const contractAddress = (input.contractAddress ?? extractContractAddress(tokenInput)).trim();

  return {
    symbol: (input.symbol ?? "").trim(),
    projectName: (input.projectName ?? "").trim(),
    chain: (input.chain ?? "").trim().toLowerCase(),
    contractAddress,
    pairAddress: (input.pairAddress ?? "").trim(),
    sourceUrl: (input.sourceUrl ?? inferSourceUrl(tokenInput)).trim(),
    tokenInput,
  };
}

function buildExplorerTarget(
  input: Required<ExternalVerificationInput>,
  copyValue: string,
  copyLabel: "copy contract" | "copy token input",
): ExternalVerificationTarget {
  const missingContract = getMissingContractTarget("explorer", "explorer/manual address check", copyValue, copyLabel);
  if (!input.contractAddress) return missingContract;

  if (!input.chain) {
    return {
      id: "explorer",
      title: "explorer/manual address check",
      label: "manual external check",
      status: "chain unknown",
      detail: "chain unknown / verify manually",
      state: "manual",
      copyValue,
      copyLabel,
      reason: "manual verification required",
    };
  }

  const explorerTarget = EXPLORER_TARGETS[input.chain];
  if (!explorerTarget) {
    return {
      id: "explorer",
      title: "explorer/manual address check",
      label: "manual external check",
      status: "chain unknown",
      detail: "chain unknown / verify manually",
      state: "manual",
      copyValue,
      copyLabel,
      reason: "manual verification required",
    };
  }

  return {
    id: "explorer",
    title: "explorer/manual address check",
    label: explorerTarget.chainLabel,
    status: "not verified",
    detail: "open external check",
    state: "link",
    href: explorerTarget.buildHref(input.contractAddress),
    copyValue,
    copyLabel,
  };
}

function buildDexTarget(
  input: Required<ExternalVerificationInput>,
  copyValue: string,
  copyLabel: "copy contract" | "copy token input",
): ExternalVerificationTarget {
  if (!input.contractAddress) {
    return getMissingContractTarget("dex", "DEX/liquidity manual check", copyValue, copyLabel);
  }

  if (!input.chain || !input.pairAddress) {
    return {
      id: "dex",
      title: "DEX/liquidity manual check",
      label: "manual external check",
      status: input.chain ? "liquidity unknown" : "chain unknown",
      detail: input.chain ? "liquidity unknown" : "chain unknown / verify manually",
      state: "manual",
      copyValue,
      copyLabel,
      reason: "manual verification required",
    };
  }

  return {
    id: "dex",
    title: "DEX/liquidity manual check",
    label: input.chain,
    status: "liquidity unknown",
    detail: "open external check",
    state: "link",
    href: `https://dexscreener.com/${encodeURIComponent(input.chain)}/${encodeURIComponent(input.pairAddress)}`,
    copyValue,
    copyLabel,
  };
}

function buildSecurityTarget(
  input: Required<ExternalVerificationInput>,
  copyValue: string,
  copyLabel: "copy contract" | "copy token input",
): ExternalVerificationTarget {
  if (!input.contractAddress) {
    return getMissingContractTarget("security", "honeypot/security manual check", copyValue, copyLabel);
  }

  return {
    id: "security",
    title: "honeypot/security manual check",
    label: "manual external check",
    status: "security not verified",
    detail: "not verified",
    state: "manual",
    copyValue,
    copyLabel,
    reason: "manual verification required",
  };
}

function buildSourceTarget(
  input: Required<ExternalVerificationInput>,
  copyValue: string,
  copyLabel: "copy contract" | "copy token input",
): ExternalVerificationTarget {
  const href = normalizeHttpUrl(input.sourceUrl);

  if (href) {
    return {
      id: "source",
      title: "source/context manual check",
      label: "manual external check",
      status: "source URL not fetched",
      detail: "source freshness unknown",
      state: "link",
      href,
      copyValue,
      copyLabel,
    };
  }

  return {
    id: "source",
    title: "source/context manual check",
    label: "manual external check",
    status: "source freshness unknown",
    detail: "manual verification required",
    state: "manual",
    copyValue,
    copyLabel,
    reason: "manual verification required",
  };
}

function getMissingContractTarget(
  id: ExternalVerificationTargetKind,
  title: string,
  copyValue: string,
  copyLabel: "copy contract" | "copy token input",
): ExternalVerificationTarget {
  return {
    id,
    title,
    label: "manual external check",
    status: "contract required",
    detail: "manual verification required",
    state: "manual",
    copyValue,
    copyLabel,
    reason: "contract required",
  };
}

function extractContractAddress(input: string): string {
  return input.match(EVM_ADDRESS_PATTERN)?.[0] ?? "";
}

function inferSourceUrl(input: string): string {
  return normalizeHttpUrl(input) ?? "";
}

function normalizeHttpUrl(value: string): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
