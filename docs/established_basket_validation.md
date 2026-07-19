# 12R.5A.1 — Established Basket Validation

## Finalne zamknięcie — 19.07.2026

Symbol-based plan pozostaje historycznym **`NO_GO_QUERY_PLAN`**, ma `production_enabled=false` i nie jest używany przez collector. Finalny mechanizm established dla CAMP to `config/established_address_universe_v1.json` z identity `CHAIN_AND_CONTRACT_ADDRESS` i oficjalnym DexScreener token-pairs endpointem. Nie wykonuje się dalszego query refinement ani kolejnego discovery experiment. **DISCOVERY CLOSED FOR CAMP 2026.**

Data walidacji: 18.07.2026

Bazowy `main`: `4dafda353456c8eea83f8a8e2db1a87197129b68`

Plan: `established_basket_v1`

Wynik: **`NO_GO_QUERY_PLAN`**

## Executive summary

Owner zaakceptował strategię dwóch koszy: `new/emerging` pozostaje obserwacyjnym strumieniem z DexScreener latest token profiles, a diagnostyczny `established-small-cap` miał sprawdzić oficjalny DexScreener search API z queries `USDC`, `USDT`, `WETH`, `WBNB`, `SOL`.

Jedyny kontrolowany live run zwrócił 120 par, z czego 57 miało exact anchor match. Po odrzuceniu 60 wyników z unsupported chains, 3 par ambiguous-anchor i 56 przypadków, w których danych rynkowych nie można było bezpiecznie przypisać kandydatowi po stronie quoteToken, pozostał 1 unikalny kandydat. Był starszy niż 7 dni, ale nie przeszedł baseline. Query `USDT` zakończyło się `NETWORK_ERROR` po jednym dozwolonym retry. Run nie został powtórzony.

Query plan nie tworzy reprezentatywnej populacji established-small-cap i nie kwalifikuje się do integracji z collectorem. `dexscreener_basic_filters_v1` pozostaje bez zmian. Produkcyjny collector, UI, scoring, `final_label`, znaczenie `WATCHLIST`, snapshoty i VPS nie zostały zmienione.

## Zaakceptowana decyzja ownera i query plan

Kanoniczny config to `config/established_discovery_query_plan_v1.json`:

- status: `NO_GO_QUERY_PLAN`;
- `production_enabled=false`;
- provider/endpoint: `dexscreener` / `search`;
- limit i queries: dokładnie 5 — `USDC`, `USDT`, `WETH`, `WBNB`, `SOL`;
- aliasy: `USDC`, `USDT`, `WETH`, `WBNB`, `SOL|WSOL`;
- supported chains: Ethereum, BSC, Base, Arbitrum, Polygon, Avalanche, Solana;
- jawnie unsupported: Robinhood;
- identity confidence: `SYMBOL_EXACT_DIAGNOSTIC_ONLY`;
- integracja produkcyjna nadal wymaga osobnej akceptacji ownera.

Nieznana wersja, więcej niż 5 queries, dodatkowe query, zmieniona kolejność lub niezatwierdzony alias są odrzucane fail-closed.

## Zasady anchor/candidate

Anchor jest dopasowywany dokładnie i case-insensitive do symbolu obu stron; substring jest zabroniony. Gdy anchor jest po stronie quoteToken, kandydatem jest baseToken. Gdy anchor jest po stronie baseToken, tożsamością kandydata jest quoteToken. Anchor po obu stronach daje `ambiguous_anchor`, a brak exact match — `anchor_not_matched`.

DexScreener zwraca `priceUsd`, `marketCap` i `fdv` dla baseToken. Dlatego przy kandydacie po stronie quoteToken nie wolno przypisać mu metryk anchora; taka para jest raportowana jako `missing_market_data` z `quote_token_market_data_not_attributable`. To celowy fail-closed, nie brak obsługi orientacji.

Unsupported chain jest odrzucany przed normalizacją. Selekcja pary następuje dopiero po prawidłowym ustaleniu kandydata, po najwyższej poprawnej `liquidity.usd`. Deduplikacja używa chain, candidate contract i pair address, a lista matched queries jest zachowywana.

