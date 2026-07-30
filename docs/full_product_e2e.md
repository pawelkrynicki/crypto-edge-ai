# E2E.1 — pełny izolowany przepływ produktu

## Cel i zakres

E2E.1 sprawdza jeden spójny przebieg:

**Nowe → Dalsza obserwacja → Kandydat do Established → Established → Analiza AI → Raport → Feedback**

Scenariusz reużywa rzeczywiste API i komponenty produktu. Nie uruchamia collectora, centralnego live data cycle, OpenAI ani zewnętrznych providerów danych. AFF.1, Kraken, VPS, Cloudflare, AIKINTEL, backup/restore drills i szerokie failure drills pozostają poza zakresem.

Źródłem tożsamości i metryk rynkowych jest najnowszy zwalidowany lokalny snapshot `INTERNAL_BETA`. Selekcja wymaga:

- warstwy `new_emerging`;
- obsługiwanej sieci;
- poprawnego `chain + contract_address`;
- braku aktywnego wpisu tej tożsamości w kanonicznym Established Universe.

Jeżeli snapshot nie zawiera takiej tożsamości, przebieg kończy się fail-closed kodem `SUPPORTED_REAL_NEW_IDENTITY_UNAVAILABLE`. Nie istnieje fallback do sztucznego tokena.

## Przebieg

1. **Nowe** — token jest odczytywany z aktualnego snapshotu i widoczny w Radarze przed wpisem Follow-up.
2. **Refresh View** — poprawna migawka jest przechowywana jako session last-known-good. Chwilowy błąd odświeżenia zachowuje listę, wybrany token, `chain + contract_address`, zakładkę, `run_id`, czas migawki, source metadata i freshness. Pokazywany jest nietechniczny alert PL/EN. Kolejny poprawny wynik atomowo zastępuje listę i usuwa alert. Pierwszy błąd bez poprawnej migawki pozostaje pusty i fail-closed. Podwójne kliknięcie współdzieli jeden request, a refresh nie uruchamia collectora ani providera.
3. **Dalsza obserwacja** — kontrolowany ingest zapisuje token do izolowanego Follow-up według znormalizowanego `chain + contract_address`. Powtórzenie ingestu nie tworzy duplikatu. Plan checkpointów pozostaje dokładnie `1 / 3 / 7 / 14 / 30`.
4. **Kandydat** — izolowany recheck zachowuje tożsamość i wszystkie metryki z bieżącego snapshotu. Jedyną kontrolowaną projekcją E2E jest pochodny wynik kwalifikacji `passed_basic_filter`; nie jest to nowa dana rynkowa ani mutacja snapshotu. Rekord przechodzi do `CANDIDATE_FOR_ESTABLISHED`, ale nie do Established.
5. **Established** — brak decyzji ownera pozostawia wersję universe bez zmian. Jawna operacja `product-e2e-owner` tworzy dokładnie jedną nową wersję, audit i aktywny wpis wyłącznie w izolowanym Established Universe.
6. **Analiza AI** — publiczny `POST /api/v1/ai-analyses/requests` wyłącznie kolejkuje. Drugi POST współdzieli ten sam `analysis_id`. Osobny owner-controlled worker używa deterministycznego mocka i wykonuje dokładnie jeden happy-path call: `QUEUED → PROCESSING → READY`. Osobna zła odpowiedź mocka potwierdza, że brief nie jest publikowany.
7. **Raport** — gotowy `ai_research_brief_v1` jest warunkiem utworzenia izolowanego raportu. Raport zachowuje identity, posiada treść PL/EN, `transaction_signal=NONE`, `lifecycle_mutation=false` i pojawia się w istniejącej Reports Library.
8. **Feedback** — właściwy publiczny POST zapisuje opinię w izolowanym SQLite i wiąże ją z raportem oraz identity. Feedback nie zmienia Follow-up, Established, analizy ani raportu.

