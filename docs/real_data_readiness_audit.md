# 12R.1 — Real Data Readiness Audit

## Metryka etapu

| Pole | Wartość |
|---|---|
| Repozytorium | `pawelkrynicki/crypto-edge-ai` |
| Bazowy `main` | `dfe329f6eef9cc97bf794f362e19c0b617ad91b6` |
| Branch audytu | `codex/real-data-readiness-audit` |
| Data audytu | 14.07.2026 |
| Aktualizacja decyzji | 12R.2, 15.07.2026, bazowy `main` `3d639919bb70cba22b9e0fa534ea9f3ca41cc23a` |
| Deadline CAMP | 31.08.2026 |
| Cel runtime | prywatny frontend VPS: `https://cryptoedge.crmallintraders.pl`, lokalnie `127.0.0.1:4180` |
| Werdykt | **NO-GO — nie wznawiać testu zewnętrznego** |

## Aktualizacja 12R.2 — decyzje ownera

Owner zaakceptował decyzje polityczne opisane w `docs/real_data_policy_decisions.md`:

- VPS `cryptoedge.crmallintraders.pl` jest `INTERNAL_BETA`; `PUBLIC_BETA` i dostęp testera zewnętrznego pozostają wyłączone;
- DexScreener jest źródłem token discovery z dozwolonym `live_fetch`, `normalized_storage` i `user_display` wyłącznie zatwierdzonych pól; `raw_storage` jest zabronione;
- GoPlus jest primary, a Honeypot.is secondary security source; brak lub niepełność danych nie może zostać przedstawiona jako bezpieczeństwo;
- zatwierdzono SLA, reguły `DEGRADED`/last-known-good, `Data Unavailable` po przekroczeniu SLA i całkowity brak automatycznego fixture fallback;
- build VPS ma działać wyłącznie w real-data mode, a demo pozostaje osobnym development mode niedostępnym w buildzie VPS;
- tester pozostaje zablokowany do spełnienia checklisty i jawnego komunikatu ownera: „akceptuję wersję dla testera”.

Ta aktualizacja zamyka pytania decyzyjne, ale nie usuwa luk implementacyjnych wykrytych w 12R.1. Registry, runtime policy, kod, providery i VPS nie zostały zmienione. Werdykt dla testera pozostaje `NO-GO`, a następnym etapem jest **12R.3 — Fail-Closed Real Data Boundary**.

## Aktualizacja 12R.3 — granica fail-closed

16.07.2026 wdrożono offline granicę publikacji bez uruchamiania providerów i bez zmian VPS. Zamknięto implementacyjnie luki RDR-F01, F02, F03, F05, F06, F07, F08, F10, F12, F14 i F16 w zakresie granicy odczytu/API/frontendu:

- `CRYPTO_EDGE_RUNTIME_MODE` rozdziela `DEVELOPMENT_DEMO` od `INTERNAL_BETA`; missing/invalid jest `UNCONFIGURED` i fail-closed;
- scanner/context wymagają wersjonowanego provenance manifestu, pełnych decyzji policy i zgodności z checked-in runtime policy;
- allowlisty usuwają raw/unknown fields oraz ścieżki hosta;
- SLA jest egzekwowane od `generated_at`/`finished_at`/`fetched_at`/`checked_at` z pięciominutową tolerancją zegara;
- API rozdziela `/api/health` od `/api/readiness`, zwraca 503 z reason codes i nigdy nie wraca do fixture w `INTERNAL_BETA`;
- frontend `INTERNAL_BETA` ma API-only data path, zero sample candidates po błędzie i ograniczoną nawigację produktu;
- testy obejmują fixture leakage, brak/wersję manifestu, policy denial, unknown source, freshness, security coverage, sanitizację, health/readiness i jawny demo mode.

Werdykt testera nadal pozostaje `NO-GO`: brak autoryzowanego collectora, atomowej publikacji, VPS API/reverse proxy, soak i owner acceptance. Następny etap to **12R.4 — Approved Live Collectors & Normalized Snapshot**.

## Aktualizacja readiness 12R.4 — 16.07.2026

Lokalna warstwa collector/publisher została wdrożona bez zmian VPS. Historyczne ustalenia poniżej o braku collectora, query `SOL`, nieatomowym zapisie i aktywnym Honeypot.is są zastąpione przez ten stan:

- DexScreener latest profiles → bounded token pairs → najwyższa poprawna płynność → deduplikacja → istniejące basic filters;
- 20/30 seedów i 10/20 security candidates;
- GoPlus jako jedyne aktywne automated security source; Honeypot.is jako `MANUAL_LINK_ONLY / blocked pending written permission`;
- brak GoPlus nie usuwa kandydata i daje `SECURITY DATA UNAVAILABLE`; brak formalnie wyłączonego Honeypot.is nie daje partial coverage;
- live Alternative.me i darmowe DefiLlama bez fixture fallback;
- timeout 10 s, jeden retry, concurrency 3, bounded `Retry-After`, User-Agent, request counters i twardy call budget;
- `scanner_snapshot_v1` / `real_data_boundary_v1`, faktyczne source IDs, runtime-policy decisions, brak raw fields i brak scorecards;
- walidacja przed temporary write, atomic rename i collision protection;
- wszystkie testy offline używają injected fetch/mock transport.

Jeden kontrolowany smoke używa `npm run collect:internal-beta -- --seed-limit 10 --security-limit 3`; offline validation używa `npm run snapshot:validate:latest`. Scheduler, retention, VPS, public deployment i AI KINTEL pozostają poza zakresem.

Pełna walidacja offline z 17.07.2026 przeszła jako `LOCAL MVP RC CHECK OK`: registry, 123 testy data-poc, typecheck, oba storage smoke, workflow/report smoke, UI contracts, 34 testy boundary i build `INTERNAL_BETA`. Opt-in live pozostawał wyłączony podczas całej walidacji.

Po naprawie utraty kontekstu domyślnego `globalThis.fetch` jedyny autoryzowany smoke w tym przebiegu, 17.07.2026, użył `seed-limit=10` i `security-limit=3` i przeszedł jako `scan_20260717201111_bfd5fb1d`. Request counts: DexScreener 13, GoPlus 0, Alternative.me 1, DefiLlama 1. Discovery zwróciło 10 seedów, 13 par, 7 kandydatów przed filtrami i 0 po filtrach. Security coverage jest `NOT_INVOKED`, ponieważ żaden kandydat nie przeszedł basic filters; Honeypot.is wykonał 0 wywołań. DefiLlama ma health `DEGRADED` wyłącznie z powodu jawnego ograniczenia normalized context do 10 rekordów, bez hard failure.

