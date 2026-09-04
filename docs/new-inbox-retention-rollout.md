# New Inbox Retention V1 — rollout runbook

Ten dokument opisuje przyszły, kontrolowany rollout polityki `NEW_INBOX_INACTIVITY_RETENTION_DAYS = 7`. W tym etapie nie wykonuje migracji VPS, nie zmienia launchera Central Automation i nie repointuje żadnych środowisk.

## Obecny stan produkcji

Aktualny Central Automation nadal uruchamia runtime z:

```text
C:\CryptoEdge\releases\CAMP2026-VPS-RC2\tools\data-poc
```

Przed rolloutem trzeba przyjąć, że lifecycle state może znajdować się pod runtime rootem RC2, zwykle:

```text
C:\CryptoEdge\releases\CAMP2026-VPS-RC2\tools\data-poc\.local\lifecycle\new-inbox.json
C:\CryptoEdge\releases\CAMP2026-VPS-RC2\tools\data-poc\.local\lifecycle\audit.json
C:\CryptoEdge\releases\CAMP2026-VPS-RC2\tools\data-poc\.local\lifecycle\cycle-receipts.json
C:\CryptoEdge\releases\CAMP2026-VPS-RC2\tools\data-poc\.local\lifecycle\operation-journal.json
```

Nie wolno wystartować nowego release z samym nowym runtime rootem. Najpierw trzeba jawnie wskazać zachowany `new-inbox.json`, audit, receipts i operation journal.

## Docelowy kontrakt ścieżek

Kod pozostaje w release directory, a stan trwały powinien być poza release directories, na przykład:

```text
C:\CryptoEdge\state\lifecycle\new-inbox.json
C:\CryptoEdge\state\lifecycle\audit.json
C:\CryptoEdge\state\lifecycle\cycle-receipts.json
C:\CryptoEdge\state\lifecycle\operation-journal.json
C:\CryptoEdge\state\lifecycle\new-inbox-archive.sqlite
C:\CryptoEdge\state\follow-up\store.json
C:\CryptoEdge\state\established-universe\store.json
C:\CryptoEdge\state\new-recheck\store.json
C:\CryptoEdge\state\automation\automation-state.json
```

Przed uruchomieniem docelowego release należy ustawić co najmniej:

```text
CRYPTO_EDGE_NEW_INBOX_STORE_PATH=C:\CryptoEdge\state\lifecycle\new-inbox.json
CRYPTO_EDGE_LIFECYCLE_AUDIT_STORE_PATH=C:\CryptoEdge\state\lifecycle\audit.json
CRYPTO_EDGE_LIFECYCLE_CYCLE_RECEIPT_PATH=C:\CryptoEdge\state\lifecycle\cycle-receipts.json
CRYPTO_EDGE_LIFECYCLE_OPERATION_JOURNAL_PATH=C:\CryptoEdge\state\lifecycle\operation-journal.json
CRYPTO_EDGE_NEW_INBOX_ARCHIVE_SQLITE_PATH=C:\CryptoEdge\state\lifecycle\new-inbox-archive.sqlite
CRYPTO_EDGE_FOLLOW_UP_STORE_PATH=C:\CryptoEdge\state\follow-up\store.json
CRYPTO_EDGE_ESTABLISHED_UNIVERSE_STORE_PATH=C:\CryptoEdge\state\established-universe\store.json
CRYPTO_EDGE_NEW_RECHECK_STORE_PATH=C:\CryptoEdge\state\new-recheck\store.json
CRYPTO_EDGE_AUTOMATION_DIRECTORY_PATH=C:\CryptoEdge\state\automation
```

`CRYPTO_EDGE_DATA_POC_ROOT` nie jest zamiennikiem powyższych ścieżek. Runtime root musi nadal wskazywać poprawny package root release; trwałość lifecycle ustawiamy przez poszczególne kontrakty env.

Jeżeli `CRYPTO_EDGE_NEW_INBOX_ARCHIVE_SQLITE_PATH` nie jest ustawione, bezpieczny default V1 to:

```text
<data-poc runtime root>\.local\lifecycle\new-inbox-archive.sqlite
```

Archive store zawiera tabele `new_inbox_archive_events` (epizody) i `new_inbox_detected_identities` (unikalna historia identity) oraz indeksy po `identity` i `archived_at`. Event `NEW_INACTIVE_7D` jest idempotentny po deterministycznym `archive_event_id`, a detected registry po kluczu `identity`.

## Kolejność rollout

