# Persistent Feedback Loop (12D.2)

## Cel i zakres

Etap 12D.2 usuwa zależność testera od GitHuba, terminala, e-maila i pomocy dewelopera. Tester może otworzyć `#feedback` z dowolnego głównego ekranu Product Radar, wybrać kategorię, opisać problem i otrzymać trwały receipt. Owner otrzymuje prywatną, wyłącznie odczytową skrzynkę wewnątrz tego samego widoku.

Core obejmuje trwały capture, odczyt ownera, filtrowanie, podsumowanie i bezpieczny eksport. Nie obejmuje screenshotów, plików, komentarzy, e-maila, Slacka, GitHub Issues, klasyfikacji AI, tworzenia zadań, mutacji triage ani wdrożenia publicznego.

## Granica tester / owner

Tester widzi formularz, automatyczny kontekst ekranu, opcjonalny zweryfikowany kontekst produktu i receipt własnej próby. Publiczny `GET /api/feedback/status` nie ujawnia liczników, treści, ścieżki storage, sesji ani diagnostyki.

Owner inbox jest udostępniany przez backend wyłącznie wtedy, gdy kanoniczny resolver owner operations ma tryb `REVIEW_SAFE` albo `ENABLED` i request jest loopback. Parametr URL, hash i localStorage nie tworzą tej capability. W zwykłym `INTERNAL_BETA`, dla requestu zdalnego oraz przy `DISABLED` endpointy ownera odpowiadają jak nieistniejące. Nie powstał drugi resolver trybów ani drugi system owner session.

`REVIEW_SAFE` pozwala czytać, filtrować, otwierać szczegóły i eksportować. W 12D.2 nie ma mutacji statusu ani owner priority.

## Kategorie

Kanoniczne wartości maszynowe:

- `BLOCKER` — nie można przejść dalej w ścieżce testowej;
- `IMPROVEMENT` — produkt działa, ale może być czytelniejszy lub wygodniejszy;
- `CLARIFICATION` — tester nie rozumie danych, komunikatu albo następnego kroku;
- `LATER` — nieblokujący pomysł spoza bieżącego zakresu.

Tester nie ustawia priority, statusu triage ani decyzji produktowej. Każdy nowy rekord otrzymuje status `NEW`. Model storage dopuszcza przyszłe `TRIAGED`, `PLANNED`, `RESOLVED` i `CLOSED`, ale ten sprint nie udostępnia mutacji.

## Kontrakt danych

Tabela `tester_feedback` przechowuje:

- `feedback_id`, `schema_version`, `created_at`, `updated_at`;
- `category`, `title`, `details`, `screen_context`, `locale`;
- kanoniczne backendowe `build_sha` (gdy poprawne) i `runtime_mode`;
- losowy `pseudonymous_session_id`, unikalny `submission_key` i `status`;
- opcjonalne, zweryfikowane `candidate_identity`, `follow_up_entry_id`, `report_id`, `scanner_run_id`, `route_context` i `viewport_class`.

Backend, a nie tester, ustawia czas, runtime, build SHA, status i kontekst podmiotu. `POST` przyjmuje wyłącznie `submission_key`, `category`, `title`, `details`, `screen_context`, `locale` oraz opcjonalny `subject_ref`. Dodatkowe pola są odrzucane.

`subject_ref` ma jeden z trzech bezpiecznych typów: `candidate`, `follow_up` albo `report`, z istniejącym identyfikatorem produktu. Backend sprawdza go odpowiednio w bieżącym snapshotcie, Follow-up lub kanonicznej bibliotece raportów. Nieznana referencja nie otwiera dostępu do żadnych danych i jest zapisywana bez subject context. Dowolne URL-e, ścieżki i nazwy plików nie są akceptowane.

## Storage i trwałość

Audyt wykazał, że istniejący Review Storage obsługuje file-backed JSON oraz opcjonalny SQLite. Jego rekordy są analitycznymi manual reviews kandydatów i mają inne znaczenie niż feedback testera. Dlatego 12D.2 wykorzystuje ten sam sprawdzony silnik `node:sqlite` i wzorce transakcyjne, ale osobny plik `tools/ui-mock/.local/tester-feedback.sqlite` i osobną tabelę. Feedback nie dotyka manual Review Storage.

Storage używa:

