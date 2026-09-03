import { useEffect, type ReactElement } from "react";
import { api } from "@/trpc/react";

export default function CryptoEdge(): ReactElement {
  const launch = api.cryptoEdge.launch.useMutation();

  useEffect(() => {
    if (launch.data?.launchUrl) window.location.assign(launch.data.launchUrl);
  }, [launch.data?.launchUrl]);

  return (
    <main aria-labelledby="crypto-edge-heading">
      <h1 id="crypto-edge-heading">Crypto Edge AI</h1>
      <p>Otwórz swój prywatny Crypto Edge Radar.</p>
      <button type="button" onClick={() => launch.mutate()} disabled={launch.isPending}>
        {launch.isPending ? "Ładowanie…" : "Otwórz Crypto Edge AI"}
      </button>
      {launch.isError && <p role="alert">Nie udało się uruchomić Crypto Edge. Spróbuj ponownie.</p>}
    </main>
  );
}
