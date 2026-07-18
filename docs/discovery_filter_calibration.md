# 12R.5A — Discovery & Filter Calibration

## Aktualizacja 12R.5A.1 — Established Basket Validation

Owner zatwierdził diagnostyczny query plan `USDC`, `USDT`, `WETH`, `WBNB`, `SOL`. Jedyny kontrolowany run oficjalnego DexScreener search API zwrócił 120 raw pairs, 57 exact anchor matches, 60 unsupported-chain wyników, 56 przypadków bez bezpiecznie przypisywalnych quote-side market data, 1 unikalnego kandydata i 0 baseline passes. `USDT` zakończyło się `NETWORK_ERROR` po jednym retry; run nie został powtórzony.

Werdykt: **`NO_GO_QUERY_PLAN`**. Search-query basket nie daje reprezentatywnej populacji established-small-cap. Aktywny profil `dexscreener_basic_filters_v1`, collector i progi pozostają bez zmian. Kierunek search zostaje zatrzymany; alternatywa do osobnej decyzji ownera to address-seeded universe korzystający wyłącznie z oficjalnych endpointów DexScreener dla znanych adresów. Kanoniczny raport: `docs/established_basket_validation.md`. 12R.5B i tester zewnętrzny pozostają `NO-GO`.

Data analizy: 18.07.2026

Bazowy `main`: `8881ffaa0e1594e9738da0ef0499e1fd6e2d583d`

Snapshot: `tools/data-poc/output/scan_20260717201111_bfd5fb1d/full_output.json`

Status: **offline i discovery-only live diagnostic zakończone; aktywny profil filtrów bez zmian**

## Executive summary

Przyczyną wyniku `0/7` nie jest brak danych. Wszystkich 7 kandydatów ma komplet metryk potrzebnych filtrom, żaden nie używa FDV zamiast market cap, a jedyny kandydat spełniający pozostałe twarde kryteria (`STX`) odpada wyłącznie dlatego, że para ma 1 dzień.

Dominującym problemem jest konflikt populacji: `dexscreener_latest_token_profiles` zwraca najnowsze profile, natomiast baseline wymaga pary starszej niż 7 dni. Snapshot miał wiek par `0–1` dni. Jedyny kontrolowany diagnostic dla 30 seedów potwierdził wzorzec: 20/20 kandydatów nie spełniało kryterium wieku, 17 miało `0–3` dni, 2 miały dokładnie 7 dni, a 1 nie miał `pairCreatedAt`.

Warianty A–E dały `0` kandydatów zarówno dla snapshotu, jak i dla live diagnostic. Nie ma danych uzasadniających zmianę liquidity, volume, market cap lub pair age. Aktywny profil pozostaje `dexscreener_basic_filters_v1`.

Rekomendacja: **A — pozostawić filtry i zmienić discovery**. `latest profiles` powinno być koszykiem `new/emerging`. Drugi, diagnostyczny koszyk `established-small-cap` powinien korzystać z jawnych, zaakceptowanych przez ownera zapytań do oficjalnego DexScreener search API. Publiczne API nie oferuje ogólnego endpointu „small caps starsze niż 7 dni”, więc query plan i reprezentatywność wymagają osobnej akceptacji oraz późniejszej walidacji live. Produkcyjny collector nie został zmieniony.

Status przejścia do 12R.5B: **NO-GO do owner acceptance dla strategii discovery i query planu**. Tester zewnętrzny pozostaje `NO-GO`.

## Zakres i twarde granice

- analiza używa normalized snapshotu i jednego bounded live diagnostic;
- live diagnostic wywołał wyłącznie DexScreener;
- GoPlus, Honeypot.is, Alternative.me i DefiLlama: 0 wywołań;
- brak raw provider storage, fixture fallback, scoring/final-label/WATCHLIST changes;
- brak publikacji snapshotu i atomic publish w diagnostic;
- brak zmian UI, schedulera, VPS i deploymentu;
- `WATCHLIST` nadal oznacza `Manual Review Only`.

## Tabela 7 kandydatów