Opublikowane fixture-free snapshoty mają `mode=live`, `environment=INTERNAL_BETA`, właściwe source IDs i `raw_storage=denied`. `snapshot:validate:latest` zwrócił `valid=true`, a lokalne `/api/readiness` zwróciło HTTP 200, scanner/context `ready=true` i pustą listę reason codes. Pliki: `tools/data-poc/output/scan_20260717201111_bfd5fb1d/full_output.json` oraz `tools/data-poc/output/approved_sources_20260717201111_71b5ca78/approved_sources_output.json`. Lokalna bramka operacyjna 12R.4 jest zamknięta; nie oznacza to zgody na zewnętrznego testera ani deployment.

Planowany następny etap: **12R.5 — Product Radar Redesign & Local Owner Review**. VPS pozostaje bez zmian.

## 1. Decyzja audytowa

Repozytorium nie ma dziś kompletnego, automatycznego i zgodnego z polityką przepływu, który może zasilać prywatną wersję VPS wyłącznie rzeczywistymi i aktualnymi danymi.

Istnieją dwa częściowo niezależne przepływy:

1. **Approved context** — `alternative_me_fng` i `defillama_api` mają adaptery live oraz uprawnienia `PUBLIC_BETA`. W lokalnym workspace znajduje się prawidłowy live output z 12.07.2026. Nie ma jednak produkcyjnego harmonogramu na VPS, SLA świeżości, atomowej publikacji ani Scanner API działającego na VPS.
2. **Token scanner** — discovery z DexScreener i security enrichment z GoPlus/Honeypot.is istnieją jako POC, lecz są ograniczone do `LOCAL_POC`. Nie ma live output skanera; jedyny lokalny `full_output.json` ma `mode: "fixture"` i zawiera fikcyjne `PASS`, `LOWL`, `FDV`.

Aktualny API bridge błędnie nazywa ten fixture `real-output`, ponieważ ocenia tylko lokalizację i minimalny kształt pliku, a nie `mode`, środowisko, pochodzenie, uprawnienie do wyświetlenia ani świeżość. Frontend dodatkowo startuje zawsze z built-in fixture i po błędzie API wraca do fixture. Oznacza to, że samo uruchomienie Scanner API na VPS nie rozwiąże problemu i może utrwalić fałszywe poczucie używania realnych danych.

Warunki wznowienia testu zewnętrznego pozostają niespełnione:

- rzeczywiste dane tokenów: **nie**;
- aktualność wymuszana technicznie: **nie**;
- zgodność wszystkich etapów `fetch -> storage -> display`: **nie**;
- fail-closed bez fixture w runtime VPS: **nie**;
- działające Scanner API i collector na VPS: **nie**;
- czytelny, jednoznaczny tryb produktu oparty wyłącznie na realnych danych: **nie**;
- akceptacja właściciela: **nie**.

## 2. Zakres i ograniczenia audytu

Audyt obejmuje:

- `tools/data-poc/README.md`;
- `tools/data-poc/package.json`;
- całe `tools/data-poc/src/`;
- testy i lokalne, zignorowane przez Git outputy `tools/data-poc/output/`;
- `docs/compliance/data_source_registry_v1.json`;
- `docs/compliance/data_source_policy.md`;
- `config/data_source_runtime_policy.json`;
- `tools/ui-mock/src/App.tsx`;
- `tools/ui-mock/src/services/scannerDataSource.ts`;
- `tools/ui-mock/src/services/contextDataSource.ts`;
- kontrakty, adaptery i fixture frontendu;
- `tools/ui-mock/server/scannerApiServer.ts`;
- `tools/ui-mock/server/latestScannerOutput.ts`;
- `tools/ui-mock/server/latestContextOutput.ts`;
- główne powierzchnie UI korzystające z danych albo kontrolowanych mocków;
- testy kontraktowe UI;
- helpery `scripts/win/` i istniejące runbooki.

Fakty dotyczące obecnego wdrożenia VPS — adres publiczny, frontend na `127.0.0.1:4180` i brak Scanner API — pochodzą z briefu etapu. Repozytorium nie zawiera konfiguracji VPS, reverse proxy ani definicji usługi dla tego wdrożenia.

W 12R.1 nie wykonano:

- żadnego wywołania providera;
- aktywacji źródła;
- zmiany source registry albo runtime policy;
- zmiany scoringu, `final_label` albo znaczenia `WATCHLIST`;
- zapisu surowej odpowiedzi providera;
- scrapingu;
- wdrożenia na VPS;
- zmian w AI KINTEL;
- przebudowy frontendu;
- usunięcia fixture;
- merge PR.

## 3. Stan faktyczny end-to-end

### 3.1 Token scanner

```text
manual CLI
  -> runCombinedScannerPoc(mode)
  -> DexScreener search albo fixture
  -> normalizeDexScreenerPairs
  -> basic filters
  -> GoPlus/Honeypot enrichment albo fixture
  -> existing final_label logic
  -> buildPersistableScannerOutput
  -> tools/data-poc/output/<run_id>/full_output.json
  -> GET /api/scanner/latest
  -> scannerDataSource.ts
  -> scannerOutputAdapter.ts
  -> Candidate Results / Detail / Scanner / Manual Review / Risk Flags
```

Stan każdego odcinka:

| Odcinek | Stan | Uwagi |
|---|---|---|
| Discovery | POC | Query-based DexScreener search; domyślnie `SOL`; maksymalnie 3 kandydatów do security enrichment. To nie jest zaplanowany, ciągły skan rynku. |
| Live permission | Tylko `LOCAL_POC` | `dexscreener`, `goplus_security`, `honeypot_is` nie mogą wykonywać `live_fetch` w `INTERNAL_BETA` ani `PUBLIC_BETA`. |
| Normalizacja i filtry | Zaimplementowane | Używają istniejącego scoring/label flow; nie były zmieniane w 12R.1. |
| Security enrichment | POC, best-effort | Błędy providerów są zamieniane na `null`; wynik wymaga manualnej weryfikacji. |
| Persistable output | Zaimplementowany lokalnie | Pliki JSON/JSONL, brak DB, brak atomowego publish, brak produkcyjnego retention. |
| Live artifact | Brak | Jedyny lokalny scanner artifact jest fixture. |
| Collector/scheduler | Brak | Nie ma cron/systemd/PM2 dla standalone VPS. |
| API | Lokalny POC | Nie działa na VPS; ścieżki zależą od `process.cwd()`. |
| Frontend | Fixture-first | Startuje z built-in fixture; API wymaga ręcznego wyboru; błędy wracają do fixture. |

