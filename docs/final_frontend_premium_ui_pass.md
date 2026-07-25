# Final Frontend Polish / Premium UI Pass

## Status i zakres

Sprint **UI.1 — Visual Foundation, Product Shell, Radar and Candidate Detail** ustanawia finalny kierunek wizualny produktu przed lokalnym Release Candidate. Zmiana obejmuje wyłącznie warstwę prezentacji i kontrakty UI.

UI.1 obejmuje:

- kanoniczny system tokenów;
- Product Shell, nagłówek, nawigację desktop i mobile;
- Radar Overview oraz trzy warstwy lifecycle;
- karty New, Maturing i Established;
- Candidate Detail;
- wspólne statusy, kopiowanie adresu i loading state;
- podstawowe empty, partial, stale, unavailable i error states;
- responsywność i podstawy dostępności.

Control Center, Reports, Feedback, Verification, Methodology i panele ownera dziedziczą tokeny i bazową jakość powierzchni, ale ich pełny polish pozostaje zakresem UI.2.

## Zaakceptowany kierunek wizualny

Crypto Edge AI ma wyglądać jak spokojny, profesjonalny terminal badawczy dla rynku aktywów cyfrowych. Efekt premium wynika z hierarchii informacji, typografii, proporcji, subtelnego światła, głębi powierzchni i szybkich mikrointerakcji.

Kierunek wyklucza:

- neonowe obrysy wszystkich kart;
- animowane tła i ciągły ruch;
- wielokolorowe gradienty;
- estetykę gamingową lub kasynową;
- dominującą purpurę;
- ciężki glassmorphism;
- dekoracje sugerujące sygnał inwestycyjny albo automatyczny awans.

## Wynik audytu wizualnego

Audyt wykazał:

1. Dwie nakładające się generacje CSS używały różnych skal promieni, odstępów, kart i przycisków.
2. Nagłówek składał się z wielu równorzędnych ramek, przez co marka, stan danych i akcje konkurowały ze sobą.
3. Sidebar używał literowych skrótów i na mobile przechodził w poziomo przewijaną listę.
4. Osiem kart podsumowania Radaru miało niemal jednakową wagę.
5. Karty kandydatów traktowały większość metryk jak osobne mini-karty i nie tworzyły wyraźnej kolejności skanowania.
6. New cards nie eksponowały skróconego kontraktu, statusu filtrów i stanu security w tej samej hierarchii co Established.
7. Candidate Detail mieszał tożsamość, provenance, freshness i dane rynkowe; numeracja nie odzwierciedlała osobnej sekcji danych.
8. Kopiowanie nie dawało widocznego feedbacku.
9. Loading był pojedynczym tekstem i nie rezerwował układu.
10. Breakpointy 760/900 px pochodziły z różnych warstw i dawały niespójny mobile shell.
11. Starsze ekrany miały własne klasy statusów; brakowało jednego kontraktu ready/partial/warning/not-ready/manual/neutral.
12. Typografia pomocnicza często schodziła do 8–10 px i nadużywała wielkich liter.

UI.1 usuwa te problemy dla shellu, Radaru i Candidate Detail oraz zapewnia bezpieczne dziedziczenie globalnych tokenów przez pozostałe trasy.

## System tokenów

Kanoniczne tokeny znajdują się w `tools/ui-mock/src/index.css`.

### Powierzchnie

- `--color-bg-app` — tło aplikacji;
- `--color-surface-1` — shell i sidebar;
- `--color-surface-2` — główna sekcja;
- `--color-surface-3` — rekord lub wewnętrzna grupa;
- `--color-surface-elevated` — menu i podniesione panele;
- `--color-surface-hover` — stan interaktywny.

### Tekst i obramowania

- `--color-text-primary`, `--color-text-secondary`, `--color-text-helper`;
- `--color-border-default`, `--color-border-strong`, `--color-border-active`;
- `--color-accent`, `--color-accent-strong`, `--color-accent-muted`.

### Statusy

- ready — faktycznie pozytywny stan systemowy;
- partial — dane częściowe;
- warning — ostrzeżenie;
- not-ready — realna blokada albo błąd;
- manual — ręczna weryfikacja lub decyzja;
- neutral — informacja bez werdyktu.

Kolor nie jest jedynym nośnikiem. Wspólny `StatusBadge` dodaje etykietę, wskaźnik i `data-status-tone`, nie zmieniając kodów maszynowych.

### Geometria, rytm i ruch

