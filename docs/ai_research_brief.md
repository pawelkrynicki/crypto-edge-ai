# AI.1 + AI.2 — Visual Candidate Research Brief i Controlled OpenAI Validation

## Status i granica produktu

AI.1 dodaje do standalone Crypto Edge AI moduł **Analiza badawcza AI / AI Research Brief**. Moduł porządkuje wyłącznie dane już zapisane w produkcie, wyjaśnia maszynowy stan badawczy i prowadzi do kolejnego kroku weryfikacji. Nie jest sygnałem transakcyjnym, nie potwierdza bezpieczeństwa projektu i nie zmienia lifecycle, Follow-up ani Established Universe.

Domyślny provider to `DISABLED`. Samo wejście na ekran, odświeżenie widoku, zmiana języka, checkpoint i collector nigdy nie generują analizy. Generowanie jest możliwe wyłącznie po jawnym kliknięciu i tylko przez backend.

AI.2 nie przebudowuje tego kontraktu. Dodaje owner-only ścieżkę pierwszego kontrolowanego live smoke z budżetem jednego wywołania, wyłączonym retry SDK, izolowanym store i metrykami technicznymi. Pełny runbook: `docs/ai_research_openai_live_validation.md`.

## Przepływ backendowy

1. Frontend wysyła do same-origin API wyłącznie `chain`, `contract_address`, `locale` i `idempotency_key`.
2. Backend normalizuje istniejącym resolverem tożsamość `chain + contract_address` i odnajduje kanoniczny rekord.
3. Read-only adapter składa ograniczony kontekst ze scanner snapshotu, Follow-up, checkpointów FLOW.1, lifecycle, filtrów, security, Established membership, freshness, metryk, linków weryfikacyjnych, opcjonalnego raportu i wersji metodologii.
4. Backend tworzy katalog faktów, ryzyk, braków, warunków, dozwolonych akcji i bezpiecznych source reference IDs. Dane projektu są traktowane jako niezaufane.
5. Z kanonicznego wejścia wyliczany jest SHA-256 `snapshot_fingerprint`. Czas odczytu UI nie uczestniczy w fingerprintcie.
6. Usługa najpierw szuka cache dla tożsamości, fingerprintu, `prompt_version`, języka i rodziny/modelu.
7. Przy cache miss jawny POST przechodzi idempotency, trzy rate limity, single-flight i globalny semaphore.
8. Adapter providera zwraca JSON Structured Output. Backend parsuje go, wykonuje ścisłą walidację i maksymalnie jedną kontrolowaną próbę naprawczą bez rozszerzania kontekstu.
9. Backend mapuje dozwolone typy akcji na własne trasy lub allowlistowane URL, dopełnia metadane i hashe, a następnie atomowo zapisuje wyłącznie zwalidowany model.
10. Frontend otrzymuje bezpieczny model publiczny. Nie otrzymuje promptu, raw odpowiedzi, sekretów, lokalnych ścieżek, sesji ani lock metadata.

Ten przepływ nie uruchamia DexScreener, GoPlus, Honeypot.is ani collectora. Brak informacji pozostaje widocznym brakiem, a nie domysłem modelu.

## API i konfiguracja

Endpointy first-party:

- `GET /api/ai-research/status` — publiczny stan konfiguracji bez sekretów;
- `GET /api/ai-research/brief?chain=…&contract_address=…&locale=pl|en` — cache/read-only;
- `GET /api/ai-research/review-metrics?analysis_id=…` — loopback-only metryki owner review, poza publicznym modelem briefu;
- `POST /api/ai-research/generate` — jawna generacja on demand.

POST wymaga `application/json`, zgodnego `Origin`, dokładnie czterech pól, maksymalnie 4096 B i poprawnej pseudonimowej sesji zapisanej w podpisanym cookie `HttpOnly; SameSite=Strict`. Nieznane pola są odrzucane.

Konfiguracja backendowa:

```text
CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED|OPENAI
CRYPTO_EDGE_AI_RESEARCH_MODEL=<model skonfigurowany operacyjnie>
OPENAI_API_KEY=<sekret środowiska>
CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS=30000
CRYPTO_EDGE_AI_RESEARCH_MAX_CONCURRENCY=2
CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET=1
CRYPTO_EDGE_AI_RESEARCH_SESSION_SECRET=<sekret środowiska>
CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH=<opcjonalna ścieżka SQLite>
```

