# AI.2C — Semantic quality boundary po pierwszym OpenAI live validation

> Dokument historyczny. AI.3 wycofało `--live-one` i bezpośrednią generację z publicznego runtime. Aktualny model wykonania — centralna kolejka, współdzielony cache i osobny worker — opisuje `docs/ai_shared_queue_cache.md`. Poniższe dane pozostają niezmienionym zapisem pierwszej walidacji AI.2C i nie są instrukcją uruchomienia kolejnego calla.

## Cel i status

Pierwsze kontrolowane wywołanie OpenAI zakończyło się technicznym sukcesem: `CALLS_USED=1`, `BRIEFS=1`, model `gpt-5-mini`, 1563 input tokens, 2081 output tokens, 3644 total tokens, latency 21183 ms, `validation=VALID`, `cache_hit=0`. AI.2C nie wykonuje kolejnego calla. Izolowany store pozostaje materiałem dowodowym.

Techniczna walidacja v1 przepuściła semantycznie wadliwy wynik: summary zawierało `DATA_STALE`, narracja kopiowała `new`, `STALE`, `rejected_basic_filter` oraz mieszała `lifecycle`, `security` i `holderów`; model dodał unsupported `holder_concentration` oparte błędnie na `security_status` i ustawił `OPEN_VERIFICATION` jako primary mimo deterministycznej potrzeby oczekiwania na świeżą migawkę. To jest dokładna przyczyna podniesienia promptu do `ai_research_prompt_v2`.

AI.2C zachowuje Responses API, publiczny `ai_research_brief_v1`, fingerprint, cache, idempotency, rate limits, single-flight, last-known-good i zaakceptowany Canvas. Zmienia wyłącznie granicę odpowiedzialności: backend tworzy deterministic skeleton, model zwraca bounded narrative, a semantic quality gate sprawdza ich zgodność.

## Wymagana konfiguracja

Sekrety i model są konfigurowane wyłącznie w środowisku procesu:

```text
OPENAI_API_KEY=<sekret ustawiony poza repozytorium>
CRYPTO_EDGE_AI_RESEARCH_PROVIDER=OPENAI
CRYPTO_EDGE_AI_RESEARCH_MODEL=<jawnie wybrany model zgodny z Responses API i Structured Outputs>
CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS=90000
CRYPTO_EDGE_AI_RESEARCH_MAX_CONCURRENCY=1
CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET=1
```

`OPENAI_API_KEY` i `CRYPTO_EDGE_AI_RESEARCH_MODEL` są wymagane przez `--live-one`. Brak dowolnej z nich kończy launcher czytelnym błędem przed startem runtime i przed jakimkolwiek requestem. Model nie jest hardcodowany. Timeout jest ograniczony do 1000–120000 ms; wartość brakująca lub spoza kontraktu daje bezpieczny default 90000 ms. Ten limit pozostaje co najmniej 30 s poniżej domyślnego 180000 ms lease workera. Launcher pierwszego smoke wymusza concurrency 1.

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
- schema name `ai_research_narrative_v2`;
- prywatny JSON Schema zawierający wyłącznie summary i teksty przypięte do narrative IDs;
- `strict: true`.

Starszy `json_object` nie jest używany. Automatyczne retry SDK jest wyłączone. Błąd składni, polityki lub semantyki kończy się fail-closed po pierwszym wyniku we wszystkich trybach; backend nie uruchamia automatycznego requestu naprawczego.

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

## Deterministic skeleton i bounded narrative

Backend ustala `research_state`, etap obserwacji, wartości known facts, kategorie/severity/źródła ryzyk, obsługiwane braki, source reference IDs oraz pełną listę akcji z priority, targetami, URL i kolejnością. Model otrzymuje lokalizowane fakty oraz zamknięte identyfikatory i może zwrócić tylko:

- summary;
- interpretacje faktów;
- wyjaśnienia ryzyk i braków;
- powody akcji;
- wyjaśnienia warunków zmiany stanu.