1. Otwórz maintenance window i zatrzymaj/pauzuj lifecycle writer oraz scheduler/launcher Central Automation. Nie wykonuj równolegle central cycle ani recheck.
2. Zapisz commit release, wszystkie efektywne env pathy i absolutne ścieżki plików. Wykonaj backup bieżącego stanu RC2: New Inbox, audit, receipts, journal, archive SQLite, Follow-up, Established, automation state i aktywne snapshoty.
3. Zweryfikuj backup checksumami, validatorami JSON oraz SQLite integrity. Uszkodzony lub niejednoznaczny store blokuje rollout.
4. Utwórz izolowane katalogi state i wykonaj COPY, nie MOVE, wszystkich zachowanych store'ów z RC2; nie twórz pustego Inboxa ani pustego Radaru na podstawie samego nowego release.
5. Utwórz lub zweryfikuj `new-inbox-archive.sqlite`. Przed pierwszym retention removal idempotentnie zaseeduj `new_inbox_detected_identities` wszystkimi identity z kopii New Inboxa, nie tylko `NEW`; zachowaj `TOTAL_IDENTITIES_BEFORE`, Follow-up/Established counts i checksumy. Jeśli nie ma eventów, V1 utworzy bazę przy pierwszym kwalifikującym cycle. Dla SQLite użyj spójnego backupu, nie kopiuj osobno aktywnego pliku WAL.
6. Skonfiguruj persistent env paths tak, aby wskazywały wyłącznie skopiowany, izolowany state; zapisz efektywne wartości i runtime root.
7. Wykonaj dry-run retention na tej kopii. Zapisz `ACTIVE_NEW_BEFORE`, `TOTAL_IDENTITIES_BEFORE`, `ELIGIBLE_STALE_NEW`, `EXPECTED_ACTIVE_NEW_AFTER = ACTIVE_NEW_BEFORE - ELIGIBLE_STALE_NEW`, `DETECTED_TOTAL_BEFORE`, `FOLLOW_UP_BEFORE`, `ESTABLISHED_BEFORE`, cutoff `now - 7 * 24h`, archive integrity oraz `last_seen_at` jako basis. Zasymuluj crash po archive persist i przed active removal; retry ma zachować jeden event i usunąć active entry.
8. Zweryfikuj dry-run counts i checksums: active, archive events, unique detected registry, audit/journal/receipt, Follow-up i Established. Dry-run z jakąkolwiek rozbieżnością blokuje dalsze kroki.
9. Wykonaj jawny **DEPLOY RETENTION-CAPABLE DATA-POC** — wdroż wersję data-poc zawierającą retention V1; sam Product Runtime nie aktywuje retention.
10. Zweryfikuj deployed data-poc SHA/version oraz zgodność runtime root z zatwierdzonym release.
11. Repoint/configure Central Automation wyłącznie na ten zweryfikowany retention-capable data-poc i skopiowane persistent env paths.
12. Pozostaw normalny schedule wyłączony; launcher nie może rozpocząć zwykłego cyklu przed ręczną kontrolą.
13. Uruchom dokładnie jeden kontrolowany lifecycle cycle ręcznie.
14. Zapisz `ARCHIVED_THIS_CYCLE`, `ACTIVE_NEW_AFTER`, `DETECTED_TOTAL_AFTER`, `FOLLOW_UP_AFTER`, `ESTABLISHED_AFTER`, receipt `archived`, archive count i checksum active Inboxa.
15. Wymagaj `ACTIVE_NEW_AFTER = EXPECTED_ACTIVE_NEW_AFTER`, `DETECTED_TOTAL_AFTER = DETECTED_TOTAL_BEFORE` przy samej archiwizacji, `FOLLOW_UP_AFTER = FOLLOW_UP_BEFORE` oraz `ESTABLISHED_AFTER = ESTABLISHED_BEFORE`.
16. Dopiero po pozytywnej weryfikacji włącz normalny Central Automation schedule.
17. Obserwuj następny zaplanowany cycle i porównaj receipt, counts, checksumy oraz archive integrity.
18. Przy jakiejkolwiek rozbieżności zatrzymaj Central Automation i wykonaj rollback według poniższej procedury.

## Backup i rollback

Backup musi obejmować razem:

- aktywny `new-inbox.json`;
- `audit.json`, `cycle-receipts.json` i `operation-journal.json`;
- `new-inbox-archive.sqlite` wraz z integrity check i spójną kopią SQLite;
- Follow-up, Established state, automation state oraz aktywne snapshoty wskazane przez automation state.

Rollback wykonuj przy zatrzymanym schedulerze. Przywróć komplet state z jednego backup bundle, włączając archive; nie przywracaj tylko `new-inbox.json`, bo spowodowałoby to rozjazd active/history. Zweryfikuj integralność SQLite, checksumy JSON, zgodność ścieżek i ostatni receipt przed ponownym startem.

Jeżeli trzeba wycofać sam release, pozostaw trwały archive store i state poza release directory. Przywróć poprzedni release z tymi samymi ścieżkami active/audit/receipts/journal, a decyzję o ponownym włączeniu retention podejmij dopiero po odtworzeniu backupu i nowym dry-runie. Nie usuwaj archive jako elementu rollbacku.

## Kryteria akceptacji po repointingu

- świeżo widziany NEW pozostaje active;
- `last_seen_at <= now - 7 * 24h` archiwizuje tylko NEW bez `archived_at` i `rejected_at`;
- bieżący snapshot odświeża `last_seen_at` przed retention;
- po sukcesie rekord znika z active Inboxa, a event jest w SQLite;
- `receipt.archived` i `last_change_summary.archived` są faktyczne;
- active „Aktywne w obserwacji” i „Nowe / obserwacja” maleją, a „Wykryte łącznie” nie maleje;
- FOLLOW_UP i MAIN_RADAR nie są archiwizowane przez tę politykę;
- re-detection tej samej `chain + contract` tworzy najwyżej jeden active NEW i zachowuje wcześniejszy archive;
- brak live OpenAI/provider calls w walidacji rolloutowej.
