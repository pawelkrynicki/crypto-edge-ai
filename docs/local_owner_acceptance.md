# OA.1 — Local Owner Acceptance

OA.1 jest krótką, ręczną bramką ownera przed dopuszczeniem zaufanego testera. Nie jest kolejnym etapem budowy, soakem ani pełną regresją. Finalny werdykt należy wyłącznie do ownera; launcher i testy techniczne nigdy nie ustawiają `ACCEPT` automatycznie.

## Wykorzystane mechanizmy

Sesja reużywa istniejące mechanizmy bez tworzenia drugiej powierzchni produktu:

- fixture-free `INTERNAL_BETA` product runtime i `/api/health`;
- aktualne, już opublikowane snapshoty Scanner/Context oraz istniejące store;
- Product Radar z New, Follow-up i Established;
- Candidate Detail z tożsamością `chain + contract_address`, routingiem i siedmioma zakładkami;
- istniejące read-only Reports i Persistent Feedback;
- `REVIEW_SAFE` dla owner-only powierzchni, bez włączenia akcji ownera;
- provider-neutralny klient AI z providerem i workerem wyłączonym.

## Uruchomienie

Bezpieczny preview jest domyślny:

```cmd
scripts\win\start-owner-acceptance-review.cmd
```

Preview otwiera dokładnie jedną kartę z tym runbookiem. Nie uruchamia runtime, collectora, providera ani OpenAI i nie zapisuje artefaktów.

Pełna lokalna sesja ownera wymaga jawnej flagi:

```cmd
scripts\win\start-owner-acceptance-review.cmd --run-local
```

Launcher buduje i uruchamia lokalny `INTERNAL_BETA` na `127.0.0.1`, sprawdza health, otwiera dokładnie jedną kartę Radaru i prowadzi ownera przez 10 pytań w konsoli. Nawigacja i `Refresh view` tylko odczytują aktualne opublikowane dane. Centralny collector, providerzy danych, AI worker, OpenAI, Task Scheduler, Established Universe oraz backup/restore/rollback pozostają nietknięte. Po ręcznym werdykcie runtime uruchomiony przez sesję jest zamykany przed publikacją artefaktów.

## Dziesięć punktów akceptacji

1. Start produktu i health.
2. Radar pokazuje prawdziwe dane, freshness i poprawny timestamp.
3. Widoki New, Follow-up i Established są zrozumiałe.
4. Candidate Detail otwiera prawidłowy token i siedem zakładek.
5. Refresh zachowuje token, routing i aktywną zakładkę.
6. Security, dane rynkowe i brakujące dane są czytelnie rozdzielone.
7. Sekcja AI działa przy wyłączonym OpenAI i nie pokazuje klientowi providera ani modelu.
8. Reports i Feedback działają zgodnie z istniejącymi uprawnieniami.
9. PL/EN oraz podstawowy desktop i mobile viewport nie mają blokujących problemów.
10. Granice klient/owner są zachowane; klient nie ma dostępu do operacji technicznych.

Każdy punkt wymaga statusu `PASS`, `FAIL`, `BLOCKED` albo `NOT_APPLICABLE` i niepustej notatki ownera. Dla viewportów wystarczy praktyczna kontrola desktop `1440 × 900` oraz mobile `390 × 844`; nie jest to nowy pełny cross-browser pass.

## Findings i decyzja

- P0: utrata danych, naruszenie bezpieczeństwa albo crash całego produktu.
- P1: blokada głównego flow, Radaru, Candidate Detail, Refresh lub owner boundary.
- P2/P3: kosmetyka, drobne teksty, ostrzeżenia i małe niedogodności — zapisz na później, nie naprawiaj w OA.1.

P0 lub P1 blokuje akceptację i wymusza `REJECT`. Dozwolone ręczne werdykty to `ACCEPT`, `ACCEPT_WITH_NOTES` i `REJECT`. Brak werdyktu, werdykt automatyczny oraz akceptacja przy zapisanym P0/P1 nie przechodzą walidacji manifestu.

## Artefakty

Po zakończonej sesji powstają:

```text
tools\ui-mock\.local\owner-acceptance\<session_id>\manifest.json
tools\ui-mock\.local\owner-acceptance\<session_id>\report.md
```

Manifest ma wersję `owner_acceptance_session_v1` i zapisuje session ID, commit SHA, czas rozpoczęcia/zakończenia, 10 wyników z notatkami, P0/P1, odłożone P2/P3, ręczny werdykt oraz potwierdzenia: 0 OpenAI calls, 0 provider calls, 0 zmian Task Scheduler i zakończenie lokalnego procesu. `report.md` jest owner-only artefaktem operacyjnym i nie jest routowany ani linkowany w widoku klienta. Nie wklejaj do notatek sekretów, cookie, tokenów sesyjnych ani nagłówków autoryzacji; walidator odrzuca typowe wzorce sekretów.

Jeżeli owner przerwie pytania albo zapis się nie powiedzie, launcher nadal zamyka uruchomiony runtime, a finalny manifest bez ręcznego werdyktu nie jest publikowany.
