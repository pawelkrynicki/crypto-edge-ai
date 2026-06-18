# Open Questions for AIKINTEL Owner

## Product and Access

1. Czy modul ma korzystac z istniejacych `users` i auth?
2. Czy nazwa w menu ma brzmiec `Crypto Market`, `Crypto Edge AI`, czy inaczej?
3. Czy Camp v1 ma byc tylko dla admin/test users, czy dla realnych uczestnikow?
4. Czy mamy juz dostep do glownego repo AIKINTEL?

## Existing Platform Data

5. Czy `crypto_news` istnieje w produkcji i jaki ma dokladny schemat?
6. Ktore zrodla danych sa zatwierdzone na v1?
7. Czy OpenAI helper juz istnieje?
8. Czy tabele maja byc tworzone przez migracje Drizzle, raw SQL, czy osobny deployment script?

## User-Specific Features

9. Czy uzytkownik ma miec prywatne watchlisty juz w v1?
10. Jakie limity uzycia AI maja obowiazywac?

## Data and Operations

11. Czy Camp v1 ma korzystac z mock data, recznie zatwierdzonych danych, czy ograniczonego live collection?
12. Czy sa juz zatwierdzone klucze lub limity dla CoinGecko, GoPlusLabs, DexScreener, DefiLlama lub innych zrodel?
13. Czy istnieje standard nazewnictwa PM2 dla nowych procesow crypto?
14. Czy token costs maja byc rozliczane przez istniejacy mechanizm `insight_costs` i `token_pools`?
15. Czy AI analysis ma byc generowany w cron scripts, w webapp backend, czy hybrydowo?

## UI and Release

16. Ktore istniejace strony AIKINTEL sa najlepszym wzorcem UI: `MarketNews.tsx`, `COTReports.tsx`, czy inna?
17. Czy sidebar ma miec osobna sekcje crypto, czy link w istniejacej sekcji market intelligence?
18. Czy Camp v1 ma miec publiczny demo mode, czy tylko zalogowany dostep?
19. Czy setup review mock moze byc dostepny dla uczestnikow, czy tylko dla admin/test users?
20. Jakie disclaimery prawne maja byc zaakceptowane przez wlasciciela przed campem?