`primary_reject_reason` jest pierwszym twardym powodem w deterministycznej kolejności aktywnego filtra. Soft reasons nie wpływają na status.

### Tożsamość i źródło

| # | `candidate_id` | `symbol` / `name` | `chain` | `contract_address` | `pair_address` | `dex` | `source_url` |
|---:|---|---|---|---|---|---|---|
| 1 | `f68d3988fab85c0347e480d65954d37b530e2e768d63750a9b8228cd1b113b84` | `hydra` / `hydra dot fun` | `solana` | `D9dPoQhg7psayT2xdtpskmCAUgnPPA4jkN9TCXLapump` | `5VF3d9uYFA8oC8JCVWRX5YXvaeRu2cRwdCKxDRNUpvsf` | `pumpswap` | `https://dexscreener.com/solana/5vf3d9uyfa8oc8jcvwrx5yxvaeru2crwdckxdrnupvsf` |
| 2 | `c5115b98a4e7c8d2a59acecb942d29d8c3c332ba33e79abfe3e2621e200cd242` | `VLAD` / `Robinhood Man` | `robinhood` | `0x0265C7566b47c942a0d0A046A882720e5F389a08` | `0x91163299312e8e51433712e6A4A76ADd9576EAc5` | `uniswap` | `https://dexscreener.com/robinhood/0x91163299312e8e51433712e6a4a76add9576eac5` |
| 3 | `86c444545166e2de949ac080133db706c78072774fcb95d894bd850948f3919b` | `STX` / `Stoxes RWA` | `robinhood` | `0x9Af220E6e234Ba4b838087DCE00B6A39E3035AFE` | `0x5Edc718eeda61F87984FF07F89f5c9A1dB0C1E44` | `pancakeswap` | `https://dexscreener.com/robinhood/0x5edc718eeda61f87984ff07f89f5c9a1db0c1e44` |
| 4 | `81d7ce6d2da9d567bac087515787fb16523d9519cee92c8ad80fcbbfcf9fe35e` | `BACKED` / `Backed` | `robinhood` | `0x7168563B0E70124f0C7c0cF2F13a8D1861BAf4A5` | `0x537217eb9534d5d606bff54f8b807df65ce48678877ee3151f92f26bb94c1243` | `uniswap` | `https://dexscreener.com/robinhood/0x537217eb9534d5d606bff54f8b807df65ce48678877ee3151f92f26bb94c1243` |
| 5 | `6205da358186b21035b8a94f0fdb636d9316d768cf5c11693138d022e10803e6` | `AAPLCAT` / `Apple Cat` | `robinhood` | `0x3918866d9097e4aD26184AAD167C43Dc5a1C6db9` | `0x07322cD528bcc592d6e1E57500cF0c2d043Cd540` | `uniswap` | `https://dexscreener.com/robinhood/0x07322cd528bcc592d6e1e57500cf0c2d043cd540` |
| 6 | `56c0d9ac02524875e499bf14d37f17d2f36d86510ba881d4b5d8a40e0077da9b` | `LAHENNIG` / `Lee Ann Hennig` | `robinhood` | `0x50CDafE7A672496f5E54dd3907AC6d114FC58888` | `0xc82558261A4a50cFA46F6e5DDD525355a08DC9B5` | `uniswap` | `https://dexscreener.com/robinhood/0xc82558261a4a50cfa46f6e5ddd525355a08dc9b5` |
| 7 | `c89827b6181c381309153c3c5dad00ad0f28f08094562144d0d5d9a329afe3a9` | `P-STOCK` / `P-STOCK` | `solana` | `Eu6qZW1szu4vWpHqWFLv6CbPr8xEYzSaHRGdyCe8pump` | `8bNBzDboqCdaLc15UgKc2eYNqFkKFbcaEEYsm9RZpW7d` | `pumpswap` | `https://dexscreener.com/solana/8bnbzdboqcdalc15ugkc2eynqfkkfbcaeeysm9rzpw7d` |

### Metryki i status

