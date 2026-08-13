export const SOCIAL_LINK_CATEGORIES = [
  "twitter",
  "telegram",
  "discord",
  "website",
  "team",
  "whitepaper",
  "roadmap",
] as const;

export type SocialLinkCategory = (typeof SOCIAL_LINK_CATEGORIES)[number];

export type PublicSocialLink = {
  category: SocialLinkCategory;
  url: string;
  source: "DexScreener";
  snapshotAt: string;
};

const SOCIAL_HOSTS: Record<Extract<SocialLinkCategory, "twitter" | "telegram" | "discord">, ReadonlySet<string>> = {
  twitter: new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]),
  telegram: new Set(["t.me", "telegram.me"]),
  discord: new Set(["discord.gg", "discord.com", "www.discord.com"]),
};

/** Validate presentation links without fetching or following them. */
export function normalizeSafePublicHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 2_048) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || isPrivateHost(url.hostname)) return null;
  return url.toString();
}

export function normalizeSafeSocialLinkUrl(category: SocialLinkCategory, value: unknown): string | null {
  const url = normalizeSafePublicHttpsUrl(value);
  if (!url) return null;
  const allowedHosts = category === "twitter" || category === "telegram" || category === "discord"
    ? SOCIAL_HOSTS[category]
    : null;
  return allowedHosts && !allowedHosts.has(new URL(url).hostname.toLowerCase()) ? null : url;
}

export function isSocialLinkCategory(value: unknown): value is SocialLinkCategory {
  return typeof value === "string" && SOCIAL_LINK_CATEGORIES.includes(value as SocialLinkCategory);
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::" || host === "::1") return true;
  if (/^(fc|fd|fe80):/i.test(host)) return true;
  const embeddedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(host)?.[1];
  return isPrivateIpv4(embeddedIpv4 ?? host);
}

function isPrivateIpv4(host: string): boolean {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!parts) return false;
  const octets = parts.slice(1).map(Number);
  if (octets.some((part) => part > 255)) return true;
  return octets[0] === 0 || octets[0] === 10 || octets[0] === 127
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 169 && octets[1] === 254);
}
