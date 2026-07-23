# Owner Established Promotion Flow

## Problem i zakres

Dotychczas owner mógł dodać wpis do Established Universe wyłącznie przez lokalny workflow CMD, ręcznie przepisując `chain` i `contract_address`. Nowy przepływ przenosi decyzję do Candidate Detail, ale nie tworzy edytora universe ani pola na dowolny adres. Tożsamość zawsze pochodzi z aktualnego, kanonicznego scanner snapshotu albo indeksu Follow-up.

Sprint obejmuje wyłącznie jedno kontrolowane `add`. Nie obejmuje `remove`, `disable`, `enable`, `update`, rollbacku, edycji notatki ani manualnego override dla `NEW` i `MATURING`. Nie ma automatycznego awansu.

## Tryby owner operations

Przepływ używa istniejących wartości `DISABLED`, `REVIEW_SAFE` i `ENABLED`.

| Tryb | Candidate Detail | Status i preview | POST |
| --- | --- | --- | --- |
| `DISABLED` | panel niewidoczny | fail-closed | fail-closed |
| `REVIEW_SAFE` | panel widoczny lokalnemu ownerowi | read-only | zablokowany |
| `ENABLED` | panel widoczny lokalnemu ownerowi | read-only | dostępny po wszystkich bramkach |

Nie istnieje launcher `ENABLED`. Zwykły `INTERNAL_BETA`, external tester i połączenie spoza loopback nie otrzymują panelu ani szczegółów operacji. Parametr URL i stan frontendu nie aktywują capability.

## Kanoniczna kwalifikacja

Jedyną tożsamością jest znormalizowane `chain + contract_address`. Backend ponownie używa `normalizeEstablishedChain`, `normalizeEstablishedAddress` i `universeIdentityKey`, więc walidacja EVM i Solana nie jest duplikowana.

Plan `ADD` jest możliwy tylko wtedy, gdy:

- rekord istnieje w aktualnym scanner snapshot albo Follow-up index;
- lifecycle wynosi `CANDIDATE_FOR_ESTABLISHED`;
- `latest_filter_result` lub równoważny aktualny scanner result ma `passed_basic_filter`;
- tożsamość nie ma aktywnego ani disabled wpisu w Established;
- current universe jest poprawny, a jego wersja i checksum są znane;
- universe lock jest wolny.

`NEW`, `MATURING` i `ARCHIVED` zwracają `BLOCKED` bez override. Aktywne `ESTABLISHED` zwraca `NO_ACTION`; disabled entry zwraca `BLOCKED` i nigdy nie jest automatycznie włączany.

Aktualny kontrakt Follow-up wylicza `CANDIDATE_FOR_ESTABLISHED` z niezmienionych basic filters, a security pozostaje osobną warstwą informacyjną. Dlatego brakujące lub częściowe security jest wyraźnym `Manual Verification Required`, ale ten sprint nie dodaje nowej blokującej reguły security. Operacja nie potwierdza bezpieczeństwa i nie jest rekomendacją inwestycyjną.

## Read-only status

`GET /api/owner-operations/established-promotion/status` przyjmuje dokładnie dwa query params: `chain` i `contract_address`. Duplikaty oraz dodatkowe parametry są odrzucane. Nieznany adres nie może służyć do arbitralnego odpytywania danych.

Odpowiedź ownera zawiera capability, kanoniczną tożsamość i presentation hints, source layer, lifecycle, wynik filtrów/security, membership oraz publiczną wersję/checksum i status walidacji universe. Nie zawiera ścieżek, PID, lock path, `owner_note`, `added_by`, historii, audytu, sekretu ani stack trace. Endpoint wykonuje zero zapisów, zero provider calls i nie rezerwuje locka.

## Dry-run preview

`GET /api/owner-operations/established-promotion-preview` ponownie czyta aktualny rekord produktu i universe, sprawdza lifecycle, basic filters, membership, wersję, checksum i dostępność locka, po czym dla planu `ADD` wywołuje bezpośrednio `mutateEstablishedUniverse(..., { apply: false })`.

Preview zwraca aktualne i planowane liczniki, planowaną wersję wyłącznie dla `ADD`, walidację adresu, duplicate status, security warning, termin ważności i `action_plan` równy `ADD`, `NO_ACTION` albo `BLOCKED`. Zablokowany i no-op plan nie pokazuje fikcyjnej planowanej wersji.

Podpisany preflight korzysta ze współdzielonego modułu `ownerPreflight.ts`, wydzielonego z Owner No-CMD Refresh. Ten sam mechanizm zapewnia HMAC, constant-time verification, krótki TTL, losowy nonce i one-time consumption. Podpisany kontekst zawiera oczekiwaną wersję i checksum universe, kanoniczną tożsamość, fingerprint źródłowego rekordu oraz fingerprint lifecycle, filtrów, membership i planu.

