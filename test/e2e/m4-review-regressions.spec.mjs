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
async function setup(page, handler, { role = "owner", admin = false, getIdentity = () => identity(role, admin), notifications = [] } = {}) {
  const errors = []; pageFailures.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem("bridge-age-confirmed-v1", "confirmed"); });
  await page.route("https://bridge-api.example.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/auth/me") return route.fulfill({ json: await getIdentity() });
    if (url.pathname === "/api/v1/notifications") return route.fulfill({ json: { notifications, pageInfo: { limit: 50, offset: 0, hasMore: false } } });
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
  if (url.pathname.endsWith("/ein/status")) return route.fulfill({ json: { businessId, einLastFour: null, status: "not_submitted", reviewNote: null } });
  if (url.pathname.endsWith("/license")) return route.fulfill({ json: { license: null } });
  if (url.pathname.endsWith("/contact")) return route.fulfill({ json: { contact: { businessId, email: null, phone: null, updatedAt: stamp } } });
  if (url.pathname.endsWith("/primary-location")) return route.fulfill({ json: { location: null } });
  if (url.pathname.endsWith("/directory-profile")) return route.fulfill({ json: { profile: current } });
  return false;
}
const member = (id, name) => ({ id, userId: `${id}-user`, email: `${id}@example.test`, displayName: name, role: "member", status: "active" });

for (const state of ["unavailable", "malformed", "not_ready"]) {
  test(`submission stays disabled when readiness is ${state} and recovers after a check`, async ({ page }) => {
    let recovered = false, submissions = 0;
    await setup(page, async (route, url) => {
      if (url.pathname.endsWith("/submission-readiness")) {
        if (recovered) return route.fulfill({ json: { ready: true, missingFields: [] } });
        if (state === "unavailable") return failure(route, "Readiness unavailable");
        return route.fulfill({ json: state === "malformed" ? {} : { ready: false, missingFields: [] } });
      }
      if (url.pathname.endsWith("/directory-profile/submit")) {
        submissions++;
        return route.fulfill({ json: { profile: { ...profile, status: "pending_review" } } });
      }
      return editorRoute(route, url);
    });
    await openPage(page, "/my-profile");
    const submit = page.getByRole("button", { name: "Submit for review", exact: true });
    await expect(submit).toBeDisabled();
    expect(submissions).toBe(0);
    recovered = true;
    await page.getByRole("button", { name: "Check submission readiness", exact: true }).click();
    await expect(submit).toBeEnabled();
    page.once("dialog", (dialog) => dialog.accept());
    await submit.click();
    await expect(page.getByText("Profile submitted for review.", { exact: true })).toBeVisible();
    expect(submissions).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}

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
  await expect(page.getByText(/Submission readiness is unavailable/)).toBeVisible();
  await expect(page.getByText(/Status: EIN not submitted/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for review", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Check submission readiness", exact: true })).toBeEnabled();
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

test("EIN review conflicts remain visible after reload and clear an earlier success notice", async ({ page }) => {
  let rows = [{ ...verification, einCheckState: "match" }], reviews = 0;
  await setup(page, (route, url) => {
    if (url.pathname === "/api/v1/admin/business-licenses") return route.fulfill({ json: { licenses: [] } });
    if (url.pathname === "/api/v1/admin/verification-queue") return route.fulfill({ json: { entries: rows } });
    if (url.pathname.endsWith("/review") && route.request().method() === "POST") {
      reviews += 1;
      if (reviews === 1) { rows = [{ ...verification, verificationItemId: "item-next", einCheckState: "match" }]; return route.fulfill({ json: {} }); }
      return route.fulfill({ status: 409, json: { error: "VERIFICATION_ITEM_CONFLICT", message: "Record changed. Review was not saved." } });
    }
    return false;
  }, { admin: true });
  page.on("dialog", (dialog) => dialog.accept());
  await openPage(page, "/admin/verification");
  await page.locator("#verification-item-focus").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Verification review saved.", { exact: true })).toBeVisible();
  const next = page.locator("#verification-item-next");
  await next.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(alerts(page)).toHaveText("Record changed. Review was not saved.");
  await expect(next).toBeVisible();
  await expect(page.getByText("Verification review saved.", { exact: true })).toHaveCount(0);
  await expect(next.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
  expect(reviews).toBe(2);
});

test("failed mock EIN action preserves the readable queue", async ({ page }) => {
  await setup(page, (route, url) => {
    if (url.pathname === "/api/v1/admin/business-licenses") return route.fulfill({ json: { licenses: [] } });
    if (url.pathname === "/api/v1/admin/verification-queue") return route.fulfill({ json: { entries: [verification] } });
    if (url.pathname.endsWith("/ein/verify")) { expect(route.request().postDataJSON().mode).toBe("mock"); return failure(route, "Mock check unavailable"); }
    return false;
  }, { admin: true });
  await openPage(page, "/admin/verification");
  await page.getByRole("combobox", { name: "EIN lookup", exact: true }).selectOption("mock");
  const row = page.locator("#verification-item-focus");
  await row.getByRole("button", { name: "Run check", exact: true }).click();
  await expect(alerts(page)).toHaveText("Mock check unavailable");
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Run check", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Retry verification queue", exact: true })).toHaveCount(0);
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
  await expect(page.getByRole("combobox", { name: "Item type", exact: true })).toHaveValue("ein");
  hold = true; await page.getByRole("combobox", { name: "Item type", exact: true }).selectOption(""); await started.promise;
  await expect(row).toHaveCount(0); release.resolve();
  await expect(row).toBeFocused(); await expect(row).toHaveClass(/notification-focus/);
});

