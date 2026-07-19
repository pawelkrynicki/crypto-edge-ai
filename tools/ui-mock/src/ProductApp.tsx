import { useCallback, useEffect, useState } from "react";
import { mapPersistableScannerOutputToUiCandidates } from "./adapters/scannerOutputAdapter";
import { CandidateDetailView } from "./components/CandidateDetailView";
import { CandidateResultsView } from "./components/CandidateResultsView";
import { ExternalVerificationLinksView } from "./components/ExternalVerificationLinksView";
import { Methodology } from "./components/Methodology";
import {
  ProductWorkspaceSection,
  ProductWorkspaceShell,
  type ProductNavItem,
  type ProductSectionId,
} from "./components/ProductWorkspaceShell";
import { getProductRuntimeMode } from "./runtimeMode";
import {
  loadScannerApiDataSourceResult,
  loadScannerReadinessResult,
  type ResolvedScannerSource,
} from "./services/scannerDataSource";
import type {
  ProductReadinessOutput,
  ScannerDiscoveryMetadata,
  UiTokenCandidate,
} from "./types/scannerTypes";

const PRODUCT_NAV_ITEMS: ProductNavItem[] = [
  { id: "candidate-results", label: "Radar", icon: "R", description: "Dwa koszyki danych" },
  { id: "candidate-detail", label: "Szczegóły", icon: "S", description: "Pełny obraz kandydata" },
  { id: "external-checks", label: "Weryfikacja", icon: "W", description: "Źródła zewnętrzne" },
  { id: "methodology", label: "Metodologia", icon: "M", description: "Zasady i ograniczenia" },
];

const SECTION_COPY: Record<ProductSectionId, { title: string; description: string }> = {
  "candidate-results": {
    title: "Radar",
    description: "Nowe projekty obserwacyjne i kandydaci Established są rozdzieleni zgodnie z kontraktem real-data.",
  },
  "candidate-detail": {
    title: "Szczegóły",
    description: "Tożsamość, rynek, filtry i bezpieczeństwo bez ukrywania brakujących danych.",
  },
  "external-checks": {
    title: "Weryfikacja",
    description: "Bezpieczne linki do ręcznej kontroli źródeł; aplikacja nie uruchamia providerów.",
  },
  methodology: {
    title: "Metodologia",
    description: "Krótki opis dwóch koszyków, filtrów, etykiet i granic produktu.",
  },
};

const HASH_TO_SECTION: Record<string, ProductSectionId> = {
  "#candidate-results": "candidate-results",
  "#candidate-detail": "candidate-detail",
  "#external-checks": "external-checks",
  "#methodology": "methodology",
};

const SECTION_TO_HASH: Record<ProductSectionId, string> = {
  "candidate-results": "#candidate-results",
  "candidate-detail": "#candidate-detail",
  "external-checks": "#external-checks",
  methodology: "#methodology",
};