| # | `price_usd` | `market_cap_usd` | `fdv_usd` | `liquidity_usd` | `volume_24h_usd` | `volume_market_cap_ratio` | `pair_created_at` | `pair_age_days` | `status` |
|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| 1 | `0.00005113` | `51,131` | `51,131` | `16,518.50` | `57,676.03` | `1.128005` | `2026-07-17T20:05:53.000Z` | 0 | `rejected_basic_filter` |
| 2 | `0.000108` | `108,065` | `108,065` | `31,381.47` | `75,982.56` | `0.703119` | `2026-07-17T19:56:12.000Z` | 0 | `rejected_basic_filter` |
| 3 | `0.0004399` | `439,945` | `439,945` | `51,091.46` | `59,288.75` | `0.134764` | `2026-07-16T16:37:57.000Z` | 1 | `rejected_basic_filter` |
| 4 | `0.0000131` | `13,102` | `13,102` | `13,943.49` | `6,145.84` | `0.469076` | `2026-07-17T13:09:57.000Z` | 0 | `rejected_basic_filter` |
| 5 | `0.00002214` | `22,142` | `22,142` | `12,767.55` | `63,643.12` | `2.874317` | `2026-07-17T19:49:29.000Z` | 0 | `rejected_basic_filter` |
| 6 | `0.00006917` | `69,175` | `69,175` | `22,683.62` | `36,348.15` | `0.525452` | `2026-07-17T19:37:15.000Z` | 0 | `rejected_basic_filter` |
| 7 | `0.000001498` | `1,498` | `1,498` | `2,811.74` | `11,184.00` | `7.465955` | `2026-07-17T20:04:32.000Z` | 0 | `rejected_basic_filter` |

### Powody filtrowania

| # | wszystkie `filter_reasons` | hard reject reasons | soft reasons | główny powód | liczba hard |
|---:|---|---|---|---|---:|
| 1 | `market_cap_below_300000`; `liquidity_below_30000`; `volume_market_cap_ratio_above_100_percent`; `volume_market_cap_ratio_outside_sweet_spot_5_30_percent`; `pair_age_not_above_7_days`; `pair_age_outside_preferred_14_90_days` | market cap; liquidity; ratio >100%; age | ratio sweet spot; preferred age | `market_cap_below_300000` | 4 |
| 2 | `market_cap_below_300000`; `volume_market_cap_ratio_outside_sweet_spot_5_30_percent`; `pair_age_not_above_7_days`; `pair_age_outside_preferred_14_90_days` | market cap; age | ratio sweet spot; preferred age | `market_cap_below_300000` | 2 |
| 3 | `pair_age_not_above_7_days`; `pair_age_outside_preferred_14_90_days` | age | preferred age | `pair_age_not_above_7_days` | 1 |
| 4 | `market_cap_below_300000`; `volume_24h_below_30000`; `liquidity_below_30000`; `volume_market_cap_ratio_outside_sweet_spot_5_30_percent`; `pair_age_not_above_7_days`; `pair_age_outside_preferred_14_90_days` | market cap; volume; liquidity; age | ratio sweet spot; preferred age | `market_cap_below_300000` | 4 |
| 5 | `market_cap_below_300000`; `liquidity_below_30000`; `volume_market_cap_ratio_above_100_percent`; `volume_market_cap_ratio_outside_sweet_spot_5_30_percent`; `pair_age_not_above_7_days`; `pair_age_outside_preferred_14_90_days` | market cap; liquidity; ratio >100%; age | ratio sweet spot; preferred age | `market_cap_below_300000` | 4 |
| 6 | `market_cap_below_300000`; `liquidity_below_30000`; `volume_market_cap_ratio_outside_sweet_spot_5_30_percent`; `pair_age_not_above_7_days`; `pair_age_outside_preferred_14_90_days` | market cap; liquidity; age | ratio sweet spot; preferred age | `market_cap_below_300000` | 3 |
| 7 | `market_cap_below_300000`; `volume_24h_below_30000`; `liquidity_below_30000`; `volume_market_cap_ratio_above_100_percent`; `volume_market_cap_ratio_outside_sweet_spot_5_30_percent`; `pair_age_not_above_7_days`; `pair_age_outside_preferred_14_90_days` | market cap; volume; liquidity; ratio >100%; age | ratio sweet spot; preferred age | `market_cap_below_300000` | 5 |

