# Control Center shell (12B.1)

## Cel

Control Center jest wyłącznie odczytowym ekranem statusu wewnątrz istniejącego Product Radar. Ma pozwolić ownerowi w mniej niż minutę odróżnić lokalną sprawność produktu od gotowości wersji dla zewnętrznego testera. Nie jest osobną aplikacją i nie jest panelem operatorskim.

Aktualny verdict dla **Trusted tester preview**: **`NOT_READY`**.

Lokalnie działający kod, API lub świeże dane nie oznaczają gotowości do testu zewnętrznego. Nadal niepotwierdzone są wdrożenie VPS, końcowy smoke Cloudflare Access, trwały feedback, Reports Library, rollback i zgoda ownera.

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

- **Runtime i API** — tryb runtime, łączność same-origin API, readiness, opcjonalny build SHA i status danych; uptime nie jest główną informacją produktową.
- **Dane i snapshoty** — ostatnie czasy scannera i kontekstu, freshness, last-known-good oraz liczby New / observation i Established po filtrach.
- **Źródła danych** — `Available`, `Partially available` lub `Unavailable` z istniejącego resolvera source health Product Radar.
- **Automatyzacja** — aktywność, ostatni run i wynik, następny run oraz najbliższy termin po aktywacji. Stan nieaktywny nie jest `READY`.
- **Established Universe** — validation status, wersja, liczba aktywnych wpisów i ostatnia zmiana. Zero wpisów nie jest awarią przy poprawnej walidacji.
- **Review storage** — dostępność, liczba zapisów i ostatni zapis. Brak zapisów jest neutralny; niedostępny storage daje `NOT_READY`.
- **Reports** — `NOT_READY`; Reports Library nie została jeszcze ukończona.
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

1. 12B.2 — Reports Library i Feedback Loop.
2. 12C — Trusted Tester Preview Mode.
3. Deployment na VPS.
4. Smoke przez domenę i Cloudflare Access.
5. Test rollbacku.
6. Zgoda ownera dla testera.

12B.1 nie wdraża produktu na VPS, nie zmienia Cloudflare i nie aktywuje Windows Task Scheduler.

## Owner review

Owner ocenia tylko ekran, statusy, EN/PL, brak mutujących akcji i overall `NOT_READY`. Nie musi powtarzać walidacji technicznej.

```cmd
scripts\win\start-product-radar-review.cmd --control-center
```
