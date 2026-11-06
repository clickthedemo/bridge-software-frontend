import assert from "node:assert/strict";
import test from "node:test";
import { M4ApiError, m4Api, findAdminProfile, mapAdminAccountChoice, validateAccountSettings } from "./api.ts";

test("submission readiness rejects absent or malformed success payloads", { concurrency: false }, async () => {
  const original = globalThis.fetch;
  const previousBase = process.env.NEXT_PUBLIC_BRIDGE_API_BASE;
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  try {
    for (const payload of [null, {}, [], { ready: "true", missingFields: [] }, { ready: true }, { ready: true, missingFields: [null] }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
      await assert.rejects(() => m4Api.getProfileSubmissionReadiness("org-a"),
        (error) => error instanceof M4ApiError && error.status === 502 && error.code === "INVALID_RESPONSE");
    }
    globalThis.fetch = async () => new Response(null, { status: 204 });
    await assert.rejects(() => m4Api.getProfileSubmissionReadiness("org-a"), M4ApiError);
  } finally {
    globalThis.fetch = original;
    if (previousBase === undefined) delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE;
    else process.env.NEXT_PUBLIC_BRIDGE_API_BASE = previousBase;
  }
});

test("onboarding requests preserve organization scope, private payloads and cookie credentials", { concurrency: false }, async () => {
  const original = globalThis.fetch;
  const previousBase = process.env.NEXT_PUBLIC_BRIDGE_API_BASE;
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  const calls: Array<{ path: string; method: string; credentials: RequestCredentials | undefined; body: unknown }> = [];
  let readiness = { ready: false, missingFields: ["ein_verification"] };
  globalThis.fetch = async (input, init) => {
    calls.push({ path: new URL(String(input)).pathname, method: init?.method ?? "GET", credentials: init?.credentials, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(readiness), { headers: { "content-type": "application/json" } });
  };
  try {
    await m4Api.putBusinessEin("org/a", "business/b", "123456789");
    await m4Api.putBusinessContact("org/a", "business/b", { email: " Ops@Example.test ", phone: " 555-010-2000 " });
    const address = { addressLine1: "1 Example Way", addressLine2: null, city: "Pittsburgh", state: "PA", postalCode: "15222", country: "US" };
    await m4Api.putPrimaryLocation("org/a", address);
    assert.deepEqual(await m4Api.getProfileSubmissionReadiness("org/a"), readiness);
    readiness = { ready: false, missingFields: [] };
    assert.deepEqual(await m4Api.getProfileSubmissionReadiness("org/a"), readiness);
    readiness = { ready: true, missingFields: [] };
    assert.deepEqual(await m4Api.getProfileSubmissionReadiness("org/a"), readiness);
    const base = "/api/v1/organizations/org%2Fa";
    assert.deepEqual(calls, [
      { path: `${base}/businesses/business%2Fb/ein`, method: "PUT", credentials: "include", body: { ein: "123456789" } },
      { path: `${base}/businesses/business%2Fb/contact`, method: "PUT", credentials: "include", body: { email: "ops@example.test", phone: "555-010-2000" } },
      { path: `${base}/primary-location`, method: "PUT", credentials: "include", body: address },
      ...Array.from({ length: 3 }, () => ({ path: `${base}/directory-profile/submission-readiness`, method: "GET", credentials: "include", body: null })),
    ]);
  } finally {
    globalThis.fetch = original;
    if (previousBase === undefined) delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE;
    else process.env.NEXT_PUBLIC_BRIDGE_API_BASE = previousBase;
  }
});

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

test("organization member management uses tenant-scoped credentialed routes", { concurrency: false }, async () => {
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  const original = globalThis.fetch; const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => { calls.push({ url: String(input), init }); const method = init?.method ?? "GET"; return new Response(method === "DELETE" ? null : JSON.stringify(method === "POST" ? { member: {}, invitationSent: false } : { members: [] }), { status: method === "DELETE" ? 204 : 200, headers: { "content-type": "application/json" } }); };
  try {
    const organizationId = "33673a42-3cde-4a54-83d4-fe1e686ee69b", membershipId = "11111111-1111-4111-8111-111111111111";
    await m4Api.listOrganizationMembers(organizationId);
    await m4Api.assignOrganizationMember(organizationId, { email: " Person@Example.com ", role: "page_manager" });
    await m4Api.removeOrganizationMember(organizationId, membershipId);
    assert.deepEqual(calls.map((call) => [call.url, call.init?.method ?? "GET", call.init?.credentials]), [
      [`https://api.example.test/api/v1/organizations/${organizationId}/members`, "GET", "include"],
      [`https://api.example.test/api/v1/organizations/${organizationId}/members`, "POST", "include"],
      [`https://api.example.test/api/v1/organizations/${organizationId}/members/${membershipId}`, "DELETE", "include"],
    ]);
    assert.equal(JSON.parse(String(calls[1]?.init?.body)).email, "person@example.com");
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; }
});

test("membership invitations require the authenticated invitee acceptance route", { concurrency: false }, async () => {
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  const original = globalThis.fetch; const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => { calls.push({ url: String(input), init }); return new Response(JSON.stringify((init?.method ?? "GET") === "POST" ? { membership: { status: "active" } } : { invitations: [] }), { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const membershipId = "11111111-1111-4111-8111-111111111111";
    await m4Api.listMyOrganizationInvitations();
    await m4Api.acceptOrganizationInvitation(membershipId);
    assert.deepEqual(calls.map((call) => [call.url, call.init?.method ?? "GET"]), [
      ["https://api.example.test/api/v1/organization-invitations", "GET"],
      [`https://api.example.test/api/v1/organization-invitations/${membershipId}/accept`, "POST"]
    ]);
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; }
});

test("assigned contact notification details use record-scoped recipient routes", { concurrency: false }, async () => {
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  const original = globalThis.fetch; const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => { calls.push({ url: String(input), init }); return new Response(JSON.stringify({ request: { id: "11111111-1111-4111-8111-111111111111", status: "viewed", createdAt: "2026-10-21T00:00:00Z" } }), { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const requestId = "11111111-1111-4111-8111-111111111111";
    await m4Api.inboundContactRequest(requestId);
    await m4Api.updateAssignedContactStatus(requestId, "viewed");
    assert.deepEqual(calls.map((call) => [call.url, call.init?.method ?? "GET"]), [
      [`https://api.example.test/api/v1/contact-requests/${requestId}`, "GET"],
      [`https://api.example.test/api/v1/contact-requests/${requestId}/status`, "POST"]
    ]);
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; }
});

test("private contact and primary address reload through protected organization routes", { concurrency: false }, async () => {
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  const original = globalThis.fetch; const calls: string[] = [];
  const organizationId = "33673a42-3cde-4a54-83d4-fe1e686ee69b", businessId = "11111111-1111-4111-8111-111111111111";
  globalThis.fetch = async (input) => {
    const url = String(input); calls.push(url);
    const payload = url.endsWith("/contact")
      ? { contact: { businessId, email: "private@example.test", phone: "555-0100", updatedAt: "2026-10-21T10:00:00Z" } }
      : { location: { id: "22222222-2222-4222-8222-222222222222", organizationId, addressLine1: "1 Bridge Way", addressLine2: null, city: "Portland", state: "OR", postalCode: "97201", country: "US", updatedAt: "2026-10-21T10:00:00Z" } };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const [contact, location] = await Promise.all([m4Api.getBusinessContact(organizationId, businessId), m4Api.getPrimaryLocation(organizationId)]);
    assert.equal(contact?.contact.email, "private@example.test");
    assert.equal(contact?.contact.phone, "555-0100");
    assert.equal(location?.location?.addressLine1, "1 Bridge Way");
    assert.deepEqual(calls, [
      `https://api.example.test/api/v1/organizations/${organizationId}/businesses/${businessId}/contact`,
      `https://api.example.test/api/v1/organizations/${organizationId}/primary-location`
    ]);
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; }
});

test("contact requests preserve subject and retry idempotency", { concurrency: false }, async () => {
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  const original = globalThis.fetch; let body = "";
  globalThis.fetch = async (_input, init) => { body = String(init?.body); return new Response(JSON.stringify({ request: { id: "11111111-1111-4111-8111-111111111111", status: "new", createdAt: "2026-10-13T00:00:00Z" } }), { status: 201, headers: { "content-type": "application/json" } }); };
  try {
    await m4Api.createContactRequest("target", { idempotencyKey: "22222222-2222-4222-8222-222222222222", firstName: "A", workEmail: "a@example.com", phoneNumber: "+1 555 555 5555", yearsOfService: 2, contactPreference: "email", subject: "Inventory", message: "Hello" });
    assert.deepEqual(JSON.parse(body), { idempotencyKey: "22222222-2222-4222-8222-222222222222", firstName: "A", workEmail: "a@example.com", phoneNumber: "+1 555 555 5555", yearsOfService: 2, contactPreference: "email", subject: "Inventory", message: "Hello" });
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; }
});


test("admin notification lookup returns the rendered page containing records beyond index 20", { concurrency: false }, async () => {
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  const original = globalThis.fetch;
  const rows = Array.from({ length: 80 }, (_, index) => ({ id: `profile-${index}`, status: "pending_review", workingProfile: { displayName: `Business ${index}` } }));
  globalThis.fetch = async (input) => {
    const url = new URL(String(input)), limit = Number(url.searchParams.get("limit")), offset = Number(url.searchParams.get("offset"));
    const profiles = url.searchParams.get("status") === "pending_review" ? rows.slice(offset, offset + limit) : [];
    return new Response(JSON.stringify({ profiles, pageInfo: { limit, offset, hasMore: offset + limit < rows.length } }), { headers: { "content-type": "application/json" } });
  };
  try {
    for (const index of [25, 75]) {
      const located = await findAdminProfile(`profile-${index}`);
      assert.ok(located);
      const rendered = await m4Api.listAdminProfiles({ status: located.status, limit: 20, offset: located.offset });
      assert.ok(rendered.items.some((item) => item.id === `profile-${index}`));
    }
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; }
});


test("contact routing uses scoped candidates and existing GET/PUT without leaking roster fields", { concurrency: false }, async () => {
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const salesRepresentative = { membershipId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", displayName: "Synthetic rep" };
  const bridgeAdmin = { userId: "33333333-3333-4333-8333-333333333333", displayName: "Assigned admin" };
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    return new Response(JSON.stringify(url.endsWith("/candidates")
      ? { candidates: { salesRepresentatives: [{ ...salesRepresentative, email: "private@example.test" }], bridgeAdmin, globalAdmins: [bridgeAdmin] } }
      : { routing: { salesRepresentative, bridgeAdmin } }), { headers: { "content-type": "application/json" } });
  };
  try {
    const base = "https://api.example.test/api/v1/organizations/org-a/directory-profile/contact-routing";
    assert.deepEqual(await m4Api.contactRoutingCandidates("org-a"), { salesRepresentatives: [salesRepresentative], bridgeAdmin });
    assert.deepEqual(await m4Api.getContactRouting("org-a"), { salesRepresentative, bridgeAdmin });
    await m4Api.updateContactRouting("org-a", { salesRepresentativeMembershipId: null, bridgeAdminUserId: null });
    assert.deepEqual(calls.map((call) => [call.url, call.init?.method ?? "GET", call.init?.credentials]), [[base + "/candidates", "GET", "include"], [base, "GET", "include"], [base, "PUT", "include"]]);
    assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { salesRepresentativeMembershipId: null, bridgeAdminUserId: null });
    for (const status of [400, 403, 404, 503]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error: "ROUTING_FAILED", message: "Retry routing." }), { status });
      await assert.rejects(() => m4Api.contactRoutingCandidates("org-a"), (error) => error instanceof M4ApiError && error.status === status);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ candidates: { salesRepresentatives: [{}], bridgeAdmin: null } }));
    await assert.rejects(() => m4Api.contactRoutingCandidates("org-a"), (error) => error instanceof M4ApiError && error.status === 502);
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; }
});