### 3.2 Approved context

```text
manual scripts/win/generate-live-context.cmd
  -> CRYPTO_EDGE_DATA_ENV=PUBLIC_BETA
  -> Alternative.me + DefiLlama adapters
  -> normalized approved_sources_output.json
  -> GET /api/context/latest
  -> contextDataSource.ts
  -> Market Context / Control Center / Candidate context
```

| Odcinek | Stan | Uwagi |
|---|---|---|
| Źródła | Dwa zatwierdzone | `alternative_me_fng`, `defillama_api`. |
| Live fetch | Zaimplementowany | Policy gate jest wykonywany przed `fetch`. |
| Raw storage | Wyłączony | Output jest znormalizowany. |
| Lokalny live artifact | Dostępny | `approved_sources_20260712131021`, `PUBLIC_BETA`, oba źródła `live`, 11 rekordów, 0 błędów. |
| Collector/scheduler VPS | Brak | Istnieje wyłącznie ręczny helper Windows; nie ma usługi Linux/VPS. |
| Freshness SLA | Brak | API wybiera najnowszy poprawny kształt, bez maksymalnego wieku. |
| API | Lokalny POC | Nie działa na VPS. |
| Fallback | Fixture | Brak/niepoprawny output zwraca fixture z HTTP 200. |
| Health propagation | Niepełna | `health_status`, `degraded_external_sources_total` i `hard_failures_total` są usuwane przez sanitizację API. Błędy i warnings pozostają. |

### 3.3 VPS

Aktualnie:

```text
Internet
  -> https://cryptoedge.crmallintraders.pl
  -> frontend na 127.0.0.1:4180
  -X-> brak Scanner API na VPS
  -X-> brak collector/scheduler
  -X-> brak repozytoryjnej konfiguracji reverse proxy / service manager
```

`vite.config.ts` proxyuje `/api` wyłącznie w dev server do `http://localhost:5177`. `vite preview` i statyczny build nie zapewniają produkcyjnego proxy. `VITE_SCANNER_API_URL` jest wartością build-time; ustawienie go na `http://localhost:5177` w buildzie dla VPS skierowałoby przeglądarkę użytkownika do jego własnego localhost. Docelowo potrzebna jest ścieżka same-origin `/api` przekazywana przez reverse proxy do API związanego wyłącznie z loopback.

## 4. Dowody z workspace z 14.07.2026

### 4.1 Workspace

- branch wejściowy: `main`;
- wejściowy `HEAD`: `dfe329f6eef9cc97bf794f362e19c0b617ad91b6`;
- working tree przed audytem: clean;
- branch roboczy: `codex/real-data-readiness-audit`.

### 4.2 Rzeczywisty stan lokalnych artefaktów

Scanner:

```json
{
  "run_id": "scan_20260623073520",
  "mode": "fixture",
  "query": "fixture",
  "symbols": ["PASS", "LOWL", "FDV"]
}
```

Mimo tego `readLatestScannerOutput()` zwraca dla niego:

```json
{
  "source": "real-output",
  "selected_run_id": "scan_20260623073520"
}
```

Jest to bezpośredni dowód, że obecne `_source_meta.source = "real-output"` znaczy „plik znaleziony w output directory”, a nie „dane pochodzą z autoryzowanego live fetch”.

Approved context:

```json
{
  "run_id": "approved_sources_20260712131021",
  "generated_at": "2026-07-12T13:10:21.320Z",
  "environment": "PUBLIC_BETA",
  "modes": ["alternative_me_fng:live", "defillama_api:live"],
  "records_total": 11,
  "errors_total": 0
}
```

Ten output spełnia podstawowe cechy live provenance, ale bez uzgodnionego SLA i technicznej bramki wieku nie wolno automatycznie uznać go za aktualny 14.07.2026 ani później.

### 4.3 Fixture widoczne w produkcie

`tools/ui-mock/public/fixtures/persistableScannerSample.json` oraz built-in fixture mają:

- `mode: "fixture"`;
- `query: "fixture"`;
- `PASS` / `Pass Token`;
- `LOWL` / `Low Liquidity Token`;
- `FDV` / `FDV Fallback Token`.

Domyślny route to `#candidate-results`, a `App.tsx` uruchamia `loadData("fixture")` przy mount. Te fikcyjne tokeny są zatem domyślną treścią produktu.

Poza scanner fixture dostępne są dodatkowe kontrolowane powierzchnie demo:

- `WebinarTeaser.tsx`: fikcyjne projekty `Atlas Protocol`, `Nova Layer`, `Orion Markets`, `Helio Finance` oraz zmyślone metryki;
- `ResearchReview.tsx`: stały `MOCK_RESULT`, zwracany niezależnie od treści wejściowej;
- `contextLatestFixture.json`: kontekst `FIXTURE_ONLY` używany jako fallback.

Fixture należy zachować do testów, ale żaden z tych mechanizmów nie może być osiągalnym fallbackiem ani nieoznaczoną treścią w docelowym trybie real-data na VPS.

## 5. Matryca polityki zaimplementowanej na dzień audytu

Poniższa tabela opisuje politykę faktycznie zapisaną w runtime na dzień 12R.1. 12R.1 jej nie zmienił, a dokumentacyjny etap 12R.2 również nie aktualizuje konfiguracji wykonawczej.

