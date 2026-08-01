# RC.1 — Local Release Candidate and Controlled Operational Soak

RC.1 sprawdza kompletny lokalny produkt na rzeczywistym runtime i centralnej automatyzacji. Nie wdraża VPS, nie zmienia Cloudflare, nie uruchamia OpenAI i nie dotyka produkcyjnego zadania `Crypto Edge AI Central Automation`.

## Bezpieczny preview

```cmd
scripts\win\start-local-rc-soak-review.cmd
```

Preview nie uruchamia providera, collectora ani runtime, nie zapisuje store i nie zmienia Task Scheduler. Otwiera dokładnie jedną kartę z tym runbookiem.

## Jawny soak lokalny

```cmd
scripts\win\start-local-rc-soak-review.cmd --run-live-local
```

Tryb live wymusza `INTERNAL_BETA`, wyłącza worker i provider OpenAI oraz czyści `OPENAI_API_KEY`. Tworzy osobne tymczasowe zadanie `Crypto Edge AI RC1 Soak` z pobudką co pięć minut i `MultipleInstances=IgnoreNew`. Pierwsza pobudka wykonuje jawny pełny cykl `scanner_and_context`; kolejne korzystają wyłącznie z istniejącej decyzji schedulera `due/not due`. Honeypot.is pozostaje manual-only, a GoPlus jest wywoływany tylko candidate-scoped przez istniejący collector.

Runner wykonuje co najmniej 60 minut rzeczywistego czasu i 12 pobudek, monitoruje lokalny UI/API, pointery, snapshoty, Follow-up, lock i AI queue przy wyłączonym OpenAI. Przed i po soak tworzy oraz ponownie waliduje pełny backup STAB.2. Zadanie tymczasowe jest usuwane przed końcowym audytem, również przy błędzie.

Po poprawnym pre-backupie jawny tryb `--run-live-local` używa istniejącej procedury owner-confirmed resume, jeśli application circuit breaker jest zawieszony. Nie zmienia przy tym pointerów ani snapshotów; początkowy pełny cykl nadal musi odbudować prawidłowy stan przez zwykły coordinator. Preview nigdy nie wykonuje resume.

Artefakty powstają pod `tools/ui-mock/.local/local-rc-soak/<run_id>/`. Raport Markdown jest stroną owner-only; nie jest routowany ani linkowany w zwykłym kliencie. `manifest.json` w formacie `local_rc_soak_run_v1` jest publikowany jako ostatni.

## Warunek PASS

PASS wymaga między innymi pełnego czasu i liczby pobudek, braku nierozwiązanego `FAILED`, braku overlap, zerowej liczby wywołań OpenAI i Honeypot.is, poprawnych budżetów/cadence, zwalidowanych snapshotów i pointerów, zachowanego last-known-good, braku duplikatów i nieoczekiwanych mutacji, dwóch poprawnych backupów oraz końcowego braku zadania i locka.
