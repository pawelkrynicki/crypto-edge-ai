# Maturing / Follow-up Basket

## Problem i cel

`New / observation` korzysta z najnowszych profili DexScreener. Profil może przestać być „najnowszy”, mimo że wykryty token nadal wymaga obserwacji. Follow-up Basket zachowuje zwalidowaną tożsamość takiego rekordu i sprawdza go ponownie w ograniczonych punktach czasu. Token nie znika tylko dlatego, że wypadł ze strumienia latest profiles.

Product Radar ma trzy rozłączne warstwy:

1. `New / observation` — bieżące wykrywanie bardzo nowych profili;
2. `Maturing / follow-up` — dalsza obserwacja zapisanej tożsamości;
3. `Established / main Radar` — owner-maintained, wersjonowany universe.

Follow-up nie zmienia scoringu, `final_label`, `WATCHLIST` ani progów `dexscreener_basic_filters_v1`.

## Kanoniczna tożsamość i lifecycle

Jedyną tożsamością jest znormalizowane `chain + contract_address`. Follow-up bezpośrednio współdzieli `normalizeEstablishedChain`, `normalizeEstablishedAddress` i `universeIdentityKey` z Established Universe. Symbol, nazwa, pair address i URL nie uczestniczą w identyfikacji. Nieobsługiwana sieć lub błędny adres są pomijane, a duplikaty są scalane deterministycznie według płynności i stabilnego identyfikatora.

Statusy maszynowe:

- `NEW` — od `first_seen_at` nie minęły 24 godziny;
- `MATURING` — trwa dalsza obserwacja, a rekord nie jest kandydatem, Established ani archiwalny;
- `CANDIDATE_FOR_ESTABLISHED` — najnowszy poprawny recheck przeszedł niezmienione basic filters; jest to wyłącznie kandydat do ręcznej decyzji ownera;
- `ESTABLISHED` — dokładna tożsamość występuje jako `enabled` w aktualnym Established Universe;
- `ARCHIVED` — plan Follow-up zakończył się po obsłużeniu checkpointu 30 dni bez przejścia do kandydata.

Brak lub niedostępność security oznacza nadal `Manual Verification Required`. `CANDIDATE_FOR_ESTABLISHED` nie oznacza bezpieczeństwa, akceptacji, rekomendacji ani `WATCHLIST`. System nie wykonuje automatycznego dodania do Established.

## Checkpoint resolver

Kanoniczne checkpointy są liczone od niezmiennego `first_seen_at`: 1, 3, 7, 14 i 30 dni. Rekord przechowuje `last_seen_at`, `last_checked_at`, `next_check_at`, `completed_checkpoints`, lifecycle oraz opcjonalne `candidate_since` i `archived_at`.

Jeśli przestój obejmie kilka checkpointów, selector wybiera rekord tylko raz. Po jednym udanym rechecku resolver oznacza wszystkie minięte checkpointy i ustawia najbliższy przyszły. Błąd providera nie zmienia `last_checked_at`, nie kończy checkpointu i zachowuje ostatnie poprawne dane. Brak due records oznacza zero dodatkowych provider calls i zero sztucznego przesuwania czasu.

## Store

Kanoniczna ścieżka lokalna, wykluczona z Git:

```text
tools/data-poc/.local/follow-up/store.json
```

Można ją nadpisać przez `CRYPTO_EDGE_FOLLOW_UP_STORE_PATH`. Kontrakt `follow_up_store_v1` zawiera `schema_version`, `generated_at`, uporządkowane `entries`, SHA-256 `checksum` i ograniczony `audit_log`. Limit wynosi 500 rekordów i 200 zdarzeń audytu. Store nie przechowuje raw provider responses.

Zapis działa przez osobny lock i atomowe zastąpienie pliku. Poprzednia poprawna wersja jest zachowywana jako bounded backup. Odczyt może bezpiecznie odzyskać backup; brak obu poprawnych wersji daje `invalid`/`unavailable`, ale nie unieważnia poprawnego scanner snapshotu. Pusty, nieutworzony jeszcze store jest prawidłowym stanem `READY`.

## Ingest

Po walidacji i atomowej publikacji scanner snapshotu collector:

- bierze wyłącznie rekordy `New / observation` z poprawnym adresem;
- nie wykonuje dodatkowego provider call dla ingestu;
- tworzy rekord albo aktualizuje `last_seen_at` i znormalizowane dane pomocnicze;
- nigdy nie cofa `first_seen_at`;
- ignoruje snapshot starszy niż zapisany `last_seen_at`;
- synchronizuje tylko odczytane członkostwo Established, nie modyfikuje universe.

