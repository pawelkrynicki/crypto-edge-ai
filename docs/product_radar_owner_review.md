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

Jeżeli nie ma aktualnego `full_output.json`, launcher pokazuje ostrzeżenie, a Radar prezentuje uczciwy stan `Data Unavailable` zamiast danych przykładowych.

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

1. Otwórz `Radar` i sprawdź górny status: środowisko, API/readiness, timestamp, wiek danych, skrócony `run_id` i źródła.
2. Przejdź między `Nowe / obserwacja` i `Established / główny Radar`.
3. Otwórz dowolny dostępny rekord przez `Otwórz szczegóły`.
4. Sprawdź sekcje: Tożsamość, Dane rynkowe, Filtry, Bezpieczeństwo i Następny krok.
5. Przejdź do `Weryfikacja`, skopiuj contract address i otwórz wybrane allowlistowane źródło.
6. Przeczytaj `Metodologia` i potwierdź znaczenie WATCHLIST oraz Manual Review Only.

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
- `SCANNER_SNAPSHOT_STALE`: dane są nieaktualne i reason code pozostaje widoczny.
- scanner unavailable / invalid snapshot / policy denied: globalny błąd, zero sample candidates.
- context unavailable: nie ukrywa Radaru, jeżeli scanner działa.

## Lista elementów do akceptacji

- [ ] Radar jest domyślną stroną i jest czytelny bez pomocy technicznej.
- [ ] Nagłówek pozwala ocenić źródło, timestamp, wiek danych, `run_id` i readiness.
- [ ] Znaczenie dwóch koszyków jest jednoznaczne.
- [ ] New / Emerging nie wygląda jak rekomendacja ani Established.
- [ ] Pusty Established wyjaśnia `ESTABLISHED_UNIVERSE_EMPTY` i nie pokazuje fikcyjnych tokenów.
- [ ] Rekord Established pokazuje adres, filtry, security i najważniejsze ryzyka.
- [ ] Szczegóły wyraźnie odróżniają „security nie uruchomiono” od pozytywnego wyniku.
- [ ] Weryfikacja otwiera tylko właściwe, allowlistowane źródła po kliknięciu.
- [ ] Metodologia jest krótka i zrozumiała.
- [ ] Layout jest czytelny w 1920×1080 oraz przy szerokości 1280 px.
- [ ] WATCHLIST wszędzie oznacza Manual Review Only.
- [ ] Brak danych nie uruchamia fixture ani sample candidates.

## Znane ograniczenia

- Commitowany universe Established ma obecnie `0` aktywnych wpisów.
- UI nie zawiera edytora universe.
- Snapshot musi mieścić się w 30-minutowym SLA; inaczej API odrzuca go fail-closed.
- Context może być niedostępny niezależnie od działającego skanera.
- Brak schedulera, automatyzacji VPS, AI KINTEL, auto-tradingu i rekomendacji inwestycyjnych.
- Weryfikacja źródłowa jest link-only i nie zapisuje werdyktu ownera w aplikacji.

## Owner verdict

- Data oceny: ____________________
- Osoba: ____________________
- Werdykt: `ACCEPT` / `CHANGES REQUIRED`
- Uwagi: ________________________________________________________________

Po jawnym `ACCEPT` następnym etapem jest wyłącznie **VPS Deployment & Automation**. Tester zewnętrzny pozostaje `NO-GO` do osobnej zgody.
