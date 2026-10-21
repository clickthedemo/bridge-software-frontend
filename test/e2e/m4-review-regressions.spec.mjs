import { expect, test } from "@playwright/test";

const orgA = "22222222-2222-4222-8222-222222222222";
const orgB = "33333333-3333-4333-8333-333333333333";
const businessId = "44444444-4444-4444-8444-444444444444";
const stamp = "2026-10-21T10:00:00Z";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQidL4DwACsgGWYeC7hAAAAABJRU5ErkJggg==", "base64");
const logoPath = `/api/v1/organizations/${orgA}/directory-profile/logo`;
const profile = { id: "55555555-5555-4555-8555-555555555555", organizationId: orgA, businessId, slug: "example-brand", displayName: "Example Brand", summary: "Wholesale partners", story: "Our story", businessType: "brand", categories: ["Wholesale"], city: "Portland", state: "Oregon", region: null, publicContact: { email: "hello@example.test", phone: null }, license: null, links: [], logoUrl: null, status: "draft", hasPublishedVersion: false };
const pageFailures = new WeakMap();
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
const alerts = (scope) => scope.locator(".form-error[role='alert']");
const failure = (route, message) => route.fulfill({ status: 500, json: { error: "READ_FAILED", message } });
function identity(role, admin) {
  return { user: { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test", accountType: "standard", platformRoles: admin ? ["admin"] : [], profile: { displayName: "Example Owner", phone: null } }, memberships: [orgA, orgB].map((organizationId, index) => ({ organizationId, organizationName: index ? "Second organization" : "First organization", organizationType: "brand", role, status: "active" })) };
}
async function setup(page, handler, { role = "owner", admin = false } = {}) {
  const errors = []; pageFailures.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem("bridge-age-confirmed-v1", "confirmed"); });
  await page.route("https://bridge-api.example.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/auth/me") return route.fulfill({ json: identity(role, admin) });
    if (url.pathname === "/api/v1/notifications") return route.fulfill({ json: { notifications: [], pageInfo: { limit: 50, offset: 0, hasMore: false } } });
    if (await handler(route, url) !== false) return;
    errors.push(`Unexpected fixture route: ${route.request().method()} ${url.pathname}`);
    return route.fulfill({ status: 404, json: { error: "NOT_FOUND", message: "Unexpected fixture route" } });
  });
}
async function openPage(page, path) {
  await page.goto(path);
  await expect(page.locator(".age-gated-content")).not.toHaveAttribute("inert", "", { timeout: 15000 });
  await expect(page.locator(".age-gated-content")).toHaveAttribute("aria-hidden", "false");
}
// Allow the fulfilled fetch and React's resulting paint to finish without timed sleeps.
async function painted(page) { await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
test.afterEach(async ({ page }) => { expect(pageFailures.get(page) ?? []).toEqual([]); });
async function editorRoute(route, url, current = profile) {
  if (url.pathname.endsWith("/businesses")) return route.fulfill({ json: { businesses: [{ id: businessId, organizationId: orgA, legalName: "Example Brand LLC", websiteUrl: "https://example.test", employeeCount: 12, status: "active" }] } });
  if (url.pathname.endsWith("/submission-readiness")) return route.fulfill({ json: { ready: true, missingFields: [] } });
  if (url.pathname.endsWith("/license")) return route.fulfill({ json: { license: null } });
  if (url.pathname.endsWith("/contact")) return route.fulfill({ json: { contact: { businessId, email: null, phone: null, updatedAt: stamp } } });
  if (url.pathname.endsWith("/primary-location")) return route.fulfill({ json: { location: null } });
  if (url.pathname.endsWith("/directory-profile")) return route.fulfill({ json: { profile: current } });
  return false;
}
const member = (id, name) => ({ id, userId: `${id}-user`, email: `${id}@example.test`, displayName: name, role: "member", status: "active" });
async function organizationDefaults(route, url) {
  if (url.pathname === "/api/v1/organizations") return route.fulfill({ json: { organizations: [] } });
  if (url.pathname === "/api/v1/organization-invitations") return route.fulfill({ json: { invitations: [] } });
  return false;
}

test("late organization A members cannot overwrite organization B", async ({ page }) => {
  const started = deferred(), release = deferred();
  await setup(page, async (route, url) => {
    if (url.pathname === `/api/v1/organizations/${orgA}/members`) { started.resolve(); await release.promise; return route.fulfill({ json: { members: [member("member-a", "Member A")] } }); }
    if (url.pathname === `/api/v1/organizations/${orgB}/members`) return route.fulfill({ json: { members: [member("member-b", "Member B")] } });
    return organizationDefaults(route, url);
  });
  await openPage(page, "/join/organization"); await started.promise;
  const section = page.getByRole("region", { name: "Organization members", exact: true });
  await section.getByRole("combobox", { name: "Organization", exact: true }).selectOption(orgB);
  await expect(section.getByText("Member B", { exact: true })).toBeVisible();
  const response = page.waitForResponse((res) => res.url().endsWith(`/organizations/${orgA}/members`));
  release.resolve(); await (await response).finished(); await painted(page);
  await expect(section.getByText("Member B", { exact: true })).toBeVisible();
  await expect(section.getByText("Member A", { exact: true })).toHaveCount(0);
  await expect(alerts(section)).toHaveCount(0);
});

test("failed organization B members hide old actions and retry uses B membership", async ({ page }) => {
  let failB = true, removed = false; const deletes = [];
  await setup(page, async (route, url) => {
    if (url.pathname.endsWith("/members/member-b") && route.request().method() === "DELETE") { deletes.push(url.pathname); removed = true; return route.fulfill({ status: 204 }); }
    if (url.pathname.endsWith("/members")) {
      const b = url.pathname.includes(orgB);
      if (b && failB) return failure(route, "B member read failed");
      return route.fulfill({ json: { members: b ? removed ? [] : [member("member-b", "Member B")] : [member("member-a", "Member A")] } });
    }
    return organizationDefaults(route, url);
  });
  await openPage(page, "/join/organization");
  const section = page.getByRole("region", { name: "Organization members", exact: true });
  await expect(section.getByText("Member A", { exact: true })).toBeVisible();
  await section.getByRole("combobox", { name: "Organization", exact: true }).selectOption(orgB);
  await expect(alerts(section)).toHaveText("B member read failed");
  await expect(section.getByText("Member A", { exact: true })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Invite user", exact: true })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  failB = false; await section.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(section.getByText("Member B", { exact: true })).toBeVisible(); await expect(alerts(section)).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await section.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => deletes).toEqual([`/api/v1/organizations/${orgB}/members/member-b`]);
});

test("selected logo survives delayed working read and deletion clears preview and file", async ({ page }) => {
  const started = deferred(), release = deferred(); let deleted = false;
  await setup(page, async (route, url) => {
    if (url.pathname === logoPath) {
      if (route.request().method() === "DELETE") { deleted = true; return route.fulfill({ json: { profile: { ...profile, logoUrl: null } } }); }
      if (route.request().resourceType() === "fetch") { started.resolve(); await release.promise; }
      return route.fulfill({ contentType: "image/png", body: png });
    }
    return editorRoute(route, url, { ...profile, logoUrl: deleted ? null : logoPath });
  });
  await openPage(page, "/my-profile"); await started.promise;
  const section = page.getByRole("region", { name: "Profile logo", exact: true });
  const file = section.getByLabel("Choose logo", { exact: true });
  await file.setInputFiles({ name: "selected-logo.png", mimeType: "image/png", buffer: png });
  await expect(section.getByText("selected-logo.png", { exact: true })).toBeVisible();
  const image = section.getByRole("img", { name: "Example Brand logo", exact: true });
  const selectedSource = await image.getAttribute("src"); expect(selectedSource).toMatch(/^blob:/);
  const response = page.waitForResponse((res) => res.url().endsWith(logoPath) && res.request().resourceType() === "fetch");
  release.resolve(); await (await response).finished(); await painted(page);
  await expect(image).toHaveAttribute("src", selectedSource); await expect(section.getByText("selected-logo.png", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept()); await section.getByRole("button", { name: "Remove logo", exact: true }).click();
  await expect(page.getByText("Logo removed.", { exact: true })).toBeVisible();
  await expect(file).toHaveValue(""); await expect(section.getByRole("img")).toHaveCount(0);
  await expect(section.getByText("selected-logo.png", { exact: true })).toHaveCount(0);
  await expect(section.getByText("No logo uploaded", { exact: true })).toBeVisible();
  await expect(section.getByRole("button", { name: "Upload logo", exact: true })).toBeDisabled(); await expect(alerts(page)).toHaveCount(0);
});

for (const status of ["pending_review", "suspended"]) {
  test(`${status} profile has no logo mutation controls`, async ({ page }) => {
    await setup(page, (route, url) => editorRoute(route, url, { ...profile, status }));
    await openPage(page, "/my-profile");
    const section = page.getByRole("region", { name: "Profile logo", exact: true });
    await expect(section).toBeVisible(); await expect(section.getByLabel("Choose logo", { exact: true })).toHaveCount(0);
    await expect(section.getByRole("button", { name: /^(Upload logo|Replace logo|Remove logo|Prepare logo replacement)$/ })).toHaveCount(0);
  });
}
test("approved profile retains explicit prepare logo replacement flow", async ({ page }) => {
  await setup(page, (route, url) => editorRoute(route, url, { ...profile, status: "approved", hasPublishedVersion: true }));
  await openPage(page, "/my-profile");
  const section = page.getByRole("region", { name: "Profile logo", exact: true });
  await expect(section.getByLabel("Choose logo", { exact: true })).toHaveCount(0);
  await section.getByRole("button", { name: "Prepare logo replacement", exact: true }).click();
  await expect(section.getByLabel("Choose logo", { exact: true })).toBeEnabled();
});
test("page manager can edit content but cannot reassign its business", async ({ page }) => {
  await setup(page, (route, url) => editorRoute(route, url), { role: "page_manager" });
  await openPage(page, "/my-profile");
  await expect(page.getByRole("combobox", { name: "Business (required)", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Display name (required)", exact: true })).toBeEnabled();
});
test("successful draft PUT remains saved when readiness GET fails", async ({ page }) => {
  const writes = []; let saved = false;
  await setup(page, (route, url) => {
    if (url.pathname.endsWith("/directory-profile") && route.request().method() === "PUT") { const body = route.request().postDataJSON(); writes.push(body); saved = true; return route.fulfill({ json: { profile: { ...profile, ...body } } }); }
    if (url.pathname.endsWith("/submission-readiness") && saved) return failure(route, "Readiness unavailable");
    return editorRoute(route, url);
  });
  await openPage(page, "/my-profile");
  await page.getByRole("textbox", { name: "Display name (required)", exact: true }).fill("Saved brand name");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible(); await expect(alerts(page)).toHaveCount(0);
  expect(writes).toHaveLength(1); expect(writes[0].displayName).toBe("Saved brand name");
  await expect(page.getByText(/Status: status unavailable/).first()).toBeVisible();
});

const licence = (id) => ({ id, businessId, organizationId: orgA, licenseNumber: `TEST-${id}`, licenseType: "adult_use", issuingState: "PA", expiresOn: "2027-12-31", status: "pending", verifiedAt: null, reviewReason: null });
const verification = { verificationCaseId: "case-focus", verificationItemId: "item-focus", organizationName: "Example organization", businessLegalName: "Focus business", itemType: "ein", status: "pending", caseSubmittedAt: stamp, itemUpdatedAt: stamp, einCheckState: "not_checked", einCheckMode: null, einLastCheckedAt: null, einSafeReason: null };
test("licence identity and failed review reason persist until explicit queue retry", async ({ page }) => {
  let rows = [licence("x"), licence("y")]; const reviews = [];
  await setup(page, (route, url) => {
    if (url.pathname === "/api/v1/admin/verification-queue") return route.fulfill({ json: { entries: [] } });
    if (url.pathname === "/api/v1/admin/business-licenses") return route.fulfill({ json: { licenses: rows } });
    if (url.pathname.endsWith("/business-licenses/x/review")) { reviews.push(route.request().postDataJSON()); return failure(route, "Licence review failed"); }
    return false;
  }, { admin: true });
  await openPage(page, "/admin/verification");
  const card = page.locator("#license-x");
  for (const value of ["TEST-x", businessId, orgA]) await expect(card.getByText(value, { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Reject", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Reject", exact: true });
  for (const value of ["TEST-x", businessId, orgA]) await expect(dialog).toContainText(value);
  const reason = dialog.getByRole("textbox", { name: "Reason (required)", exact: true });
  await reason.fill("Licence evidence does not match business.");
  await dialog.getByRole("button", { name: "Confirm reject", exact: true }).click();
  await expect(alerts(page)).toHaveText("Licence review failed"); await expect(reason).toHaveValue("Licence evidence does not match business.");
  expect(reviews).toEqual([{ action: "rejected", reason: "Licence evidence does not match business." }]);
  // Keep the pending dialog intact: keyboard activation of the existing outside retry
  // must itself clear the orphan selection when the reviewed record disappears.
  rows = [licence("y")];
  const retry = page.getByRole("button", { name: "Retry licence queue", exact: true });
  await retry.focus(); await retry.press("Enter");
  await expect(page.locator("#license-x")).toHaveCount(0); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#license-y").getByRole("button", { name: "Reject", exact: true })).toBeEnabled();
  await expect(alerts(page)).toHaveCount(0);
  await page.locator("#license-y").getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Reason (required)", exact: true })).toHaveValue("");
});
test("failed EIN queue read offers retry without an empty success state", async ({ page }) => {
  let fail = true;
  await setup(page, (route, url) => {
    if (url.pathname === "/api/v1/admin/business-licenses") return route.fulfill({ json: { licenses: [] } });
    if (url.pathname === "/api/v1/admin/verification-queue") return fail ? failure(route, "EIN queue unavailable") : route.fulfill({ json: { entries: [verification] } });
    return false;
  }, { admin: true });
  await openPage(page, "/admin/verification");
  await expect(alerts(page)).toHaveText("EIN queue unavailable");
  await expect(page.getByText("No verification cases match these filters.", { exact: true })).toHaveCount(0);
  await expect(page.locator(".verification-row")).toHaveCount(0);
  fail = false; await page.getByRole("button", { name: "Retry verification queue", exact: true }).click();
  await expect(page.locator("#verification-item-focus")).toBeVisible(); await expect(alerts(page)).toHaveCount(0);
});
test("verification deep link refocuses after filter reload with identical row IDs", async ({ page }) => {
  const started = deferred(), release = deferred(); let hold = false;
  await setup(page, async (route, url) => {
    if (url.pathname === "/api/v1/admin/business-licenses") return route.fulfill({ json: { licenses: [] } });
    if (url.pathname === "/api/v1/admin/verification-queue") { if (hold) { started.resolve(); await release.promise; } return route.fulfill({ json: { entries: [verification] } }); }
    return false;
  }, { admin: true });
  await openPage(page, "/admin/verification?verificationItemId=item-focus");
  const row = page.locator("#verification-item-focus");
  await expect(row).toBeFocused(); await expect(row).toHaveClass(/notification-focus/);
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("pending");
  hold = true; await page.getByRole("combobox", { name: "Item type", exact: true }).selectOption("ein"); await started.promise;
  await expect(row).toHaveCount(0); release.resolve();
  await expect(row).toBeFocused(); await expect(row).toHaveClass(/notification-focus/);
});