- `schema_version = 1` i idempotentnej migracji;
- `BEGIN IMMEDIATE`, commit/rollback i `synchronous=FULL`;
- `busy_timeout=5000` oraz WAL;
- indeksów `created_at`, `category`, `status` i `screen_context`;
- unikalnego indeksu `submission_key`;
- deterministycznego sortowania: nowy bloker, pozostałe nowe, potem pozostałe od najnowszych;
- limitu 10 000 rekordów bez automatycznego usuwania.

SQLite zapewnia recovery przerwanej transakcji. Jeden wadliwy request jest odrzucany przed zapisem i nie usuwa poprawnych rekordów. Błąd pliku, schematu albo gwarancji zapisu daje `NOT_READY` i fail-closed dla POST, ale nie blokuje Radaru, snapshotów ani innych subsystemów. Pusty, poprawny store jest `READY`.

## Pseudonimowa sesja i idempotencja

Backend nadaje losowe UUID w podpisanym cookie `ce_feedback_session` z `HttpOnly`, `SameSite=Strict`, `Path=/` i ograniczonym czasem życia. Cookie nie zawiera danych osobowych. W produkcyjnym runtime można dostarczyć stabilny sekret przez `CRYPTO_EDGE_FEEDBACK_SESSION_SECRET`; brak sekretu tworzy losowy sekret procesu.

Session ID służy tylko do limitu, grupowania i bezpiecznego retry. UI go nie pokazuje. Owner detail otrzymuje jednokierunkowy marker grupy, nie surowy identyfikator. IP i pełny User-Agent nie są używane ani przechowywane.

Frontend generuje UUID `submission_key` raz dla jednej próby. Retry zachowuje ten sam klucz. Unikalność wymusza SQLite wewnątrz transakcji. Powtórzenie w tej samej sesji zwraca ten sam `feedback_id` z `ALREADY_RECORDED`; podwójny klik jest dodatkowo blokowany w komponencie. Równoległe próby z tym samym kluczem mogą utworzyć najwyżej jeden rekord.

## Bezpieczeństwo POST i rate limits

`POST /api/feedback` wymaga:

- obecnego, poprawnego `Origin` zgodnego z `Host`;
- `application/json` (opcjonalnie `charset=utf-8`);
- `X-Crypto-Edge-Feedback: 1`;
- body do 16 KB i ścisłego allowlist schema;
- UUID submission key i kanonicznych enumów;
- tytułu 5–120 oraz opisu 20–3000 znaków Unicode;
- normalizacji NFC i odrzucenia znaków sterujących (w opisie dozwolone są nowe linie i tabulacja).

HTML i Markdown pozostają zwykłym tekstem. React nie używa `dangerouslySetInnerHTML`, parsera Markdown ani treści feedbacku do wyboru CSS, routingu, endpointu czy pliku.

Domyślne limity to 5 nowych wpisów na 10 minut dla sesji i awaryjne 100 nowych wpisów globalnie na 10 minut. Clock, okno i limity są wstrzykiwalne w testach. Duplikat nie zwiększa licznika, a request odrzucony przed zapisem nie tworzy rekordu.

## Endpointy

Publiczne:

- `GET /api/feedback/status` — wyłącznie availability, `READY/PARTIAL/NOT_READY`, możliwość wysłania, limity pól i kategorie;
- `POST /api/feedback` — trwały capture i receipt.

Owner-only, read-only:

- `GET /api/owner/feedback/status`;
- `GET /api/owner/feedback` z filtrami `category`, `status`, `screen_context`, `limit`, `cursor`;
- `GET /api/owner/feedback/:feedback_id`;
- `GET /api/owner/feedback/export?format=json|csv`.

Lista ma maksymalnie 100 rekordów na stronę. Eksport ma allowlist pól i limit 1000 rekordów, powstaje w odpowiedzi bez pliku serwerowego, nie zawiera session ID, submission key, ścieżek ani sekretów i nie zmienia storage.

## UI i Control Center

`#feedback` znajduje się w grupie Review / Feedback z opisem „Zgłoś problem lub pomysł” / “Report an issue or idea”. Kompaktowa akcja „Przekaż feedback” / “Send feedback” jest obecna w headerze głównych ekranów i przekazuje bieżący screen context; nie wykonuje zapisu.

Formularz pokazuje kategorie, limity znaków, nieedytowalny kontekst, prywatność, sending/success/error/rate limit, receipt oraz możliwość rozpoczęcia nowego zgłoszenia. Owner inbox pokazuje status, liczniki, filtry, listę, detail i eksport tylko po odpowiedzi owner API.

Control Center korzysta z kanonicznego statusu Feedback Store:

