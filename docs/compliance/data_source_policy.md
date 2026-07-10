# Data Source Policy

Crypto Edge AI is API-first.

The product must use documented APIs, explicitly permitted public feeds, or directly approved sources only. Public visibility does not equal permission.

Rules:

- API-first.
- No scraping.
- No undocumented endpoints.
- No bypassing controls.
- Public visibility does not equal permission.
- Every source requires registry approval.
- Uncertain sources remain disabled for real users.
- No API failure fallback to scraping.
- Raw response storage requires explicit permission.
- Real-user exposure requires an approved environment.
- No invented data.

Forbidden collection patterns:

- Web scraping.
- HTML parsing.
- Browser automation for data collection.
- Undocumented endpoints.
- Reverse-engineered endpoints.
- CAPTCHA or anti-bot bypasses.
- Rate-limit bypasses.
- Fallback from a failed API to scraping.

The registry at `docs/compliance/data_source_registry_v1.json` is a research and compliance record. It currently records 21 reviewed sources: 12 Priority A sources and 9 Priority B sources. Only 2 sources are currently cleared for Camp BETA.

Runtime authorization must use the explicit operational policy at `config/data_source_runtime_policy.json`; narrative registry fields must not be the only authorization logic. The runtime policy is intentionally stricter than the research registry. Unknown or unconfigured sources fail closed.

Local RC may classify a transient fetch failure from an allowed `PUBLIC_BETA` live source as `EXTERNAL SOURCE DEGRADED` / `degraded_external_source` so frontend/local validation can continue. This is a warning state, not a healthy or verified state. Policy denial, unknown sources, unauthorized activation, forbidden provider calls, scraping fallbacks, invented data, and raw-storage violations remain hard failures. Strict live-source validation is available separately through `scripts\win\check-live-sources-strict.cmd`.

`WATCHLIST` means eligible for further review. It is not a buy signal, sell signal, or investment advice.
