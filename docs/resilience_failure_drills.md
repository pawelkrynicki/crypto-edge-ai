# STAB.1 — odporność produktu i kontrolowane failure drills

## Cel i granice

STAB.1 sprawdza zachowanie produktu podczas kontrolowanych awarii przed Release Candidate. Przebieg nie wykonuje live OpenAI calls, live data-provider calls ani centralnego live cycle. Nie zmienia Task Scheduler, kanonicznych magazynów, procesów produkcyjnych, VPS, Cloudflare, AIKINTEL, Krakena ani AFF.1.

Wszystkie mutacje trafiają wyłącznie pod:

```text
%TEMP%\crypto-edge-resilience-failure-drills\<run_id>\
```

Runner używa kontrolowanego snapshotu, deterministycznych mock providerów, osobnych pointerów, osobnego Follow-up, Established Universe, feedback SQLite, repozytorium raportów, katalogu automatyzacji i zestawu kolejek AI SQLite. Fixture posiada prawidłową tożsamość `base + contract_address` i nigdy nie jest prezentowane jako źródło produkcyjne.

## Scenariusze

Manifest obejmuje 20 scenariuszy:

1. timeout po poprawnej migawce;
2. nieprawidłowy schemat skanera;
3. stara, ale prawidłowa migawka;
4. błąd pierwszego odczytu i późniejsze odzyskanie;
5. nakładające się cykle centralne;
6. częściowa awaria źródła;
7. awaria wszystkich źródeł;
8. odzyskanie źródła;
9. otwarcie circuit breakera;
10. błąd atomowego zapisu Follow-up;
11. nieprawidłowy checkpoint;
12. błąd decyzji/publikacji Established;
13. restart Follow-up;
14. odzyskanie orphan AI job po wygaśnięciu lease;
15. nieprawidłowa odpowiedź mock providera;
16. przekroczenie liczby prób AI;
17. cooldown i rate limit;
18. restart kolejki AI;
19. błąd publikacji raportu;
20. błąd zapisu feedbacku.

## Model last-known-good

Frontend przyjmuje tylko odpowiedź spełniającą kontrakt snapshotu. Walidowane są struktury `scan_run`, `candidates`, `security_checks`, `scorecards`, provenance i source metadata. Nieprawidłowa odpowiedź kończy się `SCANNER_RESPONSE_INVALID` przed zmianą stanu widoku.

Po zaakceptowaniu snapshotu stan sesji przechowuje listę, wybrany token, routing, aktywną zakładkę, `run_id`, source metadata, freshness i prawdziwy timestamp snapshotu. Timeout lub błąd schematu nie zmienia tych wartości. UI pokazuje nietechniczny alert. Następny prawidłowy refresh atomowo zastępuje stan i usuwa alert.

Stary snapshot jest nadal widoczny, ma `STALE` i zachowuje oryginalny czas wygenerowania. Pierwszy błąd bez last-known-good pokazuje prawdziwy pusty stan; nie ma fallbacku do fixture.

Centralny cykl zachowuje poprzednie pointery, gdy runner zawiedzie albo nie dostarczy nowego identyfikatora. Pointer przechodzi na nowy snapshot dopiero po zwalidowanym wyniku i atomowym zapisie stanu. AI.3 zwraca ostatni poprawny brief, gdy nowy fingerprint jest w kolejce lub kończy się kontrolowanym błędem.

## Retry i backoff

Centralny cykl uznaje za retryable błędy sieci, timeout, HTTP 429/5xx i chwilową niedostępność źródła. Nie dodaje pętli retry w procesie: następna próba może nastąpić wyłącznie w istniejącym schedulerze. Maksymalnie trzy kolejne błędy przejściowe otwierają breaker.

Błędy schema, contract, lineage i provenance są deterministyczne i fail-closed. Nie są automatycznie ponawiane.

AI worker ma maksymalnie trzy próby, bazowy backoff 30 sekund i mnożnik 2. Timeout, błąd sieci, rate limit i błąd serwera providera są retryable. Błąd walidacji, model mismatch, zmieniony fingerprint i błąd schematu store są fail-closed. Drill limitu używa krótszego, wstrzykniętego zegara i backoffu, ale nie zmienia wartości produkcyjnych.

Follow-up, Reports i Feedback nie wykonują automatycznego retry. Nowa próba wymaga jawnej akcji użytkownika lub ownera.

## Circuit breaker

Breaker otwiera się po jednym deterministycznym błędzie kontraktu albo po trzech kolejnych błędach przejściowych centralnego cyklu. AI worker przechodzi do `SUSPENDED` po błędzie nieretryowalnym lub wyczerpaniu prób.

W stanie open collector/provider nie jest uruchamiany. Zwykły użytkownik nie może wznowić mechanizmu. Half-open jest pojedynczym, ograniczonym probe uruchamianym przez uwierzytelnionego ownera przez istniejący coordinator/worker. Dopiero poprawna walidacja i publikacja zamyka breaker oraz zeruje licznik błędów.

