import { createHash } from "node:crypto";
import {
  getDefaultEstablishedUniverseStorePath,
  normalizeEstablishedAddress,
  normalizeEstablishedChain,
  universeIdentityKey,
} from "./establishedAddressUniverse.js";
import { readEstablishedUniverseStore } from "./establishedUniverseManager.js";
import { getDefaultFollowUpStorePath, readFollowUpStore } from "./followUpBasket.js";
import {
  SYSTEM_LIFECYCLE_POLICY_VERSION,
  getDefaultLifecycleAuditStorePath,
  getDefaultNewInboxStorePath,
  readLifecycleAuditStore,
  readNewInboxStore,
} from "./systemLifecycle.js";
import type { PersistableScannerOutput } from "./persistableScannerModel.js";

export const LIFECYCLE_MIGRATION_PREVIEW_VERSION = "pc1_lifecycle_migration_preview_v1";

export type LifecycleMigrationPreview = {
  schema_version: typeof LIFECYCLE_MIGRATION_PREVIEW_VERSION;
  policy_version: typeof SYSTEM_LIFECYCLE_POLICY_VERSION;
  preview_id: string;
  mode: "PREVIEW_ONLY";
  canonical_mutations: 0;
  before: {
    new_inbox_entries: number;
    follow_up_entries: number;
    main_radar_entries: number;
    lifecycle_audit_entries: number;
  };
  proposed: {
    new_inbox_candidates_from_snapshot: number;
    new_inbox_new_identities: number;
    already_follow_up_or_main: number;
    duplicate_snapshot_identities: string[];
  };
  expected_store_versions: {
    new_inbox_store_version: number;
    follow_up_checksum: string;
    established_universe_version: string;
    lifecycle_audit_checksum: string;
  };
  rollback_plan: {
    required_before_apply: "STAB2_BACKUP";
    apply_target: "ISOLATED_COPY_FIRST";
    canonical_apply_in_this_pr: false;
  };
};

/**
 * Computes the PC.1 migration plan from read-only inputs. It deliberately has
 * no apply mode: canonical application remains gated behind a STAB.2 backup.
 */
export async function previewLifecycleMigration(options: {
  snapshot?: Pick<PersistableScannerOutput, "candidates" | "scan_run">;
  followUpStorePath?: string;
  establishedStorePath?: string;
  newInboxStorePath?: string;
  auditStorePath?: string;
} = {}): Promise<LifecycleMigrationPreview> {
  const [inbox, followUp, established, audit] = await Promise.all([
    readNewInboxStore(options.newInboxStorePath ?? getDefaultNewInboxStorePath()),
    readFollowUpStore(options.followUpStorePath ?? getDefaultFollowUpStorePath()),
    readEstablishedUniverseStore(options.establishedStorePath ?? getDefaultEstablishedUniverseStorePath()),
    readLifecycleAuditStore(options.auditStorePath ?? getDefaultLifecycleAuditStorePath()),
  ]);
  const existingInbox = new Set(inbox.entries.map((entry) => entry.identity));
  const followUpIdentities = new Set(followUp.entries.map((entry) => universeIdentityKey(entry.chain, entry.contract_address)));
  const mainIdentities = new Set(established.current.entries.filter((entry) => entry.enabled).map((entry) => universeIdentityKey(entry.chain, entry.contract_address)));
  const observed = new Set<string>();
  const duplicates = new Set<string>();
  let snapshotCandidates = 0;
  let alreadyLayered = 0;
  for (const candidate of options.snapshot?.candidates ?? []) {
    if (candidate.discovery_basket !== "new_emerging" || candidate.contract_address === null) continue;
    const identity = safelyNormalize(candidate.chain, candidate.contract_address);
    if (!identity) continue;
    snapshotCandidates += 1;
    if (observed.has(identity)) duplicates.add(identity);
    observed.add(identity);
    if (followUpIdentities.has(identity) || mainIdentities.has(identity)) alreadyLayered += 1;
  }
  const proposedNew = [...observed].filter((identity) => !existingInbox.has(identity) && !followUpIdentities.has(identity) && !mainIdentities.has(identity));
  const expectedInboxVersion = inbox.store_version + (proposedNew.length > 0 ? 1 : 0);
  const previewBasis = JSON.stringify({
    inbox_checksum: inbox.checksum,
    follow_up_checksum: followUp.checksum,
    established_version: established.current.universe_version,
    audit_checksum: audit.checksum,
    scan_run_id: options.snapshot?.scan_run.run_id ?? null,
    observed: [...observed].sort(),
  });
  return {
    schema_version: LIFECYCLE_MIGRATION_PREVIEW_VERSION,
    policy_version: SYSTEM_LIFECYCLE_POLICY_VERSION,
    preview_id: `pc1_preview_${createHash("sha256").update(previewBasis, "utf8").digest("hex").slice(0, 24)}`,
    mode: "PREVIEW_ONLY",
    canonical_mutations: 0,
    before: {
      new_inbox_entries: inbox.entries.length,
      follow_up_entries: followUp.entries.length,
      main_radar_entries: mainIdentities.size,
      lifecycle_audit_entries: audit.entries.length,
    },
    proposed: {
      new_inbox_candidates_from_snapshot: snapshotCandidates,
      new_inbox_new_identities: proposedNew.length,
      already_follow_up_or_main: alreadyLayered,
      duplicate_snapshot_identities: [...duplicates].sort(),
    },
    expected_store_versions: {
      new_inbox_store_version: expectedInboxVersion,
      follow_up_checksum: followUp.checksum,
      established_universe_version: established.current.universe_version,
      lifecycle_audit_checksum: audit.checksum,
    },
    rollback_plan: {
      required_before_apply: "STAB2_BACKUP",
      apply_target: "ISOLATED_COPY_FIRST",
      canonical_apply_in_this_pr: false,
    },
  };
}

function safelyNormalize(chain: string, address: string): string | null {
  try {
    const normalizedChain = normalizeEstablishedChain(chain);
    return universeIdentityKey(normalizedChain, normalizeEstablishedAddress(normalizedChain, address));
  } catch { return null; }
}