- promienie: `--radius-xs` do `--radius-xl` oraz `--radius-pill`;
- odstępy: skala 4/8/12/16/20/24/32/40 px;
- cienie: `--shadow-soft`, `--shadow-panel`, `--shadow-elevated`;
- ruch: 140, 180 i 240 ms;
- easing: `--ease-standard`;
- focus: `--focus-ring-color` i `--focus-ring`.

Istniejące aliasy `--bg-*`, `--text-*`, `--green`, `--amber` i `--red` wskazują na nowy system, aby ekrany UI.2 nie uległy regresji.

## Typografia

- product eyebrow: 9–10 px, oszczędnie i tylko jako orientacja;
- page title: płynna skala 24–34 px;
- page description: 12–13 px, maksymalna szerokość dla czytelności;
- section heading: 16–21 px;
- card title: 21 px;
- primary metric: 23–30 px;
- secondary metric: 13–16 px;
- label/helper: 9–10 px z odpowiednim kontrastem;
- adresy i identyfikatory: systemowy monospace, elipsa albo bezpieczne łamanie.

Nie dodano fontu z CDN ani nowej zależności.

## Product Shell

- marka ma własny symbol SVG, product eyebrow i dyskretny runtime badge;
- pięć faktów runtime jest grupowanych w jeden status rail zamiast pięciu konkurujących kart;
- akcja odświeżenia pozostaje read-only i ma hierarchię głównej akcji użytkowej;
- PL/EN i Technical details są wizualnie drugorzędne;
- sidebar pokazuje aktualny kontekst, grupy i ikony SVG;
- aktywna pozycja zachowuje `aria-current="page"`;
- mobile ma semantyczny przycisk z `aria-expanded` i `aria-controls` oraz pionowe menu bez poziomego scrolla;
- długie polskie etykiety mogą się zawijać.

## Radar Overview

Radar zachowuje trzy różne warstwy:

1. New / observation;
2. Maturing / follow-up;
3. Established / main Radar.

Przełączniki warstw pokazują przepływ lifecycle, ale copy nadal wyklucza automatyczny awans. Główna grupa pięciu podsumowań odpowiada na pytania o New, Maturing, Candidate for Established, aktywne Established i czas snapshotu. Drugorzędny rail mieści stan filtrów, security i źródeł.

Karty tokenów mają wspólną kolejność: tożsamość, sieć i kontrakt, lifecycle, ważne metryki, filtry/security, freshness/źródło, następny krok i istniejące akcje. Interaktywny hover występuje tylko tam, gdzie karta ma akcję.

## Candidate Detail

Hero eksponuje nazwę, symbol, basket, status badawczy, sieć, DEX, źródło, freshness, skrócony kontrakt i powrót do Radaru. Dalej obowiązuje kolejność:

1. Identity;
2. Market snapshot;
3. Data and freshness;
4. Filter result;
5. Security;
6. Follow-up, jeśli istnieje;
7. Research actions.

Panel ownera pozostaje renderowany wyłącznie wtedy, gdy backend zwróci `owner_controls_visible = true`. UI nie tworzy capability i nie zmienia trybów `DISABLED`, `REVIEW_SAFE` ani `ENABLED`.

## Stany i mikrointerakcje

- loading rezerwuje przestrzeń przez lekki skeleton;
- empty/unavailable/error zachowują bezpieczny tytuł, objaśnienie i istniejące Technical details;
- refresh nie uruchamia collectora ani providera;
- content enter, mobile menu, interaktywny hover i copy feedback trwają 140–240 ms;
- nie ma ciągłego ruchu poza skeletonem widocznym tylko podczas realnego loadingu;
- copy feedback jest ogłaszany przez `aria-live="polite"`;
- animacje nie wpływają na logikę i nie blokują kliknięć.

`@media (prefers-reduced-motion: reduce)` usuwa animacje i skraca wszystkie przejścia do wartości praktycznie natychmiastowej.

## Responsywność

Kontrakty są sprawdzane dla 1440, 1280, 1024, 768 i 390 px. Shell przechodzi z sidebara do menu poniżej 900 px. Na wąskich ekranach status rail, summary, lifecycle, metryki, szczegóły i akcje składają się do jednej kolumny bez zmniejszania tekstu do nieczytelnego rozmiaru.

`html`, `body` i `#root` blokują poziomy overflow. Adresy używają `min-width: 0`, elipsy, bezpiecznego monospace i osobnego przycisku o właściwym touch target.

## Accessibility

- jednolity, kontrastowy `:focus-visible`;
- semantyczne `button`, `nav`, `main`, `section`, `header` i `footer`;
- `aria-current`, `aria-expanded`, `aria-controls`, `aria-live` i role status/error;
- disabled controls mają kursor, obniżoną intensywność i pozostają opisane tekstem;
- status ma tekst i wskaźnik, nie sam kolor;
- przyciski na mobile mają co najmniej 40–44 px;
- brak `dangerouslySetInnerHTML`.

