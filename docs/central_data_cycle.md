# DATA.1 — centralny cykl danych

## Kontrakt

Jeden proces ownera lub Windows Task Scheduler uruchamia jeden współdzielony cykl. Globalny lock `tools/data-poc/.local/automation/collector.lock.json` blokuje równoległe procesy, jest odświeżany heartbeat i może być odzyskany wyłącznie po jednoczesnym wygaśnięciu TTL oraz zakończeniu procesu właściciela. UI, liczba użytkowników i przycisk **Refresh view** nie uruchamiają collectora — tylko ponownie czytają same-origin `/api/*`.

Cykl używa istniejącego discovery i filtrów:

| Źródło | Rola | Cadence/SLA | Zasada |
| --- | --- | --- | --- |
| DexScreener | Nowe i Established | 15 min / 30 min | bounded discovery, bez fixture fallback |
| GoPlus | bezpieczeństwo | candidate-scoped / 30 min | tylko rekordy po basic filters |
| Alternative.me | kontekst | 6 h / 30 h | zwalidowany LKG przy niedostępności |
| DefiLlama | kontekst | 2 h / 6 h | zwalidowany LKG przy niedostępności |
| Honeypot.is | manualny | brak | nigdy automatycznie |

Tożsamością Follow-up jest wyłącznie znormalizowane `chain + contract_address`. Ingest jest idempotentny, zachowuje `first_seen_at`, aktualizuje `last_seen_at`, deduplikuje i przelicza checkpointy 1/3/7/14/30 dni. Cykl może oznaczyć rekord jako `Candidate for Established`, ale nie modyfikuje Established Universe i nigdy nie promuje automatycznie.

## Publikacja, LKG i częściowa dostępność

Scanner/context są najpierw walidowane i publikowane do niezmiennych katalogów runu przez plik tymczasowy i atomic rename. Dopiero końcowy zapis `automation-state.json` zatwierdza `last_published_scanner_run_id` oraz `last_published_context_run_id`. API INTERNAL_BETA czyta tylko te wskaźniki, więc kompletny, lecz osierocony plik po przerwanym cyklu nie staje się widoczny.

Jeśli jedno źródło context jest chwilowo niedostępne, cykl może przenieść tylko jego poprzedni, nadal poprawny snapshot i oznacza źródło oraz cały cykl `PARTIAL`. Brak poprawnego LKG zatrzymuje publikację. Pełny błąd zachowuje poprzednie wskaźniki i zwraca w UI `LAST_KNOWN_GOOD`; nie ma automatycznego retry całego cyklu.

`GET /api/automation/status` udostępnia bezpieczne pola: cycle ID/status/duration, czasy próby/sukcesu/snapshotu, wiek snapshotu, received/valid/rejected/new, Follow-up ingest, checkpointy, source health, kod błędu i status danych `FRESH`, `STALE`, `PARTIAL`, `LAST_KNOWN_GOOD`, `IN_PROGRESS` albo `UNAVAILABLE`. UI pokazuje osobno czas snapshotu oraz lokalny czas odświeżenia widoku.

## Odczytowa aktualizacja Product UI

`GET /api/product/version` zwraca wyłącznie sześć wskaźników opublikowanego widoku: `scanner_run_id`, `scanner_generated_at`, `context_run_id`, `context_generated_at`, `lifecycle_cycle_id` oraz `lifecycle_updated_at`. Endpoint tylko czyta wskaźniki/snapshot receipt; nie uruchamia collectora, providerów, OpenAI ani zapisu lifecycle.

Product UI sprawdza ten lekki endpoint co 45 sekund z jitterem ±10 sekund, co 120 sekund w ukrytej karcie i natychmiast po odzyskaniu focusu. Brak zmiany nie powoduje pełnego odświeżenia. Zmiana uruchamia jeden zwykły, ograniczony odczyt snapshotu scanner, readiness/context, lifecycle radar i statusów źródeł. Bieżąca sekcja, aktywna karta Candidate Detail oraz prywatny koszyk są zachowywane. `Refresh View` nadal wymusza natychmiastowy odczyt widoku, ale pozostaje wyłącznie odczytowy.

W izolowanym lokalnym runtime PC.1 (`?pc1_review=1`, `CRYPTO_EDGE_PC1_REVIEW_MODE=1` i `CRYPTO_EDGE_PC1_REVIEW_ROOT`) harness po 60 sekundach jednokrotnie zapisuje marker `pc1-review-publication.json` wyłącznie w `REVIEW_ROOT`. Następny zwykły odczyt `GET /api/product/version` widzi nowszy review `scanner_run_id`, `scanner_generated_at` i `lifecycle_updated_at`, więc UI wykonuje normalny bounded refresh. Marker nie uruchamia collectora, providerów, OpenAI, centralnego cycle ani zapisu kanonicznych danych; dane tokenów nie są zmieniane. Lokalny, loopbackowy `POST /api/product/review/publish-next?pc1_review=1` pozostaje wyłącznie pomocniczym przełącznikiem review.

## Jednorazowy cykl live, backup i rollback

Podgląd (zero provider calls i zero zapisów):