Testy renderują rzeczywiste widoki Radar, Candidate Detail (Podsumowanie, Obserwacja i Analiza AI), Główny Radar, Reports oraz Feedback. Istniejący kontrakt Tabbed Detail potwierdza Back/Forward, aktywną zakładkę, PL/EN i mobile bez overflow.

## Granice user / owner

Zwykły użytkownik może:

- otworzyć Radar i szczegóły;
- odczytać Podsumowanie i Obserwację;
- zgłosić przygotowanie wspólnej analizy;
- otworzyć gotowy Canvas;
- przeczytać raport;
- wysłać feedback.

Zwykły użytkownik nie może:

- promować do Established;
- wywołać providera bezpośrednio;
- uruchomić lub wznowić workera;
- zmienić źródeł, konfiguracji, lifecycle lub wyniku filtrów.

Owner w izolowanym E2E może:

- zapisać jawną decyzję Established;
- uruchomić pojedynczy mock worker;
- odczytać statusy i metryki techniczne.

E2E.1 nie dodaje systemu kont ani logowania. Reużywa istniejące granice runtime i owner operations.

## Izolacja store

Każdy run ma `run_id` w formacie:

```text
product-e2e-YYYYMMDDTHHMMSSZ-xxxxxxxx
```

Domyślny katalog:

```text
%TEMP%\crypto-edge-product-e2e\<run_id>\
```

Wewnątrz znajdują się osobne:

