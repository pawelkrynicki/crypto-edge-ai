# 12R.3 — Fail-Closed Real Data API Contract

## Aktualizacja kontraktu 12R.5 — dwa koszyki discovery

Scanner publikuje `query=two_basket_discovery` i allowlisted candidate metadata: `discovery_basket`, `discovery_method`, `observation_only`, `established_eligible`, `universe_version`, `universe_entry_index`, `address_identity_verified`. Dozwolone koszyki to `new_emerging` i `established`.

Manifest metadata zawiera `discovery_architecture=two_basket_discovery_v1`, osobne statystyki `new_emerging`/`established` oraz readiness procesu, obu koszyków i contextu. Pusty established universe ma `ESTABLISHED_UNIVERSE_EMPTY` / `EMPTY_CONFIGURED`; jest poprawnym empty state, nie uruchamia fixture i nie blokuje gotowego `new_emerging`. `/api/readiness` może zwrócić HTTP 200 ze statusem `ready_with_empty_established_universe`, jednocześnie raportując established `ready=false`, `configured=true` i reason code `ESTABLISHED_UNIVERSE_EMPTY`.

Security checks mogą należeć wyłącznie do established candidate po `dexscreener_basic_filters_v1`. Unknown/raw fields, scorecards, fixture i niezgodne lineage nadal są odrzucane fail-closed.

## Zakres

Ten kontrakt opisuje wyłącznie lokalną granicę odczytu i publikacji danych dla `INTERNAL_BETA`. Etap 12R.3 nie uruchamia collectorów, nie wykonuje provider calls, nie wdraża niczego na VPS i nie wystawia nowego portu publicznego.

## Aktualizacja kontraktu 12R.4

Reader `real_data_boundary_v1` pozostaje fail-closed. Aktywny scanner manifest wymaga `dexscreener` oraz dopuszcza `goplus_security` wyłącznie wtedy, gdy GoPlus faktycznie wykonał request. `honeypot_is` jest zabroniony w provenance `INTERNAL_BETA`.

GoPlus jest pełnym aktualnie zatwierdzonym security contract. Jeden świeży wynik GoPlus nie oznacza partial coverage. Brak GoPlus daje `SECURITY DATA UNAVAILABLE`; pozytywne zapewnienia bezpieczeństwa nadal są zabronione.

Metadata scanner snapshotu zawiera discovery method, liczbę seedów/par/kandydatów, security limit, request counts per source, source health i attribution `provider=GoPlus Security`. Context zawiera faktyczne `alternative_me_fng` i `defillama_api`, attribution requirements oraz źródłowe timestampy.

Publikacja jest atomiczna: pełna walidacja, plik tymczasowy w katalogu docelowym, atomic rename oraz blokada collision `run_id`. Snapshot nie zawiera raw provider fields ani publikowanych scorecards.

Collector wymaga równocześnie `CRYPTO_EDGE_DATA_ENV=INTERNAL_BETA`, `CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA` i `ALLOW_LIVE_PROVIDER_CALLS=1`; brak zgody kończy proces przed pierwszym fetch. Komenda offline to `npm run snapshot:validate:latest`.

12R.4 nie obejmuje schedulera, retention, deploymentu ani zmian VPS. Historyczny hand-off został domknięty przez 12R.5; następny etap to **Product Radar Build & Owner Acceptance**.

## Runtime mode

Jedyną flagą trybu produktu jest `CRYPTO_EDGE_RUNTIME_MODE`:

- `DEVELOPMENT_DEMO` — jawny tryb developerski; fixture są dozwolone i oznaczone jako demo;
- `INTERNAL_BETA` — wyłącznie API i display-eligible live snapshots;
- brak albo nieznana wartość — `UNCONFIGURED`, czyli fail-closed.

Adres prywatny, `localhost`, access gate ani host header nie zmieniają trybu. Build frontendu otrzymuje tę samą flagę przez konfigurację Vite; nie istnieje druga konkurencyjna flaga product mode. `INTERNAL_BETA` korzysta z osobnego entrypointu `ProductApp`, a build gate odrzuca artefakt zawierający ścieżki fixture albo markery ekranów demo/sample.

## Manifest provenance

