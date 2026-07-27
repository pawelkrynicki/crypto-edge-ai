# AI.2 — Controlled OpenAI Live Validation

## Cel i status

AI.2 przygotowuje kontrolowaną ścieżkę pierwszej rzeczywistej analizy OpenAI dla aktualnego tokena widocznego w Candidate Detail. Implementacja nie uruchamia modelu automatycznie. Pierwszy płatny request wykonuje właściciel dopiero po review kodu, przez osobny parametr `--live-one` i jawne kliknięcie **Wygeneruj analizę AI**.

AI.2 nie zmienia kontraktu domenowego AI.1: pozostają `AIResearchProvider`, Responses API, `ai_research_brief_v1`, istniejący prompt version, bounded context, strict validation, fingerprint, cache, idempotency, rate limits, single-flight, last-known-good i zaakceptowany Visual Candidate Research Canvas. Model nie zmienia lifecycle, Follow-up ani Established Universe i nie generuje sygnałów BUY, SELL lub HOLD.

## Wymagana konfiguracja

Sekrety i model są konfigurowane wyłącznie w środowisku procesu:

```text
OPENAI_API_KEY=<sekret ustawiony poza repozytorium>
CRYPTO_EDGE_AI_RESEARCH_PROVIDER=OPENAI
CRYPTO_EDGE_AI_RESEARCH_MODEL=<jawnie wybrany model zgodny z Responses API i Structured Outputs>
CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS=30000
CRYPTO_EDGE_AI_RESEARCH_MAX_CONCURRENCY=1
CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET=1
```

`OPENAI_API_KEY` i `CRYPTO_EDGE_AI_RESEARCH_MODEL` są wymagane przez `--live-one`. Brak dowolnej z nich kończy launcher czytelnym błędem przed startem runtime i przed jakimkolwiek requestem. Model nie jest hardcodowany. Timeout jest ograniczony do 1000–120000 ms; wartość brakująca lub spoza kontraktu daje bezpieczny default 30000 ms. Launcher pierwszego smoke wymusza concurrency 1.

Klucz nie jest zapisywany w repozytorium, SQLite, publicznym modelu, stdout, stderr ani logach. Launcher nie drukuje jego wartości, długości, prefiksu ani wersji maskowanej. SDK ma `logLevel: "off"`.

## Dwa tryby launchera

Bezpłatny review konfiguracji i UI:

```cmd
scripts\win\start-ai-research-openai-review.cmd
```

Tryb domyślny wymusza provider `DISABLED`, usuwa klucz z dziedziczonego środowiska procesu runtime, otwiera aktualny Candidate Detail, używa izolowanej bazy review i wykonuje 0 OpenAI calls. Ekran pokazuje uczciwy stan niedostępnego providera i instrukcję przyszłej konfiguracji.

Przyszły pojedynczy live smoke, dopiero po review kodu i po ustawieniu wymaganych zmiennych środowiskowych:

```cmd
scripts\win\start-ai-research-openai-review.cmd --live-one
```

Launcher wypisuje `INTERNAL_BETA`, provider, nazwę modelu, limit 1, timeout, concurrency, ścieżkę izolowanego store i ostrzeżenie o możliwym koszcie. Nie drukuje klucza. Sam start uruchamia wyłącznie lokalny API/UI i otwiera Candidate Detail. Request następuje dopiero po jawnym kliknięciu właściciela.

Oba tryby:

- używają bieżącego rzeczywistego tokena z lokalnego scanner snapshotu, bez fixture fallback i bez tokena testowego;
- nie uruchamiają collectora ani providerów danych rynkowych;
- utrzymują owner operations `DISABLED`;
- nie zapisują Follow-up ani Established Universe;
- wyłączają zapisy Feedback w sesji review;
- nie zmieniają VPS, Cloudflare ani Task Scheduler.

## Konfiguracja klienta OpenAI

Adapter używa oficjalnego SDK JavaScript i istniejącego Responses API. Klient jest tworzony po stronie serwera z:

- `maxRetries: 0`;
- bounded `timeout` z `CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS`;
- `logLevel: "off"`;
- kluczem wyłącznie z `OPENAI_API_KEY`.

Pojedynczy `responses.create` zawiera:

- `store: false`;
- `background: false`;
- brak `tools`, web search, file search, code interpreter i MCP;
- brak `previous_response_id` i conversation;
- brak streamingu;
- `text.format.type = "json_schema"`;
- schema name `ai_research_brief_v1`;
- istniejący JSON Schema;
- `strict: true`.

Starszy `json_object` nie jest używany. Automatyczne retry SDK jest wyłączone. Normalny AI.1 może zachować jedną kontrolowaną próbę naprawy wyniku po walidacji, ale `--live-one` kończy się fail-closed po pierwszym błędnym wyniku i nigdy nie wykonuje płatnej próby naprawczej.

## Twardy budżet jednego wywołania

`CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET` przyjmuje w review wyłącznie wartość `1`. Inna ustawiona wartość jest błędem konfiguracji i wykonuje 0 calls.

Po cache miss i po wszystkich kontrolach lokalnych backend atomowo rezerwuje próbę w izolowanym SQLite przed wywołaniem providera. Rezerwacja nie jest zwracana po timeout, błędzie API, niepoprawnym JSON ani odrzuceniu walidacji. Dzięki transakcji `BEGIN IMMEDIATE` wiele równoległych kliknięć, różne sesje i oba locale mogą uruchomić najwyżej jeden provider call. Stan pozostaje wykorzystany również po restarcie review runtime z tą samą bazą.