- `READY` — storage i trwały POST działają; zero wpisów jest neutralne;
- `PARTIAL` — storage można czytać, ale submission jest wyłączone;
- `NOT_READY` — storage lub schema nie gwarantuje trwałego zapisu.

Przy `READY` znika wyłącznie blocker `PERSISTENT_FEEDBACK_CAPTURE`. Overall Trusted Tester Preview pozostaje `NOT_READY`, ponieważ deployment, access smoke, rollback oraz owner approval nie zostały zakończone. `PUBLIC_BETA` pozostaje wyłączone.

## Local owner review: ACCEPT_LOCAL_CODE — 23.07.2026

Owner review zaakceptował lokalny kod na commicie `b20e665948a89e6adaadf214fdcbe02f9394512f` i potwierdził:

- formularz Feedback jest dostępny w PL i EN oraz automatycznie zapisuje bezpieczny kontekst ekranu;
- zgłoszenie zostało trwale zapisane w izolowanym owner review store, a receipt `FB-413F37B9` został poprawnie zwrócony;
- rekord przetrwał zamknięcie i ponowne uruchomienie runtime;
- publiczny POST, owner status, inbox, detail, export i Control Center korzystają z jednego kanonicznego store;
- inbox pokazuje 1 wpis łącznie, 1 nowy, 1 bloker oraz czas ostatniego zgłoszenia;
- lista i szczegóły pokazują ten sam rekord wraz z tytułem, opisem, kategorią i kontekstem ekranu;
- UI pokazuje „Tylko dla ownera” i „Nowe”, pseudonimową grupę sesji jako `SES-47E31D` oraz wersję produktu jako skrócone `c697a1dd`;
- surowy session ID, lokalne ścieżki i dane osobowe nie są widoczne;
- karta Feedback w Control Center ma status `READY`, a `PERSISTENT_FEEDBACK_CAPTURE` nie występuje już na liście blockerów;
- pozostałymi blockerami są Trusted Tester Preview Mode, deployment na VPS, smoke przez domenę i Cloudflare Access, rollback test oraz owner approval;
- overall Trusted Tester Preview pozostaje `NOT_READY`;
- nie wykonano live provider calls ani zmian snapshotów, automation, Follow-up, Established Universe lub analyst reviews.

Pierwszy owner review wykrył niewidoczny po POST i restarcie rekord w owner inboxie, różne lub nieprzekazywane instancje Feedback Store, brak ponownego pobrania inboxu, kategorię opartą na domyślnym `BLOCKER` oraz techniczne elementy warstwy prezentacji.

Commit `d32f7cd92de3560b33d60e8239cded15d7e09e3f` naprawił wspólny store, odświeżanie inboxu i kategorię formularza. Commit `b20e665948a89e6adaadf214fdcbe02f9394512f` doszlifował prezentację owner inboxu bez zmiany API i storage.

Dedykowany testowy review store zostanie wyczyszczony skryptem `scripts\win\clear-feedback-loop-review.cmd` dopiero po formalnym zamknięciu PR i przed merge. Do tego czasu rekord akceptacyjny pozostaje zachowany.

## Izolowany owner review i cleanup

Jedna komenda uruchamia build `INTERNAL_BETA`, same-origin runtime na loopback, `REVIEW_SAFE`, `#feedback` oraz dedykowany store `feedback-loop-review.sqlite`:

```bat
scripts\win\start-feedback-loop-review.cmd
```

Launcher nie uruchamia collectora, providerów ani automatyzacji i nie dotyka manual reviews, snapshotów, Follow-up ani Established Universe. Owner może wykonać jedno testowe zgłoszenie wyłącznie do store review.

Po zamknięciu runtime jedna idempotentna komenda usuwa tylko dedykowany plik review oraz jego WAL/SHM:

```bat
scripts\win\clear-feedback-loop-review.cmd
```

## Walidacja i dalszy etap

`scripts\win\check-persistent-feedback-loop.cmd` używa wyłącznie temporary feedback storage, wyłącza provider calls i automatyzację, uruchamia testy storage/API/UI/concurrency/boundary, Control Center, Product Radar oraz build `INTERNAL_BETA`.

12D.2 nie wdraża na VPS, nie zmienia Cloudflare ani Task Scheduler i nie wykonuje live provider calls. Następny etap to VPS oraz private tester preview z access smoke; potem Final Frontend Polish / Premium UI Pass 27–30.07 i sesja testera z poprawkami P0.
