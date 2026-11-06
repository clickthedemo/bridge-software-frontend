import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProfileLinks, profileEditorPermissions, resolveOrganizationId } from "./profile-editor.ts";

test("asynchronous memberships resolve the same organization for reads and actions", () => {
  assert.equal(resolveOrganizationId("", []), "");
  assert.equal(resolveOrganizationId("", [{ organizationId: "first" }]), "first");
  assert.equal(resolveOrganizationId("removed", [{ organizationId: "remaining" }]), "remaining");
  assert.equal(resolveOrganizationId("second", [{ organizationId: "first" }, { organizationId: "second" }]), "second");
});

test("page managers edit approved content but cannot create, reassign or submit", () => {
  const approved = { status: "approved" as const, hasPublishedVersion: true };
  assert.deepEqual(profileEditorPermissions("page_manager", approved), { editable: true, managesBusiness: false, canReassignBusiness: false, canSubmit: false });
  assert.equal(profileEditorPermissions("page_manager", null).editable, false);
  assert.equal(profileEditorPermissions("page_manager", { status: "draft" }).canSubmit, false);
  assert.equal(profileEditorPermissions("member", approved).editable, false);
  assert.equal(profileEditorPermissions("reviewer", approved).editable, false);
  assert.equal(profileEditorPermissions("owner", { status: "suspended" }).editable, false);
});

test("published revisions retain the business association and require a saved draft before submission", () => {
  for (const role of ["owner", "admin"]) {
    assert.equal(profileEditorPermissions(role, { status: "approved", hasPublishedVersion: true }).editable, true);
    assert.equal(profileEditorPermissions(role, { status: "pending_review" }).editable, true);
    assert.equal(profileEditorPermissions(role, { status: "approved", hasPublishedVersion: true }).canReassignBusiness, false);
    assert.equal(profileEditorPermissions(role, { status: "approved" }).canSubmit, false);
    assert.equal(profileEditorPermissions(role, { status: "draft", hasPublishedVersion: true }).canSubmit, true);
    assert.equal(profileEditorPermissions(role, null).editable, true);
  }
});

test("saving preserves multiple websites, menu/product links, order and caller data", () => {
  const links = [
    { type: "website" as const, label: " Main ", url: " https://example.test ", sortOrder: 5 },
    { type: "website" as const, label: "Wholesale", url: "https://wholesale.example.test", sortOrder: 8 },
    { type: "menu" as const, label: "Menu", url: "https://example.test/menu", sortOrder: 9 },
    { type: "product" as const, label: "Catalog", url: "https://example.test/catalog", sortOrder: 10 },
  ];
  const saved = normalizeProfileLinks(links);
  assert.equal(saved.length, 4);
  assert.deepEqual(saved.map((link) => link.type), ["website", "website", "menu", "product"]);
  assert.deepEqual(saved.map((link) => link.sortOrder), [0, 1, 2, 3]);
  assert.equal(saved[0].label, "Main");
  assert.equal(saved[0].url, "https://example.test");
  assert.equal(links[0].sortOrder, 5);
  assert.equal(links[0].label, " Main ");
  assert.throws(() => normalizeProfileLinks([{ ...links[0], url: "javascript:alert(1)" }]), /HTTP or HTTPS/);
  assert.throws(() => normalizeProfileLinks(Array.from({ length: 21 }, () => links[0])), /20 links/);
});
