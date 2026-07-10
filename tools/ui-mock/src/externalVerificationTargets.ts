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
  copyLabel?: "Copy Contract" | "Copy Token Input";
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
  const copyLabel = normalized.contractAddress ? "Copy Contract" : "Copy Token Input";

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
  copyLabel: "Copy Contract" | "Copy Token Input",
): ExternalVerificationTarget {
  const missingContract = getMissingContractTarget("explorer", "Explorer / Manual Address Check", copyValue, copyLabel);
  if (!input.contractAddress) return missingContract;

  if (!input.chain) {
    return {
      id: "explorer",
      title: "Explorer / Manual Address Check",
      label: "Manual External Check",
      status: "Chain Unknown",
      detail: "Chain Unknown / verify manually",
      state: "manual",
      copyValue,
      copyLabel,
      reason: "Manual Verification Required",
    };
  }

  const explorerTarget = EXPLORER_TARGETS[input.chain];
  if (!explorerTarget) {
    return {
      id: "explorer",
      title: "Explorer / Manual Address Check",
      label: "Manual External Check",
      status: "Chain Unknown",
      detail: "Chain Unknown / verify manually",
      state: "manual",
      copyValue,
      copyLabel,
      reason: "Manual Verification Required",
    };
  }

  return {
    id: "explorer",
    title: "Explorer / Manual Address Check",
    label: explorerTarget.chainLabel,
    status: "Not Verified",
    detail: "Open External Check",
    state: "link",
    href: explorerTarget.buildHref(input.contractAddress),
    copyValue,
    copyLabel,
  };
}

function buildDexTarget(
  input: Required<ExternalVerificationInput>,
  copyValue: string,
  copyLabel: "Copy Contract" | "Copy Token Input",
): ExternalVerificationTarget {
  if (!input.contractAddress) {
    return getMissingContractTarget("dex", "DEX / Liquidity Manual Check", copyValue, copyLabel);
  }

  if (!input.chain || !input.pairAddress) {
    return {
      id: "dex",
      title: "DEX / Liquidity Manual Check",
      label: "Manual External Check",
      status: input.chain ? "Liquidity Unknown" : "Chain Unknown",
      detail: input.chain ? "Liquidity Unknown" : "Chain Unknown / verify manually",
      state: "manual",
      copyValue,
      copyLabel,
      reason: "Manual Verification Required",
    };
  }

  return {
    id: "dex",
    title: "DEX / Liquidity Manual Check",
    label: input.chain,
    status: "Liquidity Unknown",
    detail: "Open External Check",
    state: "link",
    href: `https://dexscreener.com/${encodeURIComponent(input.chain)}/${encodeURIComponent(input.pairAddress)}`,
    copyValue,
    copyLabel,
  };
}

function buildSecurityTarget(
  input: Required<ExternalVerificationInput>,
  copyValue: string,
  copyLabel: "Copy Contract" | "Copy Token Input",
): ExternalVerificationTarget {
  if (!input.contractAddress) {
    return getMissingContractTarget("security", "Honeypot / Security Manual Check", copyValue, copyLabel);
  }

  return {
    id: "security",
    title: "Honeypot / Security Manual Check",
    label: "Manual External Check",
    status: "Security Not Verified",
    detail: "Not Verified",
    state: "manual",
    copyValue,
    copyLabel,
    reason: "Manual Verification Required",
  };
}

function buildSourceTarget(
  input: Required<ExternalVerificationInput>,
  copyValue: string,
  copyLabel: "Copy Contract" | "Copy Token Input",
): ExternalVerificationTarget {
  const href = normalizeHttpUrl(input.sourceUrl);

  if (href) {
    return {
      id: "source",
      title: "Source / Context Manual Check",
      label: "Manual External Check",
      status: "Source URL Not Fetched",
      detail: "Source Freshness Unknown",
      state: "link",
      href,
      copyValue,
      copyLabel,
    };
  }

  return {
    id: "source",
    title: "Source / Context Manual Check",
    label: "Manual External Check",
    status: "Source Freshness Unknown",
    detail: "Manual Verification Required",
    state: "manual",
    copyValue,
    copyLabel,
    reason: "Manual Verification Required",
  };
}

function getMissingContractTarget(
  id: ExternalVerificationTargetKind,
  title: string,
  copyValue: string,
  copyLabel: "Copy Contract" | "Copy Token Input",
): ExternalVerificationTarget {
  return {
    id,
    title,
    label: "Manual External Check",
    status: "Contract Required",
    detail: "Manual Verification Required",
    state: "manual",
    copyValue,
    copyLabel,
    reason: "Contract Required",
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