| Source | `live_fetch` | `normalized_storage` | `user_display` | `derived_score_display` | Wniosek dla prywatnego VPS |
|---|---|---|---|---|---|
| `alternative_me_fng` | `LOCAL_POC`, `INTERNAL_BETA`, `PUBLIC_BETA`, `COMMERCIAL` | te same | te same | te same | Może zasilać kontekst po spełnieniu bramek runtime/freshness. |
| `defillama_api` | `LOCAL_POC`, `INTERNAL_BETA`, `PUBLIC_BETA`, `COMMERCIAL` | te same | te same | te same | Może zasilać kontekst po spełnieniu bramek runtime/freshness. |
| `dexscreener` | tylko `LOCAL_POC` | tylko `LOCAL_POC` | tylko `LOCAL_POC` | tylko `LOCAL_POC` | Nie może zasilać `INTERNAL_BETA`/`PUBLIC_BETA` na VPS bez przyszłej, jawnie autoryzowanej decyzji. |
| `goplus_security` | tylko `LOCAL_POC` | tylko `LOCAL_POC` | brak w każdym środowisku | tylko `LOCAL_POC` | Nie wolno wyświetlać pól provider-derived; pełny scanner VPS jest zablokowany. |
| `honeypot_is` | tylko `LOCAL_POC` | tylko `LOCAL_POC` | brak w każdym środowisku | tylko `LOCAL_POC` | Nie wolno wyświetlać pól provider-derived; pełny scanner VPS jest zablokowany. |

`raw_storage` jest zabronione dla wszystkich powyższych źródeł.

Wniosek z 12R.1 pozostaje prawdziwy dla obecnej konfiguracji: **runtime nie ma jeszcze środowiska innego niż `LOCAL_POC`, w którym token discovery może działać live, a security fields nie mają zaimplementowanego uprawnienia `user_display`**. Decyzja 12R.2 zatwierdza docelową politykę dla `INTERNAL_BETA`, lecz jej egzekwowanie należy do 12R.3. Do tego czasu pełny scanner pozostaje zablokowany i nie wolno wykonywać provider calls przez obejście konfiguracji.

Ustawienie `CRYPTO_EDGE_DATA_ENV=LOCAL_POC` na VPS wyłącznie po to, aby ominąć ograniczenia, byłoby niezgodne z intencją fail-closed policy.

## 6. Rejestr luk

### P0 — blokery wznowienia testu

#### RDR-F01 — autoryzowana ścieżka live nie jest jeszcze zaimplementowana

**Dowód:** runtime policy dopuszcza DexScreener, GoPlus i Honeypot.is tylko w `LOCAL_POC`; `goplus_security.user_display` i `honeypot_is.user_display` są puste.

**Skutek:** prywatny VPS nie może obecnie pokazać kompletnego live scanner output zgodnie z polityką.

**Status decyzji:** zamknięty w 12R.2 — `INTERNAL_BETA`, DexScreener, GoPlus i Honeypot.is zostały zaakceptowane w granicach opisanych w `docs/real_data_policy_decisions.md`.

**Wymagany rezultat:** 12R.3 implementuje osobne gates dla fetch/storage/display, allowlistę oraz fail-closed zachowanie. Do tego czasu produkt może pokazać tylko dane dopuszczone przez istniejącą runtime policy albo pusty stan skanera; provider calls pozostają poza zakresem.

#### RDR-F02 — frontend jest fixture-first i fallback-open

**Dowód:** `App.tsx` inicjuje `dataSource = "fixture"` oraz wywołuje `loadData("fixture")`; ręczny selector jest wymagany do przejścia na API. `scannerDataSource.ts` wraca do built-in fixture po błędzie API lub static JSON.

**Skutek:** realne API nie staje się źródłem domyślnym, a awaria wygląda jak działający produkt z fikcyjnymi tokenami.

**Wymagany rezultat:** produkcyjny tryb real-data wybiera wyłącznie API i pokazuje blokujący empty/error state, nigdy fixture. Fixture pozostają w dev/test.

#### RDR-F03 — fałszywa klasyfikacja `real-output`

**Dowód:** `latestScannerOutput.ts` uznaje każdy minimalnie poprawny `full_output.json` za `real-output`; nie sprawdza `scan_run.mode`. Lokalny fixture `scan_20260623073520` jest zwracany jako `real-output`.

**Skutek:** UI może przedstawiać fixture jako „Latest local output”.

**Wymagany rezultat:** nazwa `real-output` może być nadana dopiero po pełnej walidacji real-data eligibility. Sam katalog `output/` nie jest dowodem provenance.

#### RDR-F04 — Scanner API i collector nie działają na VPS

**Dowód:** stan wdrożenia z briefu; repo ma tylko lokalny Node POC i helpery Windows. Brak tracked systemd/PM2 service, Linux runner, reverse proxy i deploy runbook dla standalone VPS.

**Skutek:** frontend na `127.0.0.1:4180` nie ma źródła `/api/scanner/latest` ani `/api/context/latest`.

**Wymagany rezultat:** dopiero w osobnym, autoryzowanym etapie uruchomić loopback API, recurring collector i same-origin reverse proxy.

#### RDR-F05 — brak definicji i egzekwowania świeżości

**Dowód:** selekcja opiera się na sortowaniu timestamp/mtime; nie ma `max_age`, per-source SLA, detekcji przyszłego czasu ani statusu `stale`. Candidate UI sprawdza tylko, czy data jest parsowalna. Context UI eksponuje `loaded_at`, czyli czas odczytu, jako główny tekst „Loaded”, co może odmłodzić stary snapshot wizualnie.

**Skutek:** dowolnie stary, lecz poprawny plik jest pokazywany jako latest/approved local context.

**Wymagany rezultat:** zatwierdzone SLA per dataset i fail-closed po jego przekroczeniu; UI musi pokazywać provider/run `generated_at` i age, nie tylko czas odczytu API.

#### RDR-F06 — policy gate chroni `fetch`, ale nie cały lifecycle

**Dowód:** kod wywołuje `assertSourceActionAllowed` dla `fixture_load` i `live_fetch`. Nie ma runtime calls dla `normalized_storage`, `user_display` ani `derived_score_display` w writerach i API.

**Skutek:** plik może zostać zapisany lub wyświetlony bez osobnego potwierdzenia uprawnienia dla tej czynności. Security data jest prezentowana mimo pustego `user_display` dla GoPlus/Honeypot.is.

**Wymagany rezultat:** każda granica `fetch -> normalized_storage -> API publish -> user_display/derived_score_display` musi fail-closed sprawdzać odpowiednią akcję.

#### RDR-F07 — context bridge nie wymusza live/healthy/current

