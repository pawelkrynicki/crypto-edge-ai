import {
  SOCIAL_LINK_CATEGORIES,
  type DexScreenerLink,
  type DexScreenerPairInfo,
  type NormalizedSocialLink,
  type SocialLinkCategory,
} from "./types.js";

const CATEGORY_ORDER = new Map(SOCIAL_LINK_CATEGORIES.map((category, index) => [category, index]));

const SOCIAL_HOSTS: Record<Extract<SocialLinkCategory, "twitter" | "telegram" | "discord">, ReadonlySet<string>> = {
  twitter: new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]),
  telegram: new Set(["t.me", "telegram.me"]),
  discord: new Set(["discord.gg", "discord.com", "www.discord.com"]),
};

/**
 * Normalizes only links already supplied in a DexScreener pair payload. This
 * module never performs network I/O and therefore remains inside central
 * snapshot normalization rather than a user-click/provider path.
 */
export function normalizeDexScreenerSocialLinks(info: DexScreenerPairInfo | undefined): NormalizedSocialLink[] {
  if (!info) return [];
  const links: NormalizedSocialLink[] = [];
  for (const link of Array.isArray(info.socials) ? info.socials : []) {
    const category = socialCategory(link);
    const url = category ? normalizeSafeSocialUrl(category, link.url) : null;
    if (category && url) links.push({ category, url });
  }
  for (const link of Array.isArray(info.websites) ? info.websites : []) {
    const category = websiteCategory(link);
    const url = category ? normalizeSafeSocialUrl(category, link.url) : null;
    if (category && url) links.push({ category, url });
  }
  return deduplicateAndSort(links);
}

export function normalizeSafeSocialUrl(category: SocialLinkCategory, value: unknown): string | null {
  const url = normalizeSafePublicHttpsUrl(value);
  if (!url) return null;
  const allowedHosts = category === "twitter" || category === "telegram" || category === "discord"
    ? SOCIAL_HOSTS[category]
    : null;
  return allowedHosts && !allowedHosts.has(new URL(url).hostname.toLowerCase()) ? null : url;
}

export function normalizeSafePublicHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 2_048) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || isPrivateHost(url.hostname)) return null;
  return url.toString();
}

function socialCategory(link: DexScreenerLink): Extract<SocialLinkCategory, "twitter" | "telegram" | "discord"> | null {
  const type = text(link.type);
  if (type === "twitter" || type === "x") return "twitter";
  if (type === "telegram") return "telegram";
  if (type === "discord") return "discord";
  return null;
}

function websiteCategory(link: DexScreenerLink): Exclude<SocialLinkCategory, "twitter" | "telegram" | "discord"> | null {
  const label = text(link.label) ?? text(link.type);
  if (!label) return "website";
  if (/whitepaper|docs?|documentation|litepaper/.test(label)) return "whitepaper";
  if (/roadmap|road map/.test(label)) return "roadmap";
  if (/team|about|company|people/.test(label)) return "team";
  if (/website|site|home|homepage/.test(label)) return "website";
  return "website";
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function deduplicateAndSort(links: NormalizedSocialLink[]): NormalizedSocialLink[] {
  const unique = new Map<string, NormalizedSocialLink>();
  for (const link of links) unique.set(`${link.category}:${link.url}`, link);
  return [...unique.values()].sort((left, right) => (
    (CATEGORY_ORDER.get(left.category) ?? 99) - (CATEGORY_ORDER.get(right.category) ?? 99)
    || left.url.localeCompare(right.url)
  ));
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
