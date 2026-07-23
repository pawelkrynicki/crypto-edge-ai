# Control Center shell (12B.1)

## Cel

Control Center jest wyłącznie odczytowym ekranem statusu wewnątrz istniejącego Product Radar. Ma pozwolić ownerowi w mniej niż minutę odróżnić lokalną sprawność produktu od gotowości wersji dla zewnętrznego testera. Nie jest osobną aplikacją i nie jest panelem operatorskim.

Aktualny verdict dla **Trusted tester preview**: **`NOT_READY`**.

Lokalnie działający kod, API, świeże dane lub gotowa read-only Reports Library nie oznaczają gotowości do testu zewnętrznego. Nadal niepotwierdzone są wdrożenie VPS, końcowy smoke Cloudflare Access, trwały feedback, rollback i zgoda ownera.

## Kanoniczny model statusów

Logika operuje wyłącznie na kodach maszynowych. Tłumaczenia nigdy nie są analizowane przez resolver.

| Kod | EN | PL | Znaczenie |
| --- | --- | --- | --- |
| `READY` | Ready | Gotowe | Obszar spełnia kontrakt bieżącego etapu. |
| `PARTIAL` | Partial | Częściowo gotowe | Obszar jest użyteczny, ale ma ograniczenie lub stan opóźniony. |
| `NOT_READY` | Not ready | Niegotowe | Brakuje wymaganej zdolności albo lokalny kontrakt jest niedostępny. |
| `MANUAL_CHECK_REQUIRED` | Manual check required | Wymaga ręcznego sprawdzenia | Stan wymaga decyzji lub kontroli ownera; nie wolno prezentować go jako `READY`. |

Jedynym resolverem statusu Control Center jest `resolveControlCenterStatus` w `tools/ui-mock/src/controlCenterStatus.ts`.

## Obliczanie overall readiness

Resolver najpierw wyznacza status każdej sekcji z nieprzetłumaczonych stanów wejściowych, a następnie stosuje kolejność ważności:

1. dowolny `NOT_READY` daje overall `NOT_READY`;
2. w przeciwnym razie dowolny `PARTIAL` daje overall `PARTIAL`;
3. w przeciwnym razie dowolny `MANUAL_CHECK_REQUIRED` daje taki sam overall;
4. tylko komplet `READY` daje overall `READY`.

W 12B.1 bramki Reports Library, trwałego feedbacku, Trusted Tester Preview Mode, wdrożenia VPS, smoke Cloudflare Access, testu rollbacku i zgody ownera są jawnie `false`. Dlatego overall pozostaje `NOT_READY` także wtedy, gdy lokalny runtime, API i snapshot są gotowe.

Stary, ale prawidłowy last-known-good scanner snapshot daje `PARTIAL` sekcji danych. Nie zmienia statusu działającego runtime na awarię. Prawidłowy Established Universe z 0 aktywnych wpisów pozostaje `READY`.

## Sekcje

- **Runtime i API** — dostępność `/api/health`, łączność same-origin API, poprawny tryb runtime i opcjonalny build SHA. Wynik `/api/readiness` jest pokazany wyłącznie jako informacja „Gotowość danych” i nie steruje statusem tej karty; uptime nie jest główną informacją produktową.
- **Dane i snapshoty** — ostatnie czasy scannera i kontekstu, freshness, last-known-good oraz liczby New / observation i Established po filtrach.
- **Źródła danych** — `Available`, `Partially available` lub `Unavailable` z istniejącego resolvera source health Product Radar.
- **Automatyzacja** — aktywność, ostatni run i wynik, następny run oraz najbliższy termin po aktywacji. Stan nieaktywny nie jest `READY`.
- **Established Universe** — validation status, wersja, liczba aktywnych wpisów i ostatnia zmiana. Zero wpisów nie jest awarią przy poprawnej walidacji.
- **Maturing / follow-up** — osobny status lokalnego store, aktywne i due records, Candidate for Established oraz najbliższy due. Pusty poprawny store jest `READY`; recovered store jest `PARTIAL`, a invalid/unavailable może być `NOT_READY` bez zmiany statusu działającego Runtime i API.
- **Review storage** — dostępność, liczba zapisów i ostatni zapis. Brak zapisów jest neutralny; niedostępny storage daje `NOT_READY`.
- **Reports** — status pochodzi z kanonicznego indeksu Reports Library: `READY` także przy 0 raportów, `PARTIAL` przy co najmniej jednym prawidłowym i pominiętych artefaktach, `NOT_READY` przy niedostępnym storage lub niespełnialnym kontrakcie. Karta pokazuje liczbę raportów, najnowszy raport i liczbę pominiętych artefaktów.
- **Dostęp i wdrożenie** — lokalny runtime, niepotwierdzony VPS, wymagany końcowy smoke Cloudflare Access i external tester `NO-GO`.
- **Feedback** — `NOT_READY`; trwałe zbieranie feedbacku testera nie jest gotowe.

## Read-only API i granice bezpieczeństwa

`GET /api/control-center/status` działa w istniejącym wspólnym handlerze API i agreguje wyłącznie lokalne, istniejące odczyty produktu. UI korzysta z same-origin `GET`.

Control Center:

- nie uruchamia collectora ani schedulerów;
- nie wykonuje provider calls;
- nie zapisuje review i nie zmienia Established Universe;
- nie zmienia automatyzacji;
- nie ujawnia lokalnych ścieżek, PID, lock metadata, sekretów ani env;
- nie udostępnia `POST`, `PUT`, `PATCH` ani `DELETE` pod ścieżką Control Center;
- nie ma terminala, edytora universe ani przycisków wykonujących komendy;
- odświeża widok wyłącznie przez ponowny `GET`.