```cmd
scripts\win\run-central-data-cycle.cmd
```

Jedyny jawny tryb live:

```cmd
scripts\win\run-central-data-cycle.cmd --run-once-live
```

Launcher wymaga `INTERNAL_BETA`, podwójnego opt-in dla providera danych, ustawia AI research provider na `DISABLED`, czyści `OPENAI_API_KEY`, nie wykonuje retry, nie dotyka feedbacku, VPS, Cloudflare ani Task Scheduler. Po zdobyciu locka, przed pierwszą mutacją, zapisuje manifest backupu pod `tools/data-poc/.local/data-cycle/backups/<backup_id>/manifest.json`. Manifest zawiera relative path, rozmiar, SHA-256, mtime oraz chroniony hash Established Universe. Receipt cyklu znajduje się w `tools/data-poc/.local/data-cycle/last-run-once.json`.

Rollback konkretnego backupu:

```cmd
scripts\win\run-central-data-cycle.cmd --rollback <backup_id>
```

Rollback sprawdza identyfikator, manifest, wszystkie hashe oraz niezmienność Established przed przywróceniem. Pliki utworzone po backupie są przenoszone do `post-rollback`, a nie usuwane. Operacja również wymaga globalnego locka.

Konfiguracja jednorazowego launchera:

| Zmienna | Wartość/znaczenie |
| --- | --- |
| `CRYPTO_EDGE_DATA_ENV` | dokładnie `INTERNAL_BETA` |
| `CRYPTO_EDGE_RUNTIME_MODE` | dokładnie `INTERNAL_BETA` |
| `CRYPTO_EDGE_AUTOMATION_ENABLED` | `1` wyłącznie wewnątrz jawnego trybu live |
| `ALLOW_LIVE_PROVIDER_CALLS` | `1` wyłącznie wewnątrz jawnego trybu live |
| `CRYPTO_EDGE_AI_RESEARCH_PROVIDER` | wymuszone `DISABLED` |
| `OPENAI_API_KEY` | wyczyszczone przez launcher |
| `CRYPTO_EDGE_FOLLOW_UP_STORE_PATH` | opcjonalny override; bez niego jeden store `tools/data-poc/.local/follow-up/store.json` |

## Windows Task Scheduler — przygotowany, nieaktywny

Nazwa zadania: `Crypto Edge AI Central Automation`. Zaakceptowana wartość domyślna pobudki to 5 minut, konfigurowalna w zakresie 1–1440 minut. Cadence providerów pozostaje niezależny. Zadanie ma trigger cykliczny i startowy, `MultipleInstances=IgnoreNew`, repo jako working directory, kanoniczny wrapper i brak sekretów w command line.

```cmd
scripts\win\status-central-automation-task.cmd
scripts\win\last-result-central-automation-task.cmd
scripts\win\register-central-automation-task.cmd
scripts\win\register-central-automation-task.cmd --install --interval-minutes 5
scripts\win\start-central-automation-task.cmd --run-task
scripts\win\disable-central-automation-task.cmd --disable
scripts\win\unregister-central-automation-task.cmd --uninstall
scripts\win\rollback-central-automation-task-config.cmd --rollback-config
```

Komendy zmieniające stan mają osobne jawne flagi. Instalacja zapisuje XML i manifest poprzedniej konfiguracji; rollback przywraca poprzednie XML albo poprzedni brak zadania. DATA.1 nie instaluje i nie uruchamia zadania.

## Aktualny audyt operacyjny

Przed DATA.1 ostatni zatwierdzony cykl zakończył się 21.07.2026 (`scan_20260721140824_b6fb9e54`, `approved_sources_20260721140824_671ade5a`). Brak nowszego snapshotu nie wynikał z przycisku UI ani błędu per-user: centralne zadanie Windows nigdy nie zostało zainstalowane, a po tym ręcznym cyklu nie uruchomiono collectora. Kod schedulera był przygotowany, lecz bez aktywnego mechanizmu wykonawczego.

Kontrolowany cykl DATA.1 z 28.07.2026 opublikował `scan_20260728131000_0475cb6f` oraz `approved_sources_20260728131000_6794e4fa`. Wynik to `PARTIAL`: DexScreener i Alternative.me były `READY`, GoPlus `NOT_INVOKED`, Follow-up `READY`, a DefiLlama `DEGRADED` z jawnym ostrzeżeniem o zamierzonym ograniczeniu lekkiego context output do 10 rekordów. Cykl otrzymał 37 rekordów, opublikował 13 prawidłowych, odrzucił 24 i utworzył 7 unikalnych wpisów Follow-up; checkpointów należnych w chwili pierwszego ingestu było 0. Wszystkie endpointy odczytowe zwróciły HTTP 200.

Kod jest gotowy do późniejszego uruchamiania przez ten sam wrapper na Windows VPS, ale deployment, Cloudflare, publiczny dostęp i aktywacja schedulera nadal wymagają osobnego owner review. AIKINTEL/OpenAI nie jest częścią cyklu danych: przyszła integracja może wyłącznie konsumować zatwierdzoną migawkę i nie może być włączona w collector ani ścieżkę publikacji DATA.1.
