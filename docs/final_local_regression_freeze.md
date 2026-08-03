# Final Local Regression and Freeze Candidate

## Wynik

Status: **READY_FOR_FINAL_INTEGRATION**

- Startowy `main`: `4b8cfa61883805c0ab3917470da0b44dbf92b110`.
- Przetestowany commit freeze: `f0da8df31bbc953eec8827e394ada56b721f020e`.
- PR #89: `MERGED`, merge commit zgodny ze startowym `main`.
- Freeze ID: `local_freeze_candidate_v1_20260803T125513Z_f0da8df`.
- Deadline pozostaje bez zmian: 15.08.2026.

## Pełna regresja

Kanoniczny, jednokrotny zestaw zakończył się wynikiem **681/681 PASS**:

- data-poc: 251 testów;
- UI i runtime: 430 testów obejmujących P1 Radar Operational Usability, Verification, Product Radar, Candidate/Tabbed Detail, FLOW.1, Follow-up, Established, owner promotion i manual override/audyt, AI.3 i AI.3 UI, Reports, Feedback, Refresh View, real-data boundary, central automation, E2E.1, STAB.1, STAB.2 i techniczny zakres RC.1;
- STAB.1 drill: `failure-drill-20260803T124031Z-3d7c4d98`, 20/20 scenariuszy PASS;
- STAB.2 drill: `recovery-drill-20260803T124034Z-20c39a7c`, 25/25 scenariuszy PASS;
- bez nowego godzinnego soak.

Kontrole jakości:

- UI typecheck: PASS;
- data-poc typecheck: PASS;
- scoped ESLint dla zmienionych plików: PASS;
- INTERNAL_BETA build boundary: PASS, 64 moduły, brak powierzchni demo/sample;
- scanner validation latest: PASS;
- `git diff --check`: PASS.

W trakcie bramki wykryto dwa nowe blokery P1 i naprawiono je bez rozszerzania zakresu: sanitizer API zachowuje teraz wymagane `scan_run.query`, dzięki czemu realny snapshot nie jest odrzucany przez klienta, a test AI.1 sprawdza akcję na właściwej po P1.1 zakładce `Dane i źródła`. Dodano kontrakt regresyjny dla pola `query`. P0: 0; otwarte P1: 0.

Odłożone P2/P3 pozostają bez zmian: 48 zastanych wyników pełnego, pozazakresowego lintowania UI oraz ostrzeżenie Vite o rozmiarze chunku. Nie były częścią wymaganego scoped ESLint i nie zostały poprawiane.

## Automatyczny read-only smoke

Smoke na istniejących opublikowanych danych INTERNAL_BETA zakończył się wynikiem **PASS** bez ankiety i bez ręcznego PASS/FAIL:

- health `200 / ok`;
- Radar pokazał rzeczywisty timestamp i dane: New 13, Follow-up 656, Established 0;
- New i Follow-up były dostępne;
- token otworzył Candidate Detail;
- wszystkie 7 zakładek Candidate Detail otwierało dokładnie jeden panel;
- Weryfikacja otworzyła drawer i wszystkie 6 zakładek działało;
- polskie etykiety decyzji były poprawne;
- owner controls były nieobecne dla testera i obecne wyłącznie w uprawnionym widoku ownera;
- tester pozostał read-only;
- page load i Refresh nie zmieniły automation state ani request counters i wykonały 0 provider/OpenAI calls.

Aktywny scanner run ID: `scan_20260803125231_24858225`. Aktywny context run ID: `approved_sources_20260803125231_17b6d3d9`. Aktywny timestamp: `2026-08-03T12:52:34.205Z`.

Istniejący harmonogram hosta opublikował nowy snapshot w tle niezależnie od bramki. Bramka nie uruchomiła centralnego cyklu i nie zmieniła Task Scheduler; końcowy backup został wykonany po tej publikacji, aby obejmował aktualny stan.

## Backup STAB.2 i granice

- Backup ID: `backup_20260803T125337Z_6d8002d8`.
- Stan: `BACKUP_READY`.
- Manifest: `tools/data-poc/.local/product-recovery/backups/backup_20260803T125337Z_6d8002d8/manifest.json`.
- Raport operacji: `tools/data-poc/.local/product-recovery/operations/backup_20260803T125337Z_51b27ed5/operation.md`.
- Manifest/payload: 13/13 plików, komplet i dokładny file-set PASS.
- Rozmiary i SHA-256: PASS dla 13/13 plików.
- Pointer validation: PASS; secret scan: PASS; changed store count: 0.
- SQLite `tester-feedback`: `ok`.
- SQLite `ai-analysis-queue`: `ok`.
- Restore/rollback danych kanonicznych: nie wykonano.
- OpenAI calls: 0.
- Live provider calls: 0.
- Central live cycles uruchomione przez bramkę: 0.
- Task Scheduler mutations: 0.
- VPS, Cloudflare i AIKINTEL mutations: 0.

Wersjonowany manifest freeze jest zapisany w `docs/local_freeze_candidate_v1.json`. Następny etap to końcowa integracja AIKINTEL i finalny VPS; ta bramka ich nie rozpoczyna.