**Dowód:** `latestContextOutput.ts` akceptuje `mode: "fixture"` i dowolne `environment`; nie wymaga `policy.allowed === true`, `errors_total === 0`, oczekiwanego kompletu źródeł ani wieku. `runApprovedSourcesPoc` w trybie non-strict zapisuje degraded output i może zakończyć się kodem 0. API usuwa `health_status` oraz degraded/hard-failure counters.

**Skutek:** fixture albo zdegradowany output może otrzymać etykietę `approved-sources-output` i być pokazany jako dostępny kontekst.

**Wymagany rezultat:** produkcyjny selector dopuszcza tylko live output z docelowego środowiska, dozwolonymi akcjami, kompletem wymaganych metadanych i jawnie zatwierdzoną regułą degraded/last-known-good.

#### RDR-F08 — fikcyjne i demo dane są osiągalne w tej samej aplikacji

**Dowód:** built-in/static/API fallback fixtures, `WebinarTeaser` i `ResearchReview` są dostępne z nawigacji.

**Skutek:** obietnica „wyłącznie rzeczywiste dane” nie jest spełniona nawet po podłączeniu API, jeśli użytkownik może wejść w powierzchnię prezentującą fikcyjne metryki jako część tej samej wersji produktu.

**Wymagany rezultat:** docelowy runtime mode musi oddzielić produkt real-data od demo/test. Fixture nie są usuwane; są niedostępne w produkcyjnym data path.

### P1 — wymagane przed owner acceptance

#### RDR-F09 — collector jest ręczny, Windows-only i domyślnie non-strict

`scripts/win/generate-live-context.cmd` generuje context ręcznie. Brak odpowiednika Linux, locka procesu, timeoutów, backoff, retry budget, harmonogramu, retention, last-success marker i alertu. Non-strict mode może opublikować degraded run.

#### RDR-F10 — walidacja scanner API jest zbyt płytka

`isPersistableScannerOutputShape` sprawdza głównie tablice i `candidate_id`; nie uruchamia pełnego `storageValidator`, nie sprawdza zgodności `run_id`, labeli, relacji, źródeł, trybu ani błędów. W przeciwieństwie do context bridge scanner bridge rozprzestrzenia cały obiekt przez object spread, więc nie ma allowlist sanitization chroniącej API przed nieoczekiwanymi polami.

#### RDR-F11 — publikacja plikowa nie jest atomowa

Writery zapisują docelowe pliki bez temporary file + rename i bez manifestu gotowości. API może odczytać run w trakcie zapisu. `run_id` ma rozdzielczość jednej sekundy, więc dwa runy w tej samej sekundzie mogą wejść w ten sam katalog.

#### RDR-F12 — runtime API nie jest utwardzony pod VPS

Aktualny serwer:

- ma `Access-Control-Allow-Origin: *`;
- słucha bez jawnego hosta;
- zwraca absolutne ścieżki filesystem w metadanych/diagnostics;
- nie ma auth ani własnego access gate;
- nie ma `Cache-Control` dla latest data;
- `/api/health` potwierdza tylko proces, nie gotowość danych;
- zależy od `process.cwd()` przy rozwiązywaniu ścieżek.

Prywatność może zapewniać reverse proxy, ale API nadal powinno być związane z `127.0.0.1` i nie ujawniać ścieżek hosta.

#### RDR-F13 — POC nie jest jeszcze produkcyjnym mechanizmem discovery

DexScreener client wykonuje search po pojedynczym query, domyślnie `SOL`. Nie istnieje zatwierdzona strategia universe/query, deduplikacja między runami, cursor/watermark ani gwarancja wykrywania nowych tokenów. Limit 3 chroni POC, ale nie określa kompletności produktu.

#### RDR-F14 — brakuje testów real-data readiness

Testy dobrze pokrywają normalizację, filtry, label semantics, registry fail-closed, brak scrapingu, fixture shape, context sanitization i lokalne API. Nie pokrywają jednak:

- odrzucenia `mode: "fixture"` w production mode;
- odrzucenia policy-denied storage/display;
- odrzucenia stale/future timestamps;
- zachowania bez fixture fallback;
- degraded/partial source publishing;
- scanner API allowlist sanitization;
- rzeczywistego same-origin `/api` w production build;
- restartu/schedulera/awarii na VPS;
- ciągłego okresu stabilności przed owner acceptance.

#### RDR-F15 — dokumentacja opisuje sprzeczne epoki produktu

Root `README.md` nadal twierdzi, że repo nie ma real fetcherów, a `tools/ui-mock/README.md` w jednym miejscu mówi „without a backend or live API”, mimo że niżej opisuje Scanner API. Starsze plany nazywają DexScreener/GoPlus/Honeypot priorytetem Camp BETA, podczas gdy aktualna runtime policy blokuje je poza `LOCAL_POC`.

Dokumentacja operacyjna musi mieć jeden aktualny runbook i jasno odróżniać historyczne POC od dozwolonego runtime.

#### RDR-F16 — provenance jest zbyt zbiorcze

Scanner output ma source na kandydacie i listę security sources, lecz nie ma kompletnego manifestu z:

- docelowym środowiskiem;
- decyzjami policy dla `live_fetch`, `normalized_storage` i display;
- wersją adaptera/normalizera;
- per-source fetch started/finished;
- statusem health;
- jednoznacznym `fixture_used: false`;
- checksum opublikowanego artefaktu.

Bez tego API nie może niezależnie udowodnić, że snapshot kwalifikuje się do wyświetlenia.

## 7. Definicja danych dopuszczonych do prywatnej wersji

Poniższe kryteria, uzupełnione decyzjami z `docs/real_data_policy_decisions.md`, są zatwierdzonym kontraktem technicznym do wdrożenia w 12R.3. Sam zapis dokumentacyjny nie zmienia source registry ani runtime policy.

### 7.1 `real`

Snapshot jest `real` tylko wtedy, gdy jednocześnie:

- run i każde źródło mają `mode: "live"`;
- nie użyto fixture na żadnym etapie;
- wszystkie source IDs istnieją w registry i runtime policy;
- endpoint/provider zgadza się z zatwierdzonym adapterem;
- manifest lineage jest kompletny;
- dane pochodzą z zakończonego runu, nie z ręcznie podmienionego pliku;
- output przeszedł pełną walidację kontraktu i sanitizację.

`real-output` nie może oznaczać wyłącznie „plik znaleziony w `output/`”.