Pełny accessibility pass, w tym dodatkowy screen-reader audit, pozostaje zakresem UI.3.

## Performance

Nie dodano bibliotek, fontów, obrazów tła, canvas, WebGL ani zależności animacyjnych. Warstwa korzysta z CSS i lekkich komponentów React. Zmiana rozmiaru artefaktów jest raportowana w draft PR po finalnym buildzie.

Pomiar `INTERNAL_BETA`:

| Artefakt | Przed UI.1 | Po UI.1 | Zmiana |
|---|---:|---:|---:|
| CSS raw | 135 675 B | 166 669 B | +30 994 B (+22,8%) |
| CSS gzip | 18,50 kB | 23,51 kB | +5,01 kB |
| JS raw | 404 131 B | 410 090 B | +5 959 B (+1,5%) |
| JS gzip | 113,42 kB | 114,90 kB | +1,48 kB |

Wzrost CSS wynika z kompletnej warstwy tokenów, pięciu kontraktowych breakpointów, nowego shellu, Radaru, Candidate Detail, focus/reduced-motion i bezpiecznych aliasów dla ekranów UI.2. Nie dodano runtime dependency; wzrost JS ogranicza się do lekkich prymitywów status/copy/loading i mobile menu.

## Kontrola wizualna UI.1

Kontrolę wykonano w lokalnym `INTERNAL_BETA` na prawdziwym snapshotcie/store, bez fixture fallback:

| Widok | Wynik |
|---|---|
| EN Radar, 1440 × 900 | PASS |
| PL Radar, 1440 × 900 | PASS |
| EN Candidate Detail, 1440 × 900 | PASS |
| PL Candidate Detail, 1440 × 900 | PASS |
| Radar i Detail, 390 × 844 | PASS; `documentWidth = viewportWidth = 390` |
| 1280 × 800 | PASS; brak overflow |
| 1024 × 768 | PASS; brak overflow i uciętych etykiet nawigacji |
| 768 × 1024 | PASS; dwukolumnowe summary i poprawne mobile menu |
| Keyboard focus | PASS; 2 px solid focus ring, aktywny pierwszy element Menu |
| Reduced motion | PASS; media rule usuwa animacje i skraca transitions |
| Konsola | PASS; 0 warning/error |

W trakcie kontroli poprawiono:

- zbyt dominującą datę w ostatniej karcie podsumowania;
- pustą piątą komórkę Identity dla rekordu New;
- wysokość i układ akcji nagłówka na 390 px;
- touch targets nagłówka do minimum 44 px;
- odstęp pomiędzy symbolem i nazwą projektu.

## Granice techniczne

UI.1 nie zmienia:

- API, endpointów ani strict schemas;
- storage, scoringu, filtrów, lifecycle i Established Universe;
- `WATCHLIST` i statusów maszynowych;
- owner capabilities, visibility gates, tokenów sesji i preflightów;
- runtime modes, same-origin ani provider boundary;
- VPS, Cloudflare i Windows Task Scheduler.

Walidacja i owner review mają wykonać zero live provider calls i zero mutacji danych.

## UI.2 i UI.3

UI.2: pełny polish Control Center, Reports, Feedback, owner inbox, Methodology i Verification, z użyciem tych samych tokenów i prymitywów.

UI.3: końcowy accessibility pass, cross-browser review, bardziej szczegółowa walidacja klawiatury/screen readera i finalne poprawki wizualne P0.

## Kolejność wydania

1. Final Frontend Polish / Premium UI Pass.
2. Lokalna regresja i Release Candidate.
3. Finalny deployment na VPS.
4. Cloudflare, scheduler, smoke i rollback.
5. Sesja testera i poprawki P0.
6. Freeze do 15.08.

## Owner review checklist

Owner ocenia tylko wygląd i UX:

- pierwsze wrażenie i brak efektu crypto casino;
- jakość shellu, marki i nawigacji;
- Radar oraz rozróżnienie trzech warstw;
- karty New, Maturing i Established;
- Candidate Detail i hierarchię sekcji;
- PL i EN;
- desktop 1440 px, tablet 768 px i mobile 390 px;
- focus klawiatury i reduced motion;
- brak technicznego/mockowego wyglądu;
- brak regresji istniejących akcji.

Owner nie wykonuje mutujących operacji i nie powtarza testów technicznych.

Komenda:

```cmd
scripts\win\start-premium-ui-review.cmd --radar --mobile-guide
```
