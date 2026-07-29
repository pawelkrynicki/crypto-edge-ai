# AI.3 — centralna kolejka i współdzielony cache analiz AI

## Kontrakt produktu

Analiza jest zasobem centralnym, nie zasobem użytkownika. Dla jednego kanonicznego cache key istnieje jeden `analysis_id`, jeden rekord kolejki i jeden wynik współdzielony przez wszystkich użytkowników. Sesja służy wyłącznie do rate limitu zgłoszeń; nie uczestniczy w cache key, fingerprintcie ani zapisanym wyniku.

Przeglądarka komunikuje się wyłącznie z same-origin API. Nie posiada klucza API, promptu ani klienta OpenAI. Publiczny `POST` zapisuje albo odnajduje rekord kolejki i kończy request bez wywołania providera. OpenAI może wywołać wyłącznie osobny centralny worker uruchomiony poza procesem przeglądarki i poza cyklem collectora danych.

AI.3 zachowuje publiczny `ai_research_brief_v1`, `ai_research_prompt_v2`, deterministic skeleton, bounded narrative, capability registry i semantic quality boundary AI.2C. AI nie zmienia lifecycle, risk severity, źródeł, Follow-up, Established Universe ani decyzji ownera.

## Architektura

1. `GET` albo `POST` buduje po stronie serwera aktualny bounded context dla znormalizowanego `chain + contract_address`.
2. Serwer oblicza deterministyczny `snapshot_fingerprint`; fingerprint klienta nigdy nie jest przyjmowany.
3. Serwer buduje cache key i transakcyjnie odczytuje lub tworzy rekord `ai_analysis_queue_v1` w SQLite.
4. Publiczny request zwraca stan kolejki oraz opcjonalny last-known-good. Nie importuje adaptera OpenAI i nie czeka na worker.
5. Niezależny worker atomowo claimuje rekord przez `BEGIN IMMEDIATE`, zapisuje lease i dopiero wtedy może wywołać skonfigurowany provider.
6. Wynik przechodzi parser kontraktu, deterministic merge, semantic quality gate i pełną walidację `ai_research_brief_v1` przed publikacją `READY`.
7. Błąd aktualizacji nie usuwa poprzedniego prawidłowego wyniku.

SQLite używa WAL, `synchronous=FULL`, `busy_timeout`, unikalnego `cache_key` i transakcyjnych claimów. Domyślna ścieżka to `tools/ui-mock/.local/ai-analysis-queue.sqlite`; można ją jawnie ustawić przez `CRYPTO_EDGE_AI_QUEUE_SQLITE_PATH`.

## Cache key

Cache key to SHA-256 stabilnie serializowanego obiektu:

```text
{
  chain,
  contract_address,
  snapshot_fingerprint,
  prompt_version,
  model_id,
  analysis_schema_version,
  locale
}
```

`chain` jest trimowany i normalizowany do lower-case. Adresy EVM są normalizowane do lower-case; adres Solana zachowuje znaczącą wielkość znaków. Symbol tokena nigdy nie jest tożsamością. Locale jest dodatkową częścią konfiguracji bounded narrative; nie zawiera użytkownika ani sesji. Zmiana kontraktu, fingerprintu, promptu, modelu, schema albo języka daje osobny cache key.

## Fingerprint danych

`snapshot_fingerprint` to SHA-256 stabilnego JSON z sortowaniem kluczy. Wejście ma wersję `ai_research_data_contract_v2` i obejmuje wyłącznie dane wpływające na skeleton lub narrację:

- `chain + contract_address` oraz bounded `symbol + name` jako identity tokena;
- dane rynkowe;
- status i posortowane powody basic filters;
- dostępne security checks;
- source health, completeness, observed timestamps i zwalidowane report assets;
- freshness;
- lifecycle wyliczony względem zapisanego czasu danych, nie czasu odświeżenia widoku;
- Follow-up lifecycle, completed checkpoints, next checkpoint, missing data i last checked;
- Established membership;
- wersję metodologii i data contract.

Fingerprint nie obejmuje czasu renderu/odświeżenia UI, random UUID, kolejności pól JSON, sesji ani użytkownika. Ten sam zapisany stan daje ten sam fingerprint. Zmiana danych analitycznych daje nowy rekord kolejki; samo ponowne otwarcie tokena nie daje nowej analizy.

## Store i statusy

Tabela `crypto_ai_analysis_queue` zapisuje:

