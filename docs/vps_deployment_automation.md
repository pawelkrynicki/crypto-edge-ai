# VPS Deployment & Automation

## Status

Kod sprintu przygotowano w repozytorium. Rzeczywiste wdrożenie nie zostało wykonane. Scheduler nie został aktywowany, konfiguracja Cloudflare nie została zmieniona, a tester zewnętrzny pozostaje `NO-GO`.

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

Lokalne uruchomienie przygotowanego runtime na domyślnym loopback `4180` — tylko po upewnieniu się, że port jest przeznaczony na review; ta komenda nie wdraża domeny, nie zmienia Cloudflare i nie tworzy autostartu:

```cmd
scripts\win\start-product-vps.cmd
```

Opcjonalny identyfikator builda przed startem:

```cmd
set CRYPTO_EDGE_BUILD_SHA=<commit-sha>
scripts\win\start-product-vps.cmd
```

Entry point realnego collectora pozostaje nieaktywny. Nawet ręczne `pnpm run automation:run` odmawia działania przed importem collectora, jeśli jednocześnie nie ustawiono `CRYPTO_EDGE_AUTOMATION_ENABLED=1` i `ALLOW_LIVE_PROVIDER_CALLS=1`. W tym sprincie nie należy ustawiać tych flag ani uruchamiać tej komendy.

## Dalsze kroki

1. Source-aware cadence.
2. Rejestracja jednego zadania Windows Task Scheduler dla centralnego coordinatora.
3. Controlled deployment runtime na VPS.
4. Runtime smoke przez domenę i istniejący Cloudflare Access/Tunnel.
5. Sprawdzony rollback do poprzedniego builda oraz last-known-good snapshotu.

Żaden z tych kroków nie jest wykonywany w tym sprincie.
