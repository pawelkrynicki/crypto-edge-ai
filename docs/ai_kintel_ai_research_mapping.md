# AI.1 → AI KINTEL Integration Mapping

## Cel INT.1

Standalone AI.1 pozostaje niezależny technologicznie, ale jego granice odpowiadają przyszłemu modułowi AI KINTEL. INT.1 ma przenieść adaptery infrastruktury, nie zmieniać logiki produktu, enumów, fingerprintu ani publicznego briefu.

| Standalone AI.1 | Przyszłe AI KINTEL | Zasada migracji |
|---|---|---|
| React 19 components | route/feature React 19 | ten sam `AIResearchBrief` view model |
| scoped CSS + UX.1 primitives | Tailwind 4 + shadcn/ui + Radix | mapowanie wariantów primary/secondary/tertiary i tokens, bez zmiany semantyki |
| same-origin HTTP routes | `trpc.cryptoAiResearch.*` | browser nadal wysyła tylko identity, locale, idempotency key |
| service + provider interface | server service + backend OpenAI helper | prompt i walidacja wyłącznie po stronie serwera |
| SQLite store | MySQL/MariaDB + Drizzle | zachowanie unique key, hashy, statusów i UTC |
| process-local single-flight | współdzielony lock/job dedupe | jeden job na cache key w całym klastrze |
| semaphore | PM2 analyzer worker concurrency | bounded worker pool i timeout |
| no-op usage recorder | `insight_costs` + `token_pools` adapter | user i billing tylko z protected server context |

## Etykiety prezentacyjne

AI KINTEL powinien zachować machine source reference IDs w danych i mapować je dopiero w warstwie prezentacji. Aktualne naturalne etykiety Canvasu:

| Machine reference | PL | EN |
|---|---|---|
| `basic_filters` | Podstawowe filtry | Basic filters |
| `security_status`, `security` | Status bezpieczeństwa | Security status |
| `scanner_snapshot` | Migawka skanera | Scanner snapshot |
| `follow_up_checkpoints`, `lifecycle` | Etap obserwacji | Observation stage |
| `established_membership` | Członkostwo w Established | Established membership |
| `methodology` | Metodologia produktu | Product methodology |

To mapowanie jest wyłącznie copy/view-model contractem. Nie zmienia `ai_research_brief_v1`, source reference IDs, store ani adapterów migracyjnych.

## MySQL / Drizzle mapping

Docelowa tabela `crypto_ai_research_briefs`:

| Kolumna | Sugerowany typ | Indeks / uwaga |
|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | primary key |
| `analysis_id` | `VARCHAR(40)` | unique |
| `schema_version` | `VARCHAR(40)` | required |
| `chain` | `VARCHAR(32)` | z `contract_address` |
| `contract_address` | `VARCHAR(64)` | identity index |
| `locale` | `VARCHAR(5)` | część cache unique |
| `snapshot_fingerprint` | `CHAR(64)` | index + cache unique |
| `prompt_version` | `VARCHAR(64)` | część cache unique |
| `model` | `VARCHAR(128)` | metadata, nie identity |
| `ai_analysis` | `JSON` | tylko validated public brief |
| `prompt_tokens` | `INT UNSIGNED` | usage |
| `completion_tokens` | `INT UNSIGNED` | usage |
| `total_tokens` | `INT UNSIGNED` | usage |
| `input_hash` | `CHAR(64)` | audit |
| `output_hash` | `CHAR(64)` | tamper check |
| `hash` | `CHAR(64)` | unique dedupe |
| `generated_at` | `DATETIME(3)` UTC | index |
| `data_generated_at` | `DATETIME(3)` UTC | freshness |
| `status` | `VARCHAR(16)` | index; `VALID|STALE` |
| `created_at`, `updated_at` | `DATETIME(3)` UTC | audit |

Wymagane indeksy: unique `analysis_id`, unique `(chain, contract_address, snapshot_fingerprint, prompt_version, locale)`, unique `hash`, index `(chain, contract_address)`, `generated_at`, `snapshot_fingerprint` i `status`. Migracja ma ponownie walidować JSON oraz hashe; nie należy przenosić rekordów render-preview.

## tRPC mapping

Proponowane procedury:

- `cryptoAiResearch.status` — public/private query zależnie od surface;
- `cryptoAiResearch.getBrief` — query z strict input `chain`, `contract_address`, `locale`;
- `cryptoAiResearch.generate` — `protectedProcedure` mutation z dodatkowym `idempotency_key`.

Router nie przyjmuje promptu, modelu, snapshotu, URL, summary ani risk score. Context serwera dostarcza `user_id`, session, adapter store, provider, billing i distributed single-flight. TanStack Query może cache’ować odpowiedź UI, ale nie zastępuje serwerowego cache według fingerprintu.

## PM2 analyzer mapping

Cięższa generacja może działać w oddzielnym procesie `crypto-ai-research-analyzer`. Web process:

1. waliduje request i cache;
2. rezerwuje idempotentny job dla cache key;
3. zwraca stan generowania albo czeka w ograniczonym czasie;
4. odczytuje wyłącznie zwalidowany wynik.

Analyzer ładuje bounded context po identity, wykonuje backendowy helper OpenAI, waliduje i zapisuje transakcyjnie. PM2 restart nie może pozostawić permanent lock; job musi mieć lease/timeout. Concurrency pozostaje bounded, a różne identity mogą działać niezależnie. Collector i analyzer to osobne procesy oraz osobne uprawnienia.

## Token billing mapping

`AIResearchUsageRecorder` jest portem domenowym. Adapter AI KINTEL po poprawnym zapisie briefu może w jednej kontrolowanej operacji:

- zapisać koszt i usage w `insight_costs`;
- obciążyć właściwy `token_pool`;
- powiązać `analysis_id`, `user_id`, model i usage;
- zapewnić idempotency po `analysis_id`.

`user_id` pochodzi wyłącznie z `protectedProcedure`, nigdy z body. Brak środków jest sprawdzany przed enqueue/provider call. Błąd billingu wymaga zdefiniowanej polityki transakcyjnej w INT.1; standalone nie potrąca tokenów i nie udaje billingu.

## Security i operacje

Sekrety providera należą do procesu analyzera. Frontend i web response nie widzą klucza, promptu, raw completion ani cross-user context. Source refs i action targets nadal powstają na serwerze. Model pozostaje niewładny wobec lifecycle.

Przed integracją INT.1 trzeba zatwierdzić: auth boundary, transakcję billing/store, distributed lock, retention, observability bez sensitive payloads, migrations/rollback, PM2 health i retry policy. AI.1 nie dodaje obecnie MySQL, Drizzle, tRPC, Tailwind, shadcn, Radix, PM2 ani kodu monorepo KINTEL.
