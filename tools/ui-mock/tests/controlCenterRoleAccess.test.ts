import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessOperationalControlCenter,
  getProductNavItemsForRole,
  resolveProductSectionForRole,
} from "../src/ProductApp.js";
import type { ProductNavItem } from "../src/components/ProductWorkspaceShell.js";

const navItems: ProductNavItem[] = [
  { id: "candidate-results", label: "Radar", icon: "R", description: "Product Radar" },
  { id: "candidate-detail", label: "Szczegóły", icon: "D", description: "Candidate detail" },
  { id: "external-checks", label: "Weryfikacja", icon: "V", description: "Source verification" },
  { id: "live-signals", label: "Live Signals", icon: "L", description: "AXI feed" },
  { id: "kraken-copy", label: "Kraken Copy", icon: "K", description: "Account readiness" },
  { id: "methodology", label: "Metodologia", icon: "M", description: "Rules and limitations" },
  { id: "control-center", label: "Centrum sterowania", icon: "C", description: "Operational status" },
];

describe("Control Center role boundary", () => {
  it("keeps the operational navigation item out of CAMP_USER and TRUSTED_TESTER sidebars", () => {
    for (const role of ["CAMP_USER", "TRUSTED_TESTER"] as const) {
      assert.equal(canAccessOperationalControlCenter(role), false);
      assert.deepEqual(getProductNavItemsForRole(navItems, role).map((item) => item.id), ["candidate-results", "candidate-detail", "external-checks"]);
    }
  });

  it("preserves admin-only Trading and Control Center navigation for OWNER and ADMIN", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      assert.equal(canAccessOperationalControlCenter(role), true);
      assert.deepEqual(getProductNavItemsForRole(navItems, role).map((item) => item.id), ["candidate-results", "candidate-detail", "external-checks", "live-signals", "kraken-copy", "methodology", "control-center"]);
    }
  });

  it("redirects non-admin direct Trading and Control Center routes to Radar", () => {
    for (const role of ["CAMP_USER", "TRUSTED_TESTER"] as const) {
      assert.equal(resolveProductSectionForRole("control-center", role), "candidate-results");
      assert.equal(resolveProductSectionForRole("live-signals", role), "candidate-results");
      assert.equal(resolveProductSectionForRole("kraken-copy", role), "candidate-results");
    }
    for (const role of ["OWNER", "ADMIN"] as const) {
      assert.equal(resolveProductSectionForRole("control-center", role), "control-center");
      assert.equal(resolveProductSectionForRole("live-signals", role), "live-signals");
      assert.equal(resolveProductSectionForRole("kraken-copy", role), "kraken-copy");
    }
  });

  it("hides Methodology only from CAMP navigation while retaining its route", () => {
    assert.equal(resolveProductSectionForRole("methodology", "CAMP_USER"), "methodology");
    assert.ok(getProductNavItemsForRole(navItems, "OWNER").some((item) => item.id === "methodology"));
  });
});
