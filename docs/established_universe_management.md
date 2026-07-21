# Established Universe Management

## Definicja i granice

`Established` jest jedynym głównym koszykiem Product Radar. Jego źródłem jest wyłącznie wersjonowana lista utrzymywana przez ownera. Wpis jest identyfikowany przez znormalizowaną parę `chain + contract_address`; symbol i nazwa są tylko podpowiedziami prezentacyjnymi.

Koszyk `New / observation` pozostaje niezależny, pochodzi z DexScreener latest profiles i nie awansuje automatycznie do `Established`. Dodanie do `Established` jest zawsze jawną operacją ownera. GoPlus jest uruchamiany wyłącznie dla wpisów `Established`, które przeszły niezmienione basic filters.

Walidacja adresu potwierdza format odpowiedni dla sieci. Nie potwierdza projektu, właściciela kontraktu, płynności ani bezpieczeństwa tokena.

## Kanoniczny model

Każdy wpis zawiera:

| Pole | Znaczenie |
| --- | --- |
| `chain` | jawna, znormalizowana nazwa obsługiwanej sieci |
| `contract_address` | znormalizowany adres kontraktu lub mintu |
| `enabled` | czy collector może użyć wpisu |
| `display_name` | opcjonalna nazwa prezentacyjna |
| `symbol_hint` | opcjonalna podpowiedź symbolu; nigdy nie jest tożsamością |
| `owner_note` | opcjonalna neutralna notatka lokalna, niewidoczna w API produktu |
| `added_at`, `updated_at` | znaczniki czasu ISO 8601 UTC |
| `added_by` | neutralny identyfikator ownera, bez danych osobowych |
| `entry_id` | stabilny identyfikator wpisu pochodny od tożsamości |

Duplikat `chain + contract_address` jest odrzucany. Adres EVM jest normalizowany do lowercase; adres Solana zachowuje zapis base58. Nieznana sieć zwraca `UNSUPPORTED_CHAIN`, a błędny format adresu `INVALID_CONTRACT_ADDRESS`.

Obsługiwane i wersjonowane sieci:

| `chain` | Typ adresu | DexScreener token-pairs | GoPlus |
| --- | --- | --- | --- |
| `ethereum` | EVM, `0x` + 40 cyfr hex | tak | chain id 1 |
| `bsc` | EVM | tak | chain id 56 |
| `base` | EVM | tak | chain id 8453 |
| `arbitrum` | EVM | tak | chain id 42161 |
| `polygon` | EVM | tak | chain id 137 |
| `avalanche` | EVM | tak | chain id 43114 |
| `solana` | 32-bajtowy base58 | tak | oficjalny endpoint Solana; wymaga tokenu API |

## Wersjonowanie i pliki lokalne

Universe zawiera `schema_version`, `universe_version`, `generated_at`, `entries` i deterministyczny `checksum`. Checksum SHA-256 obejmuje wersję schematu i pełną uporządkowaną zawartość wpisów, ale nie dynamiczny numer wersji ani czas. Każda skuteczna operacja `add`, `update`, `enable`, `disable` lub `remove` zwiększa `universe_version`, zachowuje poprzedni snapshot w historii i dopisuje audit entry. No-op jest odrzucany i nie tworzy wersji.

Kanoniczny lokalny store to:

```text
tools/data-poc/.local/established-universe/store.json
```

Można go wskazać zmienną `CRYPTO_EDGE_ESTABLISHED_UNIVERSE_STORE_PATH`. Katalog `.local` jest poza Git. Repozytorium zawiera tylko pusty kontrakt startowy `config/established_address_universe_v1.json`, bez fikcyjnych aktywnych tokenów. Store przechowuje bieżącą wersję, maksymalnie 20 wcześniejszych wersji i maksymalnie 200 wpisów audytu w jednym atomowo zastępowanym pliku. Operacje zapisu są chronione osobnym lokalnym lockiem.

`remove` usuwa wpis z bieżącej wersji, lecz snapshot historyczny i audit pozostają. `disable` zachowuje wpis, ale wyklucza go z collectora.

## CLI ownera

Kanoniczna komenda z katalogu repozytorium:

```cmd
pnpm --dir tools\data-poc run universe:manage -- <command>
```

Dostępne komendy: `list`, `validate`, `add`, `update`, `enable`, `disable`, `remove`, `history`, `diff`. Flaga `--json` daje jednoliniowy JSON dla automatyzacji. Nieznane i zduplikowane argumenty są odrzucane.

Operacje modyfikujące są domyślnie dry-run. Dopiero jawne `--apply` zapisuje nową wersję:

