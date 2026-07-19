import React from "react";

const FILTERS = [
  "Market cap 300 tys.–10 mln USD",
  "Volume 24h minimum 30 tys. USD",
  "Liquidity minimum 30 tys. USD",
  "Volume / market cap ratio 0,01–1",
  "Wiek pary ponad 7 dni",
];

export const Methodology: React.FC = () => (
  <div className="product-methodology">
    <section className="methodology-lead">
      <span className="candidate-results-eyebrow">Jak czytać Radar</span>
      <h3>Obserwacja nie jest rekomendacją</h3>
      <p>Crypto Edge AI porządkuje dane do ręcznej analizy. Nie zatwierdza tokenów i nie wykonuje działań transakcyjnych.</p>
    </section>

    <section className="methodology-baskets">
      <article>
        <span>01</span>
        <h4>New / Emerging</h4>
        <p>Najnowsze profile DexScreener. Projekty są bardzo nowe, mają `observation_only=true` i nie awansują automatycznie do Established.</p>
      </article>
      <article>
        <span>02</span>
        <h4>Established</h4>
        <p>Utrzymywana przez ownera, wersjonowana lista `chain + contract address`. GoPlus jest uruchamiany dopiero po przejściu filtrów.</p>
      </article>
    </section>

    <section className="methodology-grid">
      <article>
        <h4>Źródła danych</h4>
        <p>Rynek i discovery: DexScreener. Bezpieczeństwo kwalifikujących się rekordów Established: GoPlus. UI czyta tylko lokalny, zwalidowany snapshot.</p>
      </article>
      <article>
        <h4>Zamrożone filtry</h4>
        <ul>{FILTERS.map((filter) => <li key={filter}>{filter}</li>)}</ul>
      </article>
      <article>
        <h4>WATCHLIST</h4>
        <p>WATCHLIST — wyłącznie ręczna analiza. Nie oznacza „safe”, zatwierdzenia ani rekomendacji.</p>
      </article>
      <article>
        <h4>Brak danych</h4>
        <p>Braki i puste koszyki pozostają widoczne. INTERNAL_BETA nie wstawia fixture, sample candidates ani fikcyjnych wartości.</p>
      </article>
    </section>

    <section className="methodology-limitations">
      <h4>Ograniczenia systemu</h4>
      <ul>
        <li>Manual Review Only — wynik nie zastępuje własnej weryfikacji.</li>
        <li>Dane mogą stać się nieaktualne lub chwilowo niedostępne; reason code pozostaje jawny.</li>
        <li>Brak automatycznego Honeypot.is, scrapingu, auto-tradingu i rekomendacji inwestycyjnych.</li>
        <li>Established zależy od ręcznego uzupełnienia wersjonowanego universe adresów.</li>
      </ul>
    </section>
  </div>
);