Scanner wymaga `schema_version=scanner_snapshot_v1` i `generator_version=data_poc_persistable_scanner_v1`. Context wymaga `schema_version=context_snapshot_v1` i `generator_version=approved_sources_poc_v1`. Wspólna wersja kontraktu to `real_data_boundary_v1`.

Minimalny manifest:

```json
{
  "schema_version": "scanner_snapshot_v1",
  "contract_version": "real_data_boundary_v1",
  "generator_version": "data_poc_persistable_scanner_v1",
  "environment": "INTERNAL_BETA",
  "mode": "live",
  "fixture_used": false,
  "run_id": "scan_YYYYMMDDhhmmss",
  "generated_at": "ISO-8601",
  "finished_at": "ISO-8601",
  "source_ids": ["dexscreener", "goplus_security"],
  "policy_decisions": {
    "dexscreener": {
      "live_fetch": "allowed",
      "normalized_storage": "allowed",
      "user_display": "allowed",
      "raw_storage": "denied"
    }
  }
}
```

Reader porównuje decyzje manifestu z `config/data_source_runtime_policy.json`; deklaracja manifestu nie może samodzielnie nadać uprawnienia. Brak manifestu, nieznana wersja, inny environment/mode, `fixture_used=true`, brak decyzji, `raw_storage=allowed`, policy mismatch albo nieznany source kończą się 503.

Fixture markers (`fixture`, `sample`, `mock`, `demo`) są zabronione w `run_id`, query, symbolach, adresach i metadata ścieżki `INTERNAL_BETA`.

## Allowlisty publikacji

Scanner candidate publikuje wyłącznie jawnie mapowane pola:

`run_id`, `candidate_id`, `symbol`, `name`, `chain`, `contract_address`, `pair_address`, `dex`, `source`, `source_url`, `price_usd`, `market_cap_usd`, `fdv_usd`, `liquidity_usd`, `volume_24h_usd`, `volume_market_cap_ratio`, `pair_created_at`, `pair_age_days`, `basic_filter_status`, `filter_reasons`, `final_label`, `final_reasons`, `created_at`.

Security publikuje wyłącznie znormalizowane pola podatków, flag ryzyka, coverage, statusu, źródeł i `checked_at`. Dozwolone user-facing statusy to:

- `CRITICAL RISK`;
- `NEEDS MANUAL VERIFICATION`;
- `SECURITY DATA UNAVAILABLE`.

`SECURITY_PASSED` nie jest publikowane jako pozytywne zapewnienie; mapuje się na `NEEDS MANUAL VERIFICATION`. `Safe Token`, `Verified Safe`, raw payload, nieznane pola, sekrety i absolutne ścieżki hosta nie są publikowane. `final_label` i scoring nie są przeliczane ani zmieniane; nieallowlistowane scorecards nie są publikowane przez ścieżkę `INTERNAL_BETA`.

## Freshness

- scanner `generated_at`/`finished_at`: do 30 minut ma status `FRESH`; starszy prawidłowy snapshot ma status `STALE` i pozostaje last-known-good;
- GoPlus `checked_at`: maksymalnie 30 minut;
- Alternative.me `fetched_at`: maksymalnie 30 godzin;
- DefiLlama `fetched_at`: maksymalnie 6 godzin;
- tolerancja zegara w przyszłość: 5 minut.

Brakujący, nieparsowalny albo zbyt przyszły timestamp jest invalid. Stary, lecz poza tym prawidłowy scanner zwraca HTTP 200 z `_source_meta.freshness_status=STALE`, `age_seconds` i pełnym allowlistowanym snapshotem. Readiness zwraca stan `degraded`, scanner pozostaje `ready=true`, a `SCANNER_SNAPSHOT_STALE` jest diagnostyką techniczną. Stary context nadal podlega własnym SLA. Security jest walidowane względem czasu publikacji last-known-good, aby odczyt nie przepisywał historycznego snapshotu; brak prawidłowego GoPlus nadal daje `SECURITY DATA UNAVAILABLE`.

Context last-known-good jest dopuszczalny tylko wewnątrz SLA, z rekordami oraz jawnym `DEGRADED`. Po SLA endpoint zwraca 503.

