# AI Research Brief — kontrakt `ai_research_brief_v1`

## Wersje

- publiczny brief: `ai_research_brief_v1`;
- prompt: `ai_research_prompt_v1`;
- lookup: `ai_research_lookup_v1`;
- status: `ai_research_status_v1`;
- error envelope: `ai_research_error_v1`.

Zmiana znaczenia lub wymaganych pól wymaga nowej wersji. Zmiana copy bez zmiany semantyki może pozostać w tej samej wersji promptu tylko wtedy, gdy nie narusza cache; w przeciwnym razie należy zwiększyć `prompt_version`.

## Model publiczny

| Pole | Typ / limit | Pochodzenie |
|---|---|---|
| `schema_version` | stałe `ai_research_brief_v1` | backend |
| `analysis_id` | `air_` + UUID | backend |
| `identity` | `{chain, contract_address}` | wspólny normalizer EVM/Solana |
| `analysis_language` | `pl|en` | strict request |
| `snapshot_fingerprint` | lowercase SHA-256 | bounded context |
| `prompt_version` | stałe `ai_research_prompt_v1` | backend |
| `model` | string 1–128 | konfiguracja providera / `render-preview` |
| `generated_at`, `data_generated_at` | ISO UTC | backend / dane produktu |
| `research_state` | zamknięty enum | resolver danych, nigdy model |
| `summary` | 1–600 znaków | validated provider draft |
| `known_facts` | 3–5 | wartości skopiowane z katalogu backendu |
| `risk_factors` | 1–5 | kategorie/severity ograniczone kontekstem |
| `missing_information` | 0–5 | pełny katalog braków backendu |
| `next_actions` | 1–4 | model wybiera typ; backend mapuje target |
| `status_change_conditions` | 0–3 | katalog backendu |
| `source_references` | 1–16 | bezpieczny katalog backendu |
| `coverage` | dokładnie 4 | market, filters, security, information |
| `checkpoints` | dokładnie 1/3/7/14/30 | resolver FLOW.1 |
| `token_usage` | trzy nieujemne integer; suma zgodna | provider metadata |
| `input_hash`, `output_hash` | lowercase SHA-256 | backend |
| `render_preview` | boolean | backend |

`output_hash` to SHA-256 kanonicznie złożonego modelu z polem `output_hash` ustawionym na 64 zera. Reader ponownie go wylicza; zmieniona treść nie przechodzi walidacji.

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

`risk_factors[].severity`: `low|medium|high|unknown`. Brak security jest `unknown`, nigdy automatycznie `low`.

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

## Referencje i akcje

Każdy fakt, risk, brak i warunek używa istniejących `source_reference_ids`. Provider nie zwraca źródeł ani URL. Backend może wystawić jedynie źródła typów scanner, checkpoint, filters, security, membership, methodology, DexScreener, explorer i report. Zewnętrzne URL muszą mieć HTTPS, brak credentials i host z allowlisty eksploratorów/DexScreener; trasy wewnętrzne zaczynają się od `#`.

## Strict provider draft

Provider zwraca tylko podzbiór potrzebny do sformułowania narracji: wersję, dokładny `research_state`, summary, facts, risks, missing information, wybór action types z reason oraz status-change conditions. Każdy obiekt ma `additionalProperties: false`. Backend odrzuca nieznane pola, nieprawidłowe długości i wartości niewystępujące w bounded context.

Provider nie kontroluje `analysis_id`, identity, czasu, fingerprintu, prompt/model metadata, URL, targetów, coverage, checkpointów, token usage ani hashy.

## Lookup i błędy

Lookup posiada: `availability`, `provider_mode`, `brief|null`, `retry_after_seconds|null`, `error_code|null`. Dostępność jest ograniczona do `ABSENT`, `GENERATING`, `READY`, `STALE`, `PROVIDER_DISABLED`, `INSUFFICIENT_DATA`, `RATE_LIMITED`, `ERROR`.

Publiczny błąd nie zawiera raw exception. Obejmuje wersję, bezpieczny kod, neutralny komunikat, opcjonalne retry-after i zwalidowany cached brief. Obsługiwane kategorie obejmują disabled/missing configuration, timeout/provider error, validation failure, rate limit, błędną lub nieobsługiwaną tożsamość, brak rekordu i awarię store. Uszkodzony cache jest pomijany fail-closed.

## Pola zabronione

Publiczny model i store nie zawierają pełnego promptu, raw snapshotu, raw response/completion, sekretów, API key, cookies, session IDs, owner notes, lokalnych ścieżek, stack trace ani metadata locków. Model nie może dodawać liczb, URL, statusów ani faktów spoza katalogu wejścia.