- `analysis_id`, `cache_key`, znormalizowaną identity, fingerprint, prompt/model/schema/locale;
- `status`, `requested_at`, `queued_at`, `started_at`, `completed_at`, `failed_at`, `next_retry_at` i `attempt_count`;
- wyłącznie zwalidowany `result_json`, `validation_status` i bezpieczny `safe_error_code`;
- prompt/completion/total tokens, latency i bezpieczny provider response ID;
- lease owner/expiry oraz `created_at`/`updated_at`.

Zamknięty kontrakt produktu ma stany `ABSENT`, `QUEUED`, `PROCESSING`, `READY`, `STALE`, `FAILED`, `SUSPENDED`. `ABSENT` jest stanem odczytu, nie wierszem bazy. Dodatkowe outcome publicznego zgłoszenia to `READY`, `QUEUED`, `PROCESSING`, `ALREADY_EXISTS`, `COOLDOWN`, `DATA_STALE`, `DATA_UNAVAILABLE`, `PROVIDER_DISABLED`, `SUSPENDED` i `RATE_LIMITED`.

Store nie zapisuje API key, Authorization, system promptu, pełnego raw payloadu providera, raw completion, danych sesji ani danych użytkownika. Log rate limitu zawiera tylko jednokierunkowy SHA-256 scope sesji i identity.

## Deduplikacja, single-flight i recovery

- `cache_key` ma constraint `UNIQUE`, więc dwa równoległe zgłoszenia zapisują jeden rekord i współdzielą `analysis_id`.
- Powtórne kliknięcie zwraca istniejący `READY`, `QUEUED`, `PROCESSING`, `FAILED`/`COOLDOWN` albo `SUSPENDED`; nie tworzy drugiej analizy.
- Claim workera jest transakcją `BEGIN IMMEDIATE`; dwa procesy nie mogą równocześnie posiadać tego samego joba.
- `PROCESSING` posiada lease. Aktywny lease blokuje drugi worker, a wygasły lease może zostać przejęty z tym samym `analysis_id` po restarcie lub awarii procesu.
- Worker odnawia lease podczas długiego requestu. Completion/failure wymaga zgodnego `lease_owner`, więc stary proces nie może opublikować wyniku po utracie własności.
- Worker odbudowuje kontekst i ponownie sprawdza cache key przed call’em. Zmienione dane kończą stary job bez publikacji wyniku dla niewłaściwego fingerprintu.

Recovery jest co najmniej jednokrotne po niepewnym przerwaniu zewnętrznego requestu; ten sam `analysis_id` powinien być użyty jako provider idempotency scope przy adapterze docelowym. Lokalna gwarancja to dokładnie jeden aktywny claim i dokładnie jeden rekord, również po restarcie.

## Publiczne API

- `GET /api/v1/ai-analyses/status?chain=…&contract_address=…&locale=pl|en`;
- `GET /api/v1/ai-analyses/result?chain=…&contract_address=…&locale=pl|en`;
- `POST /api/v1/ai-analyses/requests` z `chain`, `contract_address`, `locale`, `idempotency_key`.

POST wymaga JSON, same-origin, podpisanego pseudonimowego cookie, maksymalnie 4096 B i ścisłej allowlisty pól. Nie wolno podać fingerprintu, promptu, modelu, lifecycle, severity, źródeł ani owner decision. Endpoint ma persistent rate limit oraz cooldown i zwraca bezpieczny, przetłumaczony przez UI stan. Historyczne `/api/ai-research/brief` i `/api/ai-research/generate` pozostają przejściowymi aliasami; alias POST także wyłącznie kolejkuje i nie wykonuje provider call.

## Worker, retry i circuit breaker

`pnpm run ai:worker` uruchamia osobny proces. Wymaga jednocześnie:

```text
CRYPTO_EDGE_AI_WORKER_ENABLED=1
ALLOW_LIVE_PROVIDER_CALLS=1
CRYPTO_EDGE_AI_RESEARCH_PROVIDER=OPENAI
CRYPTO_EDGE_AI_RESEARCH_MODEL=gpt-5-mini
```

Bez pełnego opt-in proces kończy się przed claimem i przed provider call. Docelowy model pozostaje `gpt-5-mini`; allowlista nie została rozszerzona. Worker ma własny interwał i kolejkę, więc nie jest podłączony do pięciominutowego collectora i nie analizuje automatycznie wszystkich tokenów.

Domyślne limity:

- max concurrency `1`;
- max `5` analiz na cykl;
- max `10` analiz na godzinę;
- max `50` analiz na dzień;
- max `250000` tokenów na dzień;
- max `3` próby z exponential backoff od `30000 ms`;
- lease `180000 ms`.

