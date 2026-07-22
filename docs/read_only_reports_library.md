# Read-Only Reports Library (12D.1)

## Cel i granica produktu

Etap 12D.1 udostępnia istniejące raporty analityczne wewnątrz kanonicznego, dwujęzycznego Product Radar. Biblioteka służy wyłącznie do odczytu. Tester może zobaczyć listę, otworzyć raport i wrócić do powiązanego kandydata lub ręcznej weryfikacji bez znajomości lokalnej ścieżki.

Biblioteka nie generuje, nie edytuje, nie usuwa i nie pobiera dowolnych plików. Nie dodaje zapisu feedbacku. `WATCHLIST` nadal oznacza wyłącznie ręczną analizę; raport nie jest rekomendacją inwestycyjną ani sygnałem kupna lub sprzedaży.

## Inwentaryzacja istniejącego raportowania

Przed 12D.1 istniały następujące artefakty:

- `tools/ui-mock/src/services/analystReport.ts` — czysty builder danych `AnalystReportData` i renderer Markdown;
- `tools/ui-mock/scripts/generateAnalystReport.ts` — lokalny generator czytający scanner latest, market context, review session i diagnostics;
- `scripts/win/generate-analyst-report.cmd` — launcher zwykłego eksportu;
- `scripts/win/check-analyst-report.cmd` — smoke generatora z osobnym storage i sprzątanymi plikami testowymi;
- `tools/ui-mock/.local/reports/analyst-report-*.json` oraz odpowiadający Markdown `analyst-report-*.md` — zwykły output;
- `tools/ui-mock/.local/reports-smoke` — wyłącznie output smoke;
- testy kontraktu i smoke generatora oraz opisy w local MVP runbooku, roadmapie i README skryptów;
- review storage pozostawał osobnym kontraktem: status i notatki review nie zmieniają scanner labels, scoringu, `final_label` ani znaczenia `WATCHLIST`.

W aktualnym workspace podczas inwentaryzacji nie było prawidłowego rzeczywistego raportu w `tools/ui-mock/.local/reports`. Owner review obejmuje więc prawidłowy pusty stan; nie wygenerowano sztucznego raportu.

## Format kanoniczny

Kanonicznym źródłem danych UI jest istniejący, walidowany JSON `report_version = 1`. Nie utworzono drugiego formatu raportu. Markdown pozostaje dodatkowym artefaktem generatora i nie jest parsowany przez bibliotekę, nie jest konwertowany do HTML i nie wpływa na status indeksu. UI nie używa `dangerouslySetInnerHTML`; tekst raportu jest renderowany jako zwykła zawartość React.

Publiczny model jest allowlistą utworzoną z sekcji istniejącego JSON: summary scannera, review summary, market context, source coverage, security labels i candidate snapshot. Pola techniczne zawierające ścieżki, storage filenames i diagnostykę plików nie trafiają do odpowiedzi.

## Reports root i bezpieczne indeksowanie

Kanoniczny reports root to:

```text
tools/ui-mock/.local/reports
```

Backend rozwiązuje root kanonicznie. Klient nigdy nie podaje ścieżki, nazwy pliku ani globu. Indeksowanie:

- jest nierekurencyjne;
- obejmuje maksymalnie 500 artefaktów i publikuje maksymalnie 100 najnowszych raportów;
- akceptuje wyłącznie `analyst-report-*.json`, do 1 MB na plik;
- rozpoznaje odpowiadający Markdown jako nieparsowany artefakt dodatkowy;
- odrzuca pozostałe rozszerzenia, błędny JSON, niewspieraną wersję, zbyt duże struktury, teksty i listy;
- odrzuca symlinki oraz każdy kanoniczny cel poza rootem;
- waliduje daty, wymagane sekcje, chain i — jeśli bezpieczny model kiedykolwiek zawiera adres — istniejącymi regułami Established Universe;
- pomija wadliwy raport bez blokowania prawidłowych raportów;
- wykonuje tylko `stat`, `realpath`, `readdir`, `lstat` i `readFile`; nie zapisuje indeksu ani metadanych.