Preview nie zapisuje niczego, nie uruchamia providera i nie trzyma locka przez okres ważności.

## Jedyny POST i zabezpieczenia

`POST /api/owner-operations/established-promotion` przyjmuje dokładnie:

```json
{
  "preview_id": "<signed one-time preflight>",
  "confirmation": true
}
```

Klient nie przesyła adresu, nazwy, symbolu, owner note, aktora, wersji, ścieżki, opcji managera ani override. Backend wymaga `ENABLED`, widocznej capability, loopback, dokładnego same-origin `Origin`, JSON content type, custom header `x-crypto-edge-owner-session`, świeżego podpisanego preflightu i jawnego potwierdzenia.

Przed zapisem backend ponownie czyta rekord i universe. Zmiana źródłowej tożsamości, lifecycle, filtrów, membership, wersji lub checksum zwraca HTTP 409 `STALE_PREVIEW` bez zapisu. Zajęty lock zwraca HTTP 409 `PROMOTION_ALREADY_IN_PROGRESS` bez kolejki. Jeden preflight jest atomowo zużywany w procesie; sto równoległych prób może utworzyć najwyżej jeden zapis.

## Reużycie managera, atomowość, historia i audit

Backend importuje i wywołuje istniejący `mutateEstablishedUniverse` bez procesu potomnego i bez wrappera CLI. Manager otrzymał opcjonalne optimistic guards `expectedCurrentVersion` i `expectedCurrentChecksum`, sprawdzane wewnątrz istniejącego universe locka zarówno dla dry-run, jak i zapisu. CLI działa bez zmian, ponieważ pola są opcjonalne.

Skuteczny POST wykonuje jedną mutację `add`, ustawia `display_name` i `symbol_hint` tylko z kanonicznego rekordu produktu, ustawia aktora po stronie serwera i nie dodaje `owner_note`. Istniejący manager tworzy dokładnie jedną nową wersję, nowy checksum, snapshot poprzedniej wersji w bounded history oraz audit entry, a następnie używa istniejącego atomowego zapisu.

Jeśli inna operacja dodała ten sam aktywny wpis, wynik to `NO_ACTION_ALREADY_ESTABLISHED` bez drugiej wersji. Disabled entry pozostaje disabled i jest blokadą. Rollback nadal odbywa się przez istniejące `history`/`diff` i jawne operacje ownera opisane w `docs/established_universe_management.md`.

## Follow-up jako jedno źródło prawdy

POST nie zapisuje lifecycle `ESTABLISHED` w Follow-up. Publiczny resolver ponownie czyta active membership z current Established Universe i na tej podstawie pokazuje `ESTABLISHED`, usuwa rekord z licznika Candidate for Established i nie oferuje ponownie decyzji. Follow-up store oraz checkpointy nie są zmieniane.

## UI, tester boundary i Control Center

Candidate Detail ładuje owner status same-origin i renderuje sekcję **Owner decision / Decyzja ownera** wyłącznie, gdy backend zwróci `owner_controls_visible = true`. Przed preview pokazuje lifecycle, tożsamość, filtry, security, membership i mode oraz komunikat o braku automatycznego awansu. Po preview pokazuje wersje, duplicate/address checks, zmianę liczników, ostrzeżenia i expiry. Finalny przycisk wymaga checkboxa oraz dialogu z dokładnym `chain + contract_address` i informacją o nowej wersji.

Control Center nie ma nowej dużej karty. W istniejącej karcie Established Universe owner widzi tylko dodatkową capability `Disabled`, `Review safe` albo `Enabled`; tester jej nie widzi. Capability nie wpływa na overall readiness, który pozostaje `NOT_READY`. External tester pozostaje `NO-GO`, a `PUBLIC_BETA` wyłączone.

## Review i walidacja offline

Owner review działa wyłącznie w `REVIEW_SAFE`:

```cmd
scripts\win\start-established-promotion-review.cmd
```

Launcher otwiera istniejący Candidate Detail na rzeczywistych danych. Nie tworzy sztucznego kandydata, nie zapisuje universe ani Follow-up, nie uruchamia collectora i nie wykonuje provider calls.

Dedykowany check używa wyłącznie injected product data oraz temporary universe/follow-up stores:

```cmd
scripts\win\check-owner-established-promotion.cmd
```

Testy obejmują tester boundary, lifecycle, strict query/body, Origin/session/content type, stale preview, lock, duplikaty, 100 równoległych POST, dokładnie jeden zapis managera, historię/audit, dynamiczny resolver Follow-up, 100 read-only GET i semantykę PL/EN. `ENABLED` nie jest aktywowany przez żaden launcher ani środowisko review.

Następny etap po akceptacji: **Persistent Feedback Loop**. Termin Final Frontend Polish / Premium UI Pass pozostaje **27–30.07.2026**.
