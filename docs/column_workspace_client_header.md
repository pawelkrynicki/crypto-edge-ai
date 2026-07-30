# UX.2 + UX.3 + UX.4 — kolumnowy workspace, nagłówek klienta i neutralna warstwa AI

## Zakres

Candidate Detail działa jako jedna przestrzeń master-detail. Nie jest już wieloekranową stroną z kompletem sekcji ułożonych pionowo. Tożsamość tokena nadal jest wyłącznie parą `chain + contract_address`; symbol, nazwa, adres pary i pozycja na liście nie uczestniczą w dopasowaniu.

Zmiana dotyczy prezentacji. Nie zmienia lifecycle, checkpointów, Follow-up, Established Universe, feedback store, fingerprintu AI, cache key, workera ani kontraktu wspólnej kolejki AI.3.

## Model kolumn

Desktop ma trzy współpracujące kolumny:

1. **Kontekst tokena** — wybrany token, jego warstwa Radaru, sieć, DEX, skrócony adres z kopiowaniem oraz powrót do listy.
2. **Podsumowanie** — odpowiedzi: co to jest, aktualna warstwa Radaru, kompletność danych, główne blokady i następny krok. Osiem kompaktowych modułów otwiera szczegóły: Tożsamość, Przepływ obserwacji, Rynek, Filtry, Weryfikacja i bezpieczeństwo, Analiza badawcza AI, Dane i aktualność oraz Źródła.
3. **Aktywna warstwa** — jednocześnie renderuje dokładnie jedną pełną sekcję. Nagłówek warstwy zachowuje symbol, sieć i nazwę sekcji. Przycisk powrotu oraz `Esc` zamykają warstwę bez utraty tokena.

Każda kolumna ma własny pionowy scroll. Kontener ma wysokość zależną od viewportu i nie wydłuża głównej strony do kilkunastu ekranów. Długie adresy zawijają się wewnątrz kolumn; kopiowanie contract address i pair address pozostaje dostępne w warstwie Tożsamość.

## Routing i zmiana tokena

Widok zapisuje w URL:

- `chain`;
- `contract`;
- opcjonalne `detail` z allowlisty ośmiu warstw;
- hash `#candidate-detail`.

Przykład:

```text
/?chain=base&contract=0x...&detail=security#candidate-detail
```

Nieobsługiwana wartość `detail` jest ignorowana. Wybór innego tokena usuwa poprzednią aktywną warstwę i wraca do jego podsumowania. Historia przeglądarki odtwarza token i warstwę.

## Węższy desktop i mobile

Przy szerokości 761–1200 px pozostają dwie kolumny: kontekst i podsumowanie. Aktywna pełna warstwa otwiera się jako prawy drawer, a zamknięcie przywraca podsumowanie.

Do 760 px obowiązuje sekwencja pełnoekranowa:

```text
Radar / lista → podsumowanie tokena → aktywna warstwa
```

Kontekst listy pozostaje w Radarze, podsumowanie ma przycisk powrotu do listy, a warstwa ma przycisk powrotu do podsumowania. Główny dokument nie przewija się poziomo. Główne elementy dotykowe mają co najmniej 44 px.

## Nagłówek klienta i alerty danych

Nagłówek klienta zawiera tylko kompaktową identyfikację Crypto Edge AI, czas ostatniej aktualizacji danych, przełącznik EN/PL, przycisk „Refresh view / Odśwież widok” oraz niezbędny mobilny przycisk nawigacji.

Nie zawiera API, runtime, backendu, source health, statusu schedulera, run ID ani rozwijanych szczegółów technicznych. Te dane pozostają w wewnętrznym Control Center i istniejących endpointach ownera.

Stany `STALE`, `PARTIAL` i `UNAVAILABLE` są sygnalizowane w treści krótkim, nietechnicznym alertem. Alert nie pokazuje kodów błędów, nazw endpointów, providerów ani ścieżek.

## Neutralna warstwa AI

Klient widzi wyłącznie język produktu: Analiza AI, Analiza badawcza AI, wspólna kolejka analizy, analiza dostępna lub analiza przygotowywana. Nie widzi nazwy providera, modelu ani trybu wykonawczego.

Moduł podsumowania pokazuje status, krótkie wyjaśnienie i następny krok. Pełny Canvas renderuje się dopiero w warstwie AI. `READY` i `STALE` otwierają Canvas z last-known-good, a `COOLDOWN` i `RATE_LIMITED` zachowują nieaktywne CTA. Pozostałe stany AI.3 pozostają rozłączne: `ABSENT`, `QUEUED`, `PROCESSING`, `FAILED`, `SUSPENDED` i stan niedostępności.

Techniczne metryki Canvas — model, wersja promptu, fingerprint, token usage, latency, validation i request ID — są renderowane tylko wtedy, gdy lokalny endpoint ownera zwróci `reviewMetrics`. Publiczny Canvas ich nie pokazuje. Konfiguracja serwera, worker, queue store i owner metrics nadal zachowują informacje providera i modelu.

Taki podział pozwala później zastąpić warstwę wykonawczą własnym AI bez zmiany architektury klienta. Nazwy, rytm informacji, ciemny terminalowy styl i ograniczony cyan/teal pozostają wizualnie gotowe do przeniesienia do AIKINTEL.

## Dostępność

- moduły są natywnymi przyciskami z `aria-pressed` i jednoznacznym `aria-label`;
- po otwarciu focus przechodzi do kolumny warstwy;
- `Esc` wraca do podsumowania bez pułapki focusu;
- aktywny moduł ma obramowanie, cyanowy znacznik i stan semantyczny;
- nagłówek warstwy zawsze pokazuje token oraz aktywną sekcję;
- układ respektuje `prefers-reduced-motion` istniejącego Canvas.

## Bezpieczny owner review

```cmd
scripts\win\start-column-workspace-review.cmd
```

Launcher uruchamia fixture-free `INTERNAL_BETA`, odczytuje aktualny zwalidowany snapshot przez lokalne API, wybiera istniejącą obsługiwaną tożsamość i otwiera dokładnie jedną kartę podsumowania. Nie tworzy tokena, nie uruchamia collectora, AI workera ani zewnętrznych źródeł i nie zmienia Follow-up, Established, feedback, lifecycle lub Task Scheduler.
