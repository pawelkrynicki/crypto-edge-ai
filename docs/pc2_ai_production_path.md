# PC.2 — Production AI Analysis Path

## Audit and reuse

PC.1 already supplied the core path in `tools/ui-mock`:

- `aiResearchQueueStore.ts`: SQLite/WAL queue, unique cache identity, leases, persistent request limits and last-known-good lookup.
- `aiResearchWorker.ts`: server-only worker, bounded attempts, leases and cost/budget controls.
- `aiResearchProvider.ts`: server-only OpenAI Responses adapter with a strict JSON-schema narrative contract and zero SDK retries.
- `aiResearchContext.ts` / `aiResearchSchema.ts`: snapshot hashing, deterministic lifecycle skeleton, evidence-only input and output validation.
- `aiResearchService.ts` / `scannerApiHandler.ts`: read/enqueue routes; browsers cannot call a provider.
- Candidate Detail already has exactly seven tabs, including `ai`.

The old render-preview fixture is retained only for isolated visual review. Normal queue, worker and PC.2 tests use deterministic fake providers. No development or automated test call uses OpenAI.

## PC.2 extensions

- The shared key is the normalized chain + contract + source snapshot fingerprint + prompt version + output schema version + model contract. Locale is deliberately excluded, so language choice cannot multiply an evidence-identical generation. No user, actor or private-workspace field participates in this key.
- P1 locale independence: the heavy worker always builds and stores a canonical English analysis. `ai_research_prompt_v3` makes this contract explicit, so an older locale-sensitive result cannot be selected by the new cache identity. The retained queue `locale` column is written as canonical `en` for compatibility; it is neither a cache-key component nor request-owned semantic state. No database migration is required.
- PL/EN are deterministic presentation modes over the same stored facts, risks, coverage, evidence and actions. Provider prose is not passed through a second LLM for translation; the public renderer compiles the persisted semantic skeleton into the requested language. Locale switching therefore creates no queue job, shared record or provider call, and cannot fabricate facts or mutate lifecycle.
- The queue preserves single-flight behavior across process restarts with a unique SQLite key and `BEGIN IMMEDIATE` claim/enqueue transactions. WAL and a bounded busy timeout are configured; no database migration was needed.
- `crypto_ai_circuit_breaker` is a central persisted `CLOSED` / `OPEN` / `HALF_OPEN` breaker. Retryable upstream failures open it after a bounded threshold. A single half-open probe closes it after success; all other heavy provider calls remain deferred.
- Retryable timeout, 429, network/upstream failures use bounded exponential backoff with deterministic jitter. Invalid requests and invalid provider/schema output are not retried.
- Limits cover worker global hourly/daily execution budgets, concurrent jobs, persistent per-actor/global initiation windows and queue depth. Shared cache reads and already-queued keys do not consume initiation quota.
- A failed refresh keeps the prior validated result as last-known-good. The browser receives `STALE` with the old structured result, never an empty replacement.

## CENTRAL QUERY & FAN-OUT CONTRACT

This is a P0 product and architecture contract for PC.2, and the required data-access shape for PC.3 integrations:

- The central server alone fetches providers, validates their response, normalizes it into a shared snapshot/cache and fans that record out to all product users. Browser code reads only product backend APIs. It never calls OpenAI, DexScreener, GoPlus, Honeypot.is, DefiLlama, or another data-provider API directly.
- The shared AI identity is exactly normalized `chain + contract + snapshot fingerprint + prompt version + model + schema version`. It deliberately excludes actor, lifecycle, private workspace, session and locale. One heavy generation serves every eligible user of the same stored snapshot; PL and EN are deterministic reads of that shared result and never start a second generation.
- Opening Candidate Detail and its AI tab reads the public cached result. Five hundred concurrent cached reads are read-only and produce zero provider calls. User-specific lifecycle and workspace state remain private and cannot fragment, mutate or become part of the central analysis cache.
- “Refresh view” is a read-only product refresh: it never starts a scanner cycle, provider fetch, AI job or lifecycle mutation. Manual external links remain user-initiated website visits; they are not per-click server-side provider proxies.
- For a PC.3 source with official, stable API access, use a central server fetch with explicit rate limits, TTL, normalization, cache and last-known-good handling, then fan out the stored result. For an uncertain, unstable or unauthorised source, do not scrape or create a per-user fetch path: expose a manual evidence link and record only allowed evidence.

Violating this contract is P0. A regression that creates a browser-to-provider path, per-user heavy generation, locale-generated copy, or a refresh-triggered provider call blocks release.

## Public contract and security

The server converts internal records to `ai_production_analysis_lookup_v1` before any Candidate Detail route responds. Its only states are:

`NO_ANALYSIS`, `QUEUED`, `PROCESSING`, `READY`, `STALE`, `ERROR`, `LIMIT`, `DISABLED`.

The structured result is `ai_production_analysis_v1` with summary, strengths, risks, missing data, market/security/liquidity/holder context, watch items, evidence, timestamps, freshness and analysis version. It excludes model/provider names, token counts, queue/cache/analysis IDs, raw errors and SQLite details.

The provider contract uses a per-request strict schema with exact current array counts and target-ID allowlists; the parser remains authoritative for target order. Invalid JSON, shape, skeleton, generated URLs, unsupported numbers and investment/safety/profit claims fail closed. A harmless raw enum, machine-style label or isolated locale contamination falls back only that narrative field to deterministic evidence-bound copy. Internal queue audit stores only a validation code and bounded violation names; it never stores raw provider output and these diagnostics never cross the CAMP public contract.

Responses marked `incomplete` are rejected before their partial output can enter JSON parsing. The worker records only bounded internal completion metadata (status, incomplete reason, output and reasoning token counts), never raw provider output; the public CAMP contract remains provider-neutral. The structured-output ceiling is a named 8,000-token bound, while the default request timeout remains 90 seconds.

AI request initiation now resolves the existing server-side PC.1 actor context. Browser payloads contain neither user nor role fields; the actor is used only for the persistent initiation limit. The AI worker has no lifecycle or private-workspace mutation path.

The AI tab uses the safe contract and lightweight five-second status polling only while that tab is open and the state is `QUEUED` or `PROCESSING`; polling stops at a terminal state and never refreshes the Radar. PL/EN messages are user-facing and provider-neutral.

## Operations

The relevant server-only environment controls are documented in `tools/ui-mock/.env.example`, including breaker, retry jitter, actor/global initiation and queue-depth controls. `CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS` defaults to `90000` for the bounded bilingual strict-schema Responses call; `CRYPTO_EDGE_AI_WORKER_LEASE_MS` defaults to `180000`, preserving a 90-second margin without enabling SDK retries. AI remains fail-closed unless the existing server worker configuration enables it.

No controlled live owner test was run in this change. It requires a server-side `OPENAI_API_KEY`, `CRYPTO_EDGE_AI_RESEARCH_PROVIDER=OPENAI`, an allowed model configuration, and explicit worker enablement. It must be run separately against a small owner-selected token set after offline verification.
