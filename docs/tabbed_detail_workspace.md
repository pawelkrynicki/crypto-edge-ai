# UX.2 + UX.3 + UX.4 — Tabbed Detail Workspace, nagłówek klienta i neutralne AI

Candidate Detail jest jednym szerokim obszarem analitycznym. Nad treścią znajduje się kompaktowy nagłówek wybranego tokena oraz poziomy pasek siedmiu zakładek. Pod nim renderowany jest dokładnie jeden duży panel aktywnej zakładki; widok nie używa master-detail ani stałych kolumn kontekstu, podsumowania i szczegółów.

## Nagłówek i zakładki

Nagłówek zachowuje symbol, nazwę, warstwę Radaru, sieć, DEX, skrócony contract address z kopiowaniem, kompletność danych i najbliższy krok. Zakładki to: Podsumowanie, Obserwacja, Rynek, Filtry, Bezpieczeństwo, Analiza AI oraz Dane i źródła.

Pasek ma semantykę `tablist` / `tab`, aktywna zakładka ustawia `aria-selected=true` i wskazuje jeden `tabpanel` przez `aria-controls`. Strzałki, Home i End zmieniają zakładkę wraz z focusem. Aktywna zakładka jest wizualnie połączona z panelem, a przełączenie nie zmienia wysokości nagłówka.

Podsumowanie odpowiada na najważniejsze pytania o token, pozycję w Radarze, kompletność, blokady, dostępność AI i kolejny krok. Obserwacja zachowuje lifecycle i checkpointy. Rynek, Filtry i Bezpieczeństwo pokazują swoje istniejące dane oraz stany braków. Bezpieczeństwo prowadzi do Weryfikacji źródeł. Analiza AI zachowuje wszystkie stany AI.3 i pełny Canvas. Dane i źródła łączą aktualność, źródła, contract address, pair address, kopiowanie i świadomie rozwijane szczegóły techniczne.

## Routing

Tożsamość tokena pozostaje oparta o `chain + contract_address`. URL zapisuje aktywną zakładkę jako `detail=summary|observation|market|filters|security|ai|data`. Brak lub nieobsługiwana wartość daje `summary`. Wybór innego tokena wraca do Podsumowania, a zdarzenia Back/Forward odtwarzają token i zakładkę.

## Desktop i mobile

Na desktopie workspace wykorzystuje całą dostępną szerokość i wysokość obszaru roboczego. Własny pionowy scroll ma wyłącznie panel treści, gdy jest potrzebny. Na mobile nagłówek pozostaje kompaktowy, zakładki przewijają się poziomo, panel zajmuje pełną szerokość, kontrolki mają minimum 44 px, a dokument blokuje poziomy overflow.

## Nagłówek klienta i neutralne AI

Nagłówek klienta zawiera identyfikację Crypto Edge AI, ostatnią aktualizację, PL/EN i Odśwież widok. Alerty `STALE`, `PARTIAL` i `UNAVAILABLE` pozostają nietechniczne. Client-facing AI nie pokazuje OpenAI, nazwy modelu ani trybu providera; techniczne metryki są dostępne wyłącznie w istniejących powierzchniach ownera. Kolejka, worker, fingerprint, cache key i logika AI.3 nie są zmieniane.

## Bezpieczny owner review

```cmd
scripts\win\start-tabbed-detail-review.cmd
```

Launcher uruchamia fixture-free `INTERNAL_BETA`, wybiera istniejącą obsługiwaną tożsamość z aktualnego zwalidowanego snapshotu i otwiera dokładnie jedną kartę na `detail=summary`. Provider AI, live-source opt-in, collector, worker i mutacje ownera są wyłączone. Launcher nie zmienia Follow-up, Established, feedback, lifecycle ani Task Scheduler.
