# 12R.5 — Discovery Closure

Data decyzji: 19.07.2026

Status: **DISCOVERY CLOSED FOR CAMP 2026**

Discovery dla CAMP zostaje zamknięte na dwóch jawnych koszykach. System nie jest i nie może być przedstawiany jako automatyczny globalny skaner rynku. Po tym etapie nie powstaje kolejny etap discovery, kolejny query experiment ani nowy profil filtrów.

## Finalna architektura

### `new_emerging`

- źródło: oficjalne DexScreener latest token profiles oraz token-pairs;
- `discovery_method=dexscreener_latest_token_profiles`;
- `observation_only=true`;
- `established_eligible=false`;
- brak automatycznego dodawania do established universe;
- brak GoPlus wyłącznie z powodu obecności w koszyku obserwacyjnym;
- nowość tokena nie jest pozytywną kwalifikacją ani rekomendacją.

### `established`

- źródło tożsamości: `chain + contract_address` z `config/established_address_universe_v1.json`;
- dane rynkowe: oficjalny `GET /token-pairs/v1/{chainId}/{tokenAddress}` DexScreener;
- `discovery_method=address_seeded_universe`;
- najwyższa poprawna `liquidity.usd` dla dokładnie skonfigurowanego adresu;
- obsługa adresu po stronie `baseToken` i `quoteToken`; pola ceny/wyceny base-scoped nie są przypisywane tokenowi quote-side;
- deduplikacja: chain, configured contract address, pair address;
- `address_identity_verified=true` potwierdza wyłącznie zgodność configu z odpowiedzią providera, a nie bezpieczeństwo tokena;
- po niezmienionych basic filters uruchamiany jest wyłącznie GoPlus.

## Kontrakt universe

Kanoniczny config ma wersję `established_address_universe_v1`, status `OWNER_MAINTAINED`, `production_enabled=true`, provider `dexscreener`, identity method `CHAIN_AND_CONTRACT_ADDRESS` i maksymalnie 100 wpisów. Commitowany config zawiera **0 aktywnych wpisów**.

Wpis zawiera `chain`, `contract_address`, `enabled`, `added_at`, `added_by` oraz opcjonalne `display_label` i `notes`. Wspierane sieci: Ethereum, BSC, Base, Arbitrum, Polygon, Avalanche i Solana. Robinhood oraz nieznane sieci są odrzucane. Adresy EVM muszą mieć 20 bajtów w hex, a Solana poprawne 32 bajty base58. Duplikaty `chain+address`, nieznana wersja, nieznane pola i błędny wpis kończą walidację fail-closed.

Offline workflow:

```powershell
npm run universe:validate
npm run universe:list
```

Uzupełnianie listy jest operacyjną zmianą wersjonowanego configu. Nie wykonuje provider calls, symbol lookup ani automatycznego importu z latest profiles.

## Empty universe i readiness

Pusty albo całkowicie wyłączony universe jest poprawnie skonfigurowanym stanem `ESTABLISHED_UNIVERSE_EMPTY`. Collector zwraca pustą listę established, nie uruchamia fetch dla universe, nie używa fixture i nadal może zebrać `new_emerging` oraz context.

Snapshot i `/api/readiness` rozróżniają:

- process `READY`;
- new/emerging `READY`;
- established `EMPTY_CONFIGURED` z reason code `ESTABLISHED_UNIVERSE_EMPTY`;
- context `READY` albo `UNAVAILABLE`.

Stan pusty nie jest przedstawiany jako zdrowa lista established candidates, ale sam w sobie nie blokuje gotowości procesu i koszyka obserwacyjnego.

## GoPlus

GoPlus jest jedynym automatycznym źródłem security w tym przepływie. Jest wywoływany wyłącznie dla `established` po `dexscreener_basic_filters_v1`. Brak wyniku jest prezentowany jako `SECURITY DATA UNAVAILABLE`; nie istnieje etykieta `Safe Token` ani `Verified Safe`. Snapshot przechowuje tylko znormalizowane pola, a `raw_storage=denied`. Honeypot.is nie jest wywoływany.

## Snapshot i API

Snapshot pozostaje `mode=live`, `environment=INTERNAL_BETA`, `fixture_used=false`, bez scorecards i raw payloadów. Każdy candidate ma allowlisted basket metadata: basket, method, observation flag, established eligibility, universe version/index oraz address identity flag. Provenance zawiera wyłącznie faktycznie użyte source IDs i aktualne request counts. UI/API reader zachowuje te pola i nadal egzekwuje granicę 12R.3.

## Symbol-based plan

`config/established_discovery_query_plan_v1.json` ma status **`NO_GO_QUERY_PLAN`** i `production_enabled=false`. Nie jest importowany ani dostępny z produkcyjnego collectora. Pozostaje wyłącznie historycznym, archiwalnym testem regresyjnym i komendą `discovery:archived-query-plan:diagnostic`.

## Zamrożone filtry

Aktywny profil pozostaje `dexscreener_basic_filters_v1`: market cap 300k–10m, volume 24h minimum 30k, liquidity minimum 30k, ratio 0.01–1 i pair age `>7` dni. Warianty B–E nie są aktywowane. Scoring, `final_label` i `WATCHLIST = Manual Review Only` pozostają bez zmian.

## Kontrolowany live smoke

Jedyny run wykonano 19.07.2026 po pełnej bramce offline, z lokalnym niecommitowanym universe zawierającym Ethereum WETH i USDC. DexScreener zakończył się `DEXSCREENER_NETWORK_ERROR` po dozwolonym retry; run nie został powtórzony i nie użyto fixture. Awaria nastąpiła przed normalizacją kandydatów, dlatego live base/quote orientation nie została potwierdzona, a GoPlus pozostał `NOT_INVOKED` w tym runie. Failing DexScreener request wykorzystał 2 próby; ze względu na równoległy start dwóch adresów i przerwanie procesu dokładny łączny licznik nie został wyemitowany, przy hard budget `4`. GoPlus, Honeypot.is, Alternative.me i DefiLlama wykonały 0 potwierdzonych wywołań. Nie opublikowano snapshotu i nie zapisano raw payloadów.

CLI został następnie utwardzony tak, aby przyszły technical diagnostic raportował per-source counters oraz wynik GoPlus również przy niezależnej awarii DexScreener. Nie uruchomiono go ponownie w tym etapie.

## Obowiązkowy fallback i wyłączenia

Niezależnie od wyniku smoke finalnym mechanizmem established dla CAMP pozostaje address universe. Pusty config pokazuje jawny empty state, a owner/team może później dodać adresy operacyjnie. Wyłączone przed CAMP pozostają: symbol search discovery, scraping, nowi/płatni providerzy, Honeypot.is calls, fixture fallback, raw provider storage, auto-trading, rekomendacje inwestycyjne, AI KINTEL, scheduler, VPS changes i dalsze eksperymenty discovery.

VPS pozostaje bez zmian. Tester zewnętrzny pozostaje `NO-GO`.

## Następny etap

Następny i bezwarunkowy etap to **Product Radar Build & Owner Acceptance**, deadline 27.07.2026.
