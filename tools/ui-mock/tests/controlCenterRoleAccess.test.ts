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
  { id: "control-center", label: "Centrum sterowania", icon: "C", description: "Operational status" },
];

describe("Control Center role boundary", () => {
  it("keeps the operational navigation item out of CAMP_USER and TRUSTED_TESTER sidebars", () => {
    for (const role of ["CAMP_USER", "TRUSTED_TESTER"] as const) {
      assert.equal(canAccessOperationalControlCenter(role), false);
      assert.deepEqual(getProductNavItemsForRole(navItems, role).map((item) => item.id), ["candidate-results"]);
    }
  });

  it("preserves the Control Center navigation item for OWNER and ADMIN", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      assert.equal(canAccessOperationalControlCenter(role), true);
      assert.deepEqual(getProductNavItemsForRole(navItems, role).map((item) => item.id), ["candidate-results", "control-center"]);
    }
  });

  it("redirects a resolved CAMP or trusted direct Control Center route to Radar", () => {
    for (const role of ["CAMP_USER", "TRUSTED_TESTER"] as const) {
      assert.equal(resolveProductSectionForRole("control-center", role), "candidate-results");
    }
    assert.equal(resolveProductSectionForRole("control-center", "OWNER"), "control-center");
    assert.equal(resolveProductSectionForRole("control-center", "ADMIN"), "control-center");
  });
});