Model nie ma pól pozwalających zmienić skeleton. Backend składa finalny `ai_research_brief_v1` dopiero po walidacji wszystkich narrative IDs i ich kolejności.

## Capability registry

Dozwolone braki to obecnie `security`, `history`, `next_checkpoint`, `fresh_data` i `source_verification`. Każdy ma dedykowany source reference i source type. `follow_up_checkpoints` istnieje w source catalog również jako `unavailable`, dzięki czemu brak historii lub kolejnego punktu kontrolnego ma właściwe źródło.

`holder_concentration` nie jest wspieraną capability i nie może używać `security_status`: status bezpieczeństwa nie zawiera danych o koncentracji portfeli. AI.2C nie dodaje nowego providera holderów.

## Walidacja jakości po odpowiedzi

Przed zapisem backend wymaga:

- poprawnego JSON, exact keys oraz kompletnej, niezmienionej kolejności narrative IDs;
- identycznego deterministycznego research state i etapu obserwacji jak w produkcie;
- identycznych kluczy, etykiet, wartości i źródeł known facts;
- identycznych kategorii, severity, tytułów i źródeł ryzyk;
- capability każdego missing key, dedykowanego źródła oraz obecności reference ID w katalogu;
- identycznych action types, labels, priority, targets, URL i kolejności względem resolvera;
- braku nowych lub przeliczonych wartości liczbowych;
- braku URL wygenerowanych przez model;
- braku raw enums, machine values, snake_case i mieszania języków w polach user-facing;
- braku BUY, SELL, HOLD, rekomendacji transakcyjnej i safety claim;
- braku automatycznej promocji lub zmiany lifecycle;
- braku wykonania instrukcji w nazwie, symbolu, URL, raporcie lub tekście projektu.

Niepoprawny wynik nie jest zapisywany. Last-known-good v2 pozostaje nienaruszony, UI pokazuje fail-closed, a backend nie wykonuje drugiego requestu. Guard działa na jawnie wybranych polach narracyjnych; nie stosuje globalnego replace do JSON.

## Prompt v2 i cache separation

Publiczny schema version pozostaje `ai_research_brief_v1`, natomiast `prompt_version` to `ai_research_prompt_v2`. Cache key i unikalność SQLite nadal obejmują prompt version. Stary brief v1 pozostaje w review store, lecz validator/reader v2 nie zwraca go jako aktualnego ani last-known-good v2. Nie ma migracji ani czyszczenia kanonicznego store.

Offline regression fixture zawiera wyłącznie zanonimizowany, testowo istotny wycinek pierwszego wyniku. Nie zawiera API key, Authorization, request ID, sesji, lokalnej ścieżki, raw promptu ani niezwiązanego raw completion. Test potwierdza osobno: unsupported `holder_concentration`, błędne źródło, raw enum w summary, machine values w narracji i sprzeczny action priority. Companion fixture przechodzi ten sam semantic audit.

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

## Wynik owner acceptance pierwszego smoke

Pierwszy wynik spełnił techniczne kryteria transportu, Structured Outputs, usage i zapisu, lecz nie spełnił kryteriów semantycznych punktów 1–3. Po AI.2C kolejne wyniki muszą spełnić:

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

1. AI.2A — bezpieczna ścieżka jednego live call — zakończone.
2. AI.2B — owner wykonuje jedną rzeczywistą analizę — zakończone (`CALLS_USED=1`, `BRIEFS=1`).
3. AI.2C — semantic quality boundary, prompt v2 i regresja pierwszego wyniku — zakończone offline, bez nowego calla.
4. AI.2D — maksymalnie 3–5 dodatkowych przypadków po osobnej zgodzie; nie przez czyszczenie lub samowolne zwiększenie budżetu pierwszego smoke.
5. UI.3 — final user navigation, accessibility i cross-browser.
6. INT.1 — AI KINTEL Integration Readiness Pack.
7. Lokalna regresja i Release Candidate.
8. Finalny deployment VPS i produkcyjna konfiguracja OpenAI.
9. Cloudflare, scheduler, smoke i rollback.
10. Tester i freeze do 15.08.
