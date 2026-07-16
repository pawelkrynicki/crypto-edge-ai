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
import { toMockCandidate, type MockCandidate } from "./mockData";
import { getProductRuntimeMode } from "./runtimeMode";
import { getCandidateReview, loadReviewSession } from "./services/reviewSessionStore";
import {
  loadScannerApiDataSourceResult,
  type ResolvedScannerSource,
} from "./services/scannerDataSource";
import type { ReviewSessionState } from "./types/reviewSessionTypes";

const PRODUCT_NAV_ITEMS: ProductNavItem[] = [
  { id: "candidate-results", label: "Radar", icon: "R", description: "Rzeczywiste kandydatury" },
  { id: "candidate-detail", label: "Szczegóły", icon: "S", description: "Szczegóły kandydata" },
  { id: "external-checks", label: "Weryfikacja", icon: "W", description: "Manualna weryfikacja" },
  { id: "methodology", label: "Metodologia", icon: "M", description: "Kontrakt i metodologia" },
];

const SECTION_COPY: Record<ProductSectionId, { title: string; description: string }> = {
  "candidate-results": {
    title: "Radar",
    description: "Kandydatury dopuszczone przez kontrakt real-data do ręcznej analizy.",
  },
  "candidate-detail": {
    title: "Szczegóły",
    description: "Znormalizowane dane kandydata i jawne luki wymagające weryfikacji.",
  },
  "external-checks": {
    title: "Weryfikacja",
    description: "Manualne kroki weryfikacyjne; brak automatycznej deklaracji bezpieczeństwa.",
  },
  methodology: {
    title: "Metodologia",
    description: "Kontrakt danych, etykiety i granice Manual Review Only.",
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
  const [candidates, setCandidates] = useState<MockCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedSource, setResolvedSource] = useState<ResolvedScannerSource>("unavailable");
  const [runId, setRunId] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [ageSeconds, setAgeSeconds] = useState<number | null>(null);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [verificationCandidateId, setVerificationCandidateId] = useState<string | null>(null);
  const [reviewSession] = useState<ReviewSessionState>(() => loadReviewSession());

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId)
    ?? candidates.find((candidate) => candidate.final_label === "WATCHLIST")
    ?? candidates[0]
    ?? null;
  const verificationCandidate =
    candidates.find((candidate) => candidate.id === verificationCandidateId)
    ?? selectedCandidate;
  const reviewRecord = selectedCandidate
    ? getCandidateReview(selectedCandidate.id, reviewSession)
    : null;

  const loadData = useCallback(async () => {
    setLoading(true);
    setReasonCode(null);
    setUnavailableMessage(null);

    const result = await loadScannerApiDataSourceResult({ runtimeMode });
    if (result.status === "error") {
      setCandidates([]);
      setResolvedSource("unavailable");
      setRunId(null);
      setGeneratedAt(null);
      setAgeSeconds(null);
      setSourceIds([]);
      setReasonCode(result.reasonCode);
      setUnavailableMessage(result.error);
      setLoading(false);
      return;
    }

    setCandidates(mapPersistableScannerOutputToUiCandidates(result.output).map(toMockCandidate));
    setResolvedSource(result.resolvedSource);
    setRunId(result.output.scan_run.run_id ?? null);
    setGeneratedAt(result.output.scan_run.finished_at ?? result.output.scan_run.started_at ?? null);
    setAgeSeconds(result.output._source_meta?.age_seconds ?? null);
    setSourceIds(result.output._source_meta?.source_ids ?? []);
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

  const openVerification = useCallback((candidate: MockCandidate) => {
    setSelectedCandidateId(candidate.id);
    setVerificationCandidateId(candidate.id);
    navigate("external-checks");
  }, [navigate]);

  const renderSection = () => {
    const copy = SECTION_COPY[activeSection];
    if (loading) {
      return (
        <ProductWorkspaceSection {...copy}>
          <div className="flex items-center justify-center h-40">
            <span className="text-secondary text-sm">Loading data...</span>
          </div>
        </ProductWorkspaceSection>
      );
    }

    if (activeSection === "candidate-results") {
      return (
        <ProductWorkspaceSection {...copy}>
          <CandidateResultsView
            candidates={candidates}
            reviewSession={reviewSession}
            onOpenCandidate={openCandidate}
            onOpenTokenLookup={openVerification}
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
            reviewRecord={reviewRecord}
            onBackToResults={() => navigate("candidate-results")}
            onOpenTokenLookup={openVerification}
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
      sourceStatusText={formatSourceStatus(resolvedSource, runId, generatedAt, ageSeconds, sourceIds)}
      dataUnavailableMessage={unavailableMessage}
      dataUnavailableReasonCode={reasonCode}
      runtimeMode={runtimeMode}
    >
      {renderSection()}
    </ProductWorkspaceShell>
  );
}

function resolveSection(): ProductSectionId {
  if (typeof window === "undefined") return "candidate-results";
  return HASH_TO_SECTION[window.location.hash.trim().toLowerCase()] ?? "candidate-results";
}

function formatSourceStatus(
  source: ResolvedScannerSource,
  runId: string | null,
  generatedAt: string | null,
  ageSeconds: number | null,
  sourceIds: string[],
): string {
  if (source === "unavailable") return "Data Unavailable";

  const parts = [
    runId ? `run ${runId}` : null,
    generatedAt ? `generated ${generatedAt}` : null,
    ageSeconds == null ? null : `age ${formatAge(ageSeconds)}`,
    sourceIds.length > 0 ? sourceIds.join(", ") : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(" · ");
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
