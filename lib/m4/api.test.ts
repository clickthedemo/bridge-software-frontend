import assert from "node:assert/strict";
import test from "node:test";
import { M4ApiError, m4Api, mapAdminAccountChoice, validateAccountSettings } from "./api.ts";

test("administrator choices map to the backend account fields", () => {
  assert.deepEqual(mapAdminAccountChoice("standard"), { accountType: "standard", platformRole: null });
  assert.deepEqual(mapAdminAccountChoice("sales_rep"), { accountType: "sales_rep", platformRole: null });
  assert.deepEqual(mapAdminAccountChoice("admin"), { accountType: "standard", platformRole: "admin" });
});

test("account settings trim changes, clear with null, and reject no-op or oversized input", () => {
  assert.deepEqual(validateAccountSettings(" Updated ", "", { displayName: "Before", phone: "123" }), { displayName: "Updated", phone: null });
  assert.throws(() => validateAccountSettings("Before", "123", { displayName: "Before", phone: "123" }), /Change at least one/);
  assert.throws(() => validateAccountSettings("x".repeat(101), "", { displayName: null, phone: null }), /100 characters/);
});

test("API calls use the configured base, cookies, exact admin queue pagination, and machine errors", { concurrency: false }, async () => {
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test/";
  const original = globalThis.fetch; const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => { calls.push({ url: String(input), init }); return new Response(JSON.stringify({ profiles: [], pageInfo: { limit: 20, offset: 0, hasMore: false } }), { status: 200, headers: { "content-type": "application/json" } }); };
  try { const page = await m4Api.listAdminProfiles({ status: "pending_review", limit: 20, offset: 0 }); assert.equal(calls[0]?.url, "https://api.example.test/api/v1/admin/directory-profiles?limit=20&offset=0&status=pending_review"); assert.equal(calls[0]?.init?.credentials, "include"); assert.deepEqual(page.pageInfo, { limit: 20, offset: 0, hasMore: false });
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "ADMIN_USER_ALREADY_EXISTS", message: "Already exists." }), { status: 409, headers: { "content-type": "application/json" } });
    await assert.rejects(m4Api.inviteAdminUser({ email: " Test@Example.com ", displayName: " Test ", choice: "admin" }), (error) => error instanceof M4ApiError && error.code === "ADMIN_USER_ALREADY_EXISTS" && error.status === 409);
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; }
});
