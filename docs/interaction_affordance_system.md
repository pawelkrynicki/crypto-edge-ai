# UX.1 — Global Interaction Affordance System

## Status i zakres

UX.1 porządkuje globalny język interakcji w zaakceptowanym kierunku wizualnym Crypto Edge AI: spokojny, profesjonalny i instytucjonalny terminal badawczy. Nie jest redesignem i nie zmienia API, danych, strict schemas, storage, scoringu, filtrów, lifecycle, Follow-up, Established Universe, Reports, Feedback, owner capability ani znaczenia `WATCHLIST`.

System działa w obecnym React/CSS i jest gotowy do późniejszego odwzorowania w React 19, Tailwind CSS 4, shadcn/ui i Radix. Bieżąca aplikacja nie otrzymuje nowych zależności ani bezpośrednich połączeń z zewnętrznymi API.

## Audyt elementów interaktywnych

| Kategoria | Główne wystąpienia | Kontrakt po UX.1 |
|---|---|---|
| Primary actions | Otwórz szczegóły, przejdź do weryfikacji, wyślij opinię, odśwież widok, dozwolona owner action | `ActionButton` / `ActionLink`, wariant `primary`; zwykle jedna główna akcja w grupie |
| Secondary actions | Wróć, weryfikacja źródłowa, podgląd owner preflight, odśwież raporty | `ActionButton`, wariant `secondary` |
| Tertiary actions | kopiowanie, pomocnicze akcje, filtry licznikowe | `ActionButton`, wariant `tertiary`, albo natywny toggle z `aria-pressed` |
| Linki wewnętrzne | nawigacja shellu, Methodology TOC, powrót do Radaru | natywny `a`/`button`, `aria-current` dla bieżącego celu |
| Linki zewnętrzne | eksplorator, DexScreener i allowlisted źródła | `ExternalLinkAction`, ikona external-link, `target="_blank"`, naturalna etykieta |
| Kopiowanie | kontrakt, adres pary, link | `CopyButton`, ikona, pełna etykieta, stan „Skopiowano”, `aria-live="polite"` |
| Disclosures | szczegóły techniczne, opis przepływu Radaru | natywne `details/summary` lub semantyczny button, cały wiersz, chevron, Rozwiń/Zwiń, `aria-expanded` |
| Tabs i filtry | trzy warstwy Radaru, Owner Inbox counters, locale | natywne buttony, `aria-pressed`; selected/active state nie jest samym kolorem |
| Formularze | Feedback title/details/category, owner confirmation, selecty Inbox | widoczny label, odrębna powierzchnia input, focus, checked, disabled i helper text |
| Interaktywne rekordy | Owner Inbox, lista raportów | jawne CTA lub wskaźnik strzałki i active state; nie ma niewidocznego linku na kartach z wieloma akcjami |
| Read-only cards | metryki, readiness, lifecycle, fakty techniczne | `data-interaction="read-only"`, brak pointera, liftu i hoveru sugerującego akcję |
| Status badges | readiness, bezpieczeństwo, „Brak blokad” | `StatusBadge`, `data-interaction="status"`, brak focus, hover i `tabIndex` |
| Disabled controls | pusty eksport, niepełny Feedback, `REVIEW_SAFE`, nieaktualny preflight | stan wizualny inny niż sama opacity oraz widoczny powód połączony przez `aria-describedby` |

### Wykryte i naprawione przypadki

- Karta tokena podnosiła się na hover tylko dlatego, że zawierała przyciski. Hover całej read-only karty został usunięty; akcje mają własny feedback.
- Lokalne klasy przycisków (`reports-*`, `product-*`, `primary-button`) opisywały wygląd, lecz nie stabilną rolę. Główne powierzchnie korzystają teraz z jednego kontraktu wariantów.
- Tekstowe „Kopiuj” było małe i słabo odróżnialne. Copy ma ikonę, naturalną nazwę, wyraźny hover, dostępny hit area i live feedback.
- Część `details/summary` wyglądała jak opis. Wspólny disclosure pokazuje chevron, pełny klikalny wiersz oraz jawny stan Rozwiń/Zwiń.
- Raporty i rekordy Owner Inbox nie komunikowały wystarczająco jasno aktywnego wyboru. Wybrany rekord ma active state i `aria-current`, a rekord Inbox ma jawne „Otwórz szczegóły”.
- Disabled export i owner actions opierały się głównie na opacity. Powody są widoczne i powiązane z kontrolką.
- Readiness, lifecycle, status „Brak blokad” i metryki zachowują `cursor: default` i nie otrzymują interaktywnego hoveru.

