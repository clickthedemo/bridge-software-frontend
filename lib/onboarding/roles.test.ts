import assert from "node:assert/strict";
import test from "node:test";
import { accountPathForRole, joinRoles, parseMemberRole } from "./roles.ts";
import { hasCompletedOnboarding } from "./access.ts";

test("the approved onboarding list contains 12 unique roles", () => {
  assert.equal(joinRoles.length, 12);
  assert.equal(new Set(joinRoles.map((role) => role.name)).size, 12);
});

test("role parsing accepts only an approved role", () => {
  assert.equal(parseMemberRole("Dispensary"), "Dispensary");
  assert.equal(parseMemberRole("admin"), null);
  assert.equal(parseMemberRole(null), null);
});

test("the account path safely encodes the selected role", () => {
  assert.equal(accountPathForRole("Sales rep"), "/join/account?role=Sales%20rep");
});

test("Milestone 4 keeps all approved roles but flags only implemented onboarding", () => {
  assert.deepEqual(joinRoles.filter((role) => role.milestone4Supported).map((role) => role.name), ["Brand", "Dispensary", "Retailer"]);
});

test("join remains available when signed out or onboarding is genuinely incomplete", () => {
  assert.equal(hasCompletedOnboarding(null, []), false);
  assert.equal(hasCompletedOnboarding({ profile: null } as never, []), false);
  assert.equal(hasCompletedOnboarding({ profile: { displayName: "Owner", phone: null } } as never, []), false);
});

test("completed profiles with an active membership leave account onboarding", () => {
  const user = { profile: { displayName: "Owner", phone: null } } as never;
  assert.equal(hasCompletedOnboarding(user, [{ status: "active" } as never]), true);
  assert.equal(hasCompletedOnboarding(user, [{ status: "invited" } as never]), false);
});