### 7.2 `current`

Snapshot jest `current` tylko wtedy, gdy:

- wszystkie timestampy są parsowalne i nie są w przyszłości ponad uzgodnioną tolerancję zegara;
- `started_at <= fetched_at/checked_at <= finished_at/published_at` tam, gdzie pola występują;
- wiek runu i per-source rekordów mieści się w zatwierdzonym SLA;
- UI pokazuje `generated_at`/`fetched_at`, obliczony age oraz status `fresh`/`stale`;
- brak SLA oznacza `not_ready`, nie „fresh”.

Wartości SLA zatwierdzono w 12R.2: DexScreener collect co 15 minut i fresh do 30 minut; wyniki GoPlus/Honeypot.is ważne do 30 minut; Alternative.me collect co 6 godzin i fresh do 30 godzin; DefiLlama collect co 2 godziny i fresh do 6 godzin.

### 7.3 `policy_compliant`

Snapshot jest `policy_compliant` tylko wtedy, gdy:

- `live_fetch` był dozwolony w środowisku docelowym;
- `normalized_storage` jest dozwolony przed publikacją artefaktu;
- `user_display` jest dozwolony dla pól provider-derived pokazywanych w UI;
- `derived_score_display` jest dozwolony dla wartości pochodnych;
- `raw_storage` nie wystąpił;
- wymagane attribution/branding są spełnione;
- nie wykonano scrapingu ani fallbacku do niezatwierdzonego mechanizmu.

### 7.4 `healthy` i zatwierdzone `degraded`

Snapshot jest `healthy` tylko wtedy, gdy:

- wymagane źródła zakończyły się zgodnie z zaakceptowaną regułą kompletności;
- nie ma policy denial ani hard failure;
- errors/warnings nie są ukrywane przez API;
- decyzja last-known-good jest jawna i nie przekracza SLA.

Stan `DEGRADED` nie jest `healthy`. Może być dopuszczony do prezentacji wyłącznie dla context last-known-good pozostającego w granicach SLA. Brak albo awaria security source nie usuwa kandydata, ale musi dać `SECURITY DATA UNAVAILABLE` lub `PARTIAL SECURITY COVERAGE`; nie może tworzyć pozytywnego statusu bezpieczeństwa.

### 7.5 `display_eligible`

```text
display_eligible = real
  AND current
  AND policy_compliant
  AND schema_valid
  AND (healthy OR approved_degraded)
```

`approved_degraded` oznacza wyłącznie context last-known-good w granicach SLA ze statusem `DEGRADED` albo jawnie niepełne/niedostępne pokrycie security przy kandydacie, bez pozytywnej interpretacji. Jeśli warunek jest fałszywy, API ma zwrócić kontrolowany `not_ready`/HTTP 503, a frontend ma pokazać pusty lub błędny stan bez danych zastępczych.

Scoring, `final_label` i znaczenie `WATCHLIST` pozostają bez zmian. `WATCHLIST` nadal oznacza wyłącznie manual review, nie sygnał transakcyjny.

## 8. Docelowy przepływ

```text
authorized scheduler on VPS
  -> collector with explicit target environment
  -> policy gate: live_fetch
  -> documented provider API only
  -> normalize in memory
  -> discard raw response
  -> policy gate: normalized_storage
  -> full schema + lineage + freshness validation
  -> write temporary snapshot
  -> atomic rename + publish manifest/checksum
  -> read-only Scanner API bound to 127.0.0.1
  -> policy gate: user_display / derived_score_display
  -> sanitize allowlisted response
  -> same-origin reverse proxy /api
  -> frontend real-data mode
  -> no fixture fallback; explicit empty/error/stale states
```

Zasady:

- collector nigdy nie działa w browserze;
- API read path nigdy nie wywołuje providera;
- fixture pozostają w repo do testów;
- production build nie używa fixture jako data path;
- ostatni poprawny snapshot może być użyty tylko w granicach zatwierdzonego SLA i z prawdziwym statusem age;
- brak aktualnych danych jest widocznym stanem produktu, nie powodem do pokazania sample;
- approved context i token scanner mają niezależne readiness, ale ogólny test ownera wymaga wszystkich powierzchni, które są mu prezentowane.

## 9. Plan wykonawczy do 31.08.2026

Plan nie autoryzuje żadnej zmiany polityki, aktywacji źródła, provider call ani wdrożenia. Każdy taki krok wymaga odrębnej zgody w swoim etapie.

| Etap | Termin | Zakres | Bramka wyjścia |
|---|---|---|---|
| **12R.2 — Real Data Policy & Environment Decisions** | 15.07 | **Zakończone:** zatwierdzić target environment, source actions, SLA, degraded/last-known-good, real-data product mode i owner acceptance gates. | `docs/real_data_policy_decisions.md`; bez provider calls, wdrożenia i zmian VPS. |
| **12R.3 — Fail-Closed Real Data Boundary** | 16.07 | **Zakończone:** walidacja scanner/context, policy gates dla storage/display, allowlisty, freshness, sanitizacja, 503/empty state zamiast fallback, rozdzielenie real-data/dev mode i testy offline. | Fixture/stale/denied są odrzucane, partial/unavailable są jawne, a testy bez sieci przechodzą. |
| **12R.4 — Approved Live Collectors & Normalized Snapshot** | 29.07-07.08 | Wdrożyć jawnie zatwierdzone collectory, scheduler/runner, timeouty, lock, temporary write + atomic publish, manifest, retention i last-success. | Powtarzalny run produkuje wyłącznie normalized artifact; brak raw storage; failure nie publikuje niegotowego snapshotu. |
| **12R.5 — VPS API & Same-Origin Integration** | 08-14.08 | Osobny autoryzowany deployment: API na loopback, service manager, reverse proxy `/api`, production env, logi i readiness endpoint. | `https://cryptoedge.crmallintraders.pl/api/...` działa przez access gate; port API nie jest publiczny; restart jest bezpieczny. |
| **12R.6 — Frontend Real-Data Runtime Mode** | 15-20.08 | Skonfigurować API jako jedyne źródło produkcyjne, usunąć runtime fallback do fixture, odseparować demo/mock surfaces, pokazać provenance/age/degraded/error. Bez redesignu scoringu. | W production build nie można wyświetlić `PASS`, `LOWL`, `FDV` ani demo metrics; brak danych daje pusty/error state. |
| **12R.7 — Soak, Failure Drills & Owner Candidate** | 21-26.08 | Minimum 72 h ciągłej obserwacji, source outage, stale data, invalid artifact, restart VPS, clock skew, no-output i rollback drill. | Brak fixture leakage, brak stale-as-fresh, alerty działają, runbook jest odtworzony przez drugą osobę. |
| **12R.8 — Owner Acceptance & CAMP Gate** | 27-31.08 | Właściciel przechodzi uzgodniony scenariusz produktu; poprawki tylko blokujące. Test zewnętrzny dopiero po akceptacji. | Pisemne `GO`; wszystkie bramki z sekcji 11 zielone. |