## Endpointy

| Endpoint | Znaczenie |
|---|---|
| `GET /api/health` | wyłącznie stan procesu; może zwrócić 200 przy data readiness 503 |
| `GET /api/readiness` | osobna gotowość scanner/context i tablica `reason_codes` |
| `GET /api/scanner/latest` | najnowszy prawidłowy allowlisted live scanner snapshot; fresh lub stale, HTTP 200 |
| `GET /api/context/latest` | allowlisted live context snapshot albo 503 |
| `GET /api/scanner/sources` | bezpieczna diagnostyka bez absolutnych ścieżek |

Hard failure, gdy nie istnieje żaden prawidłowy snapshot, ma stabilny kształt:

```json
{
  "status": "data_unavailable",
  "reason_code": "SCANNER_SCHEMA_INVALID",
  "message": "Data Unavailable"
}
```

Najważniejsze reason codes:

- runtime: `RUNTIME_MODE_UNCONFIGURED`;
- scanner: `SCANNER_OUTPUT_DIRECTORY_MISSING`, `SCANNER_OUTPUT_UNAVAILABLE`, `SCANNER_OUTPUT_INVALID_JSON`, `SCANNER_SCHEMA_INVALID`, `SCANNER_MANIFEST_MISSING`, `SCANNER_MANIFEST_VERSION_UNSUPPORTED`, `SCANNER_ENVIRONMENT_INVALID`, `SCANNER_MODE_INVALID`, `SCANNER_FIXTURE_FORBIDDEN`, `SCANNER_FIXTURE_MARKER_DETECTED`, `SCANNER_POLICY_DECISIONS_MISSING`, `SCANNER_POLICY_DENIED`, `SCANNER_POLICY_MISMATCH`, `SCANNER_RAW_STORAGE_ALLOWED`, `SCANNER_SOURCE_REQUIRED`, `SCANNER_SOURCE_UNKNOWN`, `SCANNER_LINEAGE_MISMATCH`, `SCANNER_TIMESTAMP_MISSING`, `SCANNER_TIMESTAMP_INVALID`, `SCANNER_TIMESTAMP_FUTURE`, `SCANNER_SNAPSHOT_STALE`;
- context: odpowiedniki `CONTEXT_*`, w tym `CONTEXT_LINEAGE_MISMATCH`, oraz `CONTEXT_ALTERNATIVE_ME_STALE`, `CONTEXT_DEFILLAMA_STALE`, `CONTEXT_SOURCE_DATA_UNAVAILABLE`;
- frontend defense-in-depth: `SCANNER_RUNTIME_MODE_UNCONFIGURED` i `SCANNER_FIXTURE_RESPONSE_FORBIDDEN`.

Wszystkie odpowiedzi API używają `Cache-Control: no-store, max-age=0`. `INTERNAL_BETA` jest same-origin i nie emituje `Access-Control-Allow-Origin: *`. Demo dopuszcza wyłącznie jawne originy `http://127.0.0.1:5173` i `http://localhost:5173`.

## Uruchomienie bez provider calls

Fail-closed `INTERNAL_BETA`:

```powershell
cd tools/ui-mock
$env:CRYPTO_EDGE_RUNTIME_MODE = "INTERNAL_BETA"
pnpm run api
pnpm run build:internal-beta
```

Brak display-eligible snapshotu jest oczekiwanym stanem 503.

Jawny offline demo:

```powershell
cd tools/ui-mock
$env:CRYPTO_EDGE_RUNTIME_MODE = "DEVELOPMENT_DEMO"
pnpm run dev:with-api
```

Windows helper `scripts\win\dev-ui.cmd` ustawia `DEVELOPMENT_DEMO` jawnie. `scripts\win\check-data-poc.cmd` nie wykonuje live calls, chyba że operator osobno ustawi `CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=1`; tej opcji nie używa się w 12R.3.

## Następny etap

12R.4 — Approved Live Collectors & Normalized Snapshot: autoryzowane collectory, normalized-only output, atomowa publikacja, retention i operational controls. Dopiero ten etap może dostarczyć prawdziwy snapshot; 12R.3 tylko egzekwuje granicę jego dopuszczenia.