## Atomic writes

Follow-up zapisuje plik tymczasowy, wykonuje `fsync`, zachowuje backup i dopiero później wykonuje atomowy replace. Punkt awarii STAB.1 jest wstrzykiwany przed replace; poprzedni plik pozostaje byte-identical.

Established Universe używa locka, optimistic version/checksum guards i atomowego write. Błąd decyzji lub write nie publikuje nowej wersji, historii ani audytu.

Raporty są publikowane jako para Markdown + JSON. Oba pliki najpierw trafiają do plików tymczasowych i są synchronizowane. Markdown jest publikowany pierwszy, a JSON — jedyny artefakt widoczny dla Reports Library — ostatni. Library ignoruje pliki tymczasowe i companion Markdown. Powtórzenie identycznej publikacji daje jeden raport; konflikt treści failuje zamknięcie.

SQLite Feedback i AI używają transakcji. Niepełny wynik AI nie otrzymuje `READY`, a feedback nie posiada żadnej ścieżki do zmiany lifecycle.

## Orphan recovery i restarty

`PROCESSING` posiada ownera lease i `lease_expires_at`. Inny worker nie może przejąć aktywnego lease. Po restarcie i wygaśnięciu lease kolejka zwraca ten sam `analysis_id`; unikalny cache key uniemożliwia drugi rekord i równoległe wykonanie.

Restart kolejki zachowuje `QUEUED`, `PROCESSING`, fingerprint i shared cache key. Restart Follow-up ponownie waliduje checksum, odtwarza checkpointy i deduplikuje według `chain + contract_address`.

## Ochrona danych

Przed i po przebiegu porównywane są SHA-256:

- kanoniczny Follow-up i backup;
- Established Universe oraz wersjonowana konfiguracja adresów;
- feedback SQLite wraz z WAL/SHM;
- AI SQLite wraz z WAL/SHM;
- centralny pointer `automation-state.json`;
- kanoniczne Reports Library;
- katalog konfiguracji repozytorium.

Task Scheduler jest wyłącznie obserwowany przez `Get-ScheduledTask` na hoście ownera. Manifest zawsze utrzymuje osobne `scheduler_host_status` i `scheduler_mutations=0`. Dowolna zmiana kanonicznego hasha ustawia cały run na `FAILED`; runner nie wykonuje automatycznej naprawy.

## Manifest i raport

Źródłem audytu jest `product_failure_drill_run_v1`. JSON zawiera `run_id`, czasy, status, scenariusze, `expected_result`, `actual_result`, `recovery_result`, stany chronione before/after, liczbę mutacji kanonicznych i schedulera, liczniki live calls, bezpieczne kody błędów, politykę retry/circuit breakera, lokalizacje izolowane i ścieżkę do Markdown.

Manifest nie zapisuje sekretów, promptów, Authorization, cookie, danych sesyjnych ani danych osobowych. `mock_provider_calls` jest licznikiem deterministycznego testu i nie jest licznikiem OpenAI.

Statusy:

- `PASS` — wszystkie wymagane scenariusze przeszły, odzyskanie zostało udowodnione, a live calls i mutacje kanoniczne wynoszą zero;
- `PARTIAL` — rdzeń ochrony przeszedł, ale jawnie opcjonalna obserwacja nie była dostępna;
- `FAILED` — dowolny scenariusz obowiązkowy, recovery albo ochrona kanoniczna zawiodły.

Raport Markdown pokazuje symulowane awarie, last-known-good, recovery, duplikaty, mutacje kanoniczne, scheduler, live calls oraz listę scenariuszy wymagających poprawki.

## Granica klient / owner

Klient otrzymuje wyłącznie naturalne komunikaty PL/EN. Nie widzi stack trace, nazw wyjątków, ścieżek, SQLite, providera/modelu AI, attempt count, lease ID ani wnętrza circuit breakera. Szczegóły techniczne i bezpieczne kody pozostają w manifeście ownera i Centrum sterowania.

## Owner review

Domyślny preview:

```cmd
scripts\win\start-resilience-failure-drills-review.cmd
```

Preview pokazuje scenariusze i przyszłe lokalizacje, nie tworzy store, nie wykonuje awarii, nie uruchamia workera, nie zmienia schedulera i otwiera dokładnie jedną kartę z tym runbookiem.

Jawny przebieg izolowany:

```cmd
scripts\win\start-resilience-failure-drills-review.cmd --run-isolated
```

Launcher zeruje wszystkie live opt-ins i klucz OpenAI. Może odczytać status Task Scheduler, ale nie instaluje, nie zatrzymuje, nie uruchamia, nie włącza, nie wyłącza ani nie modyfikuje zadania. Otwiera dokładnie jedną kartę raportu.

## Następny etap

PASS STAB.1 jest bramką do osobnego etapu backup/restore/rollback. Ten etap nie wykonuje backupu ani restore danych produkcyjnych i nie jest dowodem gotowości VPS/Cloudflare. AFF.1 pozostaje odłożone na końcówkę.
