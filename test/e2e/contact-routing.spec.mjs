import { expect, test } from "@playwright/test";

const origin = "https://bridge-api.example.test";
const org1 = "22222222-2222-4222-8222-222222222222";
const org2 = "33333333-3333-4333-8333-333333333333";
const requestId = "66666666-6666-4666-8666-666666666666";
const rep1 = { membershipId: "77777777-7777-4777-8777-777777777777", userId: "88888888-8888-4888-8888-888888888888", displayName: "First organization rep" };
const rep2 = { membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", displayName: "Another first organization rep" };
const otherRep = { membershipId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", displayName: "Second organization rep" };
const admin = { userId: "99999999-9999-4999-8999-999999999999", displayName: "Configured Bridge admin" };
const routingPath = (organizationId) => `/api/v1/organizations/${organizationId}/directory-profile/contact-routing`;
const inboxPath = (organizationId) => `/api/v1/organizations/${organizationId}/contact-requests`;
const incoming = { id: requestId, status: "new", subject: "Synthetic assigned inquiry", firstName: "Synthetic sender", workEmail: "sender@example.test", phoneNumber: "555-010-1000", yearsOfService: 2, contactPreference: "email", message: "Synthetic inquiry", createdAt: "2026-10-21T00:00:00Z" };
const inbox = { requests: [incoming], pageInfo: { limit: 20, offset: 0, hasMore: false } };
const salesSelector = (page) => page.getByLabel("Assigned sales representative", { exact: true });
const saveButton = (page) => page.getByRole("button", { name: "Save routing changes", exact: true });
const routingToggle = (page) => page.getByRole("button", { name: "Manage contact routing", exact: true });
const appError = (page) => page.locator("main .form-error[role='alert']");
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
function identity(role = "owner", accountType = "standard") {
  return { user: { id: "11111111-1111-4111-8111-111111111111", email: "synthetic@example.test", accountType, platformRoles: [], profile: { displayName: "Synthetic member", phone: null } }, memberships: [org1, org2].map((organizationId, index) => ({ organizationId, organizationName: index ? "Second organization" : "First organization", organizationType: "brand", role, status: "active" })) };
}

// Mirrors m4.spec.mjs auth, age-gate and error fixtures without a timed auth delay.
// Browser routes are synthetic contracts; SQL eligibility itself is covered by pgTAP.
async function setup(page, handler, who = identity()) {
  const state = { calls: [], errors: [], allowedFailures: [] };
  page.on("pageerror", (error) => state.errors.push({ message: error.message, url: "pageerror" }));
  page.on("console", (entry) => { if (entry.type() === "error") state.errors.push({ message: entry.text(), url: entry.location().url }); });
  await page.addInitScript(() => {
    localStorage.setItem("bridge-age-confirmed-v1", "confirmed");
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  });
  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    state.calls.push({ path: url.pathname, method, ...(method === "PUT" || method === "POST" ? { body: route.request().postDataJSON() } : {}) });
    if (url.pathname === "/api/v1/auth/me") return route.fulfill({ json: who });
    if (url.pathname === "/api/v1/notifications") return route.fulfill({ json: { notifications: [], pageInfo: { limit: 50, offset: 0, hasMore: false } } });
    const handled = await handler(route, url, state);
    if (handled !== false) return;
    state.errors.push({ message: `Unexpected fixture route: ${method} ${url.pathname}`, url: url.href });
    return route.fulfill({ status: 404, json: { error: "NOT_FOUND", message: "Unexpected fixture route" } });
  });
  return state;
}
async function openPage(page, path = "/requests") {
  await page.goto(path);
  await expect(page.locator(".age-gated-content")).not.toHaveAttribute("inert", "", { timeout: 15000 });
  await expect(page.locator(".age-gated-content")).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByRole("heading", { name: "Contact request inbox", exact: true })).toBeVisible();
}
async function evidence(page, state) {
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  expect(state.errors.filter((entry) => !state.allowedFailures.some(({ status, path }) => entry.url === origin + path && entry.message.includes(String(status)) && entry.message.includes("Failed to load resource")))).toEqual([]);
  expect(state.calls.filter((call) => call.path.includes("inbox-organizations"))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
async function failRead(route, state, status, message) {
  const path = new URL(route.request().url()).pathname;
  state.allowedFailures.push({ status, path });
  return route.fulfill({ status, json: { error: "ROUTING_UNAVAILABLE", message } });
}
function routingFixture(route, url, current, writes) {
  const organizationId = url.pathname.includes(`/organizations/${org2}/`) ? org2 : org1;
  if (url.pathname === inboxPath(organizationId)) return route.fulfill({ json: inbox });
  if (url.pathname === `${routingPath(organizationId)}/candidates`) return route.fulfill({ json: { candidates: { salesRepresentatives: organizationId === org1 ? [rep1, rep2] : [otherRep], bridgeAdmin: current[organizationId].bridgeAdmin } } });
  if (url.pathname !== routingPath(organizationId)) return false;
  if (route.request().method() === "PUT") {
    const body = route.request().postDataJSON();
    writes.push({ path: url.pathname, body });
    const eligible = organizationId === org1 ? [rep1, rep2] : [otherRep];
    current[organizationId] = { salesRepresentative: eligible.find((rep) => rep.membershipId === body.salesRepresentativeMembershipId) ?? null, bridgeAdmin: body.bridgeAdminUserId === admin.userId ? admin : null };
  }
  return route.fulfill({ json: { routing: current[organizationId] } });
}
async function saveAndWait(page, writes, count) {
  await saveButton(page).click();
  await expect.poll(() => writes.length).toBe(count);
  await expect(salesSelector(page)).toBeEnabled();
  await expect(saveButton(page)).toBeDisabled();
  await expect(page.getByText("Contact routing saved.", { exact: true })).toBeVisible();
}

for (const role of ["owner", "admin"]) {
  test(`${role} uses the bounded organization roster and exact assignment/clearing payloads`, async ({ page }) => {
    const current = { [org1]: { salesRepresentative: rep1, bridgeAdmin: admin }, [org2]: { salesRepresentative: otherRep, bridgeAdmin: null } };
    const writes = [];
    const state = await setup(page, (route, url) => routingFixture(route, url, current, writes), identity(role));
    await openPage(page);
    await expect(page.getByLabel("Organization", { exact: true }).locator("option")).toHaveText(["First organization", "Second organization"]);
    await expect(page.getByText(incoming.subject, { exact: true })).toBeVisible();
    expect(state.calls.filter((call) => call.path.includes("contact-routing"))).toEqual([]);
    await routingToggle(page).click();
    await expect(salesSelector(page)).toHaveValue(rep1.membershipId);
    await expect(salesSelector(page).locator("option")).toHaveText(["No sales representative", rep1.displayName, rep2.displayName]);
    await expect(page.getByText(otherRep.displayName, { exact: true })).toHaveCount(0);
    await expect(page.getByText(admin.displayName, { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Contact routing", exact: true }).getByRole("combobox")).toHaveCount(1);
    await expect(saveButton(page)).toBeDisabled();

    await salesSelector(page).selectOption(rep2.membershipId);
    await saveAndWait(page, writes, 1);
    await salesSelector(page).selectOption("");
    await saveAndWait(page, writes, 2);
    await salesSelector(page).selectOption(rep1.membershipId);
    await page.getByLabel("Remove assigned Bridge administrator", { exact: true }).check();
    await saveAndWait(page, writes, 3);
    await expect(page.getByLabel("Remove assigned Bridge administrator", { exact: true })).toHaveCount(0);
    await salesSelector(page).selectOption("");
    await saveAndWait(page, writes, 4);
    // A subsequent sales edit must not restore the removed admin from stale candidates.
    await salesSelector(page).selectOption(rep2.membershipId);
    await saveAndWait(page, writes, 5);
    expect(writes).toEqual([
      { path: routingPath(org1), body: { salesRepresentativeMembershipId: rep2.membershipId, bridgeAdminUserId: admin.userId } },
      { path: routingPath(org1), body: { salesRepresentativeMembershipId: null, bridgeAdminUserId: admin.userId } },
      { path: routingPath(org1), body: { salesRepresentativeMembershipId: rep1.membershipId, bridgeAdminUserId: null } },
      { path: routingPath(org1), body: { salesRepresentativeMembershipId: null, bridgeAdminUserId: null } },
      { path: routingPath(org1), body: { salesRepresentativeMembershipId: rep2.membershipId, bridgeAdminUserId: null } },
    ]);
    await evidence(page, state);
  });
}

for (const scenario of [
  { name: "ordinary member", who: identity("member") },
  { name: "sales-rep page manager", who: identity("page_manager", "sales_rep") },
  { name: "inactive owner", who: { ...identity(), memberships: identity().memberships.map((item) => ({ ...item, status: "suspended" })) } },
  { name: "global admin without organization membership", who: { ...identity(), user: { ...identity().user, platformRoles: ["admin"] }, memberships: [] } },
]) {
  test(`${scenario.name} gets no organization routing controls or discovery`, async ({ page }) => {
    const state = await setup(page, () => false, scenario.who);
    await openPage(page);
    await expect(page.getByRole("heading", { name: "No accessible inbox", exact: true })).toBeVisible();
    await expect(routingToggle(page)).toHaveCount(0);
    await expect(page.getByLabel("Organization", { exact: true })).toHaveCount(0);
    expect(state.calls.filter((call) => call.path.includes("/organizations/") || call.path.includes("/contact-requests/"))).toEqual([]);
    await evidence(page, state);
  });
}

test("default inbox uses only active owner/admin memberships without discovery", async ({ page }) => {
  const who = identity(); who.memberships[1].role = "member";
  who.memberships.push({ ...who.memberships[0], organizationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", organizationName: "Inactive admin organization", role: "admin", status: "suspended" });
  const state = await setup(page, (route, url) => url.pathname === inboxPath(org1) ? route.fulfill({ json: inbox }) : false, who);
  await openPage(page);
  await expect(page.getByLabel("Organization", { exact: true }).locator("option")).toHaveText(["First organization"]);
  await expect(page.getByText(incoming.subject, { exact: true })).toBeVisible();
  await expect(routingToggle(page)).toBeVisible();
  expect(state.calls.filter((call) => call.path.includes("/organizations/")).map((call) => call.path)).toEqual([inboxPath(org1)]);
  await evidence(page, state);
});

for (const assigned of [identity("page_manager", "sales_rep"), { ...identity(), user: { ...identity().user, platformRoles: ["admin"] }, memberships: [] }]) {
  test(`${assigned.user.accountType === "sales_rep" ? "sales rep" : "assigned platform admin"} opens and transitions only an exact assigned request`, async ({ page }) => {
    const exactPath = `/api/v1/contact-requests/${requestId}`;
    let status = "new";
    const state = await setup(page, (route, url) => {
      if (url.pathname === exactPath) return route.fulfill({ json: { request: { ...incoming, status } } });
      if (url.pathname === exactPath + "/status" && route.request().method() === "POST") { status = route.request().postDataJSON().status; return route.fulfill({ json: { request: { id: requestId, status } } }); }
      return false;
    }, assigned);
    await openPage(page, `/requests?requestId=${requestId}`);
    await expect(page.getByText(incoming.subject, { exact: true })).toBeVisible();
    await expect(routingToggle(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Mark responded", exact: true }).click();
    await expect(page.getByText("responded", { exact: true })).toBeVisible();
    expect(state.calls.filter((call) => call.method === "POST")).toEqual([{ path: exactPath + "/status", method: "POST", body: { status: "responded" } }]);
    expect(state.calls.filter((call) => call.path.includes("/organizations/"))).toEqual([]);
    await evidence(page, state);
  });
}

for (const { status, candidates } of [{ status: 400, candidates: false }, { status: 403, candidates: true }, { status: 404, candidates: true }, { status: 503, candidates: false }]) {
  test(`routing ${candidates ? "roster" : "assignment"} read ${status} cannot save defaults and retries from authoritative state`, async ({ page }) => {
    const gate = deferred(); const started = deferred();
    const current = { [org1]: { salesRepresentative: rep1, bridgeAdmin: admin }, [org2]: { salesRepresentative: otherRep, bridgeAdmin: null } };
    const writes = []; let reads = 0;
    const failingPath = routingPath(org1) + (candidates ? "/candidates" : "");
    const state = await setup(page, async (route, url, result) => {
      if (url.pathname === failingPath && route.request().method() === "GET") {
        reads++;
        if (reads === 1) return failRead(route, result, status, `Synthetic routing read ${status}`);
        if (reads === 2) { started.resolve(); await gate.promise; }
      }
      return routingFixture(route, url, current, writes);
    });
    try {
      await openPage(page);
      await routingToggle(page).click();
      await expect(appError(page)).toHaveText(`Synthetic routing read ${status}`);
      await expect(salesSelector(page)).toHaveCount(0);
      await expect(saveButton(page)).toHaveCount(0);
      expect(writes).toEqual([]);
      await page.getByRole("button", { name: "Retry routing", exact: true }).click();
      await started.promise;
      await expect(page.getByText("Loading contact routing…", { exact: true })).toBeVisible();
      await expect(saveButton(page)).toHaveCount(0);
      expect(writes).toEqual([]);
      gate.resolve();
      await expect(salesSelector(page)).toHaveValue(rep1.membershipId);
      await expect(saveButton(page)).toBeDisabled();
      await expect(appError(page)).toHaveCount(0);
      await salesSelector(page).selectOption(rep2.membershipId);
      await saveAndWait(page, writes, 1);
      expect(writes[0]).toEqual({ path: routingPath(org1), body: { salesRepresentativeMembershipId: rep2.membershipId, bridgeAdminUserId: admin.userId } });
      await evidence(page, state);
    } finally { gate.resolve(); }
  });
}

for (const lateFirstOrganization of [false, true]) {
  test(lateFirstOrganization ? "late first-organization routing response cannot replace the second organization" : "changing organization removes loaded routing controls before its next read", async ({ page }) => {
    const gate = deferred(); const started = deferred(); const delivered = deferred();
    const current = { [org1]: { salesRepresentative: rep1, bridgeAdmin: admin }, [org2]: { salesRepresentative: null, bridgeAdmin: null } };
    const writes = [];
    const state = await setup(page, async (route, url) => {
      const heldPath = routingPath(lateFirstOrganization ? org1 : org2);
      if (url.pathname === heldPath && route.request().method() === "GET") {
        started.resolve(); await gate.promise;
        await route.fulfill({ json: { routing: current[lateFirstOrganization ? org1 : org2] } });
        delivered.resolve(); return;
      }
      return routingFixture(route, url, current, writes);
    });
    try {
      await openPage(page);
      await routingToggle(page).click();
      if (lateFirstOrganization) await started.promise;
      else await expect(salesSelector(page)).toHaveValue(rep1.membershipId);
      await page.getByLabel("Organization", { exact: true }).selectOption(org2);
      await expect(salesSelector(page)).toHaveCount(0);
      await expect(routingToggle(page)).toHaveAttribute("aria-expanded", "false");
      await routingToggle(page).click();
      if (!lateFirstOrganization) {
        await started.promise;
        await expect(salesSelector(page)).toHaveCount(0);
        const response = page.waitForResponse((result) => result.url() === origin + routingPath(org2) && result.request().method() === "GET");
        gate.resolve(); await (await response).finished(); await delivered.promise;
      } else {
        await expect(salesSelector(page)).toHaveValue("");
        const response = page.waitForResponse((result) => result.url() === origin + routingPath(org1) && result.request().method() === "GET");
        gate.resolve(); await (await response).finished(); await delivered.promise;
      }
      await expect(salesSelector(page)).toHaveValue("");
      await expect(salesSelector(page).locator("option")).toHaveText(["No sales representative", otherRep.displayName]);
      await expect(page.getByText(admin.displayName, { exact: true })).toHaveCount(0);
      await salesSelector(page).selectOption(otherRep.membershipId);
      await saveAndWait(page, writes, 1);
      expect(writes).toEqual([{ path: routingPath(org2), body: { salesRepresentativeMembershipId: otherRep.membershipId, bridgeAdminUserId: null } }]);
      await evidence(page, state);
    } finally { gate.resolve(); }
  });
}