## Kanoniczne role i warianty

### `ActionButton` i `ActionLink`

- `primary` — najwyższy kontrast i najważniejsza akcja w bieżącej grupie;
- `secondary` — istotna akcja o spokojniejszej powierzchni i wyraźnym obrysie;
- `tertiary` — akcja pomocnicza, nadal z widocznym hit area i hoverem;
- `danger` — zarezerwowany dla rzeczywistej destrukcyjnej akcji; UX.1 nie wprowadza nowej destrukcji;
- `disabled` — natywny `disabled`, dashed/neutral surface oraz widoczny powód;
- `loading` — `aria-busy`, etykieta postępu i nieaktywny przycisk;
- icon-only — kontrakt dopuszczony tylko z dostępną nazwą; kluczowe akcje desktopowe pozostają tekstowe.

Każdy wariant ma default, hover, focus-visible i active. Loading i disabled są stosowane tylko tam, gdzie wynikają ze stanu produktu. Active daje krótki `translate/scale`; nie ma ciągłego ruchu poza wskaźnikiem trwającej operacji. `prefers-reduced-motion` usuwa animację.

### `CopyButton`

Przycisk zachowuje dokładną kopiowaną wartość. Po udanym zapisie do schowka przez 1,6 s pokazuje „Skopiowano/Copied”; osobny `role="status" aria-live="polite"` ogłasza wynik bez przenoszenia focusu.

### `ExternalLinkAction`

Zawsze jest natywnym linkiem, pokazuje ikonę zewnętrznego celu i odróżnia się od statusu. Tooltip nie jest wymagany do zrozumienia akcji.

### `TechnicalDetails`

Używa `details/summary`, więc Enter i Space działają natywnie. Summary obejmuje cały wiersz, ma chevron, `aria-expanded`, widoczny focus i tekst Rozwiń/Zwiń. Kod i wartości techniczne mogą się łamać bez overflow.

### `StatusBadge` i `ReadOnlyCard`

Status jest `span`, a karta informacyjna jest `article`; nie otrzymują `onClick`, `tabIndex`, pointera ani interaktywnego hoveru. Kolor jest wsparty tekstem i wskaźnikiem.

## Formularze i disabled reasons

- Feedback category pozostaje rzeczywistym `input type="radio"` w dużym klikalnym `label`; checked, hover i focus są widoczne.
- Title, details i selecty mają jawne label oraz osobne stany focus.
- Submit Feedback wskazuje wymagane braki tekstem `feedback-submit-help` i `aria-describedby`.
- Eksport pustego Inbox pozostaje disabled, a `feedback-export-help` wyjaśnia, że aktywuje go pierwszy zapis.
- Owner refresh i Established promotion w `REVIEW_SAFE` pozostają disabled; widoczny notice oraz `owner-*-disabled-help` opisują warunek aktywacji.
- Tooltip może być tylko informacją dodatkową i nigdy jedynym wyjaśnieniem disabled state.

## Klawiatura i accessibility

- Interakcje używają natywnych `button`, `a`, `input`, `select`, `textarea` i `details/summary`.
- Brak interaktywnych `div`, `role="button"` i `dangerouslySetInnerHTML`.
- Focus-visible ma niezależny obrys i nie polega wyłącznie na zmianie tła.
- `aria-pressed` opisuje filtry/toggle, `aria-current` bieżącą nawigację/rekord, `aria-expanded` disclosure, a `aria-describedby` powody disabled.
- Statusy i badge nie trafiają do kolejności tab.
- Ikony są dekoracyjne (`aria-hidden`); etykieta kontrolki pozostaje dostępna.
- Kolejność DOM odpowiada kolejności czytania i tabulacji.

## Mobile 390 px