## Rejection reason matrix i rozkłady

| Hard reason | hydra | VLAD | STX | BACKED | AAPLCAT | LAHENNIG | P-STOCK | Razem |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `pair_age_not_above_7_days` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 7 |
| `market_cap_below_300000` | 1 | 1 | 0 | 1 | 1 | 1 | 1 | 6 |
| `liquidity_below_30000` | 1 | 0 | 0 | 1 | 1 | 1 | 1 | 5 |
| `volume_market_cap_ratio_above_100_percent` | 1 | 0 | 0 | 0 | 1 | 0 | 1 | 3 |
| `volume_24h_below_30000` | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 2 |

- jeden hard reason: `1/7`; dwa lub więcej: `6/7`;
- brakujące dane: `0/7`; FDV fallback: `0/7`;
- chain: `robinhood=5`, `solana=2`.

| Metryka | Min | Mediana | Max | Rozkład progowy |
|---|---:|---:|---:|---|
| market cap / FDV | `1,498` | `51,131` | `439,945` | `<200k: 6`, `300k–10m: 1` |
| liquidity | `2,811.74` | `16,518.50` | `51,091.46` | `<20k: 4`, `20–30k: 1`, `>=30k: 2` |
| volume 24h | `6,145.84` | `57,676.03` | `75,982.56` | `<20k: 2`, `>=30k: 5` |
| pair age | `0` | `0` | `1` dzień | `0–3 dni: 7` |
| volume/market-cap ratio | `13.48%` | `70.31%` | `746.60%` | `5–30%: 1`, `>30–100%: 3`, `>100%: 3` |

## Warianty A–E

| Wariant | Zmiana względem baseline | Snapshot 7 | Live 30 seedów | Ryzyko |
|---|---|---:|---:|---|
| A | brak | 0 | 0 | baseline |
| B | liquidity `30k → 20k` | 0 | 0 | mniejsza głębokość, większy slippage |
| C | volume i liquidity `30k → 20k` | 0 | 0 | mniejsza aktywność i głębokość |
| D | market cap `200k–15m`, volume/liquidity `20k` | 0 | 0 | szerszy cap i słabsza jakość obrotu |
| E | pair age `>7 → >3 dni` | 0 | 0 | krótsza historia i mniej dojrzała płynność |

Żaden wariant nie przepuszcza kandydata i żaden wynik nie opiera się na pojedynczym wyjątku. Nie dodano losowych wariantów. Próg `>0` przepuściłby pojedynczego `STX` z historycznego snapshotu, ale byłaby to kalibracja na jeden wyjątek bez dowodu stabilności.

## Discovery-only diagnostic — 30 seedów

Jedyny run: `2026-07-18T15:26:58.564Z`.

| Miara | Wynik |
|---|---:|
| profiles loaded / poprawne seedy | `30 / 30` |
| pair groups / pairs loaded | `30 / 54` |
| selected pairs / dropped before normalization | `20 / 34` |
| candidates normalized / baseline pass | `20 / 0` |
| profile bez matching token pair | `2` |
| profile bez usable/positive-liquidity pair | `10 / 10` |
| highest-liquidity selection valid | `true` |
| DexScreener requests / retries / failures | `34 / 3 / 0`, budżet `36` |
| security/context requests | `0 / 0` |
| publish / raw storage | `false / false` |

Seed chains: `solana=15`, `robinhood=12`, `bsc=1`, `base=1`, `polygon=1`. Kandydaci: `solana=7`, `robinhood=10`, `bsc=1`, `base=1`, `polygon=1`.

Missing fields: `pair_created_at=1`, `pair_age_days=1`; wszystkie pozostałe badane pola, w tym market cap, FDV, volume i liquidity: `0`.

