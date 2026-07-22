# Owner No-CMD refresh (12B.4)

## Cel i zakres

Pierwsza operacja No-CMD pozwala ownerowi zobaczyć plan cadence i, po osobnej przyszłej decyzji aktywacyjnej, uruchomić dokładnie jeden kontrolowany cykl odświeżenia danych. Operacja jest częścią istniejącego Control Center, a nie osobną publiczną zakładką. Nie dodaje edycji Established Universe, raportów, feedbacku, zmiany filtrów, scoringu, `final_label`, `WATCHLIST`, limitów ani konfiguracji providerów.

Implementacja korzysta z istniejących `decideCentralSchedule`, `runCentralSchedulerOnce`, centralnego coordinatora i globalnego single-flight locka. Nie istnieje drugi collector ani ogólny mechanizm uruchamiania skryptów. API nie przyjmuje komendy, nazwy skryptu, ścieżki ani parametrów runtime.

## Kanoniczne tryby

Logiką sterują wyłącznie nieprzetłumaczone wartości:

| Tryb | Panel | Preflight | Jednorazowy cykl |
| --- | --- | --- | --- |
| `DISABLED` | niewidoczny | niedostępny | niedostępny |
| `REVIEW_SAFE` | widoczny wyłącznie w lokalnej sesji owner review | dostępny | zablokowany |
| `ENABLED` | widoczny wyłącznie lokalnie | dostępny | dozwolony po przejściu wszystkich bramek |

Domyślny tryb to `DISABLED`. Z niego wynikają kanoniczne capabilities `owner_controls_visible = false` i `owner_actions_enabled = false`. Parametr URL, hash ani stan frontendu nie może zmienić trybu. Backend sprowadza nieznaną wartość do `DISABLED`.

Launcher 12B.4 udostępnia wyłącznie `REVIEW_SAFE`:

```cmd
scripts\win\start-product-radar-review.cmd --control-center --owner-operations-review
```

Nie ma launchera `ENABLED`. Prawdziwa aktywacja wymaga osobnej decyzji ownera po code review i przed jakimikolwiek pracami wdrożeniowymi.

## Dry-run-first i preflight

`GET /api/owner-operations/refresh-preview` wykonuje tylko odczyty lokalnego stanu, opublikowanych timestampów i globalnego locka. Używa tego samego resolvera cadence co centralny scheduler. Zwraca:

- `scanner_due` i `context_due`;
- plan `scanner_and_context`, `context_only` albo `no_action`;
- źródła, które mogą być wywołane, i źródła pomijane;
- powód `no_action`;
- dostępność globalnego locka;
- capability wykonania;
- czas ważności oraz podpisany identyfikator preflightu.

Preflight nie rezerwuje locka, nie zapisuje automation state, nie publikuje snapshotu, nie zmienia timestampów i nie wywołuje providera. Identyfikator jest krótko ważny, podpisany sekretem procesu i jednorazowy dla POST. Nie podaje przewidywanej liczby requestów, ponieważ liczba wywołań candidate-scoped GoPlus zależy od bieżących kandydatów.

## Sesja lokalna, same-origin i CSRF

Przy starcie procesu w trybie innym niż `DISABLED` backend generuje kryptograficznie losowy sekret sesji. Sekret:

- pozostaje tylko w pamięci procesu;
- nie trafia do repozytorium, URL, localStorage, logów ani odpowiedzi API;
- wygasa wraz z procesem.

Sekret podpisuje identyfikator preflightu. Frontend przesyła ten identyfikator zarówno w ścisłym body, jak i w niestandardowym nagłówku `x-crypto-edge-owner-session`; backend sprawdza podpis metodą constant-time. POST wymaga także `Content-Type: application/json`, poprawnego same-origin `Origin`, loopbackowego połączenia i loopbackowego hosta. Formularz cross-origin nie może spełnić kontraktu JSON plus niestandardowego nagłówka, a obcy lub brakujący `Origin` jest odrzucany.

Zwykły `INTERNAL_BETA`, external tester i żądanie spoza loopback otrzymują fail-closed capability. Nie dostają panelu, prawdziwego trybu ownera ani sekretu sesji. URL nie może aktywować capability.

## Zabezpieczenia mutującego POST

Jedyną mutacją jest `POST /api/owner-operations/refresh`. Body musi zawierać dokładnie:

```json
{
  "preflight_id": "<aktualny podpisany identyfikator>",
  "confirmation": true
}
```

Dodatkowe pola, `confirmation = false`, nieaktualny lub ponownie użyty preflight, błędny nagłówek, brak JSON, brak/obcy Origin, połączenie spoza loopback i niedostępny lock są odrzucane. Endpoint nie ma `force`, nie omija cadence i nie przyjmuje limitów ani konfiguracji.

Warstwa procesu atomowo zużywa preflight i dopuszcza najwyżej jedno lokalne żądanie. Centralny coordinator dodatkowo przejmuje istniejący międzyprocesowy global lock. Zajęty lock zwraca HTTP 409 bez kolejki. Sto równoległych prób z jednym preflightem może dać maksymalnie jeden zaakceptowany cykl.

## Zachowanie collectora i last-known-good

W `ENABLED` backend ponownie sprawdza świeżość preflightu i aktualny canonical schedule, a następnie przekazuje jeden cykl do istniejącego schedulera/coordinatora. Zachowane pozostają:

- jeden wspólny snapshot;
- source-aware cadence;
- candidate-scoped GoPlus;
- brak automatycznego Honeypot.is;
- walidacja przed publikacją;
- atomowa publikacja;
- last-known-good przy błędzie.

`no_action` nie uruchamia runnera, nie wywołuje providerów i nie zmienia czasu ostatniego prawidłowego runu. Błąd jest zwracany jako bezpieczny kod bez stack trace i ścieżek, a UI jasno informuje o zachowaniu last-known-good.

## Status API

`GET /api/owner-operations/status` wykonuje zero provider calls i zwraca wyłącznie bezpieczny stan capability, akcji, cadence, automatyzacji i bieżących snapshotów. Nie zwraca PID, lock metadata, ścieżek, env, sekretu, surowych nagłówków, command line, credentials ani pełnych wyjątków.

Dozwolone ścieżki i metody to wyłącznie:

- `GET /api/owner-operations/status`;
- `GET /api/owner-operations/refresh-preview`;
- `POST /api/owner-operations/refresh`.

Pozostałe metody i ścieżki fail-closed bez zmian stanu i provider calls.

## Tester boundary i readiness

Owner operations nie zmieniają verdictu produktu. External tester pozostaje `NO-GO`, a overall Trusted Tester Preview pozostaje `NOT_READY`. `PUBLIC_BETA` nie jest aktywowane. Zwykły build `INTERNAL_BETA` uruchamia się w `DISABLED`, więc tester nie widzi nazw operacji, przycisków ani capability wykonania.

## Rollback operacyjny

Rollback polega na przywróceniu `CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED` i restarcie lokalnego procesu. Powoduje to wygaśnięcie sekretu oraz wszystkich preflightów, ukrycie panelu i zamknięcie POST. Ostatni prawidłowy snapshot pozostaje bez zmian. Rollback nie wymaga modyfikacji VPS, Cloudflare ani Windows Task Scheduler.

## Owner review

Owner sprawdza wyłącznie widoczność panelu w `REVIEW_SAFE`, wersje PL/EN, czytelność planu, jasną blokadę prawdziwej akcji, brak panelu w zwykłym widoku oraz brak technicznych komend i ścieżek. Owner nie uruchamia prawdziwego odświeżenia i nie powtarza testów technicznych.
