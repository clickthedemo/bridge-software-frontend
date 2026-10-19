import assert from "node:assert/strict";
import test from "node:test";
import { canManageDirectoryProfile, directoryProfileBusinessType } from "./directory-profile-form.ts";
import type { OrganizationMembership } from "@/lib/phase3";

const membership = (role: OrganizationMembership["role"], status: OrganizationMembership["status"] = "active"): OrganizationMembership => ({
  organizationId: "33673a42-3cde-4a54-83d4-fe1e686ee69b",
  organizationName: "Example",
  organizationType: "retailer",
  role,
  status,
});

test("owner, admin, and page manager can open the Directory profile editor", () => {
  for (const role of ["owner", "admin", "page_manager"] as const) {
    assert.equal(canManageDirectoryProfile(membership(role)), true);
  }
  for (const role of ["reviewer", "member"] as const) {
    assert.equal(canManageDirectoryProfile(membership(role)), false);
  }
  assert.equal(canManageDirectoryProfile(membership("page_manager", "suspended")), false);
});

test("the profile business type comes from the organization membership", () => {
  assert.equal(directoryProfileBusinessType(membership("owner")), "retailer");
  assert.equal(directoryProfileBusinessType(undefined), "brand");
});
