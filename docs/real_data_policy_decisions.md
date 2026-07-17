# 12R.2 — Real Data Policy & Environment Decisions

## Metryka decyzji

| Pole | Wartość |
|---|---|
| Repozytorium | `pawelkrynicki/crypto-edge-ai` |
| Bazowy `main` | `3d639919bb70cba22b9e0fa534ea9f3ca41cc23a` |
| Data decyzji | 15.07.2026 |
| Status | **zaakceptowane przez ownera** |
| Środowisko docelowe | `INTERNAL_BETA` na `https://cryptoedge.crmallintraders.pl` |
| Stan testu zewnętrznego | **wstrzymany — NO-GO** |
| Następny etap | **12R.4 — Approved Live Collectors & Normalized Snapshot** |

## 1. Charakter i pierwszeństwo dokumentu

Ten dokument formalnie zamyka pytania decyzyjne wskazane w `docs/real_data_readiness_audit.md` po etapie 12R.1. Jest normatywnym źródłem zaakceptowanej polityki real-data dla `INTERNAL_BETA`.

Akceptacja decyzji nie oznacza, że źródła zostały aktywowane albo że bieżący runtime już je egzekwuje. Rejestr źródeł, runtime policy, API, frontend i konfiguracja VPS pozostają bez zmian w 12R.2. Do czasu wdrożenia oraz weryfikacji granicy fail-closed w 12R.3 system ma odmawiać publikacji danych, których nie potrafi udowodnić jako dozwolone, rzeczywiste i aktualne.

## Aktualizacja wykonawcza 12R.3 — 16.07.2026

Decyzje 12R.2 zostały technicznie zakodowane w granicy odczytu/publikacji opisanej w `docs/real_data_api_contract.md`:

- product runtime rozróżnia wyłącznie jawne `DEVELOPMENT_DEMO` i `INTERNAL_BETA`; brak/nieznana wartość fail-closed;
- manifest `real_data_boundary_v1` jest obowiązkowy dla danych dopuszczanych do `INTERNAL_BETA` i jest porównywany z runtime policy;
- DexScreener, GoPlus i Honeypot.is otrzymały zatwierdzone gates `INTERNAL_BETA` w registry/runtime policy, bez aktywacji i bez provider calls;
- scanner/context API publikuje wyłącznie allowlisty, egzekwuje SLA i zwraca 503 z reason code zamiast fixture fallback;
- frontend `INTERNAL_BETA` korzysta tylko z API, nie pokazuje selektorów sample ani demo navigation;
- etap wykonano całkowicie offline; VPS pozostał bez zmian.

To nie jest aktywacja źródeł ani potwierdzenie gotowości danych. Do czasu 12R.4 oczekiwanym stanem `INTERNAL_BETA` bez poprawnego live snapshotu jest `Data Unavailable` / 503.

## Aktualizacja wykonawcza 12R.4 — 16.07.2026

Ta aktualizacja ma pierwszeństwo przed historycznymi zapisami 12R.2/12R.3:

- aktywne źródła `INTERNAL_BETA` to `dexscreener`, `goplus_security` (tylko gdy faktycznie wywołane), `alternative_me_fng` i `defillama_api`;
- `honeypot_is` zachowuje `access_status=PENDING_TERMS_REVIEW`, ale jest `MANUAL_LINK_ONLY / blocked pending written permission`; `INTERNAL_BETA` usunięto z `live_fetch`, `normalized_storage` i `user_display`;
- GoPlus jest jedynym aktywnym źródłem security, więc brak Honeypot.is nie oznacza `PARTIAL SECURITY COVERAGE`;
- DexScreener discovery używa latest token profiles i per-token pairs, 20 seedów domyślnie / 30 maksymalnie oraz 10 / 20 kandydatów security po basic filters;
- transport ma timeout 10 s, concurrency 3, maksymalnie jeden retry i twarde budżety: DexScreener 26/36, GoPlus 13/23, Alternative.me 2, DefiLlama 2;
- publikowane są wyłącznie normalized snapshots; walidacja poprzedza temporary write i atomic rename, collision `run_id` nie nadpisuje pliku;
- nie dodano schedulera, retention cleanup ani zmian VPS.