Widoczna granica produktu pozostaje bez zmian: Crypto Edge AI jest narzędziem badawczym, a `WATCHLIST` oznacza wyłącznie ręczną analizę.

## Dalszy plan 12B i 12C

Kolejne prace powinny zachować tę kolejność:

1. trwały Feedback Loop po ukończonej read-only Reports Library 12D.1.
2. 12C — Trusted Tester Preview Mode.
3. Deployment na VPS.
4. Smoke przez domenę i Cloudflare Access.
5. Test rollbacku.
6. Zgoda ownera dla testera.

12B.1 nie wdraża produktu na VPS, nie zmienia Cloudflare i nie aktywuje Windows Task Scheduler.

## Aktualizacja 12D.1

Od 12D.1 karta Reports nie korzysta ze stałej bramki. `GET /api/control-center/status` wywołuje ten sam bezpieczny `readReportsLibraryStatus`, którego używa `GET /api/reports/status`, więc karta korzysta z kanonicznego statusu biblioteki.

- `READY` przy 0 raportów jest prawidłowym, neutralnym stanem gotowej biblioteki.
- Reports Library ze statusem `READY` nie występuje na liście blockerów.
- `PARTIAL` albo `NOT_READY` mogą ponownie dodać Reports Library jako osobny blocker.
- Trwałe zbieranie feedbacku pozostaje niezależnym blockerem i nie jest łączone z Reports Library.

Overall nadal pozostaje `NOT_READY`, ponieważ feedback i access/deployment pozostają niegotowe. Szczegóły kontraktu znajdują się w `docs/read_only_reports_library.md`.

## Aktualizacja: Maturing / Follow-up Basket

`GET /api/control-center/status` korzysta z tego samego bezpiecznego resolvera co `GET /api/follow-up/status`. Karta Follow-up nie uruchamia collectora ani providerów i nie udostępnia mutacji. Błąd store’u jest lokalny dla tej karty: poprawny scanner last-known-good oraz status Runtime i API pozostają niezależne. Overall Trusted Tester Preview nadal jest `NOT_READY`. Pełny kontrakt: `docs/maturing_follow_up_basket.md`.

## Local owner review: ACCEPT_LOCAL_CODE — 22.07.2026

Owner review zaakceptował lokalny kod etapu 12B.1 i potwierdził:

- ogólny status Trusted Tester Preview pozostaje `NOT_READY`;
- **Runtime i API** ma status `READY` przy działającym health, połączonym API i poprawnym `INTERNAL_BETA`;
- gotowość danych nie steruje statusem runtime;
- stare lub brakujące snapshoty dają `PARTIAL` wyłącznie w karcie **Dane i snapshoty**;
- częściowo dostępne źródła dają `PARTIAL`;
- nieaktywna automatyzacja wymaga ręcznego sprawdzenia;
- prawidłowy pusty Established Universe ma status `READY`;
- Review Storage z 0 zapisów ma neutralny status `READY`;
- Reports, deployment/access i feedback pozostają `NOT_READY`;
- UI nie zawiera przycisków mutujących ani komend;
- polska wersja jest czytelna i logiczna.

Pierwsza wersja owner review wykryła błędne powiązanie statusu **Runtime i API** z data readiness. Commit `fc05d0a8c6dba611a26c9babcb1a24ae6bce749f` rozdzielił te dwa obszary: stan danych pozostaje widoczny, ale nie obniża statusu prawidłowo działającego runtime i API.

Akceptacja lokalnego kodu nie oznacza gotowości całego produktu dla testera zewnętrznego. External tester pozostaje `NO-GO` do czasu zamknięcia pozostałych bramek.

## Owner operations w 12B.4

Etap 12B.4 dodaje wewnątrz Control Center osobną, backend-gated sekcję **Operacje ownera / Owner operations**. Nie zmienia ona read-only kontraktu `/api/control-center/status`: korzysta z osobnych, ściśle nazwanych endpointów `/api/owner-operations/*`.

W domyślnym `DISABLED` sekcja nie renderuje się i nie może zostać włączona hashem ani parametrem URL. `REVIEW_SAFE` pozwala wyłącznie na read-only preflight; prawdziwy POST pozostaje zablokowany. Zwykły `INTERNAL_BETA` i tester nie dostają capability ownera. Overall pozostaje `NOT_READY`, a external tester `NO-GO`. Pełny kontrakt bezpieczeństwa znajduje się w `docs/owner_no_cmd_refresh.md`.

Bezpieczny przegląd panelu 12B.4, bez provider calls i bez prawdziwego odświeżenia:

```cmd
scripts\win\start-product-radar-review.cmd --control-center --owner-operations-review
```

Pierwszy panel operacji ownera został zaakceptowany lokalnie 22.07.2026 z werdyktem `ACCEPT_LOCAL_CODE`. Panel pozostaje ukryty dla testera, domyślnie wyłączony w trybie `DISABLED` i dostępny podczas lokalnego owner review wyłącznie jako bezpieczny `REVIEW_SAFE`; tryb `ENABLED` nie został aktywowany.

## Owner review

Owner ocenia tylko ekran, statusy, EN/PL, brak mutujących akcji i overall `NOT_READY`. Nie musi powtarzać walidacji technicznej.

```cmd
scripts\win\start-product-radar-review.cmd --control-center
```
