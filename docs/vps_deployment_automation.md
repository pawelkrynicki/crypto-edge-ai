# VPS Deployment & Automation

## Status

Sprint 1 i Sprint 2 zostały zaakceptowane lokalnie. Aktualny stan to **local code complete, VPS operational deployment pending**. Rzeczywiste wdrożenie nie zostało wykonane, scheduler nie został aktywowany, konfiguracja Cloudflare nie została zmieniona, a tester zewnętrzny pozostaje `NO-GO`.

## Local owner review: ACCEPT_LOCAL_CODE — 21.07.2026

Końcowy lokalny owner review Sprintu 1 i Sprintu 2 zakończył się werdyktem `ACCEPT_LOCAL_CODE`. Akceptacja dotyczy wyłącznie lokalnego kodu i nie oznacza wykonania deploymentu ani uruchomienia automatyzacji operacyjnej.

Manualny owner review potwierdził:

- INTERNAL_BETA same-origin runtime na `127.0.0.1:4180`: **PASS**;
- UI i `/api/*` na jednym originie: **PASS**;
- health endpoint i build SHA: **PASS**;
- brak fixture i demo surfaces: **PASS**;
- path traversal i CORS boundary: **PASS**;
- global collector lock między procesami: **PASS**;
- pięć równoczesnych prób, jeden runner: **PASS**;
- last-known-good po błędzie: **PASS**;
- source-aware cadence: **PASS**;
- `context_only` bez DexScreener i GoPlus: **PASS**;
- read-only `/api/automation/status`: **PASS**;
- sto odczytów statusu, zero runner/provider calls: **PASS**;
- Task Scheduler dry-run: **PASS**;
- UI status aktywnej i nieaktywnej automatyzacji: **PASS**;
- `next_run_at` i `next_due_at`: **PASS**;
- Refresh view nie uruchamia collectora: **PASS**.

Podczas owner review wykonano dokładnie jeden kontrolowany centralny run:

- wynik: `SUCCESS`;
- scanner run: `scan_20260721140824_b6fb9e54`;
- context run: `approved_sources_20260721140824_671ade5a`;
- request counts:
  - `dexscreener`: `21`;
  - `goplus_security`: `0`;
  - `alternative_me_fng`: `1`;
  - `defillama_api`: `1`;
- runner zakończył się bez aktywnego locka;
- opublikowano jeden wspólny snapshot dla wszystkich użytkowników;
- zwykłe odświeżenie UI nie wykonało provider calls.

Zaakceptowane ograniczenia lokalnego etapu:

- Windows Task Scheduler nie jest aktywny;
- VPS jest obecnie niedostępny;
- deployment pod domenę nie został wykonany;
- Cloudflare Tunnel i Cloudflare Access nie zostały zmienione;
- port `4173` nie został użyty;
- tester zewnętrzny pozostaje `NO-GO`;
- finalna bramka operacyjna wymaga wdrożenia na VPS, aktywacji zadania, smoke przez domenę oraz testu rollbacku.

## Windows VPS contract

- System operacyjny: Windows.
- Domena produktu: `https://cryptoedge.crmallintraders.pl`.
- Lokalny origin produktu: `http://127.0.0.1:4180`.
- Port `4173` należy do istniejącej usługi podglądowej i nie może być używany przez runtime VPS ani jego smoke test.
- Istniejąca usługa Windows `cloudflared` oraz istniejący Cloudflare Tunnel pozostają jedyną ścieżką tunelu. W tym sprincie nie wolno ich modyfikować, restartować ani zastępować drugim tunelem.
- Cloudflare Access pozostaje bez zmian.
- Istniejący Windows Task Scheduler i wcześniejszy autostart wersji podglądowej pozostają bez zmian.
- Runtime VPS działa wyłącznie jako `INTERNAL_BETA`. `PUBLIC_BETA`, fixture fallback i publiczny endpoint uruchamiający collector są zabronione.

## Produkcyjny runtime same-origin