Limity godzinowe/dzienne uwzględniają także aktywne claimy. Po osiągnięciu limitu claim jest bezpiecznie odraczany i nie ma provider call. Limit kosztu dziennego jest egzekwowany tylko wtedy, gdy owner poda jednocześnie zaufane: `CRYPTO_EDGE_AI_MAX_DAILY_COST_USD`, `CRYPTO_EDGE_AI_INPUT_COST_PER_MILLION_USD` i `CRYPTO_EDGE_AI_OUTPUT_COST_PER_MILLION_USD`. Repo nie hardcoduje zmiennego cennika.

Błędy przejściowe (`PROVIDER_TIMEOUT`, `PROVIDER_ERROR`) mają ograniczony retry i exponential backoff. Po limicie job oraz worker przechodzą do suspend. Błąd schema, prompt/response contract, semantic quality, nieobsługiwana wersja, model mismatch albo błąd bezpieczeństwa zawiesza worker natychmiast. Wznowienie jest wyłącznie operacją ownera przez backendowy `resumeWorker`; zwykły użytkownik nie posiada tej kontroli. `suspendWorker`, `resumeWorker`, `workerState` oraz force reanalysis przez transakcyjne `enqueue(..., force: true)` są celowo oddzielone od publicznego API i wymagają przyszłego adaptera owner-auth przed ekspozycją na VPS.

## Last-known-good i UI

Po zmianie fingerprintu poprzedni `READY` pozostaje w SQLite. Gdy nowy job jest `QUEUED`, `PROCESSING`, `FAILED` lub `SUSPENDED`, API może dołączyć poprzedni brief z `is_last_known_good=true`. UI pokazuje go jako ostatnią analizę i nie usuwa po błędzie aktualizacji.

Zwykły użytkownik widzi spokojne stany „Analiza dostępna”, „Analiza oczekuje w kolejce”, „Analiza jest przygotowywana”, „Dane zmieniły się…”, „Ostatnia analiza dostępna”, „Analiza chwilowo niedostępna” albo „Przygotowanie analizy zostało wstrzymane”. Jedyna akcja zapisu to „Zgłoś przygotowanie analizy”. Copy wyjaśnia, że nie uruchamia OpenAI natychmiast, kolejka i wynik są wspólne, a powtórzenie nie tworzy duplikatu.

## Owner review i walidacja bez kosztu

```cmd
scripts\win\start-ai3-shared-queue-review.cmd
scripts\win\start-ai3-shared-queue-review.cmd --state cooldown
scripts\win\start-ai3-shared-queue-review.cmd --all-states
```

Bez parametrów launcher otwiera dokładnie jedną kartę kanonicznego stanu `READY`. `--state <nazwa>` otwiera dokładnie jedną kartę wybranego stanu; obsługiwane są `ready`, `absent`, `queued`, `processing`, `stale`, `failed`, `suspended` i `cooldown`. Pełny zestaw ośmiu kart jest dostępny wyłącznie przez jawne `--all-states`. Nieznane albo sprzeczne argumenty kończą się kodem błędu i drukują poprawne użycie, zanim zostaną uruchomione API, UI lub przeglądarka.

Launcher używa aktualnej rzeczywistej identity tokena z lokalnego zwalidowanego snapshotu, podmienia wyłącznie renderowany stan kolejki, ustawia deterministyczny mock i izolowany SQLite pod `%TEMP%`. Wykonuje 0 OpenAI calls, 0 data-provider calls, 0 collector calls i nie zmienia kanonicznego AI store, feedback, Follow-up, Established, lifecycle ani Task Scheduler.

Wszystkie automatyczne testy AI.3 używają mock providerów. Zakazane są `--live-one`, realne OpenAI calls, live source checks i centralny live data cycle.

## VPS i AIKINTEL

Na pojedynczym VPS SQLite/WAL zapewnia wspólny store dla API i wielu lokalnych procesów workerów, jeśli używają tego samego trwałego wolumenu. Worker powinien działać jako osobna usługa PM2/systemd z inną częstotliwością niż collector. Backup musi obejmować bazę wraz z poprawnym checkpointem WAL; monitoring powinien raportować queue depth, najstarszy queued age, aktywny lease, circuit state, usage i budget blocks bez sekretów.

Przy wielu hostach SQLite należy zastąpić wspólną bazą z transakcją/row lock, zachowując `ai_analysis_queue_v1`, unique cache key, lease ownership i te same granice. Mapowanie do AIKINTEL jest gotowe przez jawne pola identity, prompt/model/schema, usage, latency, provider response ID i bezpieczne statusy. Integracja, migracja DB, VPS deployment, Cloudflare i produkcyjne uruchomienie workera pozostają poza AI.3.