Kanoniczna komenda: `npm run collect:internal-beta`; walidacja bez sieci: `npm run snapshot:validate:latest` w `tools/data-poc`.

Następny etap: **12R.5 — Product Radar Redesign & Local Owner Review**.

## 2. Environment

- VPS `cryptoedge.crmallintraders.pl` jest środowiskiem `INTERNAL_BETA`.
- `PUBLIC_BETA` pozostaje wyłączone.
- Dostęp testera zewnętrznego pozostaje wstrzymany.
- Prywatny adres ani access gate nie zmieniają środowiska na `LOCAL_POC` i nie mogą służyć do obejścia polityki.

## 3. Token discovery

| Decyzja | Zasada |
|---|---|
| Source | DexScreener API |
| `live_fetch` | dozwolone w `INTERNAL_BETA` |
| `normalized_storage` | dozwolone w `INTERNAL_BETA` |
| `user_display` | dozwolone wyłącznie dla zatwierdzonych, znormalizowanych pól z jawnej allowlisty |
| `raw_storage` | zabronione |
| Brak odpowiedzi API | `Data Unavailable` |
| Fallback | brak fixture fallback i brak innego automatycznego źródła zastępczego |

Allowlista pól widocznych użytkownikowi musi zostać jawnie zakodowana i przetestowana w 12R.3. Brak pola na allowliście oznacza brak prawa do jego publikacji. Odpowiedź providera może być przetwarzana w pamięci tylko w zakresie potrzebnym do normalizacji; surowy payload nie może zostać utrwalony.

## 4. Security

- GoPlus Token Security API jest źródłem primary.
- Honeypot.is jest źródłem secondary.
- Źródła security są wywoływane dla kandydatów podczas skanu.
- `live_fetch` jest dozwolone wyłącznie dla kandydatów podczas skanu.
- `normalized_storage` jest dozwolone wyłącznie dla zatwierdzonych pól wyniku, statusu, źródła i czasu sprawdzenia.
- `user_display` jest dozwolone wyłącznie dla zatwierdzonych pól z allowlisty oraz poniższych statusów.
- Brak wyniku, błąd albo niepełna odpowiedź nie oznaczają bezpieczeństwa.
- Dozwolone statusy prezentowane użytkownikowi to wyłącznie:
  - `CRITICAL RISK`;
  - `NEEDS MANUAL VERIFICATION`;
  - `SECURITY DATA UNAVAILABLE`;
  - `PARTIAL SECURITY COVERAGE`.
- Komunikaty `Safe Token`, `Verified Safe` oraz równoważne pozytywne zapewnienia są zabronione.
- Raw provider payload storage jest zabronione.
- Awaria jednego lub obu źródeł nie usuwa automatycznie kandydata. Musi skutkować jawnym statusem braku albo częściowego pokrycia.

Statusy security są warstwą pokrycia i ryzyka. 12R.2 nie zmienia scoringu, `final_label` ani znaczenia `WATCHLIST`.

## 5. SLA i świeżość

| Dataset / source | Collect interval | Maksymalny wiek danych uznawanych za fresh |
|---|---:|---:|
| DexScreener scanner | 15 minut | 30 minut |
| GoPlus Token Security API | dla kandydatów podczas skanu | 30 minut od wyniku |
| Honeypot.is | dla kandydatów podczas skanu | 30 minut od wyniku |
| Alternative.me | 6 godzin | 30 godzin |
| DefiLlama | 2 godziny | 6 godzin |

Wiek jest liczony od źródłowego `fetched_at`/`checked_at`, a nie od czasu odczytu przez API lub załadowania ekranu. Nieparsowalny, brakujący albo niedopuszczalnie przyszły timestamp nie może zostać uznany za fresh.

## 6. Degraded i last-known-good

- Skan DexScreener starszy niż 30 minut nie może być pokazany jako aktualny.
- Po przekroczeniu SLA bieżąca wartość ma status `Data Unavailable`.
- Awaria security source nie usuwa kandydata; daje jawny status braku albo częściowego pokrycia.
- Poprzedni pozytywny security result wygasa po 30 minutach i nie może dalej wspierać pozytywnej interpretacji.
- Context może używać last-known-good wyłącznie w granicach SLA i ze statusem `DEGRADED`.
- Po przekroczeniu SLA context jest niedostępny.
- Nie istnieje automatyczny fixture fallback dla scanner, security ani context.