Cache hit i render preview nie rezerwują budżetu. Wejście na ekran, Refresh view, zmiana locale i nawigacja wykonują tylko read-only GET. Po wykorzystaniu budżetu API zwraca `LIVE_CALL_BUDGET_EXHAUSTED`, przycisk generowania pozostaje disabled, a istniejący cached Canvas można nadal otwierać.

Budżet nie trafia do kanonicznego produktu. Live-one jest odrzucany przed call’em, jeżeli skonfigurowana baza nie ma dokładnej nazwy `ai-research-openai-review.sqlite`.

## Izolowany store i cleanup

Review używa wyłącznie:

```text
tools\ui-mock\.local\ai-research-openai-review.sqlite
```

Nie jest to kanoniczny `ai-research-brief.sqlite`, render-preview store, Feedback Store, Review Storage, Follow-up Store ani Established Universe. Baza przechowuje tylko zwalidowany brief, token usage, owner-review metrics i licznik wykorzystanej próby. Nie przechowuje raw promptu, raw completion, klucza ani nagłówka Authorization.

Idempotentny cleanup:

```cmd
scripts\win\clear-ai-research-openai-review.cmd
```

Skrypt usuwa wyłącznie review SQLite oraz jego `-wal` i `-shm`. Nie zabija procesów. Jeżeli runtime nadal trzyma plik, cleanup kończy się błędem i prosi o zamknięcie okien runtime przed ponowieniem.

Cleanup zeruje również procesowy zapis zużytej próby. Nie należy go wykonywać po nieudanym pierwszym smoke tylko po to, aby uzyskać drugi call. Kolejna próba wymaga najpierw oceny błędu i osobnej decyzji właściciela.

## Walidacja jakości po odpowiedzi

Przed zapisem backend wymaga:

- poprawnego JSON i exact keys zgodnych ze strict schema;
- dozwolonych enumów, action types i research state;
- identycznego deterministycznego lifecycle/research state jak w produkcie;
- source reference IDs obecnych w wejściowym katalogu;
- known facts skopiowanych dokładnie z kandydatów faktów w bounded context;
- braku nowych lub przeliczonych wartości liczbowych;
- braku URL wygenerowanych przez model;
- zgodności next action z serwerowym action catalog, freshness i filters;
- braku BUY, SELL, HOLD, rekomendacji transakcyjnej i safety claim;
- braku automatycznej promocji lub zmiany lifecycle;
- braku wykonania instrukcji w nazwie, symbolu, URL, raporcie lub tekście projektu.

Niepoprawny wynik nie jest zapisywany. Last-known-good pozostaje nienaruszony, UI pokazuje fail-closed, a budżet live-one blokuje drugi płatny request.

## Metryki owner review

Po poprawnym live call izolowany store zapisuje:

- analysis ID;
- model i prompt version;
- snapshot fingerprint;
- `generated_at` UTC i `data_generated_at` UTC;
- latency ms;
- prompt/input tokens, output tokens i total tokens;
- `cache_hit = false`;
- `validation_status = VALID`;
- `x-request-id`, jeżeli SDK go zwróci.

Canvas pokazuje je w zwijanych **Szczegółach technicznych**. Request ID jest dostępny wyłącznie przez osobny loopback-only endpoint owner review i nie trafia do publicznego `AIResearchBrief`. Główne UI nie pokazuje raw odpowiedzi, promptu, input/output hashy, danych klucza ani wyliczonego kosztu USD. Koszt nie jest obliczany bez jawnej, wersjonowanej tabeli cenowej.

## Owner acceptance pierwszego smoke

Po jednym poprawnym kliknięciu właściciel sprawdza:

1. Canvas opisuje wyłącznie rzeczywisty przekazany rekord i nie dopowiada braków.
2. Lifecycle, research state, freshness, filters i next action zgadzają się z produktem.
3. Nie ma sygnału inwestycyjnego, safety claim, nowego URL ani automatycznej promocji.
4. Szczegóły techniczne zawierają model, wersje, czasy, latency, usage, walidację i opcjonalny request ID.
5. Badge render-preview jest nieobecny, a widoczny jest dyskretny status „Analiza wygenerowana przez OpenAI”.
6. Ponowne otwarcie Canvasu i ponowne kliknięcie zwracają ten sam analysis ID dla tego samego fingerprintu i locale.
7. Refresh view i powrót na ekran używają cache i wykonują 0 provider calls.
8. Przycisk nowej generacji pozostaje zablokowany po wykorzystaniu budżetu.

Po błędzie należy zachować bazę do diagnozy, zapisać kod błędu, sprawdzić konfigurację/model/timeout i nie czyścić store bez osobnej decyzji o kolejnym płatnym smoke. Operacyjny rollback to zamknięcie runtime i powrót do launchera bez `--live-one`, czyli provider `DISABLED`.

## Dalsza kolejność

1. AI.2A — bezpieczna ścieżka jednego live call.
2. AI.2B — owner wykonuje jedną rzeczywistą analizę.
3. AI.2C — ocena jakości, cache, czasu i token usage.
4. AI.2D — maksymalnie 3–5 dodatkowych przypadków po osobnej zgodzie; nie przez samowolne zwiększenie budżetu pierwszego smoke.
5. UI.3 — final user navigation, accessibility i cross-browser.
6. INT.1 — AI KINTEL Integration Readiness Pack.
7. Lokalna regresja i Release Candidate.
8. Finalny deployment VPS i produkcyjna konfiguracja OpenAI.
9. Cloudflare, scheduler, smoke i rollback.
10. Tester i freeze do 15.08.