`tools/ui-mock/server/productVpsServer.ts` uruchamia jeden proces Node i jeden origin, który:

- domyślnie nasłuchuje wyłącznie na `127.0.0.1:4180`;
- serwuje `tools/ui-mock/dist` z builda `INTERNAL_BETA`;
- deleguje `/api/*` do tego samego handlera, którego używa lokalny Scanner API;
- zwraca bezpieczny fallback `index.html` wyłącznie dla tras SPA;
- blokuje segmenty traversal, backslash traversal i pliki spoza `dist`, w tym wyjście przez symlink;
- ustawia typy MIME, `x-content-type-options: nosniff`, `no-store` dla `index.html` i immutable cache dla hashowanych assetów;
- nie ustawia wildcard CORS ani zewnętrznego CORS w `INTERNAL_BETA`;
- zamyka serwer kontrolowanie po `SIGINT` i `SIGTERM`;
- nie importuje collectora ani adapterów providerów do zwykłego request path.

Konfiguracja:

| Zmienna | Kontrakt |
| --- | --- |
| `CRYPTO_EDGE_RUNTIME_MODE` | obowiązkowo dokładnie `INTERNAL_BETA`; brak lub inna wartość zatrzymuje start |
| `CRYPTO_EDGE_PRODUCT_HOST` | opcjonalna; domyślnie `127.0.0.1` |
| `CRYPTO_EDGE_PRODUCT_PORT` | opcjonalna; domyślnie `4180` |
| `CRYPTO_EDGE_UI_DIST_PATH` | opcjonalny override katalogu `dist` |
| `CRYPTO_EDGE_BUILD_SHA` | opcjonalny, bezpieczny identyfikator widoczny w health |

`GET /api/health` może zwrócić `service`, `runtime_mode`, `build_sha` i `process_uptime_seconds`. Nie zwraca ścieżek absolutnych, sekretów ani pełnego środowiska procesu.

## Jeden centralny collector i jeden snapshot

Architektura wieloużytkownikowa jest single-flight:

1. Jeden centralny coordinator zdobywa globalny lock.
2. Jeden runner wykonuje jeden cykl collectora.
3. Istniejąca walidacja snapshotów kończy się przed atomową publikacją.
4. Wszystkie sesje użytkowników czytają ten sam ostatni prawidłowy snapshot przez `/api/*`.
5. Odświeżenie strony i „Refresh view” / „Odśwież widok” wykonują tylko odczyt naszego API.

Liczba użytkowników ani liczba równoległych odczytów nie zwiększa liczby wywołań DexScreener, GoPlus ani pozostałych providerów. UI i zwykłe API nie uruchamiają collectora. Nie istnieje publiczny endpoint collect/scan/refresh.

## Global lock i stale recovery

Runtime lock znajduje się domyślnie pod ignorowanym przez git `tools/data-poc/.local/automation/collector.lock.json`. Jest tworzony atomowo przez semantykę `open(..., "wx")` i zawiera tylko:

- `schema_version`;
- `run_id`;
- `pid`;
- `started_at`;
- `heartbeat_at`;
- `expires_at`.

Aktywny lock zwraca konkurentowi `RUN_ALREADY_IN_PROGRESS` oraz aktywny `run_id`. Heartbeat przedłuża czas własności. Kontrolowany sukces albo błąd usuwa lock po sprawdzeniu zgodności `run_id`.

Stale recovery jest dozwolone tylko wtedy, gdy oba warunki są spełnione równocześnie:

- `expires_at` minął;
- proces wskazany przez `pid` nie żyje.

Samo przekroczenie czasu nigdy nie odbiera locka żyjącemu procesowi. Zegar i sprawdzanie procesu są wstrzykiwalne w testach. Nieczytelny, nieprawidłowy lub niemożliwy do utworzenia lock zatrzymuje run fail-closed.

## Stan automatyzacji i last-known-good