## Ograniczenia symbol-only matching

Exact symbol match eliminuje substring noise (`USDTX`, `SOLCAT`), lecz nie potwierdza adresu anchora. Dowolny token może użyć symbolu `USDC`, `WETH` lub `SOL`, dlatego ryzyko spoofingu pozostaje **wysokie**. Raport nie twierdzi, że anchor został zweryfikowany kryptograficznie. Integracja nie może przejść dalej bez address-backed anchor identity.

## Kontrolowany live run

Komenda:

```powershell
$env:CRYPTO_EDGE_DATA_ENV = "INTERNAL_BETA"
$env:CRYPTO_EDGE_RUNTIME_MODE = "INTERNAL_BETA"
$env:ALLOW_LIVE_PROVIDER_CALLS = "1"
npm run discovery:archived-query-plan:diagnostic
```

Limity: 10 s timeout, concurrency 3, najwyżej jeden retry na request, globalny budżet 10 requestów. Wykonano dokładnie jeden run. Jedynym providerem był DexScreener; security/context calls, raw storage, snapshot publish i atomic publish wyniosły 0.

## Wynik per query

| Query | Raw pairs | Exact anchor | No match | Ambiguous | Unsupported | Missing market data | Unique po selekcji | Baseline pass | Requests | Retries | Failures |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| USDC | 30 | 4 | 0 | 1 | 25 | 3 | 1 | 0 | 1 | 0 | 0 |
| USDT | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 1 | 1 |
| WETH | 30 | 7 | 0 | 0 | 23 | 7 | 0 | 0 | 2 | 1 | 0 |
| WBNB | 30 | 18 | 0 | 1 | 11 | 18 | 0 | 0 | 1 | 0 | 0 |
| SOL | 30 | 28 | 0 | 1 | 1 | 28 | 0 | 0 | 1 | 0 | 0 |
| **Razem** | **120** | **57** | **0** | **3** | **60** | **56** | **1** | **0** | **7** | **2** | **1** |

`USDT` nie dostarczyło próbki: endpoint `https://api.dexscreener.com/latest/dex/search?q=USDT`, code `NETWORK_ERROR`, HTTP status niedostępny, request count 2, retry count 1, failure count 1. Run nie został powtórzony i nie użyto fixture.

## Wynik łączny i kandydaci

- unique candidates: 1;
- baseline passes: 0;
- candidates found by multiple queries: 0;
- anchor błędnie uznany za kandydata: 0;
- pair age distribution: 1 w bucket `14_to_90_days`, min/median/max 89;
- chain distribution kandydatów: Solana 1;
- query concentration: USDC 100%, pozostałe 0%;
- kompletność pól jedynego kandydata: pełna;
- raw payloads stored: false;
- security/context calls: 0/0;
- publish/atomic publish: false/false.

| Symbol | Chain | Contract | Pair | Query | Anchor side | Age | Market cap | Liquidity | Volume 24h | Ratio | Baseline |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|
| ERC20-USDC | solana | `G8KhLpeBPRhM6tMroEVC72H4Fv23KtwYzU1LZK6YE4rR` | `ZJYDE76uc638Zt1TicwDnNn1vSjamknEY7Hu5Y5bYRk` | USDC | quoteToken | 89 dni | $49,009,801 | $48,923,841.57 | $153,634.21 | 0.3135% | reject |

Kandydat został odrzucony przez `market_cap_above_10000000` i `volume_market_cap_ratio_below_1_percent`; soft reason: `volume_market_cap_ratio_outside_sweet_spot_5_30_percent`. **Tabela kandydatów przechodzących baseline jest pusta.**

## Rejection matrix