test("EIN status rejects malformed or cross-business responses rather than implying verification", { concurrency: false }, async () => {
  const original = globalThis.fetch, previous = process.env.NEXT_PUBLIC_BRIDGE_API_BASE;
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  try {
    for (const payload of [null, {}, { businessId: "another", einLastFour: "6789", status: "verified", reviewNote: null }, { businessId: "business", einLastFour: "6789", status: "unknown", reviewNote: null }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
      await assert.rejects(() => m4Api.getBusinessEinStatus("org", "business"), M4ApiError);
    }
  } finally { globalThis.fetch = original; if (previous === undefined) delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; else process.env.NEXT_PUBLIC_BRIDGE_API_BASE = previous; }
});

test("profile action context rejects malformed ownership responses", { concurrency: false }, async () => {
  const original = globalThis.fetch, previous = process.env.NEXT_PUBLIC_BRIDGE_API_BASE;
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  try {
    for (const payload of [null, {}, { ownOrganization: "false" }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
      await assert.rejects(() => m4Api.getPublicProfileActionContext("evergreen"), M4ApiError);
    }
    for (const ownOrganization of [true, false]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ ownOrganization }), { headers: { "content-type": "application/json" } });
      assert.deepEqual(await m4Api.getPublicProfileActionContext("evergreen"), { ownOrganization });
    }
  } finally { globalThis.fetch = original; if (previous === undefined) delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; else process.env.NEXT_PUBLIC_BRIDGE_API_BASE = previous; }
});
