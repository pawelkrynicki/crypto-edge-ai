# Product Radar — lokalna ocena ownera

Status: gotowy do lokalnej oceny na kontrakcie `INTERNAL_BETA`. Tester zewnętrzny pozostaje `NO-GO`.

## Uruchomienie

Z katalogu repozytorium uruchom:

```cmd
scripts\win\start-product-radar-review.cmd
```

Launcher:

- sprawdza lokalne zależności UI i obecność scanner output;
- zwalnia wyłącznie kanoniczne porty `5173` i `5177`, aby nie pozostawić konkurencyjnych procesów;
- uruchamia Scanner API i UI z `CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA`;
- uruchamia API przez dedykowany wrapper ustawiający również `SCANNER_API_PORT=5177`, bez zagnieżdżonych poleceń `set` w `start ... cmd /k`;
- otwiera `http://127.0.0.1:5173/#candidate-results`;
- nie używa fixture, `DEVELOPMENT_DEMO` ani połączeń z VPS.

Jeżeli istnieje prawidłowy, lecz starszy `full_output.json`, Radar zachowuje kandydatów i pokazuje żółty stan `Delayed` / `Opóźnione`. HTTP 503 pozostaje zarezerwowane dla braku prawidłowego snapshotu lub naruszenia granicy real-data.

Zatrzymanie:

```cmd
scripts\win\kill-local-ports.cmd
```

Rzeczywisty runtime smoke launchera uruchamia API, czeka maksymalnie 20 sekund, sprawdza health/readiness/scanner i zawsze zwalnia porty:

```cmd
scripts\win\start-product-radar-review.cmd --check
```

Bezpośrednia komenda smoke:

```cmd
scripts\win\check-product-radar-review.cmd
```

## Oczekiwany flow ownera

1. Otwórz `Radar` i potwierdź, że domyślny język to English.
2. Przełącz `EN / PL`, potwierdź natychmiastową zmianę tekstu, odśwież przeglądarkę i sprawdź zapamiętanie wyboru.
3. Sprawdź górny status: połączenie z API, aktualność snapshotu, stan źródeł, `Last updated` i osobny `View refreshed`. `Last updated` jest zawsze czasem `generated_at` (albo `finished_at`) przyjętego snapshotu skanera; status `Current` / `Delayed` jest pokazany osobno. Nagłówek i kafel `Source status` korzystają z jednego rozstrzygnięcia source health i muszą przekazywać ten sam stan semantyczny.
4. Kliknij `Refresh view` / `Odśwież widok` i potwierdź, że przycisk wyłącznie ponownie odczytuje lokalne API; nie tworzy nowych danych, nie uruchamia collectora ani providerów. Zmienia się czas `View refreshed`, natomiast `Last updated` zmienia się tylko wtedy, gdy API zwróci nowszy przyjęty snapshot.
5. Przejdź między `New / observation` i `Established / main Radar`.
6. Otwórz dowolny dostępny rekord przez `Open details`.
7. Sprawdź sekcje: Identity, Market data, Filters, Security i Next step.
8. Przejdź do `Verification`, skopiuj contract address i otwórz wybrane allowlistowane źródło.
9. Przeczytaj `Methodology` i potwierdź znaczenie WATCHLIST oraz Manual Review Only.

## Dwa koszyki

### Nowe / obserwacja

- źródło: najnowsze profile DexScreener;
- status główny: `OBSERWACJA — NOWY PROJEKT`;
- `observation_only=true` i brak automatycznego awansu;
- sam udział w koszyku nie uruchamia GoPlus;
- rekord może pokazać powody niespełnienia filtrów, ale nie jest rekomendacją.

### Established / główny Radar

- owner-maintained, wersjonowany universe adresów;
- tożsamość: `chain + contract address`;
- niezmienione basic filters;
- GoPlus wyłącznie po przejściu filtrów;
- WATCHLIST oznacza wyłącznie ręczną analizę.

## Oczekiwane empty i error states

- `ESTABLISHED_UNIVERSE_EMPTY`: poprawny, skonfigurowany pusty koszyk; nie jest globalnym błędem.
- `NEW_EMERGING_EMPTY`: aktualny skan nie zwrócił rekordów obserwacyjnych.
- `NEW_EMERGING_UNAVAILABLE` / `ESTABLISHED_UNAVAILABLE`: niedostępność konkretnego koszyka.
- `SCANNER_SNAPSHOT_STALE`: prawidłowy snapshot pozostaje widoczny jako `Delayed` / `Opóźnione`; dokładny reason code jest tylko w szczegółach technicznych.
- scanner unavailable / invalid snapshot / policy denied: globalny błąd, zero sample candidates.
- context unavailable: nie ukrywa Radaru, jeżeli scanner działa.

## Lista elementów do akceptacji