### Ścieżka krytyczna

Decyzje krytyczne zapadły 15.07.2026 w 12R.2: środowiskiem jest `INTERNAL_BETA`, źródła i akcje są określone, security display jest ograniczone do zatwierdzonych statusów/pól, a SLA i product mode są ustalone.

Granica 12R.3 jest wdrożona i zweryfikowana offline. Ścieżką krytyczną jest teraz **12R.4 — Approved Live Collectors & Normalized Snapshot**; aktywacja źródeł i wdrożenie VPS nadal wymagają osobnych etapów i weryfikacji.

## 10. Backlog wykonawczy

| ID | Priorytet | Zadanie | Kryterium akceptacji |
|---|---|---|---|
| RDR-001 | P0 | Wyegzekwować zatwierdzone target environment VPS. | Runtime i runbook używają wyłącznie `INTERNAL_BETA`; `PUBLIC_BETA` pozostaje wyłączone i nie występuje nadużycie `LOCAL_POC`. |
| RDR-002 | P0 | Wdrożyć zatwierdzoną politykę discovery/security. | DexScreener, GoPlus i Honeypot.is przechodzą osobne gates fetch/storage/display, allowlistę i testy; raw storage jest niemożliwe. |
| RDR-003 | P0 | Dodać kanoniczny validator `display_eligible`. | Odrzuca fixture, stale, policy-denied, schema-invalid, incomplete lineage i hard failure; dopuszcza wyłącznie zatwierdzone degraded/partial states, jawnie oznaczone według 12R.2. |
| RDR-004 | P0 | Egzekwować `normalized_storage`, `user_display`, `derived_score_display`. | Test udowadnia brak write/publish/display po denial; fetch gate pozostaje. |
| RDR-005 | P0 | Zmienić production Scanner API na fail-closed. | `/api/scanner/latest` nie zwraca fixture; brak kwalifikowanego live snapshotu daje 503 i reason code. |
| RDR-006 | P0 | Zmienić production Context API na fail-closed. | Tylko live, target environment, allowed policy, valid, current output; brak fixture fallback. |
| RDR-007 | P0 | Wprowadzić production data mode we frontendzie. | API jest jedynym źródłem; selector fixture/static jest dev-only; błędy nie zasilają kandydatów sample. |
| RDR-008 | P0 | Odseparować demo/mock surfaces od prywatnej wersji real-data. | Demo pozostaje wyłącznie w development mode, nie jest dostępne w buildzie VPS, a główne menu zawiera tylko Radar / Szczegóły / Weryfikacja / Metodologia. |
| RDR-009 | P1 | Dodać manifest provenance i per-source health. | API może wykazać mode, environment, source IDs, policy decisions, timestamps, version i `fixture_used: false`. |
| RDR-010 | P1 | Dodać atomic publish oraz retention. | Czytelnik widzi wyłącznie kompletny snapshot; collision run_id nie nadpisuje innego runu. |
| RDR-011 | P1 | Dodać scheduler i operational controls. | Lock, timeout, bounded retry/backoff, exit codes, last-success, alert i cleanup; brak unbounded calls. |
| RDR-012 | P1 | Utwardzić API na VPS. | Bind `127.0.0.1`, same-origin proxy, ograniczone CORS, bez absolutnych ścieżek, sensowne cache headers, access gate. |
| RDR-013 | P1 | Dodać readiness/diagnostics bez danych wrażliwych. | Health procesu jest oddzielony od scanner/context readiness; monitoring wykrywa stale/degraded/no-output. |
| RDR-014 | P1 | Rozszerzyć testy. | Pełna macierz z sekcji 12 przechodzi offline; VPS smoke nie wywołuje nieautoryzowanych providerów. |
| RDR-015 | P1 | Ujednolicić dokumentację i runbook. | Jedna aktualna procedura generate/validate/publish/deploy/rollback; stare POC wyraźnie historyczne. |
| RDR-016 | P0 | Uzyskać owner acceptance. | Owner przechodzi Radar → Szczegóły → Weryfikacja → Manual Review i pisze: „akceptuję wersję dla testera”. |

## 11. Bramka GO/NO-GO dla testu zewnętrznego

Każda pozycja jest obowiązkowa. Jeden wynik negatywny oznacza `NO-GO`.

### A. Source i policy

- [x] Target environment VPS jest jawnie zatwierdzone jako `INTERNAL_BETA`; `PUBLIC_BETA` pozostaje wyłączone.
- [x] Owner zatwierdził source/action matrix opisaną w `docs/real_data_policy_decisions.md`.
- [ ] Każdy aktywny source ma uprawnienie `live_fetch` w tym środowisku.
- [ ] Każdy zapisany source ma uprawnienie `normalized_storage`.
- [ ] Każde pole widoczne użytkownikowi ma `user_display` albo odpowiednio `derived_score_display`.
- [ ] `raw_storage` pozostaje wyłączone i test to potwierdza.
- [ ] Attribution/branding są spełnione.

### B. Prawdziwość i provenance

- [ ] Scanner i context mają `mode: "live"`.
- [ ] Manifest potwierdza `fixture_used: false`.
- [ ] Nie istnieje runtime fallback do fixture/static sample.
- [ ] API sanitizuje odpowiedź allowlistą.
- [ ] UI pokazuje source, run ID i realny czas generacji.

### C. Aktualność i health

- [x] SLA per dataset jest zatwierdzone.
- [ ] SLA per dataset jest egzekwowane end-to-end.
- [ ] Stale/future/invalid timestamps są odrzucane.
- [ ] Degraded/partial/hard failure nie udają healthy.
- [ ] Brak danych daje 503/empty state.
- [ ] Monitoring alarmuje przed przekroczeniem SLA.

