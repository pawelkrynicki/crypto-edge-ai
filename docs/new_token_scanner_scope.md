# New Token Scanner Scope

## Purpose

New Token Scanner is a key module of Crypto Edge AI. It helps find and filter new tokens using real data.

It is not the entire product. Crypto Edge AI also includes Research Review, Risk Engine, Setup Review, and Final Checklist.

## Camp BETA Goal

For Camp BETA, the scanner should work on a limited but real-data pipeline.

Primary goal:

- Find token candidates.
- Reject obvious scams and critical risks.
- Surface watchlist candidates.
- Produce a scorecard and checklist.

## First Code POC Boundary

The first code POC covers only:

- DexScreener discovery.
- Normalization to Crypto Edge AI candidate JSON.
- Basic filters for market cap, volume, liquidity, volume/MC, and pair age.
- Fixture mode for stable tests.

It does not include security integrations, scorecard persistence, database writes, UI, cron, or AI calls.

## Second Code POC Boundary

The second code POC adds Security Enrichment only:

- GoPlus fixture/live best-effort.
- Honeypot.is fixture/live best-effort.
- Security normalization.
- Security labels.
- Missing data handling.

It still does not include:

- Database writes.
- UI.
- Production scanner.
- Cron.
- OpenAI.
- CoinGecko.
- Fear & Greed.
- AIKINTEL Market News.

## Third Code POC Boundary: Combined Scanner

The third code POC combines discovery, basic filters, and security enrichment into one controlled scanner output.

It includes:

- DexScreener fixture/live discovery.
- Basic filter pass/reject status.
- Security enrichment only for a limited number of passed candidates.
- Final labels: `REJECT`, `WATCHLIST`, `CRITICAL_RISK`, `NEEDS_MANUAL_VERIFICATION`.
- JSON output for Camp BETA review.

It still does not include:

- Database writes.
- UI.
- Production scanner or production cron.
- OpenAI.
- CoinGecko.
- Fear & Greed.
- AIKINTEL Market News.
- Exchange, MT4, Telegram, Discord, payment, or auto-trading integrations.

Commands:

```bash
npm run scanner:fixture
npm run scanner:live -- --query SOL --max-candidates 3
```

`WATCHLIST` means only `eligible for further review`. It does not mean buy, enter now, guaranteed setup, or trading signal.

Known asset caution: this rule set is optimized for new tokens and microcaps. Large known assets, stablecoins, wrapped assets, or special-purpose contracts may need contextual interpretation. Do not implement a whitelist or known assets list at POC stage.

## Fourth Code POC Boundary: Persistable Scanner Output

The fourth code POC converts Combined Scanner output into a storage-ready shape and writes local JSON/JSONL files.

It includes:

- Scan run record.
- Candidate rows.
- Security check rows when security data exists.
- Partial scorecard rows for every candidate.
- Local file output under `tools/data-poc/output/<run_id>/`.

It still does not include:

- MySQL.
- SQLite.
- Drizzle.
- Migrations.
- Auth.
- UI.
- Production cron.
- Production scanner persistence.

The output maps later to:

- `crypto_token_scan_runs`.
- `crypto_token_candidates`.
- `crypto_token_security_checks`.
- `crypto_token_scorecards`.

Scorecards remain partial/null until the scoring model is implemented beyond the POC.

## Discovery Radar

Starting source:

- DexScreener as primary source.

Later or backup:

- GeckoTerminal.
- DexTools as manual reference.

Starting filters:

- Market cap: $300K - $10M.
- Token/pair age: preferred 14-90 days.
- Minimum pair age: >7 days if token age is unavailable.
- 24h volume: minimum $30K.
- Liquidity: minimum $30K.
- Volume/MC: 3%-80%.
- Sweet spot Volume/MC: 5%-30%.
- Reject Volume/MC <1% as likely dead.
- Reject Volume/MC >100% as possible wash trading or pump/dump.

## Deal Breaker Engine

Reject immediately when critical flags appear:

- Honeypot positive.
- Buy/sell tax >10%.
- Unverified contract.
- Liquidity unlocked.
- Top wallet >30% supply.
- Top 10 wallets >60% supply.
- Token Sniffer score <50.
- GoPlus high risk or critical issue.
- Missing verified source code.
- Anonymous team plus very young token.
- Suspicious copy-paste whitepaper.
- Fake partnership or unverifiable claims.

## Security Check

Priority Camp BETA integrations:

- GoPlus Security.
- Honeypot.is.

Optional/manual/later:

- Token Sniffer if legal and stable access is confirmed.
- De.Fi Scanner if API/legal access is confirmed.
- Etherscan/BscScan/Solscan as explorers.

Three-stamp idea:

- Token Sniffer >70 and no critical flags.
- GoPlus: honeypot false, tax <10%, no critical risk.
- De.Fi Scanner: no critical risks.

For Camp BETA, treat GoPlus and Honeypot.is as priority real integrations.

## Rug Pull Risk

Dedicated rug pull risk checks should evaluate:

- Unlocked liquidity.
- Liquidity lock <30 days.
- LP tokens controlled by one wallet.
- Active contract ownership.
- Mint function.
- Blacklist/whitelist functions.
- Sell restrictions.
- Hidden owner / proxy risk.
- Top wallet concentration.
- Fresh wallets buying together.
- Large transfers between linked wallets.
- Developer wallet sells during pump.
- Liquidity spike without organic volume.

## On-Chain Distribution

Target metrics:

- Holders minimum 300, preferred 500-5000.
- Top 10 wallets <40% target, >60% red flag.
- Top 1 wallet <10% target, >20% red flag.
- Dev wallet <5% locked, >10% unlocked red flag.
- Liquidity/MC 10%-30% optimal, <3% red flag.

Bubblemaps is important later or as a manual check. Do not force production API until access terms are confirmed.

## Social and Narrative Check

Social checks:

- Twitter/X account age.
- Follower quality.
- Engagement 2%-5% healthy.
- Telegram members 500+ preferred.
- Telegram active users 10%-30% active.
- Real comments, not only hype spam.
- Admin responsiveness.
- Voice chat active as green flag.
- Fake engagement as red flag.

For Camp BETA, social may be manual input or checklist if API sources are unstable.

## Output

Scanner output should include:

- Candidate data.
- Security result.
- Rug pull risk.
- Holder/distribution notes.
- Social/narrative notes.
- Scorecard.
- Decision label.
- Final checklist.
- Disclaimer.

## Safety

Do not output `APE`. Use safer labels:

- `WATCHLIST`.
- `HIGH_CONVICTION_REVIEW`.
- `REJECT`.
- `CRITICAL_RISK`.
- `NOT_ELIGIBLE_FOR_REVIEW`.