- [ ] Radar jest domyślną stroną i jest czytelny bez pomocy technicznej.
- [ ] English jest językiem domyślnym niezależnie od języka przeglądarki.
- [ ] Przełącznik EN / PL zmienia cały Product Radar bez przeładowania i zapamiętuje wybór po refreshu przeglądarki.
- [ ] Nagłówek rozdziela połączenie z API, aktualność snapshotu, stan źródeł, `Last updated` i `View refreshed`; `Last updated` pokazuje timestamp snapshotu jako wartość główną, a `Delayed` / `Opóźnione` jest osobnym statusem.
- [ ] Nagłówek `Sources` i kafel `Source status` są spójne: szczegółowe `metadata.source_health` mają pierwszeństwo, a readiness jest fallbackiem. Opcjonalne źródło context w stanie degraded daje `Partially available` / `Częściowo dostępne`, ale nie ukrywa używalnego Radaru.
- [ ] `Refresh view` / `Odśwież widok` jest zablokowany podczas trwającego odczytu, zmienia wyłącznie czas odczytu widoku i nie uruchamia providera ani collectora.
- [ ] Przy snapshotcie starszym niż 30 minut żółte ostrzeżenie jest widoczne, a kandydaci, szczegóły, weryfikacja i metodologia pozostają dostępne.
- [ ] HTTP 503 występuje tylko wtedy, gdy nie ma prawidłowego real snapshotu lub granica fail-closed go odrzuca.
- [ ] Powody filtrów są naturalnie opisane po angielsku i polsku; nieznany kod ma neutralny fallback i pozostaje w szczegółach technicznych.
- [ ] Klasyfikacja pięciu podstawowych warunków filtrów opiera się wyłącznie na kanonicznych `filter_reasons`, a nie na angielskich ani polskich tłumaczeniach.
- [ ] Ten sam podstawowy warunek nie jest jednocześnie pokazany jako spełniony i niespełniony; niepewna klasyfikacja ma jawny neutralny stan.
- [ ] Uwagi o preferowanym zakresie ratio 5–30% i wieku 14–90 dni są oddzielone od twardych podstawowych warunków.
- [ ] Znaczenie dwóch koszyków jest jednoznaczne.
- [ ] New / Emerging nie wygląda jak rekomendacja ani Established.
- [ ] Pusty Established wyjaśnia `ESTABLISHED_UNIVERSE_EMPTY` i nie pokazuje fikcyjnych tokenów.
- [ ] Rekord Established pokazuje adres, filtry, security i najważniejsze ryzyka.
- [ ] Szczegóły wyraźnie odróżniają „security nie uruchomiono” od pozytywnego wyniku.
- [ ] `security not invoked`, `security unavailable` i `partial security coverage` są trzema odrębnymi stanami produktu.
- [ ] Sama obecność technicznego rekordu security nie oznacza wykonanej kontroli; wymagany jest zgodny kontrakt stanu i prawidłowy `checked_at`.
- [ ] Szczegóły i Weryfikacja używają jednego kanonicznego rozstrzygnięcia stanu security dla tego samego kandydata.
- [ ] Brak uruchomionej kontroli jest opisany jako brak oceny, a nie jako brak ryzyka.
- [ ] Weryfikacja otwiera tylko właściwe, allowlistowane źródła po kliknięciu.
- [ ] Metodologia jest krótka i zrozumiała.
- [ ] Layout jest czytelny w 1920×1080 oraz przy szerokości 1280 px.
- [ ] WATCHLIST wszędzie oznacza Manual Review Only.
- [ ] Brak danych nie uruchamia fixture ani sample candidates.

## Znane ograniczenia

- Commitowany universe Established ma obecnie `0` aktywnych wpisów.
- UI nie zawiera edytora universe.
- Snapshot starszy niż 30 minut jest oznaczony jako opóźniony i pozostaje dostępny jako last-known-good, o ile nadal przechodzi schema, lineage, policy, environment i fixture checks.
- Freshness i source health są niezależne: stary snapshot nie pogarsza automatycznie stanu źródeł, a częściowa dostępność źródła nie oznacza automatycznie opóźnionego snapshotu.
- Opóźniony lokalny snapshot pozostaje opóźniony aż do opublikowania nowego wyniku collectora. Na tym etapie nie istnieje scheduler, a odświeżenie widoku nie generuje nowego snapshotu.
- Context może być niedostępny niezależnie od działającego skanera.
- Brak schedulera, automatyzacji VPS, AI KINTEL, auto-tradingu i rekomendacji inwestycyjnych.
- Weryfikacja źródłowa jest link-only i nie zapisuje werdyktu ownera w aplikacji.

## Owner verdict

- Data oceny: 21.07.2026
- Osoba: Owner repozytorium
- Werdykt: `ACCEPT`

### Podsumowanie manualnego owner review

- Radar: PASS.
- EN/PL: PASS.
- Last updated i View refreshed: PASS.
- Stale last-known-good: PASS.
- Source health: PASS.
- New / observation i Established: PASS.
- Szczegóły: PASS.
- Klasyfikacja filtrów: PASS.
- Security not invoked: PASS.
- Weryfikacja źródłowa: PASS.
- Metodologia: PASS.
- Brak fixture fallback: PASS.
- Brak provider calls przez Refresh view: PASS.

### Zaakceptowane ograniczenia

- Established universe ma obecnie 0 aktywnych wpisów.
- Snapshot może być oznaczony jako opóźniony.
- Opcjonalny context może być częściowo dostępny.
- Brak schedulera i wdrożenia VPS w tym PR.
- Tester zewnętrzny pozostaje poza zakresem PR #68.

Po jawnym `ACCEPT` następnym etapem jest wyłącznie **VPS Deployment & Automation**. Tester zewnętrzny pozostaje `NO-GO` do osobnej zgody.