Oddzielny `tools/data-poc/.local/automation/automation-state.json` jest zapisywany przez plik tymczasowy i atomic rename. Zawiera znormalizowane daty ostatniej próby, sukcesu i błędu, aktywny/ostatni `run_id`, wynik, bezpieczny kod błędu, request counts z ostatniego sukcesu oraz identyfikatory ostatnich opublikowanych scanner/context snapshots.

Stan nie zawiera raw provider responses, tokenów, sekretów, stack trace, ścieżek użytkownika ani danych osobowych. Błąd runnera zachowuje request counts i identyfikatory ostatniego prawidłowego publish. Coordinator nie usuwa ani nie nadpisuje last-known-good snapshotu na ścieżce błędu i nie wykonuje automatycznego retry całego runu.

Sprint 2 rozszerza ten sam kompatybilny plik o wersję schedulera, ostatnią decyzję i sprawdzenie, osobne znaczniki sukcesu scanner/context, następne terminy, osobne identyfikatory runów oraz `missed_schedule_count`. Zapis nadal używa pliku tymczasowego i atomic rename.

## Source-aware cadence i tryby runnera

Windows Task Scheduler ma jedynie budzić centralny scheduler co 5 minut. To nie jest cadence providerów: czysty planner sprawdza wspólny stan i wykonuje najwyżej jeden należny run. Nie istnieją runy per użytkownik.

| Źródło | Cadence | SLA | Run mode |
| --- | --- | --- | --- |
| DexScreener | 15 min | 30 min | `scanner_and_context` |
| GoPlus | candidate-scoped | 30 min | `scanner_and_context` |
| Alternative.me | 6 h | 30 h | `context_only` lub `scanner_and_context` |
| DefiLlama | 2 h | 6 h | `context_only` lub `scanner_and_context` |
| Honeypot.is | manual only | n/a | never scheduled |

`scanner_and_context` uruchamia istniejący collector bez zmiany filtrów, discovery, budżetów, retry, walidacji i publikacji. GoPlus jest wywoływany wyłącznie dla kandydatów po basic filters w tym runie. Źródła context są odpytywane tylko wtedy, gdy ich własny termin jest due; wpis niedue jest przenoszony z ostatniego zwalidowanego context snapshotu z request count `0`. `context_only` tworzy i publikuje wyłącznie prawidłowy snapshot Alternative.me/DefiLlama; nie importuje ani nie odpytuje DexScreener lub GoPlus i nie zmienia scanner snapshotu.

Czysta decyzja schedulera ma sześć wyników: `RUN_SCANNER_AND_CONTEXT`, `RUN_CONTEXT_ONLY`, `NOTHING_DUE`, `RUN_ALREADY_IN_PROGRESS`, `AUTOMATION_DISABLED` i `STATE_UNAVAILABLE`. Używa wstrzykiwalnego zegara, stanu, aktywnego locka i timestampów ostatnich snapshotów; sama nie wykonuje provider calls.

## Read-only observability

`GET /api/automation/status` jest częścią wspólnego handlera lokalnego i same-origin. `enabled` oznacza rzeczywiście aktywny cykliczny mechanizm wykonawczy. Produktowe `next_run_at` jest terminem wykonania i dlatego ma wartość wyłącznie przy `enabled=true`; przy nieaktywnej automatyzacji jest `null`. Czyste wyliczenie cadence pozostaje osobno w `next_due_at` i może istnieć także przy `enabled=false`, obok źródłowych `next_scanner_run_at` i `next_context_run_at`. Endpoint zwraca też bezpieczny aktywny run, ostatni wynik/kod i timestamps, ostatnie opublikowane ID, request counts oraz `scheduler_status`. Brak pliku daje `NOT_YET_RUN`, a uszkodzony stan `STATE_UNAVAILABLE` z HTTP 200. Endpoint nie zwraca PID, lock metadata, ścieżek, sekretów ani env i nigdy nie uruchamia collectora.