- Wszystkie przyciski i summary w Product Shell mają minimum 44 × 44 px; copy buttons zachowują 44 px hit area.
- Primary jest przed secondary w Candidate Detail, a grupy akcji przechodzą do jednej kolumny.
- Karta pozostaje read-only; tylko jej jawne CTA reagują na dotyk.
- Copy może przejść pod długą wartość techniczną; etykieta nie jest skracana.
- Disclosures są pełnymi klikalnymi wierszami.
- Disabled reasons pozostają widoczne; `#root` i shell blokują poziomy overflow.

## Mapowanie AI KINTEL / shadcn/ui

To jest mapowanie dokumentacyjne, nie bieżąca migracja.

| Crypto Edge AI | Docelowy AI KINTEL |
|---|---|
| Primary Action | shadcn Button `default` |
| Secondary Action | Button `outline` |
| Tertiary Action | Button `ghost` |
| Icon Button | Button `size="icon"` z `aria-label` |
| Interactive Card | Card + jawny Button/Link; cały Card tylko dla jednego celu |
| Read-only Card | Card bez handlera i hover-lift |
| Status | Badge |
| Lifecycle/basket filters | Tabs, jeśli zachowują semantykę wyboru widoku |
| Form select | Select |
| Disclosure | Accordion albo Collapsible |
| Modal confirmation | Dialog |
| Loading placeholder | Skeleton |
| Supplemental hint | Tooltip, wyłącznie pomocniczy |
| External action / dropdown actions | Button/Link lub DropdownMenu zależnie od liczby akcji |

Frontend AI KINTEL nadal powinien pobierać dane wyłącznie przez tRPC/TanStack Query i backendowe adaptery; nie wolno przenosić provider fetch do przeglądarki.

## Bundle

Baseline dla `a0a5b5d00d3be8ff4b87e2e60f635c9bd7d2540e` w fixture-free `INTERNAL_BETA`:

- CSS: 191,96 kB; gzip 27,00 kB;
- JS: 459,33 kB; gzip 127,84 kB.

UX.1 nie dodaje runtime dependencies, biblioteki ikon, animacji ani fontu. Końcowy pomiar jest zapisywany w podsumowaniu PR po buildzie walidacyjnym.

Końcowy pomiar UX.1 w tym samym buildzie:

- CSS: 206,10 kB; gzip 28,95 kB — zmiana +14,14 kB / +1,95 kB gzip;
- JS: 464,94 kB; gzip 129,44 kB — zmiana +5,61 kB / +1,60 kB gzip.

## Owner review checklist

1. Radar i karta tokena — czy klikalne są tylko koszyki, disclosure, copy i jawne CTA; oś lifecycle pozostaje niefokusowalna.
2. Candidate Detail — primary verification, pojedynczy secondary back na dole, read-only fields i copy.
3. Verification — secondary external-link, tertiary copy contract/pair/link, widoczny unavailable reason.
4. Reports — jawne CTA, selected record, metadata bez affordance filtra.
5. Feedback — radio hover/checked/focus, labels, komplet bieżących braków i disabled submit bez stanu oczekiwania.
6. Owner Inbox — filtry z `aria-pressed`, selecty, active record, disabled export reason.
7. Methodology — TOC wygląda jak nawigacja, definicje pozostają informacyjne.
8. Control Center — readiness i pięciostopniowa lista warunków nie mają hoveru ani fokusu; tylko disclosures i dozwolone owner actions są interaktywne.
9. Mobile 390 px — 44 px, brak overflow, primary przed secondary, pełne disclosure rows.
10. Keyboard-only — logiczny Tab, widoczny focus, Enter/Space, brak fokusowalnych statusów.

Komenda:

```cmd
scripts\win\start-interaction-affordance-review.cmd --mobile-guide
```

Launcher otwiera zwykły `INTERNAL_BETA`, pozostawia owner operations w `DISABLED`, nie uruchamia collectora, providerów, `--apply` ani mutacji danych i nie omija owner authentication. Odczytowa skrzynka Owner Inbox wymaga jawnego `--owner-inbox`; parametr deleguje do istniejącej kanonicznej ścieżki `REVIEW_SAFE` używanej przez UI.2.