Last-known-good nie zeruje wieku, nie zmienia źródłowego czasu pobrania i nie może być oznaczony jako healthy/fresh tylko dlatego, że API odczytało go ponownie.

## 7. Product mode

Build przeznaczony dla `cryptoedge.crmallintraders.pl` działa wyłącznie w real-data mode.

W buildzie VPS nie mogą być dostępne:

- `Built-in sample`;
- `Local data file`;
- `PASS`, `LOWL`, `FDV`;
- `Trusted Preview`;
- `Webinar Teaser`;
- demo/mock surfaces;
- panele developerskie w głównym menu.

Brak danych musi dawać jawny empty/error state. Główne menu wersji dla testera jest ograniczone do:

- `Radar`;
- `Szczegóły`;
- `Weryfikacja`;
- `Metodologia`.

Demo jest dozwolone wyłącznie jako osobny, jawny development mode i nie może być dostępne w buildzie VPS ani osiągalne przez jego runtime data path.

## 8. Checklisty acceptance

### 8.1 Akceptacja decyzji 12R.2

- [x] VPS sklasyfikowano jako `INTERNAL_BETA`.
- [x] `PUBLIC_BETA` pozostawiono wyłączone, a testera zewnętrznego wstrzymano.
- [x] Zatwierdzono DexScreener jako źródło token discovery i określono dozwolone akcje.
- [x] Zatwierdzono GoPlus jako primary i Honeypot.is jako secondary security source.
- [x] Zatwierdzono SLA, reguły degraded/last-known-good i brak fixture fallback.
- [x] Zatwierdzono real-data-only product mode oraz rozdzielenie development demo.
- [x] Zatwierdzono bramki dostępu testera i wymagany scenariusz ownera.

### 8.2 Bramka dostępu testera zewnętrznego

Wszystkie pozycje poniżej są obowiązkowe. Do czasu ich spełnienia obowiązuje `NO-GO`.

- [ ] Landing page jest prawdziwym Radarem z real-data, bez demo i fixture.
- [ ] Radar pokazuje prawdziwe symbole, sieci, kontrakty i source URLs.
- [ ] Widoczne są rzeczywisty czas skanu, wiek danych i użyte źródła.
- [ ] Każdy kandydat ma czytelny powód znalezienia.
- [ ] Ryzyka, braki danych oraz częściowe lub niedostępne pokrycie security są czytelne.
- [ ] Zweryfikowano brak fixture leakage w danych, API, UI i buildzie VPS.
- [ ] Główne menu zawiera wyłącznie `Radar / Szczegóły / Weryfikacja / Metodologia`.
- [ ] Owner przeszedł `Radar → Szczegóły → Weryfikacja → Manual Review`.
- [ ] Owner przekazał jawny komunikat: „akceptuję wersję dla testera”.
- [ ] Dopiero po spełnieniu wszystkich powyższych warunków tester zewnętrzny otrzymał dostęp.

## 9. Zakres wyłączony z 12R.2

W tym etapie nie wykonuje się:

- provider calls;
- zmian VPS ani wdrożenia;
- aktywacji źródeł;
- zmiany scoringu;
- zmiany `final_label`;
- implementacji AI KINTEL;
- automatycznego lub ręcznego fixture fallback w buildzie VPS.

## 10. Następny etap

Następny etap to **12R.4 — Approved Live Collectors & Normalized Snapshot**.

12R.3 technicznie wyegzekwował target environment, action gates dla fetch/storage/display, allowlistę odpowiedzi, freshness SLA, jawne degraded/unavailable states, brak fixture fallback oraz rozdzielenie product real-data mode od development demo. 12R.4 może dodać wyłącznie jawnie zatwierdzone collectory i znormalizowaną, atomowo publikowaną migawkę; nie może osłabić granicy 12R.3 ani samodzielnie autoryzować zmian VPS.
