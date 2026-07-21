import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
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
import { ProductLocaleProvider, useProductLocale } from "./productI18n";
import { resolveProductSourceHealth } from "./productSourceHealth";
import { getProductRuntimeMode } from "./runtimeMode";
import {
  loadScannerApiDataSourceResult,
  loadScannerReadinessResult,
  type ResolvedScannerSource,
} from "./services/scannerDataSource";
import { loadAutomationStatus, type AutomationStatus } from "./services/automationStatusDataSource";
import type {
  ProductReadinessOutput,
  ScannerApiOutput,
  ScannerDiscoveryMetadata,
  UiTokenCandidate,
} from "./types/scannerTypes";

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
  return (
    <ProductLocaleProvider>
      <ProductAppContent />
    </ProductLocaleProvider>
  );
}

export function ProductAppContent() {
  const { t } = useProductLocale();
  const runtimeMode = getProductRuntimeMode();
  const [activeSection, setActiveSection] = useState<ProductSectionId>(() => resolveSection());
  const [candidates, setCandidates] = useState<UiTokenCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedSource, setResolvedSource] = useState<ResolvedScannerSource>("unavailable");
  const [runId, setRunId] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [ageSeconds, setAgeSeconds] = useState<number | null>(null);
  const [freshnessStatus, setFreshnessStatus] = useState<"FRESH" | "STALE" | null>(null);
  const [viewRefreshedAt, setViewRefreshedAt] = useState<string | null>(null);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<ScannerDiscoveryMetadata | null>(null);
  const [readiness, setReadiness] = useState<ProductReadinessOutput | null>(null);
  const [readinessReasonCode, setReadinessReasonCode] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [verificationCandidateId, setVerificationCandidateId] = useState<string | null>(null);
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const navItems = useMemo<ProductNavItem[]>(() => [
    { id: "candidate-results", label: t("nav.radar"), icon: "R", description: t("nav.radarDescription") },
    { id: "candidate-detail", label: t("nav.details"), icon: "D", description: t("nav.detailsDescription") },
    { id: "external-checks", label: t("nav.verification"), icon: "V", description: t("nav.verificationDescription") },
    { id: "methodology", label: t("nav.methodology"), icon: "M", description: t("nav.methodologyDescription") },
  ], [t]);

  const sectionCopy = useMemo<Record<ProductSectionId, { title: string; description: string }>>(() => ({
    "candidate-results": { title: t("nav.radar"), description: t("section.radarDescription") },
    "candidate-detail": { title: t("nav.details"), description: t("section.detailsDescription") },
    "external-checks": { title: t("nav.verification"), description: t("section.verificationDescription") },
    methodology: { title: t("nav.methodology"), description: t("section.methodologyDescription") },
  }), [t]);

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId)
    ?? candidates.find((candidate) => candidate.discoveryBasket === "established" && candidate.finalLabel === "WATCHLIST")
    ?? candidates.find((candidate) => candidate.discoveryBasket === "established")
    ?? candidates[0]
    ?? null;
  const verificationCandidate =
    candidates.find((candidate) => candidate.id === verificationCandidateId)
    ?? selectedCandidate;
  const sourceHealth = useMemo(
    () => resolveProductSourceHealth({ metadata, readiness, sourceIds }),
    [metadata, readiness, sourceIds],
  );

  const loadData = useCallback((): Promise<void> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const refresh = (async () => {
      setLoading(true);
      setReasonCode(null);
      setReadinessReasonCode(null);
      setUnavailableMessage(null);

      const [scannerResult, readinessResult, automationResult] = await Promise.all([
        loadScannerApiDataSourceResult({ runtimeMode }),
        loadScannerReadinessResult({ runtimeMode }),
        loadAutomationStatus(),
      ]);
      setAutomationStatus(automationResult);

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
        setFreshnessStatus(null);
        setSourceIds([]);
        setMetadata(null);
        setReasonCode(scannerResult.reasonCode);
        setUnavailableMessage(scannerResult.error);
        return;
      }

      const output = scannerResult.output;
      const acceptedTimestamps = getAcceptedProductRefreshTimestamps(output, new Date().toISOString());
      setCandidates(mapPersistableScannerOutputToUiCandidates(output));
      setResolvedSource(scannerResult.resolvedSource);
      setRunId(output.scan_run.run_id ?? null);
      setGeneratedAt(acceptedTimestamps.generatedAt);
      setViewRefreshedAt(acceptedTimestamps.viewRefreshedAt);
      setAgeSeconds(output._source_meta?.age_seconds ?? null);
      setFreshnessStatus(output._source_meta?.freshness_status ?? null);
      setSourceIds(output._source_meta?.source_ids ?? output.provenance?.source_ids ?? []);
      setMetadata(output.provenance?.metadata ?? null);
    })().finally(() => {
      setLoading(false);
      refreshPromiseRef.current = null;
    });

    refreshPromiseRef.current = refresh;
    return refresh;
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
    const copy = sectionCopy[activeSection];
    if (loading && candidates.length === 0) {
      return (
        <ProductWorkspaceSection {...copy}>
          <div className="product-loading" role="status">{t("app.loading")}</div>
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
            freshnessStatus={freshnessStatus}
            sourceIds={sourceIds}
            sourceHealth={sourceHealth}
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
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={navigate}
      loading={loading}
      runtimeMode={runtimeMode}
      resolvedSource={resolvedSource}
      runId={runId}
      generatedAt={generatedAt}
      ageSeconds={ageSeconds}
      freshnessStatus={freshnessStatus}
      viewRefreshedAt={viewRefreshedAt}
      sourceIds={sourceIds}
      sourceHealth={sourceHealth}
      readiness={readiness}
      readinessReasonCode={readinessReasonCode}
      dataUnavailableMessage={unavailableMessage}
      dataUnavailableReasonCode={reasonCode}
      onRefresh={() => void loadData()}
      automationStatus={automationStatus}
    >
      {renderSection()}
    </ProductWorkspaceShell>
  );
}

function resolveSection(): ProductSectionId {
  if (typeof window === "undefined") return "candidate-results";
  return HASH_TO_SECTION[window.location.hash.trim().toLowerCase()] ?? "candidate-results";
}

export function resolveScannerSnapshotTimestamp(output: ScannerApiOutput): string | null {
  return output.provenance?.generated_at ?? output.scan_run.finished_at ?? null;
}

export function getAcceptedProductRefreshTimestamps(
  output: ScannerApiOutput,
  viewRefreshedAt: string,
): { generatedAt: string | null; viewRefreshedAt: string } {
  return {
    generatedAt: resolveScannerSnapshotTimestamp(output),
    viewRefreshedAt,
  };
}
