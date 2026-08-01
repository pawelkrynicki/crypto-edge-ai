# STAB.2 — Backup, Restore and Rollback

## Cel i granica

STAB.2 dostarcza lokalny, owner-only system odzyskiwania stanu produktu dla Windows. Nie dodaje publicznego endpointu, nie zmienia interfejsu testera i nie wykonuje deploymentu VPS, zmian Cloudflare ani operacji Task Scheduler. Backup i restore używają tych samych resolverów ścieżek co produkt; ścieżki systemowe, nazwy SQLite, checksumy i journal nie są wystawiane klientowi.

Twarde kontrakty formatu:

- bundle: `product_backup_bundle_v1`;
- journal operacji: `product_recovery_operation_v1`;
- generator: `stab2_product_recovery_v1`;
- izolowany run: `product_recovery_drill_run_v1`.

## Kanoniczne store

Inwentaryzacja jest budowana runtime’owo, bez zgadywania aktywnych snapshotów:

| Logical store ID | Zawartość | Resolver / źródło |
|---|---|---|
| `follow_up_store` | Follow-up wraz z audytem i checksumą | `getDefaultFollowUpStorePath()` |
| `follow_up_backup` | ostatnia kopia atomowego zapisu Follow-up | ścieżka store + `.bak` |
| `established_universe_store` | aktualny universe, historia i audit log | `getDefaultEstablishedUniverseStorePath()` |
| `established_address_config` | wersjonowana konfiguracja startowa Established | `resolveRepoFile()` |
| `feedback_sqlite` | trwały Feedback SQLite | `getDefaultFeedbackStorePath()` |
| `ai_queue_cache_sqlite` | AI.3 queue, cache, rate log i worker state | `getDefaultAIAnalysisQueueStorePath()` |
| `central_automation_state` | centralny stan oraz pointery aktywnych snapshotów | `resolveCanonicalDataPaths()` / automation resolver |
| `active_scanner_snapshot` | `full_output.json` wskazywany przez pointer | pointer z automation state + output root |
| `active_context_snapshot` | `approved_sources_output.json` wskazywany przez pointer | pointer z automation state + output root |
| `central_run_once_receipt` | ostatni receipt kontrolowanego run-once, gdy istnieje | `resolveCanonicalDataPaths()` |
| `reports_library` | poprawne pary JSON/Markdown Reports Library | `getDefaultReportsRootPath()` |
| `runtime_policy_config` | bezpieczna runtime policy źródeł | `resolveRepoFile()` |
| `established_discovery_query_plan` | wersjonowany plan Established | `resolveRepoFile()` |
| `data_source_registry` | allowlistowany rejestr źródeł | `resolveRepoFile()` |

Metadane commit SHA, runtime mode, generator version i czas powstania są częścią manifestu, a nie osobnym plikiem payloadu. Review Session nie jest backupowany: jest store sesyjnym i podlega wykluczeniu.

Jeżeli dynamiczny `established_universe_store` nie powstał jeszcze w poprawnej, początkowej instalacji, backup materializuje jego walidowany odpowiednik z wersjonowanej konfiguracji Established (`current` plus puste `history` i `audit_log`) wyłącznie wewnątrz bundle. Nie zapisuje przy tym pliku do kanonicznej ścieżki produktu.

## Backup

Owner uruchamia backup lokalnym CLI:

```cmd
cd tools\ui-mock
pnpm recovery:owner backup
```

Proces:

1. sprawdza fail-closed maintenance state i przejmuje wspólny `owner-operation.lock.json`;
2. waliduje Follow-up, Established, automation state, pointery, snapshoty, Reports oraz oba SQLite;
3. tworzy wyłącznie katalog `.staging-<backup_id>`;
4. dla SQLite wykonuje spójny `VACUUM INTO`, który obejmuje zatwierdzone dane WAL, przełącza kopię na journal `DELETE` i uruchamia `PRAGMA integrity_check`;
5. kopiuje wyłącznie allowlistowane regular files, odrzucając symlinki i reparse points;
6. skanuje tekst oraz tekstowe komórki SQLite pod kątem sekretów i danych osobowych;
7. liczy SHA-256 po trwałym zapisie payloadu;
8. ponownie odczytuje schematy, checksumy, integralność i dokładny zestaw plików;
9. publikuje `manifest.json` jako ostatni plik, po czym atomowo zmienia nazwę staging na finalny bundle.

Katalog bez finalnego manifestu nigdy nie jest READY. Każdy błąd usuwa staging i kończy operację statusem `VALIDATION_FAILED`.

Manifest zawiera `backup_id`, `created_at`, commit, runtime mode, stan `BACKUP_READY`, logical store ID, bezpieczną ścieżkę względną, typ, rozmiar, SHA-256, zależności pointerów, wynik walidacji, wykluczenia oraz potwierdzenie secret scan.