| Hard reason live | Liczba |
|---|---:|
| `pair_age_not_above_7_days` | 19 |
| `market_cap_below_300000` | 18 |
| `liquidity_below_30000` | 17 |
| `volume_market_cap_ratio_above_100_percent` | 14 |
| `volume_24h_below_30000` | 6 |
| `volume_market_cap_ratio_below_1_percent` | 2 |
| `market_cap_above_10000000` | 1 |
| `pair_age_missing` | 1 |

Wiek: `17` kandydatów `0–3` dni, `2` dokładnie `7` dni, `1` brak. Wszystkich `20/20` nie spełnia baseline age, a jeden odpada wyłącznie przez wiek. To dowodzi konfliktu `latest profiles` vs `pair age >7`.

## Jakość discovery i oficjalne API

`latest token profiles` jest dobrym strumieniem nowych/emerging profili, ale nie reprezentatywną próbką celu „established small cap”. Dobór najwyższej liquidity per token działa prawidłowo; problem powstaje na etapie seed population.

Oficjalna dokumentacja opisuje `latest profiles`, pule/adresy znanych tokenów oraz `GET /latest/dex/search?q=...`, ale nie ogólny endpoint „established small caps”. Źródło: [DexScreener API Reference](https://docs.dexscreener.com/api/reference).

`tokens/v1` może wzbogacić znane adresy, ale nie rozwiązuje seed generation. Search API może być podstawą bounded prototypu, lecz query plan wprowadza bias i wymaga owner acceptance.

## Rekomendowane discovery, progi i ryzyko

1. `new/emerging`: zachować `latest profiles`; brak starszych kandydatów jest prawidłowym wynikiem tego koszyka.
2. `established-small-cap`: nieaktywny prototyp `npm run discovery:prototype -- --query "<owner-approved-query>"`. Używa oficjalnego search API, wybiera najwyższą liquidity per chain/base token, nie publikuje i nie ma domyślnego query.
3. Po akceptacji query planu wykonać osobny przyszły bounded validation run. Nie wykonywać go w 12R.5A — limit jednego live diagnostic został wykorzystany.

Aktywny profil pozostaje `dexscreener_basic_filters_v1`; diagnostyczne warianty mają wersję `filter_calibration_12r5a_v1`. Nie proponuje się calibrated production profile. Obniżenie liquidity/volume i rozszerzenie market cap nie pomaga, a live próbka zawiera 18/20 tokenów poniżej 300k oraz 14/20 z ratio powyżej 100%, więc liberalizacja zwiększałaby udział słabych tokenów.

## Elementy wymagające owner acceptance

1. Dwa kosze discovery: `new/emerging` i `established-small-cap`.
2. Jawna lista queries/chains/quote assets dla established prototype.
3. Zgoda na jeden osobny przyszły bounded live validation run prototypu.
4. Decyzja, czy rzadkie wyniki przy baseline są akceptowalne; obecne dane nie uzasadniają zmiany progów.
5. Dopiero po danych z established basket — ewentualna decyzja o wersjonowanym profilu calibrated.

## Narzędzia i walidacja

```powershell
npm run filters:calibrate -- --snapshot output/scan_20260717201111_bfd5fb1d/full_output.json
npm run discovery:diagnostic -- --seed-limit 30
npm run discovery:prototype -- --query "<owner-approved-query>"
```

- Data PoC: `133/133` testy; source registry: valid, `21` źródeł;
- fail-closed boundary: `34/34` testy;
- calibration/diagnostic/prototype tests, typecheck i build: pass;
- UI contract, UI typecheck i `INTERNAL_BETA` build boundary: pass;
- `check-ui-mock`, `check-preview-launchers`, `check-local-mvp`, `check-local-rc`: pass;
- `git diff --check`: pass.

## Decyzja etapu

- Implementacja 12R.5A: **GO / kompletna**.
- Przejście do 12R.5B: **NO-GO do owner acceptance**; po akceptacji **GO**.
- Aktywny profil filtrów: **niezmieniony**.
- VPS: **bez zmian**.
- Tester zewnętrzny: **NO-GO**.
