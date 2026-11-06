import assert from "node:assert/strict";
import test from "node:test";
import { HttpPhase3Client } from "./http-client.ts";
import { MockPhase3Client } from "./mock-client.ts";
import { canEditOrganization, organizationTypeForRole, parseOrganizationResponse, parseOrganizationsResponse, validateOrganizationInput } from "./organizations.ts";
import { Phase3Error, type OrganizationInput, type OrganizationRecord } from "./types.ts";

const id = "a56a9b82-9930-4b4d-96be-d32c82bc23da";
const organization: OrganizationRecord = { id, name: "Example", organizationType: "brand", membership: { role: "owner", status: "active" } };

test("organization client uses exact backend endpoints, payloads, envelopes and cookies", async () => {
  const original = globalThis.fetch;
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json(requests.length === 1 ? { organizations: [organization] } : { organization });
  };
  try {
    const client = new HttpPhase3Client("https://backend.example/");
    assert.deepEqual(await client.listOrganizations(), { organizations: [organization] });
    assert.deepEqual(await client.getOrganization(id), { organization });
    assert.deepEqual(await client.createOrganization({ name: " Example ", organizationType: "brand" }), { organization });
    assert.deepEqual(await client.updateOrganization(id, { name: "Updated" }), { organization });
    assert.deepEqual(requests.map(({ url }) => url), ["https://backend.example/api/v1/organizations", `https://backend.example/api/v1/organizations/${id}`, "https://backend.example/api/v1/organizations", `https://backend.example/api/v1/organizations/${id}`]);
    assert.equal(requests[2].init?.method, "POST");
    assert.equal(requests[2].init?.body, JSON.stringify({ name: "Example", organizationType: "brand" }));
    assert.equal(requests[3].init?.method, "PATCH");
    assert.equal(requests[3].init?.body, JSON.stringify({ name: "Updated" }));
    for (const { init } of requests) { assert.equal(init?.credentials, "include"); assert.equal(new Headers(init?.headers).get("Authorization"), null); }
    assert.throws(() => client.getOrganization("../other"), Phase3Error);
    assert.throws(() => client.createOrganization({ name: "", organizationType: "brand" }), Phase3Error);
    assert.equal(requests.length, 4);
  } finally { globalThis.fetch = original; }
});

test("organization validation rejects invalid fields and unsupported roles without mapping", () => {
  for (const input of [{ name: " ", organizationType: "brand" }, { name: "x".repeat(201), organizationType: "brand" }, { name: "X", organizationType: "sales_rep" }, { name: "X", organizationType: "retailer", ein: "unwanted" }, null]) assert.throws(() => validateOrganizationInput(input as OrganizationInput), Phase3Error);
  assert.throws(() => validateOrganizationInput({}, true), Phase3Error);
  assert.deepEqual(validateOrganizationInput({ organizationType: "dispensary" }, true), { organizationType: "dispensary" });
  assert.equal(organizationTypeForRole("Brand"), "brand");
  for (const role of ["Sales rep", "Cultivator", "Manufacturer", "Lab", "Transport", "Bank", "Service", "Media", "Hydroponics", "unknown"]) assert.equal(organizationTypeForRole(role), null);
  for (const role of ["owner", "admin", "reviewer", "member"] as const) assert.equal(canEditOrganization({ ...organization, membership: { role, status: "active" } }), role === "owner" || role === "admin");
  assert.equal(canEditOrganization({ ...organization, membership: { role: "owner", status: "suspended" } }), false);
});

test("preview organizations create and edit locally and honor authentication", async () => {
  const client = new MockPhase3Client();
  const before = await client.listOrganizations();
  const created = await client.createOrganization({ name: " Preview ", organizationType: "retailer" });
  assert.equal(created.organization.name, "Preview");
  assert.deepEqual(created.organization.membership, { role: "owner", status: "active" });
  assert.equal((await client.listOrganizations()).organizations.length, before.organizations.length + 1);
  assert.equal((await client.updateOrganization(created.organization.id, { name: "Edited" })).organization.name, "Edited");
  assert.equal((await client.getOrganization(created.organization.id)).organization.name, "Edited");
  await client.logout();
  await assert.rejects(client.listOrganizations(), { code: "unauthenticated" });
  await assert.rejects(client.createOrganization({ name: "No", organizationType: "brand" }), { code: "unauthenticated" });
});

test("malformed organization responses fail closed before rendering", () => {
  for (const response of [null, {}, { organization: {} }, { organization: { ...organization, membership: null } }, { organization: { ...organization, id: "bad-id" } }, { organization: { ...organization, organizationType: "lab" } }]) assert.throws(() => parseOrganizationResponse(response), { code: "unavailable" });
  for (const response of [{}, { organizations: null }, { organizations: [{}] }]) assert.throws(() => parseOrganizationsResponse(response), { code: "unavailable" });
});

test("page-manager membership parses without granting organization administration", () => {
  const pageManager = { ...organization, membership: { role: "page_manager", status: "active" } };
  const parsed = parseOrganizationResponse({ organization: pageManager });
  assert.equal(parsed.organization.membership.role, "page_manager");
  assert.equal(canEditOrganization(parsed.organization), false);
});