- `follow-up\store.json`;
- `established\store.json`;
- `ai\queue.sqlite`;
- `feedback\feedback.sqlite`;
- `reports\`;
- `product-e2e-manifest.json`;
- `product-e2e-report.md`.

Pliki SQLite mogą posiadać własne `-wal` i `-shm`. Żaden z tych plików nie jest ścieżką kanoniczną produktu.

Bezpieczne czyszczenie wymaga dokładnego, zwalidowanego `run_id`:

```cmd
cd tools\ui-mock
node --import tsx scripts\runFullProductE2E.ts --cleanup product-e2e-YYYYMMDDTHHMMSSZ-xxxxxxxx
```

Runner odrzuca ścieżkę wychodzącą poza `%TEMP%\crypto-edge-product-e2e` i nigdy nie używa dowolnej ścieżki użytkownika jako celu rekursywnego usunięcia.

## Idempotencja

W ramach tego samego izolowanego runu druga próba:

- zachowuje jeden Follow-up dzięki identity i deterministycznemu `entry_id`;
- zachowuje jeden rekord AI dzięki unikalnemu cache key;
- nie tworzy kolejnej wersji Established bez nowej decyzji;
- nie nadpisuje raportu inną treścią i zachowuje jedną pozycję biblioteki;
- nie wykonuje ponownego POST feedback; istniejący wpis jest tylko odczytywany;
- nie zmienia żadnego store kanonicznego.

Konflikt treści pod tą samą nazwą raportu kończy się `PRODUCT_REPORT_IDEMPOTENCY_CONFLICT`.

## Ochrona kanonicznych danych

Przed przebiegiem i po nim runner porównuje SHA-256:

- kanonicznego Established Universe;
- kanonicznego Feedback SQLite wraz z `-wal`, `-shm` i backupem;
- kanonicznego Follow-up wraz z backupem;
- centralnego pliku pointerów `automation-state.json`;
- kanonicznego AI SQLite wraz z `-wal`, `-shm` i backupem.

Po każdym izolowanym etapie mutującym wykonywana jest dodatkowa kontrola plików kanonicznych. Naruszenie:

- ustawia `FAILED`;
- zatrzymuje dalsze kroki;
- zapisuje bezpieczny kod `CANONICAL_*_MUTATION`;
- nie próbuje automatycznej naprawy.

Task Scheduler nie jest częścią hasha kanonicznego i jego stan nie wpływa na PASS. Kontrakt gwarantuje `scheduler_mutations=0`. Bezpośredni runner zapisuje `scheduler_host_status=HOST_STATUS_NOT_OBSERVED`, ponieważ środowisko uruchomieniowe nie jest źródłem prawdy o komputerze ownera. Launcher owner review może wykonać dokładnie jeden read-only `Get-ScheduledTask` na komputerze, na którym został uruchomiony, i przekazać faktycznie odczytany status. Nie rejestruje, nie uruchamia, nie zatrzymuje, nie włącza, nie wyłącza ani nie modyfikuje zadania. Nieudany lub niewiarygodny odczyt pozostaje `HOST_STATUS_NOT_OBSERVED`.

## Manifest i raport ownera

Źródłem audytu jest `product_e2e_run_v1` w JSON. Zawiera:

- `run_id`, czasy i status;
- `source_snapshot_id`, `chain`, `contract_address`;
- status i bezpieczny kod każdego kroku;
- ID izolowanych rekordów;
- liczbę mock calls oraz happy-path mock calls;
- ślad `QUEUED → PROCESSING → READY`;
- wyniki najważniejszych fail-closed boundaries;
- `live_openai_calls=0`;
- `live_data_provider_calls=0`;
- `canonical_store_mutations`;
- hashe before/after magazynów kanonicznych;
- `scheduler_mutations=0` i osobny `scheduler_host_status`;
- wynik kroku `refresh-view-last-known-good` oraz szczegóły `navigation.refresh_view`;
- wyniki idempotencji;
- granice user/owner;
- ścieżkę do raportu Markdown.

Manifest nie zapisuje sekretów, Authorization, cookie, danych sesji, pełnych promptów, raw odpowiedzi providera ani danych osobowych. Ścieżki w manifeście dotyczą wyłącznie izolowanych magazynów.

Markdown pokazuje ten sam wynik w formie owner-friendly: przebieg, blokadę, izolację, duplikaty, live calls, granice i ochronę danych.

Znaczenie statusów:

- **PASS** — wszystkie obowiązkowe kroki i wszystkie granice przeszły, live calls i kanoniczne mutacje wynoszą zero.
- **PARTIAL** — obowiązkowy rdzeń jest poprawny, ale jawnie opcjonalny krok prezentacyjny został pominięty. Obecny happy path nie pomija kroków.
- **FAILED** — obowiązkowy krok, fail-closed boundary albo ochrona kanoniczna nie przeszły. Brak obserwacji statusu hosta schedulera sam w sobie nie jest błędem.

## Owner review

Domyślny preview:

```cmd
scripts\win\start-full-product-e2e-review.cmd
```

Preview:

- wybiera i pokazuje rzeczywistą identity;
- pokazuje plan i docelowe ścieżki izolowane;
- nie tworzy izolowanych store;
- nie uruchamia workera;
- wykonuje zero mutacji;
- otwiera dokładnie jedną kartę z tym runbookiem.

Launcher dodatkowo wykonuje wyłącznie read-only odczyt statusu `Crypto Edge AI Central Automation` na bieżącym hoście. W trybie plan-only i przy braku wiarygodnego odczytu raportuje `HOST_STATUS_NOT_OBSERVED`; nie wyciąga wniosków o komputerze ownera ze środowiska Codexa.

Pełny kontrolowany run:

```cmd
scripts\win\start-full-product-e2e-review.cmd --run-isolated
```

Jest to jedyny parametr wykonujący scenariusz. Launcher czyści live opt-ins i klucz OpenAI, ustawia `INTERNAL_BETA`, pozostawia owner operations publicznego runtime jako `DISABLED`, używa mocka i otwiera dokładnie jedną kartę raportu.

## Kolejne etapy

E2E.1 domyka happy path i najważniejsze granice fail-closed. Jest gotowy jako bramka przed późniejszymi:

- rozszerzonymi failure drills;
- backup/restore drills;
- walidacją release candidate;
- decyzją ownera o kolejnym środowisku.

Sam PASS E2E.1 nie aktywuje `PUBLIC_BETA`, VPS, Cloudflare ani zewnętrznego testera.
