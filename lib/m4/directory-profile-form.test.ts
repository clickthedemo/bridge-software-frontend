import assert from "node:assert/strict";
import test from "node:test";
import { canManageDirectoryProfile, directoryProfileBusinessType, normalizeEin } from "./directory-profile-form.ts";
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

test("saving the website field preserves every other profile link", async () => {
  const { withPrimaryWebsite } = await import("./directory-profile-form.ts");
  const links = [
    { type: "website" as const, label: "Main", url: "https://a.example", sortOrder: 0 },
    { type: "menu" as const, label: "Menu", url: "https://a.example/menu", sortOrder: 1 },
    { type: "website" as const, label: "Shop", url: "https://shop.example", sortOrder: 2 },
  ];
  const updated = withPrimaryWebsite(links, " https://b.example ");
  assert.deepEqual(updated.map((link) => link.url), ["https://b.example", "https://a.example/menu", "https://shop.example"]);
  assert.equal(updated[0].label, "Main");
  assert.deepEqual(withPrimaryWebsite(links, "").map((link) => [link.url, link.sortOrder]), [["https://a.example/menu", 0], ["https://shop.example", 1]]);
  assert.deepEqual(withPrimaryWebsite([], "https://c.example").map((link) => link.url), ["https://c.example"]);
});

test("EIN intake accepts the two IRS formats and nothing else", () => {
  assert.equal(normalizeEin(" 12-3456789 "), "123456789");
  assert.equal(normalizeEin("123456789"), "123456789");
  for (const bad of ["", "12-345678", "1234567890", "12 3456789", "ab-cdefghi", "123-456789"]) assert.throws(() => normalizeEin(bad), /9-digit EIN/);
});