Model nie jest stałą domeny. `OPENAI_API_KEY` nie trafia do frontendowego bundla, modelu publicznego ani store. Adapter OpenAI używa Responses API, `store: false`, `background: false`, braku tools oraz strict JSON Schema. Oficjalny klient ma `maxRetries: 0`, bounded timeout i wyłączone logowanie SDK. Obecny `AIResearchUsageRecorder` zapisuje usage w briefie i jest no-op dla billingu. Budżet `1` jest wyłącznie ograniczeniem izolowanego owner review; inna ustawiona wartość failuje przed call’em.

## Cache, single-flight i limity

Klucz generacji obejmuje znormalizowaną tożsamość, fingerprint, prompt version, język i model. Unikalność SQLite pomija model zgodnie z kontraktem produktu: `identity + snapshot_fingerprint + prompt_version + locale`. Brak zmiany danych zwraca poprzednią analizę bez nowego wywołania. Zmiana danych oznacza poprzedni rekord jako `STALE`, ale go nie usuwa.

Jedna instancja procesu dopuszcza najwyżej jedną aktywną generację dla klucza. Równoległe żądania czekają na ten sam Promise; inny token nie jest blokowany poza bounded globalnym semaphore. Lock jest zawsze zwalniany po błędzie.

Domyślne limity w oknie 10 minut:

- 3 próby na pseudonimową sesję;
- 2 próby na tożsamość tokena;
- 20 prób globalnie;
- maksymalnie 2 równoległe wywołania providera, konfigurowalne w zakresie 1–8.

HTTP 429 zawiera spokojny kod, `Retry-After`, czas ponownej próby i ostatni poprawny cached brief, jeśli istnieje. IP nie jest jedyną ani główną tożsamością limitu.

## Store i odporność

Dedykowany SQLite znajduje się domyślnie w `tools/ui-mock/.local/ai-research-brief.sqlite`. Jest niezależny od Review Storage, Feedback, Follow-up, Established Universe i Reports. Używa WAL, `synchronous=FULL`, `BEGIN IMMEDIATE`, rollbacku przy błędzie, unikalnych kluczy, indeksów oraz limitu retencji 5000 rekordów.

Zapis obejmuje wersję, UUID analizy, znormalizowaną tożsamość, locale, fingerprint, prompt version, model, zwalidowany JSON, UTC timestamps, usage, input/output SHA-256 i stan `VALID|STALE`. Nie zapisuje promptu ani raw completion. Rekord render-preview jest odrzucany przez store. Przy uszkodzonym najnowszym rekordzie reader pomija go i szuka ostatniego poprawnego wpisu; poprawny last-known-good nie jest usuwany przez nieudaną regenerację.

## Bezpieczeństwo promptu i odpowiedzi

Prompt wymusza research-only, wyłącznie bounded context, jawne braki, autorytatywny maszynowy state, kopiowanie wartości faktów bez nowych obliczeń oraz brak zewnętrznej wiedzy. Nazwa, symbol, URL, raport i teksty projektu są oznaczone jako niezaufane dane, których instrukcji nie wolno wykonywać.

Walidator fail-closed sprawdza exact keys, rozmiary, enumy, fakty względem wejścia, wszystkie source reference IDs, allowlistę URL i typów akcji, token usage, UTC, hashe i zabronione treści transakcyjne/safety claims. Model nigdy nie tworzy URL ani statusu. Maksymalnie jedna naprawa dotyczy wyłącznie błędu schematu lub polityki.

## Visual Candidate Research Canvas

Canvas jest deterministycznym React UI, nie treścią HTML/SVG/CSS generowaną przez model. Zawiera nagłówek tokena z lokalnym identiconem, sześć KPI, czteropolową macierz pokrycia, mapę „Co dalej”, macierz ryzyk, jawne „Czego nadal nie wiemy”, checkpointy 1/3/7/14/30, krótki brief, źródła i stałą granicę badawczą.

Warstwa prezentacji rozdziela lifecycle od świeżości: „Etap badawczy” pokazuje `new`, `follow_up`, `candidate` lub `established` jako naturalne etykiety, a „Świeżość danych” osobno prezentuje stan aktualny, opóźniony, nieaktualny albo niedostępny. Wynik filtrów jest oddzielony od kompletności wejścia: KPI „Podstawowe filtry” pokazuje wystarczające/niewystarczające, natomiast komórka pokrycia „Dane do oceny filtrów” mówi wyłącznie, czy wynik można było obliczyć. Przy nieaktualnej migawce mapa „Co dalej” najpierw zaleca oczekiwanie na nowe dane; ręczna weryfikacja pozostaje secondary action, a DexScreener i eksplorator są tertiary external actions.