Mały panel w Technical details jest tylko do odczytu. Przy `enabled=false` pokazuje „Nie zaplanowano” / „Not scheduled” jako następny run, a `next_due_at` opisuje wyłącznie jako najbliższy termin po aktywacji. Przy `enabled=true` pokazuje `next_run_at` bez dodatkowego tekstu „po aktywacji”. „Refresh view” ponownie czyta nasze API, lecz nie aktywuje automatyzacji ani nie uruchamia schedulera lub providera. Sto równoległych odczytów jest pokryte testem bez mutacji stanu i z zerową liczbą wywołań runnera.

## Windows Task Scheduler — pakiet nieaktywny

Skrypty rejestracji i usunięcia są domyślnie dry-run. Dopiero jawne `--apply` może zmienić dokładnie zadanie `Crypto Edge AI Central Automation`. Plan ma cadence 5 minut, trigger startowy, `MultipleInstances=IgnoreNew`, kanoniczny wrapper, working directory repo i zero sekretów w command line. W tym sprincie nie wykonano `--apply`; Task Scheduler, Cloudflare i VPS pozostają niezmienione.

## Owner runbook

Wszystkie poniższe komendy należy uruchamiać z katalogu głównego repozytorium.

Build VPS bez provider calls:

```cmd
scripts\win\build-product-vps.cmd
```

Offline smoke same-origin na dedykowanym losowym porcie `43000-48999` (nigdy `4180` ani `4173`):

```cmd
scripts\win\check-product-vps-runtime.cmd
```

Offline test globalnego locka i coordinatora na izolowanych plikach tymczasowych:

```cmd
scripts\win\check-automation-single-flight.cmd
```

Offline cadence, decyzje i Task Scheduler script checks:

```cmd
scripts\win\check-central-scheduler.cmd
```

Same-origin status API na losowym porcie: 100 odczytów, brak mutacji i brak provider calls:

```cmd
scripts\win\check-automation-status-api.cmd
```

Podgląd planu zadania bez zmiany systemu:

```cmd
scripts\win\preview-central-automation-task.cmd
```

Jawne komendy ownera do przyszłej rejestracji lub usunięcia — nie wykonywać podczas offline review:

```cmd
scripts\win\register-central-automation-task.cmd --apply
scripts\win\unregister-central-automation-task.cmd --apply
```

Lokalne uruchomienie przygotowanego runtime na domyślnym loopback `4180` — tylko po upewnieniu się, że port jest przeznaczony na review; ta komenda nie wdraża domeny, nie zmienia Cloudflare i nie tworzy autostartu:

```cmd
scripts\win\start-product-vps.cmd
```

Opcjonalny identyfikator builda przed startem:

```cmd
set CRYPTO_EDGE_BUILD_SHA=<commit-sha>
scripts\win\start-product-vps.cmd
```

Entry point realnego collectora pozostaje podwójnie opt-in. Nawet ręczne `pnpm run automation:run` odmawia działania przed importem collectora, jeśli jednocześnie nie ustawiono `CRYPTO_EDGE_AUTOMATION_ENABLED=1` i `ALLOW_LIVE_PROVIDER_CALLS=1`. Wrapper przyszłego zadania ustawia te flagi, ale nie jest uruchamiany przez walidację ani UI.

## Dalsze kroki

1. Przywrócenie VPS.
2. Controlled deployment runtime na `127.0.0.1:4180`.
3. Podpięcie istniejącego Cloudflare Tunnel bez tworzenia drugiego tunelu.
4. Osobna, jawna aktywacja jednego centralnego zadania Windows Task Scheduler.
5. Runtime smoke przez domenę i istniejący Cloudflare Access/Tunnel.
6. Sprawdzony rollback do poprzedniego builda oraz last-known-good snapshotu.
7. Dopiero po przejściu całej bramki operacyjnej zgoda dla testera zewnętrznego.

Rejestracja zadania, deployment i zmiany Cloudflare nie są wykonywane w tym sprincie. Testy lokalne pozostają możliwe bez dostępu do VPS.