## Wykluczenia i fail-closed secret scan

Bundle nie zawiera `.env`, kluczy OpenAI, nagłówków Authorization, cookies, tokenów, haseł, store sesyjnych, pełnych promptów, `node_modules`, `.git`, build cache, temporary files, niepotrzebnych logów ani danych innych projektów. Payload jest allowlistą, a nie kopią drzewa projektu. Wykrycie sekretu, e-maila osobowego, niedozwolonego typu pliku lub nieznanego artefaktu Reports przerywa backup.

## Restore preview

Restore bez `--apply` jest zawsze read-only:

```cmd
cd tools\ui-mock
pnpm recovery:owner restore --bundle <bundle-path> --backup-id <backup_id>
```

Preview wymaga konkretnego `backup_id`. Weryfikuje wersję manifestu, wszystkie SHA-256 i rozmiary, brakujące i nadmiarowe pliki, path traversal, ścieżki absolutne, symlinki/reparse points, logical store IDs, wolne miejsce, schematy, checksumy, Reports, SQLite oraz zależności pointer → snapshot. Wynik to `PREVIEW`; produkt nie jest modyfikowany.

Osobna ponowna walidacja bundle:

```cmd
pnpm recovery:owner validate --bundle <bundle-path>
```

## Restore apply

Jawny zapis wymaga obu potwierdzeń:

```cmd
pnpm recovery:owner restore --bundle <bundle-path> --backup-id <backup_id> --apply
```

Apply przejmuje owner maintenance lock, tworzy pre-restore safety bundle, przygotowuje cały payload w staging i zapisuje journal przed publikacją. Store są publikowane grupami; pointer-bearing automation state jest publikowany na końcu. Poprzednie wersje są zachowane w prywatnym katalogu operacji, a safety bundle pozostaje źródłem kontrolnym poprzedniego stanu. Po publikacji wszystkie walidatory są uruchamiane ponownie read-only. Jeden nieprawidłowy store oznacza niepowodzenie całego restore.

Idempotentny restore zastępuje Reports jako jeden katalog i nie dokłada duplikatów. Nie ma statusu częściowego sukcesu.

## Rollback i restart

Awaria publikacji restore natychmiast zatrzymuje dalsze grupy. Journal jest odczytywany w odwrotnej kolejności, nowy stan trafia do prywatnych dowodów operacji, a poprzednie pliki wracają na swoje miejsca. Następnie pełne walidatory i hashe są porównywane z pre-restore state/safety bundle.

Prawidłowy wynik awarii restore to `RESTORE_FAILED_ROLLED_BACK`, nigdy `RESTORE_SUCCEEDED`. Przerwany proces może wznowić recovery z `operation.json`; nie powtarza agresywnie restore, tylko dokańcza rollback.

Jeżeli rollback nie przejdzie pełnej walidacji, wynik to `ROLLBACK_FAILED`. System zapisuje `FAIL_CLOSED_MAINTENANCE` z bezpiecznym kodem i blokuje następne backup/restore do ręcznej interwencji ownera. Audit i dowody nie są usuwane.

Obsługiwane statusy: `PREVIEW`, `BACKUP_READY`, `RESTORE_READY`, `RESTORE_SUCCEEDED`, `RESTORE_FAILED_ROLLED_BACK`, `ROLLBACK_SUCCEEDED`, `ROLLBACK_FAILED`, `VALIDATION_FAILED`.

## Audit

Każda operacja zapisuje `operation.json` i bezpieczny `operation.md`. Journal raportuje operation/backup ID, preview/apply, czas, status, before/after hashes, preflight, walidację store, SQLite integrity, pointer validation, liczbę zmian, rollback, kody błędów, lokalizację artefaktów, commit i liczniki wywołań. Nie zawiera sekretów, promptów, danych sesyjnych ani stack trace.

## Izolowany recovery drill

Domyślny owner review jest wyłącznie preview i otwiera dokładnie jedną kartę:

```cmd
scripts\win\start-backup-restore-rollback-review.cmd
```

Pełne 25 scenariuszy wymaga jawnego:

```cmd
scripts\win\start-backup-restore-rollback-review.cmd --run-isolated
```

Wszystkie targety znajdują się pod `%TEMP%\crypto-edge-backup-restore-rollback\<run_id>`. Runner porównuje kanoniczne hashe przed i po. Kontrakt wyniku to: canonical mutations 0, Task Scheduler mutations 0, OpenAI calls 0, live provider calls 0 i central live cycles 0.

## Przyszły VPS

Format jest przenośny na przyszły Windows VPS, ale STAB.2 niczego tam nie wdraża. Przed użyciem VPS trzeba osobno zatwierdzić katalog recovery, ACL ownera, pojemność dysku, retention, maintenance integration i operacyjny runbook. Ten etap nie zmienia terminu projektu: twardy deadline pozostaje 15 sierpnia 2026.