Główny Canvas tłumaczy source reference IDs na naturalne etykiety PL/EN i pokazuje konkretne opisy każdej obsługiwanej luki. Surowe identyfikatory pozostają kontraktem maszynowym, nie copy użytkowym. Brak danych jest nadal stanem nieznanym, nigdy niskim ryzykiem. Linie siatki tła są celowo słabsze od obramowań paneli, aby zachować terminalowy charakter bez konkurowania z tekstem i tabelami.

Candidate Detail umieszcza Canvas po przepływie lifecycle i przed szczegółowymi metrykami. Obsługuje `ABSENT`, `GENERATING`, `READY`, `STALE`, `RATE_LIMITED`, `PROVIDER_DISABLED`, `INSUFFICIENT_DATA` i `ERROR`. Radar pokazuje tylko kompaktowy status i tertiary action. Verification zachowuje ręczną weryfikację jako nadrzędną i otrzymuje secondary action do Candidate Detail. Reports pozostaje read-only; wersjonowany brief jest stabilnym assetem do późniejszego adaptera.

UI działa w PL i EN, nie pokazuje surowych enumów, ma semantyczne nagłówki/listy/tabelę, `aria-live`, `aria-busy`, focus-visible, minimum 44 px, reduced motion i bezpieczne łamanie adresów. Na 390 px KPI mają dwie kolumny, mapa staje się pionowa, a tabela ryzyk listą bez poziomego scrolla.

Warstwa wizualna zachowuje shell Crypto Edge AI i dodaje tylko scoped tokeny kompatybilności KINTEL: niemal czarny panel, cienkie cyan borders, małe badges, zwarty gradient cyan–green, umiarkowany glow i semantyczne kolory. Nie dodaje Tailwind, shadcn, Radix ani nowego globalnego systemu.

Stały disclaimer:

> Analiza AI porządkuje dostępne dane i proponuje kolejny krok badawczy. Nie potwierdza bezpieczeństwa projektu i nie jest rekomendacją inwestycyjną.

## Owner review i rollback

Bezpieczny przegląd:

```cmd
scripts\win\start-ai-research-brief-review.cmd --render-preview --mobile-guide
```

Launcher wymusza `INTERNAL_BETA`, provider `DISABLED`, owner operations `DISABLED`, brak live-source opt-in i brak automatyzacji. Store AI i pomocniczy Feedback Store są kierowane do izolowanych losowych ścieżek `%TEMP%`, więc zwykły review nie dotyka kanonicznych baz. `--render-preview` używa najnowszego prawdziwego lokalnego tokena, nie dopuszcza fixture fallback, tworzy brief tylko w pamięci z `token_usage=0`, pokazuje badge „Podgląd formatu — bez wywołania AI” i nie otwiera nawet tymczasowego store AI.

AI.2 dodaje osobny bezpłatny review oraz przyszły live-one:

```cmd
scripts\win\start-ai-research-openai-review.cmd
scripts\win\start-ai-research-openai-review.cmd --live-one
scripts\win\clear-ai-research-openai-review.cmd
```

Pierwsza komenda utrzymuje provider `DISABLED`. Druga wymaga klucza i modelu, ale nadal nie wykonuje requestu przy starcie — pierwszy call następuje dopiero po kliknięciu ownera. Oba tryby używają `tools\ui-mock\.local\ai-research-openai-review.sqlite`; live-one rezerwuje jedną próbę atomowo także na wypadek błędu i nie uruchamia automatycznej naprawy. Cleanup usuwa tylko tę bazę oraz jej WAL/SHM i nie zatrzymuje procesów.

Rollback kodu polega na cofnięciu commitu AI.1. Operacyjny rollback polega na ustawieniu `CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED`; odcina generowanie bez naruszania istniejących briefów. Osobny plik SQLite można zachować jako last-known-good lub po zatrzymaniu procesu przenieść do archiwum. Rollback nie wymaga zmian scanner snapshotu, lifecycle, Follow-up, Established, Feedback, VPS, Cloudflare ani Task Scheduler.
