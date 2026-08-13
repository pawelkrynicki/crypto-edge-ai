# PC.3D — Social / Team / Docs coverage matrix

Audit date: 2026-08-13. This audit used checked-in fixtures and current local
canonical contracts only; it made no live provider request.

Current checked-in scanner outputs (`tools/data-poc/fixtures` and
`tools/ui-mock/public/fixtures`) contain no token social/profile link values.
The existing DexScreener pair response is nevertheless the central discovery
snapshot boundary. PC.3D now normalizes its already-delivered `info.socials`
and `info.websites` metadata when present, attaches `DexScreener` provenance
and the candidate snapshot time, and persists it on the exact chain + contract
candidate. It does not read source pages, follow links, or fetch any new API.

| Item | Existing normalized field | Raw/stored data exists? | Source | Can normalize without new provider? | Automatic link available? | Manual fallback | Gap |
|---|---|---:|---|---:|---:|---|---|
| twitter | `candidate.social_links[category=twitter]` | No checked-in value; supported in existing pair `info.socials` | DexScreener pair snapshot | Yes | When safe X/Twitter source link is supplied | Controlled private X finding + optional engagement % | Quality is never inferred from a link |
| telegram | `candidate.social_links[category=telegram]` | No checked-in value; supported in existing pair `info.socials` | DexScreener pair snapshot | Yes | When safe Telegram source link is supplied | Controlled private Telegram finding + optional activity % | No member/activity API |
| discord | `candidate.social_links[category=discord]` | No checked-in value; supported in existing pair `info.socials` | DexScreener pair snapshot | Yes | When safe Discord source link is supplied | Controlled private Discord finding | Absence is not a red flag |
| website | `candidate.social_links[category=website]` | No checked-in value; supported in existing pair `info.websites` | DexScreener pair snapshot | Yes | When a safe public HTTPS link is supplied | Controlled private website finding | No crawling or content claim |
| team | `candidate.social_links[category=team]` only when source explicitly labels team/about | No checked-in value | DexScreener pair snapshot | Yes, if explicitly supplied | Only with explicit source label | Controlled private team finding | Reliable token age is unavailable; pair age is never substituted |
| whitepaper / docs | `candidate.social_links[category=whitepaper]` | No checked-in value; supported in labelled pair `info.websites` | DexScreener pair snapshot | Yes | When explicitly labelled docs/whitepaper is supplied | Controlled private docs finding | No document scraping or automatic originality analysis |
| roadmap | `candidate.social_links[category=roadmap]` | No checked-in value; supported in labelled pair `info.websites` | DexScreener pair snapshot | Yes | When explicitly labelled roadmap is supplied | Controlled private roadmap finding | No automatic delivery/risk threshold |

## Implementation boundary

- An automatic source link means **Link from token source** / **Link ze źródła tokena**, not “Official” and not quality verification.
- Link data is deduplicated and bound to `chain + contract address`; no symbol or name join exists.
- URL validation accepts only public HTTPS endpoints. It rejects credentials, localhost,
  private-network hosts and unsafe schemes. X, Telegram and Discord also use the
  required host allowlists.
- Invalid persisted social metadata fails the scanner schema path so the existing
  canonical last-known-good snapshot remains preferable; an invalid link cannot
  replace valid shared evidence.
- Private manual evidence uses the existing PC.3A SQLite repository. It remains
  actor-scoped; trusted testers receive read-only access.