Pusty, dostępny katalog jest śledzony przez bezpieczny `.gitkeep`, dzięki czemu 0 raportów może być rzeczywistym stanem `READY` po czystym checkout bez generowania danych.

## `report_id`

`report_id` ma postać `rpt_` plus 40 znaków hex SHA-256. Hash obejmuje wersjonowany prefiks i kanoniczną względną tożsamość pliku raportu. Identyfikator:

- nie zawiera nazwy pliku ani ścieżki;
- nie jest dekodowany do ścieżki;
- nie przyjmuje `..`, separatorów ani ścieżek absolutnych;
- działa wyłącznie wobec aktualnie zbudowanego indeksu;
- dla nieznanego lub nieaktualnego ID daje 404.

## Statusy

`GET /api/reports/status` zwraca `library_available`, `library_status`, liczniki, najnowszy czas raportu, wspierane wersje i `last_indexed_at`, bez ścieżek lokalnych.

- `READY` — storage i indeks działają, a wszystkie widoczne raporty są prawidłowe. 0 raportów jest neutralnym stanem pustym.
- `PARTIAL` — istnieje co najmniej jeden prawidłowy raport, ale część artefaktów została bezpiecznie pominięta.
- `NOT_READY` — storage jest niedostępny albo żaden znaleziony artefakt nie może spełnić kontraktu biblioteki.

## Read-only API

Dozwolone są wyłącznie:

```text
GET /api/reports/status
GET /api/reports
GET /api/reports/:report_id
```

`POST`, `PUT`, `PATCH` i `DELETE` dla tych ścieżek odpowiadają 405. Nie istnieje endpoint generowania raportu ani `GET /files/*`. Wszystkie odpowiedzi są same-origin, `no-store` i `nosniff`.

## UI listy i szczegółów

Deep link `#reports` znajduje się w grupie **Review / Feedback** Product Radar. Lista pokazuje status, liczbę prawidłowych i pominiętych raportów, najnowszy czas oraz allowlistowane metadane. Nie pokazuje nazwy pliku.

Szczegóły wykorzystują wyłącznie sekcje obecne w JSON v1: research summary, source freshness, source coverage, security observations, risk flags wyprowadzone z istniejących liczników, candidate snapshot, manual verification requirements i review notes. Brakujące sekcje są prezentowane jako `Not available` / `Niedostępne`, `Manual verification required` / `Wymaga ręcznej weryfikacji` albo `Cannot infer` / `Nie można wyciągnąć wniosku`.

Akcje powrotu, szczegółów kandydata i ręcznej weryfikacji są nawigacją wewnętrzną. Dwie ostatnie pojawiają się tylko, gdy `candidate_id` raportu pasuje do aktualnie załadowanego kandydata. Kopiowanie kontraktu jest warunkowe i wymaga poprawnego adresu w publicznym modelu raportu. Nie ma akcji inwestycyjnych.

## Control Center i tester boundary

Karta Reports w Control Center korzysta z tego samego `readReportsLibraryStatus`, co endpoint statusu. Pokazuje status, liczbę raportów, najnowszy raport i liczbę pominiętych artefaktów, jeśli jest większa od zera.

Gotowa biblioteka — także pusta — nie zmienia overall Trusted Tester Preview na `READY`. Trwały feedback, deployment, końcowy access smoke, rollback i zgoda ownera pozostają otwartymi bramkami; tester nadal ma `NO-GO`.

## Brak provider calls i zapisów

Status, lista, szczegóły i odświeżenie raportów czytają wyłącznie lokalny reports root. Frontend korzysta tylko z relatywnych same-origin `GET`. Test 100 równoległych odczytów potwierdza 0 provider calls oraz identyczną listę i zawartość plików przed i po teście. Odczyty nie zmieniają review, automation, Established Universe ani snapshotów.

## Owner review

Bezpieczny launcher uruchamia zwykły `INTERNAL_BETA` i otwiera `#reports`. Nie generuje raportu i nie wykonuje provider calls:

```cmd
scripts\win\start-product-radar-review.cmd --reports
```

Po 12D.1 dalszym etapem pozostaje trwały feedback. Nie jest częścią tej biblioteki.