```cmd
pnpm --dir tools\data-poc run universe:manage -- add --chain ethereum --contract 0x1111111111111111111111111111111111111111 --display-name "Projekt"
pnpm --dir tools\data-poc run universe:manage -- add --chain ethereum --contract 0x1111111111111111111111111111111111111111 --display-name "Projekt" --apply
pnpm --dir tools\data-poc run universe:manage -- update --chain ethereum --contract 0x1111111111111111111111111111111111111111 --symbol-hint ABC --apply
pnpm --dir tools\data-poc run universe:manage -- disable --chain ethereum --contract 0x1111111111111111111111111111111111111111 --apply
pnpm --dir tools\data-poc run universe:manage -- enable --chain ethereum --contract 0x1111111111111111111111111111111111111111 --apply
pnpm --dir tools\data-poc run universe:manage -- remove --chain ethereum --contract 0x1111111111111111111111111111111111111111 --apply
pnpm --dir tools\data-poc run universe:manage -- history --json
pnpm --dir tools\data-poc run universe:manage -- diff --from established-universe-v000001 --to established-universe-v000002 --json
```

Identyfikator ownera ustaw lokalnie, bez przekazywania sekretów w command line:

```cmd
set CRYPTO_EDGE_UNIVERSE_OWNER_ID=owner
```

## Preview, live validation i collector

Bezpieczny preview:

```cmd
pnpm --dir tools\data-poc run universe:preview
pnpm --dir tools\data-poc run universe:preview -- --limit 10
```

Pokazuje wyłącznie enabled inputs. Nie wykonuje provider calls, nie publikuje snapshotu i nie zmienia automation state.

Oddzielny controlled live validation nie jest częścią automatycznej walidacji. Wymaga poprawnego universe, jawnego limitu, `ALLOW_LIVE_PROVIDER_CALLS=1`, obu flag `INTERNAL_BETA`, pojedynczego procesu oraz istniejącego globalnego collector locka:

```cmd
set CRYPTO_EDGE_DATA_ENV=INTERNAL_BETA
set CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA
set ALLOW_LIVE_PROVIDER_CALLS=1
pnpm --dir tools\data-poc run universe:live-validate -- --limit 3
```

Collector nie naprawia ani nie zapisuje universe. Używa wyłącznie enabled entries z bieżącej, poprawnej wersji. Pusty universe daje `ESTABLISHED_UNIVERSE_EMPTY`. Błędny lub niedostępny universe zamyka koszyk `Established` z `ESTABLISHED_UNIVERSE_INVALID` albo `ESTABLISHED_UNIVERSE_UNAVAILABLE`, bez blokowania `New / observation` i bez wywołań GoPlus dla Established.

## API i Product Radar

`GET /api/established-universe/status` jest read-only i zwraca tylko:

- `universe_version`;
- `generated_at`;
- `entries_total`;
- `entries_enabled`;
- `validation_status`;
- `last_change_at`.

Nie zwraca `owner_note`, `added_by`, ścieżek, historii ani audytu. Product Radar nie ma endpointów zapisu ani edytora universe. Gdy wpisy istnieją, karta `Established` pokazuje liczbę aktywnych adresów, wersję universe, kandydatów po filtrach, status security oraz główne ryzyka i braki. Pusty koszyk pozostaje poprawnym stanem.

## Historia i rollback

Przed rollbackiem owner wykonuje `history` i `diff`, identyfikuje ostatnią poprawną wersję, a następnie odtwarza jej stan wyłącznie jawnymi komendami `add`, `update`, `enable`, `disable` i `remove`, najpierw bez `--apply`. Po sprawdzeniu planu uruchamia te same komendy z `--apply`, waliduje wynik i porównuje checksum. Nie należy ręcznie nadpisywać JSON ani usuwać historii. Każdy krok rollbacku jest nową wersją i nowym wpisem audytu.

## Owner runbook

1. `scripts\win\established-universe-validate.cmd --json`
2. `scripts\win\established-universe-list.cmd --json`
3. Uruchom właściwy skrypt modyfikujący bez `--apply` i sprawdź tożsamość, wersję oraz liczniki.
4. Powtórz identyczną komendę z `--apply`.
5. `scripts\win\established-universe-history.cmd --json`
6. `pnpm --dir tools\data-poc run universe:preview`
7. `scripts\win\check-established-universe.cmd`
8. Sprawdź `GET /api/established-universe/status` w lokalnym Product Radar.

Operacje lokalne nie wdrażają na VPS, nie zmieniają Cloudflare, nie aktywują Task Scheduler, nie uruchamiają collectora i nie wykonują provider calls. VPS deployment nadal oczekuje, ale nie blokuje lokalnego zarządzania universe.