### D. VPS runtime

- [ ] Collector działa cyklicznie i nie nachodzi sam na siebie.
- [ ] Publikacja jest atomowa.
- [ ] Scanner API działa na loopback i jest dostępne same-origin przez reverse proxy.
- [ ] API port nie jest publicznie wystawiony.
- [ ] Restart, rollback i brak outputu zostały przećwiczone.

### E. Frontend

- [ ] Default data source to production API.
- [x] Zatwierdzono real-data-only product mode dla builda VPS i osobny development demo mode.
- [ ] `PASS`, `LOWL`, `FDV` nie mogą pojawić się w production build.
- [ ] Demo projects/metrics nie są częścią real-data product mode.
- [ ] UI pokazuje age i stale/degraded/error bez dwuznacznych zielonych statusów.
- [ ] `WATCHLIST` nadal znaczy Manual Review Only.

### F. Quality

- [ ] Offline unit/contract/integration tests przechodzą.
- [ ] Production build przechodzi.
- [ ] 72 h soak nie wykazał fixture leakage ani stale-as-fresh.
- [ ] Failure drills przechodzą.
- [ ] Working tree i deployment artifact nie zawierają secretów ani raw provider payloads.

### G. Product acceptance

- [ ] Owner przeszedł scenariusz Radar → Szczegóły → Weryfikacja → Manual Review.
- [ ] Właściciel rozumie source/freshness/error states bez pomocy dewelopera.
- [ ] Owner przekazał jawny komunikat: „akceptuję wersję dla testera”.
- [ ] Dopiero wtedy można zaprosić testera zewnętrznego.

## 12. Wymagana macierz testów

### Offline — bez provider calls

1. Fixture scanner output w production mode -> odrzucony.
2. Live scanner output bez manifestu -> odrzucony.
3. `mode: "live"` przy `query: "fixture"` albo fixture marker -> odrzucony.
4. `live_fetch` allowed, lecz `normalized_storage` denied -> brak zapisu/publish.
5. Storage allowed, lecz `user_display` denied -> API nie publikuje pól provider-derived.
6. Stary timestamp -> `stale`/503.
7. Timestamp z przyszłości -> invalid/503.
8. Context `mode: "fixture"` w katalogu `approved_sources_*` -> odrzucony.
9. Context z degraded providerem -> zachowanie zgodne z zatwierdzoną regułą, nigdy healthy.
10. Nieoczekiwane raw/provider fields -> usunięte albo cały artefakt odrzucony.
11. Brak output directory -> 503, bez fixture.
12. Partial write -> czytelnik pozostaje na poprzednim atomowym snapshotcie.
13. Policy unknown source/action -> fail closed i zero network calls.
14. UI API error -> zero kandydatów sample, jawny Data Unavailable state.
15. Production navigation -> brak demo/mock data surfaces.

### Integracja lokalna

1. Approved live context przechodzi pełny validator.
2. Fixture scanner `scan_20260623073520` jest odrzucany jako non-real.
3. API response nie zawiera absolutnych ścieżek hosta.
4. `Cache-Control`, CORS i reason codes są zgodne z kontraktem.
5. Readiness rozróżnia process healthy od data ready.
6. Frontend same-origin `/api` działa w production build, nie tylko w Vite dev proxy.

### VPS — dopiero po autoryzowanym wdrożeniu

1. `127.0.0.1:4180` serwuje właściwy production build.
2. Publiczny URL przechodzi przez access gate.
3. `/api` jest reverse-proxy do loopback API.
4. Bezpośredni port API z Internetu jest zamknięty.
5. Scheduler publikuje nowe snapshoty w zatwierdzonym interwale.
6. Zatrzymanie collectora powoduje stale/not-ready, nie fixture.
7. Błąd providera nie publikuje fałszywego healthy snapshotu.
8. Restart VPS odtwarza API i scheduler bez ręcznego CMD.
9. Rollback nie przywraca fixture-first build.
10. Logi i artefakty nie zawierają raw provider responses ani secretów.

## 13. Decyzje rozstrzygnięte przez właściciela/compliance

Wszystkie pytania z 12R.1 rozstrzygnięto w 12R.2 i zapisano kanonicznie w `docs/real_data_policy_decisions.md`:

1. VPS to `INTERNAL_BETA`; `PUBLIC_BETA` pozostaje wyłączone.
2. DexScreener jest źródłem token discovery.
3. GoPlus jest primary, a Honeypot.is secondary security source; display podlega jawnej allowliście i zakazowi komunikatów o bezpieczeństwie.
4. `raw_storage` jest zabronione; dozwolone są wyłącznie zatwierdzone znormalizowane pola i statusy.
5. SLA zatwierdzono osobno dla DexScreener, security, Alternative.me i DefiLlama.
6. Last-known-good jest dopuszczalne wyłącznie dla context, w granicach SLA i ze statusem `DEGRADED`; po SLA obowiązuje `Data Unavailable`.
7. Demo jest wyłączone z builda VPS i dostępne wyłącznie w osobnym development mode.
8. Tester wymaga pełnej checklisty, przejścia ownera przez Radar → Szczegóły → Weryfikacja → Manual Review oraz jawnej akceptacji.

Decyzje nie mogą zostać zastąpione domyślną wartością w kodzie. Zostały jawnie wyegzekwowane i przetestowane offline w 12R.3.

## 14. Podsumowanie 12R.1

Najkrótsza bezpieczna droga nie polega na podmianie fixture jednym plikiem live. Decyzje środowiskowe, źródłowe, SLA i produktowe zatwierdzono w 12R.2, a granicę prawdy danych wdrożono w 12R.3. Następny krok to zatwierdzone collectory i znormalizowana, atomowo publikowana migawka w 12R.4.

Do czasu spełnienia wszystkich bramek:

- frontend VPS może pozostać dostępny wyłącznie jako niezaakceptowany preview;
- test zewnętrzny pozostaje wstrzymany;
- nie wolno przedstawiać `PASS`, `LOWL`, `FDV` jako realnych tokenów;
- nie wolno uruchamiać pełnego live scanner przez zmianę środowiska na `LOCAL_POC`;
- approved context nie jest wystarczający, aby uznać cały produkt za real-data ready;
- AI KINTEL pozostaje poza zakresem.