for (const outcome of ["cancel", "success", "failure"]) {
  test(`verified EIN replacement ${outcome} requires accessible confirmation before any write`, async ({ page }) => {
    let status = "verified", writes = 0;
    await setup(page, (route, url) => {
      if (url.pathname.endsWith("/ein/status")) return route.fulfill({ json: { businessId, einLastFour: status === "pending" ? "4321" : "6789", status, reviewNote: null } });
      if (url.pathname.endsWith("/ein") && route.request().method() === "PUT") {
        writes++;
        if (outcome === "failure") return failure(route, "EIN save failed");
        status = "pending";
        return route.fulfill({ json: { businessId, einLastFour: "4321" } });
      }
      return editorRoute(route, url, null);
    });
    await openPage(page, "/my-profile");
    await expect(page.getByText(/Status: verified by Bridge/)).toBeVisible();
    await page.getByLabel("EIN (required)", { exact: true }).fill("987654321");
    await page.getByRole("button", { name: "Save EIN", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Replace verified EIN?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    expect(writes).toBe(0);
    await expect(dialog).toContainText("will require verification again");
    if (outcome === "cancel") {
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toHaveCount(0); expect(writes).toBe(0);
      await expect(page.getByText(/Status: verified by Bridge/)).toBeVisible();
    } else {
      await dialog.getByRole("button", { name: "Save and request verification", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      if (outcome === "failure") {
        await expect(alerts(page)).toHaveText("EIN save failed");
        await expect(page.getByText(/Status: verified by Bridge/)).toBeVisible();
        await expect(page.getByLabel("EIN (required)", { exact: true })).toHaveValue("987654321");
      } else {
        await expect(page.getByText(/Status: EIN ending 4321 saved, waiting for Bridge to verify/)).toBeVisible();
        await expect(page.getByLabel("EIN (required)", { exact: true })).toHaveValue("");
        await expect(page.getByText(/Status: verified by Bridge/)).toHaveCount(0);
      }
      expect(writes).toBe(1);
    }
  });
}

test("pending EIN and protected contact/address status do not depend on Directory readiness", async ({ page }) => {
  await setup(page, (route, url) => {
    if (url.pathname.endsWith("/ein/status")) return route.fulfill({ json: { businessId, einLastFour: "6789", status: "pending", reviewNote: null } });
    if (url.pathname.endsWith("/submission-readiness")) return failure(route, "No Directory draft");
    if (url.pathname.endsWith("/contact")) return route.fulfill({ json: { contact: { businessId, email: "ops@example.test", phone: "555-010-2000" } } });
    return editorRoute(route, url, null);
  });
  await openPage(page, "/my-profile");
  await expect(page.getByText(/Status: EIN ending 6789 saved, waiting for Bridge to verify/)).toBeVisible();
  await expect(page.locator("form").filter({ has: page.getByRole("heading", { name: "Private business contact", exact: true }) })).toContainText("Status: saved");
  await expect(page.locator("form").filter({ has: page.getByRole("heading", { name: "Business address", exact: true }) })).toContainText("Status: not provided");
});

for (const role of ["page_manager", "member", "reviewer"]) {
  test(`${role} cannot read or replace protected EIN`, async ({ page }) => {
    const protectedReads = [];
    await setup(page, (route, url) => {
      if (url.pathname.endsWith("/ein/status") || url.pathname.endsWith("/ein")) { protectedReads.push(url.pathname); return route.fulfill({ status: 403, json: { error: "FORBIDDEN" } }); }
      return editorRoute(route, url);
    }, { role });
    await openPage(page, "/my-profile");
    await expect(page.getByRole("button", { name: "Save EIN", exact: true })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(protectedReads).toEqual([]);
  });
}

test("organization context selects only active authorized memberships", async ({ page }) => {
  const reads = [];
  await setup(page, (route, url) => { reads.push(url.pathname); return editorRoute(route, url, null); });
  await openPage(page, `/my-profile?organizationId=${orgB}`);
  await expect(page.getByRole("combobox", { name: "Organization (required)", exact: true })).toHaveValue(orgB);
  expect(reads.filter((p) => p.includes(orgA))).toEqual([]);
  reads.length = 0;
  await openPage(page, "/my-profile?organizationId=unrelated");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("The requested organization is unavailable or you no longer have access.");
  expect(reads).toEqual([]);
});

test("late EIN response cannot change another business or open a stale confirmation", async ({ page }) => {
  const businessB = "66666666-6666-4666-8666-666666666666", started = deferred(), release = deferred();
  await setup(page, async (route, url) => {
    if (url.pathname.endsWith("/businesses")) return route.fulfill({ json: { businesses: [businessId, businessB].map((id) => ({ id, organizationId: orgA, legalName: id === businessId ? "Business A" : "Business B", status: "active" })) } });
    if (url.pathname.endsWith("/ein/status")) {
      const isA = url.pathname.includes(businessId);
      if (isA) { started.resolve(); await release.promise; }
      return route.fulfill({ json: { businessId: isA ? businessId : businessB, einLastFour: isA ? "6789" : null, status: isA ? "verified" : "not_submitted", reviewNote: null } });
    }
    return editorRoute(route, url);
  });
  await openPage(page, "/my-profile"); await started.promise;
  await page.getByRole("combobox", { name: "Business (required)", exact: true }).selectOption(businessB);
  await expect(page.getByText(/Status: EIN not submitted/)).toBeVisible();
  const response = page.waitForResponse((r) => r.url().includes(`${businessId}/ein/status`));
  release.resolve(); await (await response).finished(); await painted(page);
  await expect(page.getByText(/Status: EIN not submitted/)).toBeVisible();
  await expect(page.getByText(/Status: verified by Bridge/)).toHaveCount(0);
});

test("pending provider match retains explicit Approve while verified match uses accurate Bridge status", async ({ page }) => {
  await setup(page, (route, url) => {
    if (url.pathname.endsWith("/business-licenses")) return route.fulfill({ json: { licenses: [{ ...licence("names"), businessName: "Named business", organizationName: "Named organization" }] } });
    if (url.pathname.endsWith("/verification-queue")) return route.fulfill({ json: { entries: [
      { ...verification, einCheckState: "match", einCheckMode: "live", einResponseCode: "7", einLastCheckedAt: stamp, einSafeReason: "The provider reports that the legal name and EIN match IRS business records. Administrator approval is still required." },
      { ...verification, verificationItemId: "verified-item", status: "verified", einCheckState: "match", einCheckMode: "mock", einResponseCode: "0", einLastCheckedAt: stamp, einSafeReason: "The provider reports that the legal name and EIN match. Administrator approval is still required." }
    ] } });
    return false;
  }, { admin: true });
  await openPage(page, "/admin/verification");
  await expect(page.getByRole("main")).toHaveCount(1);
  const pending = page.locator("#verification-item-focus"), verified = page.locator("#verification-verified-item");
  await expect(pending.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await expect(pending).toContainText("Provider response code: 7"); await expect(pending).toContainText("Live lookup");
  await expect(verified.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(verified).toContainText("Bridge has approved this business EIN.");
  await expect(verified).not.toContainText("approval is still required");
  await expect(page.locator("#license-names").getByRole("heading", { name: "Named business" })).toBeVisible();
  await expect(page.locator("#license-names")).toContainText("Named organization");
});

test("manual review shows provider explanation and sends a meaningful correction note through the existing contract", async ({ page }) => {
  const writes = [];
  await setup(page, (route, url) => {
    if (url.pathname.endsWith("/business-licenses")) return route.fulfill({ json: { licenses: [] } });
    if (url.pathname.endsWith("/verification-queue")) return route.fulfill({ json: { entries: [{ ...verification, einCheckState: "manual_review", einResponseCode: "6", einCheckMode: "mock", einLastCheckedAt: stamp, einSafeReason: "Manual review is required until the provider confirms this code is acceptable for business EIN verification." }] } });
    if (url.pathname.endsWith("/review")) { writes.push(route.request().postDataJSON()); return route.fulfill({ json: {} }); }
    return false;
  }, { admin: true });
  await openPage(page, "/admin/verification");
  const row = page.locator("#verification-item-focus");
  await expect(row).toContainText("Provider response code: 6");
  await expect(row.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  page.once("dialog", (d) => d.accept("short"));
  await row.getByRole("button", { name: "Request correction", exact: true }).click();
  await expect(alerts(page)).toHaveText("Enter a meaningful review note of at least 10 characters."); expect(writes).toEqual([]);
  page.once("dialog", (d) => d.accept("Please correct the registered legal name."));
  await row.getByRole("button", { name: "Request correction", exact: true }).click();
  await expect(page.getByText("Verification review saved.", { exact: true })).toBeVisible();
  expect(writes).toEqual([{ decision: "correction_required", expectedUpdatedAt: stamp, reason: "Please correct the registered legal name." }]);
});

test("intro plays once per tab while age confirmation stays independent", async ({ page }) => {
  await setup(page, () => false);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/pricing");
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.locator(".age-gated-content")).toHaveAttribute("aria-hidden", "false");
  await page.reload();
  await expect(page.locator(".age-gated-content")).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toHaveCount(0);
  await page.addInitScript(() => localStorage.removeItem("bridge-age-confirmed-v1"));
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Before you enter Bridge" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toHaveCount(0);
});

test("unavailable tab storage safely skips intro and keeps age gate", async ({ page }) => {
  await setup(page, () => false);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => { localStorage.removeItem("bridge-age-confirmed-v1"); Object.defineProperty(window, "sessionStorage", { get() { throw new Error("Storage unavailable"); } }); });
  await page.goto("/pricing");
  await expect(page.getByRole("dialog", { name: "Before you enter Bridge" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toHaveCount(0);
});

for (const ownOrganization of [true, false]) {
  test(`Evergreen profile actions wait for authoritative membership then own organization is ${ownOrganization}`, async ({ page }) => {
    const started = deferred(), release = deferred();
    await setup(page, async (route, url) => {
      if (url.pathname.endsWith("/action-context")) { started.resolve(); await release.promise; return route.fulfill({ json: { ownOrganization } }); }
      if (url.pathname.endsWith("/directory/profiles/evergreen")) return route.fulfill({ json: { profile: { ...profile, slug: "evergreen", displayName: "Evergreen", organizationId: undefined } } });
      if (url.pathname === "/api/v1/posts") return route.fulfill({ json: { posts: [], nextCursor: null } });
      if (url.pathname === "/api/v1/saved-profiles") return route.fulfill({ json: { savedProfiles: [], pageInfo: { limit: 100, offset: 0, hasMore: false } } });
      return false;
    }, { getIdentity: () => ({ ...identity("owner", false), memberships: [identity("owner", false).memberships[ownOrganization ? 0 : 1]] }) });
    await openPage(page, "/profile/evergreen"); await started.promise;
    await expect(page.getByRole("heading", { name: "Evergreen", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Checking profile actions" })).toBeVisible();
    const actions = [page.getByRole("button", { name: "Save profile", exact: true }), page.getByRole("button", { name: "Report this profile", exact: true }), page.getByRole("heading", { name: "Contact Evergreen", exact: true })];
    for (const action of actions) await expect(action).toHaveCount(0);
    const response = page.waitForResponse((r) => r.url().endsWith("/evergreen/action-context"));
    release.resolve(); await (await response).finished();
    await expect(page.getByText("Checking profile actions…", { exact: true })).toHaveCount(0);
    if (ownOrganization) { for (const action of actions) await expect(action).toHaveCount(0); }
    else { for (const action of actions) await expect(action).toBeVisible(); }
  });
}

test("successful organization creation refreshes shared memberships before client navigation to My Profile", async ({ page }) => {
  let created = false, identityReads = 0;
  const organization = { id: orgA, name: "First organization", organizationType: "brand", membership: { role: "owner", status: "active" } };
  await setup(page, (route, url) => {
    if (url.pathname === "/api/v1/organizations") {
      if (route.request().method() === "POST") { created = true; return route.fulfill({ json: { organization } }); }
      return route.fulfill({ json: { organizations: created ? [organization] : [] } });
    }
    if (url.pathname.endsWith("/members")) return route.fulfill({ json: { members: [] } });
    if (url.pathname === "/api/v1/organization-invitations") return route.fulfill({ json: { invitations: [] } });
    return editorRoute(route, url, null);
  }, { getIdentity: () => { identityReads++; return { ...identity("owner", false), memberships: created ? [identity("owner", false).memberships[0]] : [] }; } });
  await openPage(page, "/join/organization");
  await page.getByRole("textbox", { name: "Organization name", exact: true }).fill("First organization");
  await page.getByRole("combobox", { name: "Organization type", exact: true }).selectOption("brand");
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page.getByText("Organization created. You are its owner.", { exact: true })).toBeVisible();
  const navigation = page.waitForURL("**/my-profile");
  await page.getByRole("link", { name: "Go to your profile", exact: true }).click(); await navigation;
  await expect(page.getByRole("combobox", { name: "Organization (required)", exact: true })).toHaveValue(orgA);
  expect(identityReads).toBe(2);
});

test("Sent cards omit unsupported private fields", async ({ page }) => {
  await setup(page, (route, url) => url.pathname === "/api/v1/contact-requests/sent" ? route.fulfill({ json: { requests: [{ id: "sent-safe", status: "new", createdAt: stamp, target: { slug: "target", displayName: "Recipient business" } }], pageInfo: { limit: 20, offset: 0, hasMore: false } } }) : false);
  await openPage(page, "/requests/sent");
  await expect(page.getByRole("heading", { name: "Recipient business", exact: true })).toBeVisible();
  await expect(page.getByText("Not provided", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Contact preference:", { exact: true })).toHaveCount(0);
  await expect(page.getByText("From:", { exact: true })).toHaveCount(0);
});

test("administrator announcement copy accurately describes publishing without a business profile", async ({ page }) => {
  await setup(page, (route, url) => url.pathname === "/api/v1/admin/announcements" ? route.fulfill({ json: { announcements: [] } }) : false, { admin: true, getIdentity: () => ({ ...identity("owner", true), memberships: [] }) });
  await openPage(page, "/admin/announcements");
  await expect(page.getByText("Plain text. Authorized platform administrators can publish announcements without a business profile.", { exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
});

for (const failureKind of ["unavailable", "malformed"]) {
  test(`EIN status ${failureKind} is a read failure rather than saved or verified`, async ({ page }) => {
    let writes = 0;
    await setup(page, (route, url) => {
      if (url.pathname.endsWith("/ein/status")) return failureKind === "unavailable" ? failure(route, "EIN status unavailable") : route.fulfill({ json: {} });
      if (url.pathname.endsWith("/ein")) { writes++; return route.fulfill({ json: {} }); }
      return editorRoute(route, url, null);
    });
    await openPage(page, "/my-profile");
    await expect(page.getByText(/Status: status unavailable/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save EIN", exact: true })).toBeDisabled();
    expect(writes).toBe(0);
  });
}

test("verified EIN confirmation prevents duplicate writes and locks business selection", async ({ page }) => {
  const release = deferred(); let writes = 0, saved = false;
  await setup(page, async (route, url) => {
    if (url.pathname.endsWith("/ein/status")) return route.fulfill({ json: { businessId, einLastFour: "6789", status: saved ? "pending" : "verified", reviewNote: null } });
    if (url.pathname.endsWith("/ein")) { writes++; await release.promise; saved = true; return route.fulfill({ json: { businessId, einLastFour: "6789" } }); }
    return editorRoute(route, url);
  });
  await openPage(page, "/my-profile");
  await expect(page.getByText(/Status: verified by Bridge/)).toBeVisible();
  await page.getByLabel("EIN (required)", { exact: true }).fill("123456789");
  await page.getByRole("button", { name: "Save EIN", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Replace verified EIN?" });
  await expect(page.getByRole("combobox", { name: "Organization (required)", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Save and request verification", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByRole("button", { name: "Saving�", exact: true })).toBeDisabled();
  expect(writes).toBe(1); release.resolve();
  await expect(page.getByText(/Status: EIN ending 6789 saved, waiting for Bridge to verify/)).toBeVisible();
  expect(writes).toBe(1);
});

test("dashboard retains one primary main landmark", async ({ page }) => {
  await setup(page, (route, url) => url.pathname.endsWith("/contact-requests") ? route.fulfill({ json: { requests: [], pageInfo: { limit: 20, offset: 0, hasMore: false } } }) : false);
  await openPage(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "Keep your connections close", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
});

test("notification open marks read and selects its authorized organization", async ({ page }) => {
  const reads = [], marked = [];
  const notification = { id: "owner-result", type: "ein_correction_required", category: "verification", title: "EIN correction required", body: "Please correct the legal name.", resourceType: "verification_item", resourceId: "verification-item", createdAt: stamp, readAt: null, available: true, context: { organizationId: orgB, organizationName: "Second organization" }, action: { label: "View verification status", href: `/my-profile?organizationId=${orgB}` } };
  await setup(page, (route, url) => {
    if (url.pathname === "/api/v1/notifications/owner-result/read") { marked.push(route.request().method()); return route.fulfill({ json: {} }); }
    reads.push(url.pathname); return editorRoute(route, url, null);
  }, { notifications: [notification] });
  await openPage(page, "/notifications");
  await page.getByRole("button", { name: "View verification status", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/my-profile\\?organizationId=${orgB}`));
  await expect(page.getByRole("combobox", { name: "Organization (required)", exact: true })).toHaveValue(orgB);
  expect(marked).toEqual(["POST"]); expect(reads.some((path) => path.includes(orgA))).toBe(false);
});

test("unsaved protected drafts do not acquire Saved status", async ({ page }) => {
  await setup(page, (route, url) => editorRoute(route, url, null));
  await openPage(page, "/my-profile");
  const contact = page.locator("form").filter({ has: page.getByRole("heading", { name: "Private business contact", exact: true }) });
  await expect(contact).toContainText("Status: not provided");
  await contact.getByLabel("Business email (required; not published)", { exact: true }).fill("draft@example.test");
  await contact.getByLabel("Business phone (required; not published)", { exact: true }).fill("555-010-2000");
  await expect(contact).toContainText("Status: not provided");
});

for (const failureKind of ["unavailable", "malformed"]) {
  test(`Evergreen action-context ${failureKind} shows an error and retries without exposing self actions`, async ({ page }) => {
    let recovered = false;
    await setup(page, (route, url) => {
      if (url.pathname.endsWith("/evergreen/action-context")) {
        if (!recovered) return failureKind === "unavailable" ? failure(route, "Context unavailable") : route.fulfill({ json: {} });
        return route.fulfill({ json: { ownOrganization: false } });
      }
      if (url.pathname.endsWith("/directory/profiles/evergreen")) return route.fulfill({ json: { profile: { ...profile, slug: "evergreen", displayName: "Evergreen", organizationId: undefined } } });
      if (url.pathname === "/api/v1/posts") return route.fulfill({ json: { posts: [], nextCursor: null } });
      if (url.pathname === "/api/v1/saved-profiles") return route.fulfill({ json: { savedProfiles: [], pageInfo: { limit: 100, offset: 0, hasMore: false } } });
      return false;
    }, { getIdentity: () => ({ ...identity("owner", false), memberships: [identity("owner", false).memberships[1]] }) });
    await openPage(page, "/profile/evergreen");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Profile actions could not be checked. Please try again.");
    await expect(page.getByRole("button", { name: "Save profile", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Report this profile", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Contact Evergreen", exact: true })).toHaveCount(0);
    recovered = true;
    await page.getByRole("button", { name: "Retry profile actions", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save profile", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Report this profile", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contact Evergreen", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });
}
