# AI Research Brief — kontrakt `ai_research_brief_v1`

## Wersje

- publiczny brief: `ai_research_brief_v1`;
- prompt i kontrakt semantyczny: `ai_research_prompt_v2`;
- prywatny Structured Output providera: `ai_research_narrative_v2`;
- lookup: `ai_research_lookup_v1`;
- status: `ai_research_status_v1`;
- error envelope: `ai_research_error_v1`.

Publiczna struktura briefu nie zmieniła się. Wersja promptu wzrosła, ponieważ AI.2C przenosi własność pól semantycznych z modelu do backendu. Cache key i unikalność store nadal obejmują `prompt_version`, dlatego rekord `ai_research_prompt_v1` pozostaje materiałem dowodowym, ale nie jest zwracany jako aktualny ani last-known-good dla v2.

## Podział odpowiedzialności

Backend tworzy kompletny deterministyczny skeleton:

- `research_state` i etap obserwacji;
- klucze, etykiety, wartości oraz źródła known facts;
- kategorie, severity, tytuły i źródła ryzyk;
- obsługiwane braki danych i ich źródła;
- `action_type`, label, priority, target type, target reference, URL i kolejność akcji;
- warunki zmiany stanu, source catalog, coverage oraz checkpoints.

Model otrzymuje wyłącznie lokalizowane fakty i zamknięte identyfikatory narracyjne. Zwraca `summary` oraz `interpretation`, `explanation` lub `reason` przypięte do wszystkich identyfikatorów w przekazanej kolejności. Nie zwraca source IDs, machine values, enumów, URL ani pól decyzyjnych.

Backend składa publiczny `ai_research_brief_v1`, uruchamia semantic quality gate i dopiero potem wylicza hash oraz zapisuje wynik.

## Model publiczny

| Pole | Typ / limit | Pochodzenie |
|---|---|---|
| `schema_version` | stałe `ai_research_brief_v1` | backend |
| `analysis_id` | `air_` + UUID | backend |
| `identity` | `{chain, contract_address}` | wspólny normalizer EVM/Solana |
| `analysis_language` | `pl|en` | strict request |
| `snapshot_fingerprint` | lowercase SHA-256 | bounded context |
| `prompt_version` | stałe `ai_research_prompt_v2` | backend |
| `model` | string 1–128 | konfiguracja providera / `render-preview` |
| `generated_at`, `data_generated_at` | ISO UTC | backend / dane produktu |
| `research_state` | zamknięty enum | resolver danych, nigdy model |
| `summary` | 1–600 znaków | bounded narrative |
| `known_facts` | 3–5 | skeleton backendu + modelowe `interpretation` |
| `risk_factors` | 1–5 | skeleton backendu + modelowe `explanation` |
| `missing_information` | 0–5 | capability registry + modelowe `explanation` |
| `next_actions` | 1–4 | resolver backendu + modelowe `reason` |
| `status_change_conditions` | 0–3 | skeleton backendu + modelowe `explanation` |
| `source_references` | 1–16 | bezpieczny katalog backendu |
| `coverage` | dokładnie 4 | market, filters, security, information |
| `checkpoints` | dokładnie 1/3/7/14/30 | resolver FLOW.1 |
| `token_usage` | trzy nieujemne integer; suma zgodna | provider metadata |
| `input_hash`, `output_hash` | lowercase SHA-256 | backend |
| `render_preview` | boolean | backend |

`output_hash` to SHA-256 kanonicznie złożonego modelu z polem `output_hash` ustawionym na 64 zera. Reader ponownie go wylicza; zmieniona treść nie przechodzi walidacji.

## Capability registry

Obsługiwane braki danych:

| Capability ID | Wymagany source reference | Source type |
|---|---|---|
| `security` | `security_status` | `security_status` |
| `history` | `follow_up_checkpoints` | `follow_up_checkpoint` |
| `next_checkpoint` | `follow_up_checkpoints` | `follow_up_checkpoint` |
| `fresh_data` | `scanner_snapshot` | `scanner_snapshot` |
| `source_verification` | `scanner_snapshot` | `scanner_snapshot` |

Brak jest tworzony tylko wtedy, gdy capability istnieje, kontekst jednoznacznie wykazuje brak, a wymagany source reference znajduje się w katalogu i ma właściwy typ. `holder_concentration` nie należy do registry: `security_status` nie dowodzi koncentracji holderów, a produkt nie posiada osobnej capability ani providera tych danych.

## Zamknięte enumy

`research_state`:

```text
INSUFFICIENT_DATA
BASIC_FILTERS_FAILED
KEEP_OBSERVING
MANUAL_VERIFICATION_REQUIRED
OWNER_DECISION_REQUIRED
ESTABLISHED_RESEARCH
DATA_STALE
```

`risk_factors[].severity`: `low|medium|high|unknown`. Brak danych bezpieczeństwa jest `unknown`, nigdy automatycznie `low`.

`coverage[].state`: `sufficient|partial|insufficient|unavailable`.

`next_actions[].action_type`:

```text
OPEN_VERIFICATION
OPEN_DEXSCREENER
OPEN_EXPLORER
REVIEW_SECURITY
WAIT_FOR_CHECKPOINT
REVIEW_CHECKPOINTS
OPEN_REPORT
OWNER_REVIEW
RETURN_TO_RADAR
```

`BUY`, `SELL`, `HOLD`, `TRADE`, `DEPOSIT`, `CONNECT_WALLET`, `EXECUTE` i syntetyczne signal/safety states nie należą do kontraktu.

## Prywatny Structured Output v2

`ai_research_narrative_v2` zawiera dokładnie:

- `narrative_version`;
- `summary`;
- `fact_narratives[{id, interpretation}]`;
- `risk_narratives[{id, explanation}]`;
- `missing_narratives[{id, explanation}]`;
- `action_narratives[{id, reason}]`;
- `status_change_narratives[{id, explanation}]`.

Każda lista musi mieć dokładnie tę samą liczbę elementów, identyfikatory i kolejność co skeleton. Każdy obiekt ma `additionalProperties: false`. Nie istnieje pole, przez które model mógłby ustawić state, value, category, severity, source, priority, target lub URL.

## Semantic quality gate

Post-validation sprawdza zgodność pełnego złożonego briefu z kontekstem: research state, wszystkie fact values, skeleton ryzyk, capability i źródła braków, katalog source IDs, akcje wraz z kolejnością/priority/targetem oraz warunki zmiany. Osobny guard skanuje wyłącznie kontrolowane pola user-facing — bez globalnego replace — pod kątem raw enums, snake_case i machine values, mieszania PL/EN, nowych liczb, URL, BUY/SELL/HOLD, safety claims i prompt injection.

Błąd kończy żądanie fail-closed bez zapisu i bez automatycznego drugiego requestu. Zwalidowany last-known-good v2 pozostaje dostępny.

## Lookup i pola zabronione

Lookup posiada: `availability`, `provider_mode`, `brief|null`, `retry_after_seconds|null`, `error_code|null`. Dostępność jest ograniczona do `ABSENT`, `GENERATING`, `READY`, `STALE`, `PROVIDER_DISABLED`, `INSUFFICIENT_DATA`, `RATE_LIMITED`, `ERROR`.

Publiczny model i store nie zawierają pełnego promptu, raw snapshotu, raw response/completion, sekretów, API key, cookies, session IDs, owner notes, lokalnych ścieżek, stack trace ani metadata locków. Publiczny błąd nie zawiera raw exception. Uszkodzony lub semantycznie przestarzały cache jest pomijany fail-closed.