export default function ProductApp() {
  const runtimeMode = getProductRuntimeMode();
  const [activeSection, setActiveSection] = useState<ProductSectionId>(() => resolveSection());
  const [candidates, setCandidates] = useState<UiTokenCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedSource, setResolvedSource] = useState<ResolvedScannerSource>("unavailable");
  const [runId, setRunId] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [ageSeconds, setAgeSeconds] = useState<number | null>(null);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<ScannerDiscoveryMetadata | null>(null);
  const [readiness, setReadiness] = useState<ProductReadinessOutput | null>(null);
  const [readinessReasonCode, setReadinessReasonCode] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [verificationCandidateId, setVerificationCandidateId] = useState<string | null>(null);

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId)
    ?? candidates.find((candidate) => candidate.discoveryBasket === "established" && candidate.finalLabel === "WATCHLIST")
    ?? candidates.find((candidate) => candidate.discoveryBasket === "established")
    ?? candidates[0]
    ?? null;
  const verificationCandidate =
    candidates.find((candidate) => candidate.id === verificationCandidateId)
    ?? selectedCandidate;

  const loadData = useCallback(async () => {
    setLoading(true);
    setReasonCode(null);
    setReadinessReasonCode(null);
    setUnavailableMessage(null);

    const [scannerResult, readinessResult] = await Promise.all([
      loadScannerApiDataSourceResult({ runtimeMode }),
      loadScannerReadinessResult({ runtimeMode }),
    ]);

    if (readinessResult.status === "ready") {
      setReadiness(readinessResult.output);
    } else {
      setReadiness(null);
      setReadinessReasonCode(readinessResult.reasonCode);
    }

    if (scannerResult.status === "error") {
      setCandidates([]);
      setResolvedSource("unavailable");
      setRunId(null);
      setGeneratedAt(null);
      setAgeSeconds(null);
      setSourceIds([]);
      setMetadata(null);
      setReasonCode(scannerResult.reasonCode);
      setUnavailableMessage(scannerResult.error);
      setLoading(false);
      return;
    }

    const output = scannerResult.output;
    setCandidates(mapPersistableScannerOutputToUiCandidates(output));
    setResolvedSource(scannerResult.resolvedSource);
    setRunId(output.scan_run.run_id ?? null);
    setGeneratedAt(output.provenance?.generated_at ?? output.scan_run.finished_at ?? output.scan_run.started_at ?? null);
    setAgeSeconds(output._source_meta?.age_seconds ?? null);
    setSourceIds(output._source_meta?.source_ids ?? output.provenance?.source_ids ?? []);
    setMetadata(output.provenance?.metadata ?? null);
    setLoading(false);
  }, [runtimeMode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const handleHashChange = () => setActiveSection(resolveSection());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigate = useCallback((section: ProductSectionId) => {
    setActiveSection(section);
    if (window.location.hash !== SECTION_TO_HASH[section]) {
      window.location.hash = SECTION_TO_HASH[section];
    }
  }, []);

  const openCandidate = useCallback((candidateId: string) => {
    setSelectedCandidateId(candidateId);
    navigate("candidate-detail");
  }, [navigate]);

  const openVerification = useCallback((candidate: UiTokenCandidate) => {
    setSelectedCandidateId(candidate.id);
    setVerificationCandidateId(candidate.id);
    navigate("external-checks");
  }, [navigate]);

  const renderSection = () => {
    const copy = SECTION_COPY[activeSection];
    if (loading) {
      return (
        <ProductWorkspaceSection {...copy}>
          <div className="product-loading" role="status">Ładowanie aktualnego obrazu Radaru…</div>
        </ProductWorkspaceSection>
      );
    }

    if (activeSection === "candidate-results") {
      return (
        <ProductWorkspaceSection {...copy}>
          <CandidateResultsView
            candidates={candidates}
            metadata={metadata}
            readiness={readiness}
            generatedAt={generatedAt}
            ageSeconds={ageSeconds}
            sourceIds={sourceIds}
            scannerUnavailableReasonCode={reasonCode}
            onOpenCandidate={openCandidate}
            onOpenExternalChecks={openVerification}
          />
        </ProductWorkspaceSection>
      );
    }

    if (activeSection === "candidate-detail") {
      return (
        <ProductWorkspaceSection {...copy}>
          <CandidateDetailView
            candidate={selectedCandidate}
            onBackToResults={() => navigate("candidate-results")}
            onOpenExternalChecks={openVerification}
          />
        </ProductWorkspaceSection>
      );
    }

    if (activeSection === "external-checks") {
      return (
        <ProductWorkspaceSection {...copy}>
          <ExternalVerificationLinksView candidate={verificationCandidate} />
        </ProductWorkspaceSection>
      );
    }

    return (
      <ProductWorkspaceSection {...copy}>
        <Methodology />
      </ProductWorkspaceSection>
    );
  };

  return (
    <ProductWorkspaceShell
      navItems={PRODUCT_NAV_ITEMS}
      activeSection={activeSection}
      onSectionChange={navigate}
      loading={loading}
      runtimeMode={runtimeMode}
      resolvedSource={resolvedSource}
      runId={runId}
      generatedAt={generatedAt}
      ageSeconds={ageSeconds}
      sourceIds={sourceIds}
      readiness={readiness}
      readinessReasonCode={readinessReasonCode}
      dataUnavailableMessage={unavailableMessage}
      dataUnavailableReasonCode={reasonCode}
    >
      {renderSection()}
    </ProductWorkspaceShell>
  );
}

function resolveSection(): ProductSectionId {
  if (typeof window === "undefined") return "candidate-results";
  return HASH_TO_SECTION[window.location.hash.trim().toLowerCase()] ?? "candidate-results";
}