| Kategoria | Reason | Liczba |
|---|---|---:|
| Pair | `unsupported_chain` | 60 |
| Pair | `missing_market_data` | 56 |
| Pair | `ambiguous_anchor` | 3 |
| Pair | `anchor_not_matched` | 0 |
| Baseline hard | `market_cap_above_10000000` | 1 |
| Baseline hard | `volume_market_cap_ratio_below_1_percent` | 1 |
| Baseline soft | `volume_market_cap_ratio_outside_sweet_spot_5_30_percent` | 1 |

Unsupported-chain distribution: HyperEVM 9, PulseChain 8, Celo 5, Cronos 4, Aptos 4, Linea 3, Soneium 3, Scroll 3, Flare 3, Manta 2, Near 2, Polkadot 2, Flow EVM 2 oraz po 1: Ink, Sei v2, XRPL, zkSync, Mantle, TON, Metis, Plasma, Robinhood, Algorand.

## Odpowiedzi na pytania etapu

1. Pary per query: USDC 30, USDT 0 z powodu awarii, WETH 30, WBNB 30, SOL 30.
2. Exact anchor matches: odpowiednio 4, 0, 7, 18, 28; razem 57.
3. `anchor_not_matched`: 0. Dodatkowo 3 wyniki były ambiguous; 60 odrzucono przed anchor matching jako unsupported-chain.
4. Unsupported chains: 60 wyników.
5. Pozostał 1 unikalny kandydat.
6. Baseline przeszło 0 kandydatów.
7. Nie przeszedł żaden symbol.
8. Brak sieci w zbiorze passing; jedyny normalized candidate był na Solanie.
9. Brak passing candidates. Jedyny kandydat miał 89 dni, market cap $49.01M, liquidity $48.92M, volume $153.63k i ratio 0.3135%.
10. Żaden kandydat nie został znaleziony przez więcej niż jedno query.
11. Tak: 100% normalized candidates pochodziło z USDC.
12. Nie, żaden anchor nie został kandydatem.
13. Ryzyko symbol spoofing jest wysokie, bo identity jest symbol-only i bez address verification.
14. Plan znalazł starszą parę, czego brakowało latest profiles, ale nie stworzył użytecznej populacji established-small-cap; jako całość nie daje przewagi potrzebnej Radarowi.
15. Wynik: **`NO_GO_QUERY_PLAN`**.

## Jakość, klasyfikacja i następny etap

`NO_GO_QUERY_PLAN` wynika z 0 baseline passes oraz niepełnego query runu (`USDT` network failure). Niezależnie od awarii jakość próbki jest niewystarczająca: 50% raw wyników pochodziło z unsupported chains, niemal wszystkie supported exact matches wskazywały kandydata po quote-side bez przypisywalnych metryk, a jedyny normalized candidate nie był small-cap i pochodził wyłącznie z USDC.

Kierunek established search zostaje zatrzymany. Rekomendowana alternatywa do osobnej akceptacji ownera: **address-seeded established universe** oparty nadal wyłącznie o oficjalne DexScreener API (`/tokens/v1/{chainId}/{tokenAddresses}` lub `/token-pairs/v1/{chainId}/{tokenAddress}`), z wersjonowaną allowlistą jawnych adresów tokenów i adresami anchorów. Źródło adresów musi zostać osobno zatwierdzone; ten etap nie dodaje providera ani nie integruje collectora.

Historyczna bramka została zamknięta przez `docs/discovery_closure.md`. Następny etap to **Product Radar Build & Owner Acceptance**. VPS pozostaje bez zmian. Tester zewnętrzny pozostaje `NO-GO`.

## Walidacja

Przed live runem przeszły: 152/152 testów Data PoC, source registry, config/anchor/dedupe tests, 34/34 fail-closed boundary tests, UI contract, UI typecheck, `INTERNAL_BETA` build, `check-ui-mock.cmd`, `check-preview-launchers.cmd`, `check-local-mvp.cmd` i `check-local-rc.cmd`. Pierwsze uruchomienie agregatu `local-mvp` odziedziczyło pomocnicze zmienne `INTERNAL_BETA` i prawidłowo zatrzymało test default-env; po wyczyszczeniu środowiska oba agregaty przeszły. Nie wykonano dodatkowego provider runu.