Błąd Follow-up jest zwracany jako `DEGRADED` w wyniku collectora. Scanner i jego last-known-good pozostają opublikowane.

## Due recheck i request budget

Recheck jest częścią istniejącego `scanner_and_context`, pod centralnym coordinatorem i globalnym inter-process lockiem. Nie istnieje drugi collector ani frontendowa akcja recheck.

Na cykl wybieranych jest maksymalnie 5 due records. Każdy używa oficjalnego DexScreener `token-pairs` endpointu, wspólnego bounded transportu, istniejących retry/backoff, wyboru najwyższej poprawnej płynności oraz tej samej normalizacji pary i basic filters co Established.

Budżet DexScreener dodaje wyłącznie liczbę faktycznie wybranych due records (maks. 5) i rezerwę maks. 2 retry. GoPlus może zostać użyty tylko dla Follow-up po przejściu basic filters i tylko w niewykorzystanej części wspólnego `securityCandidateLimit` (domyślnie 10, hard max 20). Nie powstaje osobny budżet security. Honeypot.is ma zawsze 0 automatycznych wywołań.

Liczba użytkowników, locale switch i `Refresh view` nie uczestniczą w schedulerze ani selectorze due. Sto równoległych odczytów API oraz sto odświeżeń UI wykonują zero provider calls i nie zmieniają store. Globalny lock gwarantuje jeden wspólny run collectora.

## Read-only API

- `GET /api/follow-up/status` — dostępność, walidacja, liczniki lifecycle, due i next due;
- `GET /api/follow-up` — maks. 100 aktywnych rekordów: candidate, due maturing, pozostałe maturing, new, established;
- `GET /api/follow-up/:entry_id` — jeden publiczny rekord lub 404.

Model publiczny zawiera wyłącznie bezpieczne dane znormalizowane, metryki rynkowe, wynik filtrów/security, braki, członkostwo Established i następny krok. Nie zawiera ścieżek, lock metadata, audytu, raw payloadów, sekretów ani pełnych wyjątków. `POST`, `PUT`, `PATCH` i `DELETE` są odrzucane.

## UI i tester boundary

Radar pokazuje liczniki Maturing i Candidate for Established, trzeci tab, empty/unavailable state, lifecycle, first seen, last checked, next checkpoint, ukończone checkpointy, filtry, security i ręczny następny krok. Wiek poniżej 24 godzin jest pokazywany w godzinach. Candidate ma jawny komunikat, że nie został automatycznie dodany do Established.

Candidate Detail pokazuje Follow-up tylko przy bezpiecznym dopasowaniu `chain + contract_address`. Nie ma przycisku promocji. Control Center pokazuje osobną kartę store/active/due/candidate/next due. Awaria Follow-up nie obniża działającego Runtime i API. Overall Trusted Tester Preview pozostaje `NOT_READY`.

Tester może czytać statusy i checkpointy. Nie może edytować store, zmieniać checkpointów, wymuszać rechecku, konfigurować transportu, uruchamiać providerów ani dodawać do Established.

## Bootstrap dry-run

Preview aktualnego poprawnego scanner snapshotu:

```cmd
scripts\win\follow-up-bootstrap-preview.cmd
```

Komenda wykonuje 0 provider calls, domyślnie nie zapisuje store i pokazuje plan add/update. CLI ma osobną flagę `--apply`, ale nie należy jej używać podczas review ani bez osobnej decyzji ownera.

## Recovery, rollback i walidacja

Przy uszkodzonym primary reader próbuje poprawnego backupu. Jeśli recovery nie jest możliwe, zachowuje pliki do analizy i raportuje Follow-up niezależnie. Nie należy ręcznie edytować JSON. Rollback aplikacji polega na wycofaniu kodu; store i backup pozostają lokalne. Established Universe pozostaje osobnym źródłem prawdy i nie jest zmieniany.

Pełny offline check:

```cmd
scripts\win\check-follow-up-basket.cmd
```

Owner review bez bootstrap `--apply`:

```cmd
scripts\win\start-follow-up-basket-review.cmd
```

Następny osobny sprint to **Owner Established Promotion Flow**: jawna, dry-run-first i potwierdzana decyzja ownera korzystająca z istniejącego managera Established Universe. Persistent Feedback Loop pozostaje późniejszym etapem.
