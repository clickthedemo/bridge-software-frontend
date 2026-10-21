import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const org1 = "22222222-2222-4222-8222-222222222222";
const org2 = "33333333-3333-4333-8333-333333333333";
const business = "44444444-4444-4444-8444-444444444444";
const profile = {
  id: "55555555-5555-4555-8555-555555555555", organizationId: org1, businessId: business,
  slug: "example-brand", displayName: "Example Brand", summary: "Wholesale partners", story: "Our story",
  businessType: "brand", categories: ["Wholesale"], city: "Portland", state: "Oregon", region: "Willamette Valley",
  publicContact: { email: "hello@example.test", phone: "555-010-1000" }, license: { type: "METRC", number: "TEST-100" },
  links: [
    { type: "website", label: "Website", url: "https://example.test", sortOrder: 0 },
    { type: "website", label: "Wholesale", url: "https://wholesale.example.test", sortOrder: 1 },
    { type: "menu", label: "Menu", url: "https://example.test/menu", sortOrder: 2 },
  ],
  logoUrl: null, status: "approved", hasPublishedVersion: true, legalName: "Example Brand LLC", dbaName: "Example Brand", verified: true,
};
function identity(role = "owner", accountType = "standard", platformRoles = []) {
  return { user: { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test", accountType, platformRoles, profile: { displayName: "Example Owner", phone: null } },
    memberships: [org1, org2].map((organizationId, index) => ({ organizationId, organizationName: index ? "Second organization" : "First organization", organizationType: "brand", role, status: "active" })) };
}
async function setup(page, handler, role = "owner", accountType = "standard", platformRoles = []) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (entry) => { if (entry.type() === "error") errors.push(`${entry.text()} ${entry.location().url}`); });
  await page.addInitScript(() => {
    localStorage.setItem("bridge-age-confirmed-v1", "confirmed");
    // Keep pagination deliberate so the test can exercise filter changes during an in-flight next page.
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  });
  await page.route("https://bridge-api.example.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/auth/me") {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return route.fulfill({ json: identity(role, accountType, platformRoles) });
    }
    if (url.pathname === "/api/v1/notifications") return route.fulfill({ json: { notifications: [], pageInfo: { limit: 50, offset: 0, hasMore: false } } });
    const result = await handler(route, url);
    if (result !== false) return;
    console.error(`Unexpected fixture route: ${url.href}`);
    return route.fulfill({ status: 404, json: { error: "NOT_FOUND", message: "Unexpected fixture route" } });
  });
  return errors;
}
async function openPage(page, path) {
  await page.goto(path);
  // Auth can resolve beneath the age gate before its requestAnimationFrame unlocks
  // the page. Wait for actual user interactivity before editing controlled inputs.
  await expect(page.locator(".age-gated-content")).not.toHaveAttribute("inert", "", { timeout: 15000 });
  await expect(page.locator(".age-gated-content")).toHaveAttribute("aria-hidden", "false");
}
async function evidence(page, testInfo, name, errors) {
  await expect(page.locator("body")).not.toBeEmpty();
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await mkdir("/tmp/bridge-m4-evidence", { recursive: true });
  const path = `/tmp/bridge-m4-evidence/${testInfo.project.name}-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const role of ["owner", "page_manager"]) {
  test(`${role} can save approved profile revisions without losing links`, async ({ page }, testInfo) => {
    const saves = [];
    const errors = await setup(page, async (route, url) => {
      if (url.pathname.endsWith("/businesses")) return route.fulfill({ json: { businesses: [{ id: business, organizationId: org1, legalName: "Example Brand LLC", dbaName: "Example Brand", status: "active" }] } });
      if (url.pathname.endsWith("/submission-readiness")) return route.fulfill({ json: { ready: true, missingFields: [] } });
      if (url.pathname.endsWith("/license")) return route.fulfill({ json: { license: null } });
      if (route.request().method() === "GET" && url.pathname.endsWith("/contact")) return route.fulfill({ json: { contact: { businessId: business, email: null, phone: null, updatedAt: "2026-10-21T10:00:00Z" } } });
      if (route.request().method() === "GET" && url.pathname.endsWith("/primary-location")) return route.fulfill({ json: { location: null } });
      if (url.pathname.endsWith("/directory-profile")) {
        if (route.request().method() === "PUT") {
          const body = route.request().postDataJSON(); saves.push(body);
          return route.fulfill({ json: { profile: { ...profile, ...body, status: "draft" } } });
        }
        return route.fulfill({ json: { profile } });
      }
      return false;
    }, role);
    await openPage(page, "/my-profile");
    // An approved profile is read-only until the owner starts a working revision.
    const displayName = page.getByLabel("Display name (required)", { exact: true });
    await expect(displayName).toBeDisabled();
    await page.getByRole("button", { name: "Prepare profile update", exact: true }).click();
    await expect(displayName).toBeEnabled();
    await displayName.fill("");
    await displayName.pressSequentially("Revised Brand");
    await expect(displayName).toHaveValue("Revised Brand");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
    expect(saves).toHaveLength(1);
    expect(saves[0].links).toEqual(profile.links);
    expect(saves[0].displayName).toBe("Revised Brand");
    if (role === "owner") await expect(page.getByRole("button", { name: "Submit for review", exact: true })).toBeEnabled();
    else await expect(page.getByRole("button", { name: "Submit for review", exact: true })).toHaveCount(0);
    await evidence(page, testInfo, `profile-${role}`, errors);
  });
}

test("owner can enter EIN, private contact and address that submission requires", async ({ page }, testInfo) => {
  const writes = [];
  let savedContact = null;
  let savedLocation = null;
  let missing = ["private_email", "private_phone", "ein_verification", "business_address"];
  const errors = await setup(page, async (route, url) => {
    const method = route.request().method();
    if (url.pathname.endsWith("/businesses")) return route.fulfill({ json: { businesses: [{ id: business, organizationId: org1, legalName: "Example Brand LLC", dbaName: "Example Brand", websiteUrl: "https://example.test", employeeCount: 12, status: "active" }] } });
    if (url.pathname.endsWith("/submission-readiness")) return route.fulfill({ json: { ready: missing.length === 0, missingFields: missing } });
    if (url.pathname.endsWith("/license")) return route.fulfill({ json: { license: null } });
    if (url.pathname.endsWith("/directory-profile")) return route.fulfill({ json: { profile: { ...profile, status: "draft", hasPublishedVersion: false } } });
    if (method === "GET" && url.pathname.endsWith(`/businesses/${business}/contact`)) { const contact = url.pathname.includes(`/organizations/${org1}/`) ? savedContact : null; return route.fulfill({ json: { contact: { businessId: business, email: contact?.email ?? null, phone: contact?.phone ?? null, updatedAt: "2026-10-21T10:00:00Z" } } }); }
    if (method === "GET" && url.pathname.endsWith("/primary-location")) return route.fulfill({ json: { location: url.pathname.includes(`/organizations/${org1}/`) ? savedLocation : null } });
    if (method === "PUT" && url.pathname.endsWith(`/businesses/${business}/ein`)) { writes.push([url.pathname, route.request().postDataJSON()]); return route.fulfill({ json: { businessId: business, einLastFour: "6789" } }); }
    if (method === "PUT" && url.pathname.endsWith(`/businesses/${business}/contact`)) { savedContact = route.request().postDataJSON(); writes.push([url.pathname, savedContact]); missing = missing.filter((item) => !item.startsWith("private_")); return route.fulfill({ json: { contact: { businessId: business, ...savedContact } } }); }
    if (method === "PUT" && url.pathname.endsWith(`/organizations/${org1}/primary-location`)) { const value = route.request().postDataJSON(); savedLocation = { id: "66666666-6666-4666-8666-666666666666", organizationId: org1, updatedAt: "2026-10-21T10:00:00Z", ...value }; writes.push([url.pathname, value]); missing = missing.filter((item) => item !== "business_address"); return route.fulfill({ json: { location: savedLocation } }); }
    return false;
  });
  await openPage(page, "/my-profile");
  const submit = page.getByRole("button", { name: "Submit for review", exact: true });
  await expect(submit).toBeDisabled();

  await page.getByLabel("EIN (required)", { exact: true }).fill("12-3456789");
  await page.getByRole("button", { name: "Save EIN", exact: true }).click();
  await expect(page.getByText("EIN ending 6789 saved, waiting for Bridge to verify", { exact: false })).toBeVisible();
  await expect(page.getByLabel("EIN (required)", { exact: true })).toHaveValue("");

  await page.getByLabel("Business email (required; not published)", { exact: true }).fill(" Ops@Example.test ");
  await page.getByLabel("Business phone (required; not published)", { exact: true }).fill("555-010-2000");
  await page.getByRole("button", { name: "Save private contact", exact: true }).click();
  await expect(page.getByText("Private business contact saved.", { exact: true })).toBeVisible();

  await page.getByLabel("Street address (required)", { exact: true }).fill("1 Example Way");
  await page.getByLabel("Address city (required)", { exact: true }).fill("Pittsburgh");
  await page.getByLabel("Address state (required)", { exact: true }).fill("pa");
  await page.getByLabel("ZIP code (required)", { exact: true }).fill("15222");
  await page.getByRole("button", { name: "Save business address", exact: true }).click();
  await expect(page.getByText("Business address saved.", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Business email (required; not published)", { exact: true })).toHaveValue("ops@example.test");
  await expect(page.getByLabel("Business phone (required; not published)", { exact: true })).toHaveValue("555-010-2000");
  await expect(page.getByLabel("Street address (required)", { exact: true })).toHaveValue("1 Example Way");
  await page.getByLabel("Organization (required)", { exact: true }).selectOption(org2);
  await expect(page.getByLabel("Business email (required; not published)", { exact: true })).toHaveValue("");
  await page.getByLabel("Organization (required)", { exact: true }).selectOption(org1);
  await expect(page.getByLabel("Business email (required; not published)", { exact: true })).toHaveValue("ops@example.test");
  await expect(page.getByLabel("Street address (required)", { exact: true })).toHaveValue("1 Example Way");

  expect(writes).toEqual([
    [`/api/v1/organizations/${org1}/businesses/${business}/ein`, { ein: "123456789" }],
    [`/api/v1/organizations/${org1}/businesses/${business}/contact`, { email: "ops@example.test", phone: "555-010-2000" }],
    [`/api/v1/organizations/${org1}/primary-location`, { addressLine1: "1 Example Way", addressLine2: null, city: "Pittsburgh", state: "PA", postalCode: "15222", country: "US" }],
  ]);
  // Only Bridge's EIN check is left, so submission stays blocked with a plain reason.
  await expect(page.getByText("Complete before submission: ein verification.", { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();
  await evidence(page, testInfo, "verification-details", errors);
});

test("directory filters reset cursor and discard an old in-flight page", async ({ page }, testInfo) => {
  const queries = [];
  let nextPageStarted = false;
  const errors = await setup(page, async (route, url) => {
    if (url.pathname !== "/api/v1/directory/profiles") return false;
    queries.push(Object.fromEntries(url.searchParams));
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      nextPageStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fulfill({ json: { profiles: [{ ...profile, slug: "stale", displayName: "Stale next-page result" }], pageInfo: { nextCursor: null, hasMore: false } } });
    }
    const filtered = url.searchParams.get("state") === "Oregon";
    return route.fulfill({ json: { profiles: [{ ...profile, displayName: filtered ? "Filtered business" : "Initial business" }], pageInfo: { nextCursor: filtered ? null : "opaque-initial", hasMore: !filtered } } });
  });
  await openPage(page, "/explore");
  await expect(page.getByRole("heading", { name: "Initial business", exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect.poll(() => nextPageStarted).toBe(true);
  await page.getByLabel("State", { exact: true }).fill("Oregon");
  await page.getByLabel("Category", { exact: true }).fill("Wholesale");
  await page.getByLabel("City", { exact: true }).fill("Portland");
  await page.getByLabel("Region", { exact: true }).fill("Willamette Valley");
  await expect(page.getByRole("heading", { name: "Initial business", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Filtered business", exact: true })).toBeVisible();
  await expect.poll(() => queries.at(-1)?.region).toBe("Willamette Valley");
  expect(queries.at(-1)).toMatchObject({ state: "Oregon", category: "Wholesale", city: "Portland", region: "Willamette Valley" });
  expect(queries.at(-1).cursor).toBeUndefined();
  await page.waitForTimeout(900);
  await expect(page.getByRole("heading", { name: "Stale next-page result", exact: true })).toHaveCount(0);
  await expect(page.getByText("1 business loaded", { exact: true })).toBeVisible();
  await evidence(page, testInfo, "directory", errors);
});


for (const index of [25, 75]) {
  test(`sent notification opens request at index ${index}`, async ({ page }) => {
    const requests = Array.from({ length: 80 }, (_, row) => ({ id: `request-${row}`, subject: `Request ${row}`, status: "new", createdAt: "2026-10-21T10:00:00Z" }));
    await setup(page, async (route, url) => {
      if (url.pathname !== "/api/v1/contact-requests/sent") return false;
      const limit = Number(url.searchParams.get("limit")), offset = Number(url.searchParams.get("offset"));
      return route.fulfill({ json: { requests: requests.slice(offset, offset + limit), pageInfo: { limit, offset, hasMore: offset + limit < requests.length } } });
    });
    await openPage(page, `/requests/sent?requestId=request-${index}`);
    await expect(page.getByRole("heading", { name: `Request ${index}`, exact: true })).toBeVisible();
  });
}

test("profile detail recovers after a failed read and retry", async ({ page }) => {
  let reads = 0;
  await setup(page, async (route, url) => {
    if (url.pathname !== "/api/v1/directory/profiles/example-brand") return false;
    return ++reads === 1
      ? route.fulfill({ status: 500, json: { error: "READ_FAILED", message: "Temporary failure" } })
      : route.fulfill({ json: { profile } });
  });
  await openPage(page, "/profile/example-brand");
  await expect(page.getByRole("heading", { name: "Profile unavailable", exact: true })).toBeVisible();
  await expect(page.locator("main [role='alert']")).toContainText("Temporary failure");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Example Brand", exact: true })).toBeVisible();
  // Next keeps an empty route-announcement alert outside the application content.
  await expect(page.locator("main [role='alert']")).toHaveCount(0);
});

test("failed preferences cannot save defaults and retry restores server choices", async ({ page }) => {
  let reads = 0, writes = 0;
  const preferences = { profile: { inApp: false, email: false }, contact: { inApp: false, email: false }, verification: { inApp: false, email: false } };
  await setup(page, async (route, url) => {
    if (url.pathname !== "/api/v1/notification-preferences") return false;
    if (route.request().method() === "PUT") { writes++; return route.fulfill({ json: { preferences } }); }
    return ++reads === 1
      ? route.fulfill({ status: 500, json: { error: "READ_FAILED", message: "Temporary failure" } })
      : route.fulfill({ json: { preferences } });
  });
  await openPage(page, "/notifications/preferences");
  await expect(page.getByRole("button", { name: "Retry preferences", exact: true })).toBeVisible();
  await expect(page.locator("main [role='alert']")).toContainText("Temporary failure");
  await expect(page.getByRole("button", { name: "Save preferences", exact: true })).toBeDisabled();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Retry preferences", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save preferences", exact: true })).toBeEnabled();
  for (const input of await page.locator('form input[type="checkbox"]').all()) await expect(input).not.toBeChecked();
  await expect(page.locator("main [role='alert']")).toHaveCount(0);
});

test("sales-rep page managers use assigned links without loading an organization inbox", async ({ page }) => {
  let organizationReads = 0;
  await setup(page, async (route, url) => {
    if (url.pathname.includes("/organizations/") && url.pathname.endsWith("/contact-requests")) { organizationReads++; return route.fulfill({ status: 403, json: { error: "FORBIDDEN" } }); }
    if (url.pathname === "/api/v1/contact-requests/assigned-request") return route.fulfill({ json: { request: { id: "assigned-request", subject: "Assigned request", status: "new", createdAt: "2026-10-21T10:00:00Z" } } });
    return false;
  }, "page_manager", "sales_rep");
  await openPage(page, "/requests");
  await expect(page.getByRole("heading", { name: "No accessible inbox", exact: true })).toBeVisible();
  expect(organizationReads).toBe(0);
  await openPage(page, "/requests?requestId=assigned-request");
  await expect(page.getByRole("heading", { name: "Assigned request", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark viewed", exact: true })).toBeVisible();
  expect(organizationReads).toBe(0);
});

for (const hasBusiness of [false, true]) {
  test(`page manager waits for owner profile setup with business=${hasBusiness}`, async ({ page }) => {
    await setup(page, async (route, url) => {
      if (url.pathname.endsWith("/businesses")) return route.fulfill({ json: { businesses: hasBusiness ? [{ id: business, legalName: "Example Brand LLC", status: "active" }] : [] } });
      if (url.pathname.endsWith("/directory-profile")) return route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
      return false;
    }, "page_manager");
    await openPage(page, "/my-profile");
    await expect(page.getByRole("heading", { name: "Profile setup required", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create business", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
  });
}


test("delayed business A contact never replaces business B or its saved payload", async ({ page }) => {
  const businessB = "77777777-7777-4777-8777-777777777777";
  const writes = [];
  let releaseA, markARequested;
  const aRequested = new Promise((resolve) => { markARequested = resolve; });
  const aGate = new Promise((resolve) => { releaseA = resolve; });
  await setup(page, async (route, url) => {
    if (url.pathname.endsWith("/businesses")) return route.fulfill({ json: { businesses: [business, businessB].map((id) => ({ id, organizationId: org1, legalName: id === business ? "Business A" : "Business B", status: "active" })) } });
    if (url.pathname.endsWith("/directory-profile")) return route.fulfill({ json: { profile: { ...profile, status: "draft", hasPublishedVersion: false } } });
    if (url.pathname.endsWith("/submission-readiness")) return route.fulfill({ json: { ready: true, missingFields: [] } });
    if (url.pathname.endsWith("/license")) return route.fulfill({ json: { license: null } });
    if (url.pathname.endsWith("/primary-location")) return route.fulfill({ json: { location: null } });
    if (url.pathname.endsWith("/contact")) {
      const id = url.pathname.includes(businessB) ? businessB : business;
      if (route.request().method() === "PUT") {
        writes.push({ businessId: id, ...route.request().postDataJSON() });
        return route.fulfill({ json: { contact: writes.at(-1) } });
      }
      if (id === business) { markARequested(); await aGate; }
      return route.fulfill({ json: { contact: { businessId: id, email: id === business ? "a@example.test" : "b@example.test", phone: id === business ? "555-010-1000" : "555-010-2000" } } });
    }
    return false;
  });
  await openPage(page, "/my-profile");
  await aRequested;
  await expect(page.getByRole("button", { name: "Save private contact", exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: "Business (required)", exact: true }).selectOption(businessB);
  await expect(page.getByLabel("Business email (required; not published)", { exact: true })).toHaveValue("b@example.test");
  const oldResponse = page.waitForResponse((response) => response.url().endsWith(`/businesses/${business}/contact`));
  releaseA();
  await oldResponse;
  // Flush the released response's React work before verifying the current selection.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByLabel("Business email (required; not published)", { exact: true })).toHaveValue("b@example.test");
  await expect(page.getByLabel("Business phone (required; not published)", { exact: true })).toHaveValue("555-010-2000");
  await page.getByRole("button", { name: "Save private contact", exact: true }).click();
  await expect(page.getByText("Private business contact saved.", { exact: true })).toBeVisible();
  expect(writes).toEqual([{ businessId: businessB, email: "b@example.test", phone: "555-010-2000" }]);
});

for (const key of ["Enter", "Space"]) {
  test(`admin nested review action and profile link work with ${key}`, async ({ page }) => {
    let approvals = 0;
    const record = { id: profile.id, organization: { id: org1, name: "Example organization" }, business: { id: business, legalName: "Example Brand LLC", dbaName: null }, workingProfile: { ...profile, hasLogo: false }, status: "pending_review", submittedAt: "2026-10-21T10:00:00Z", hasPublishedVersion: true, verificationEligibility: { eligible: true, einVerified: true, organizationActive: true, businessActive: true } };
    await setup(page, async (route, url) => {
      if (url.pathname === "/api/v1/admin/directory-profiles") return route.fulfill({ json: { profiles: [record], pageInfo: { limit: 20, offset: 0, hasMore: false } } });
      if (url.pathname.endsWith(`/directory-profiles/${profile.id}/approve`)) { approvals++; return route.fulfill({ json: {} }); }
      if (url.pathname === "/api/v1/directory/profiles/example-brand") return route.fulfill({ json: { profile } });
      return false;
    }, "owner", "standard", ["admin"]);
    await openPage(page, "/admin/directory-profiles");
    const approve = page.getByRole("button", { name: "Approve", exact: true });
    await expect(approve).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await approve.focus(); await approve.press(key);
    await expect(page.getByText("Approve completed for Example Brand.", { exact: true })).toBeVisible();
    expect(approvals).toBe(1);
    const toggle = page.getByRole("button", { name: "Example Brand", exact: true });
    await toggle.focus(); await toggle.press(key);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("article[role=button]")).toHaveCount(0);
    const link = page.getByRole("link", { name: "Open current published profile", exact: true });
    await expect(link).toBeVisible();
    await link.focus(); await link.press("Enter");
    await expect(page).toHaveURL(/\/profile\/example-brand$/);
  });
}

test("EIN lookup completion refreshes the currently selected status", async ({ page }) => {
  let releaseLookup, markLookupStarted;
  const lookupStarted = new Promise((resolve) => { markLookupStarted = resolve; });
  const lookupGate = new Promise((resolve) => { releaseLookup = resolve; });
  const queueStatuses = [];
  const entry = (status) => ({ verificationCaseId: `case-${status}`, verificationItemId: `item-${status}`, organizationName: "Example organization", businessLegalName: status === "verified" ? "Verified business" : "Pending business", itemType: "ein", status, caseSubmittedAt: "2026-10-21T10:00:00Z", itemUpdatedAt: "2026-10-21T10:00:00Z", einCheckState: status === "verified" ? "match" : "not_checked", einCheckMode: null, einLastCheckedAt: null, einSafeReason: null });
  await setup(page, async (route, url) => {
    if (url.pathname === "/api/v1/admin/verification-queue") {
      const status = url.searchParams.get("status") || "pending"; queueStatuses.push(status);
      return route.fulfill({ json: { entries: [entry(status)] } });
    }
    if (url.pathname === "/api/v1/admin/business-licenses") return route.fulfill({ json: { licenses: [] } });
    if (url.pathname.endsWith("/ein/verify")) {
      expect(route.request().postDataJSON().mode).toBe("mock"); markLookupStarted(); await lookupGate;
      return route.fulfill({ json: {} });
    }
    return false;
  }, "owner", "standard", ["admin"]);
  await openPage(page, "/admin/verification");
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("pending");
  await page.getByRole("combobox", { name: "EIN lookup", exact: true }).selectOption("mock");
  await page.getByRole("button", { name: "Run check", exact: true }).click();
  await lookupStarted;
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("verified");
  await expect(page.getByText("Verified business", { exact: true })).toBeVisible();
  const countBeforeCompletion = queueStatuses.length;
  releaseLookup();
  await expect.poll(() => queueStatuses.length).toBeGreaterThan(countBeforeCompletion);
  await expect(page.getByText("Mock test completed without contacting Cobalt. Review the refreshed result before approving.", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("verified");
  await expect(page.getByText("Verified business", { exact: true })).toBeVisible();
  await expect(page.getByText("Pending business", { exact: true })).toHaveCount(0);
  expect(queueStatuses.slice(countBeforeCompletion)).toEqual(["verified"]);
});

test("business selection loads B protected fields before saving B", async ({ page }) => {
  const businessB = "77777777-7777-4777-8777-777777777777", writes = [];
  await setup(page, async (route, url) => {
    if (url.pathname.endsWith("/businesses")) return route.fulfill({ json: { businesses: [{ id: business, organizationId: org1, legalName: "A", websiteUrl: "https://a.example.test", employeeCount: 5 }, { id: businessB, organizationId: org1, legalName: "B", websiteUrl: "https://b.example.test", employeeCount: 42 }] } });
    if (route.request().method() === "PATCH" && url.pathname.endsWith(`/businesses/${businessB}`)) { writes.push({ path: url.pathname, ...route.request().postDataJSON() }); return route.fulfill({ json: {} }); }
    if (url.pathname.endsWith("/directory-profile")) return route.fulfill({ json: { profile: { ...profile, status: "draft" } } });
    if (url.pathname.endsWith("/submission-readiness")) return route.fulfill({ json: { ready: true, missingFields: [] } });
    if (url.pathname.endsWith("/license")) return route.fulfill({ json: { license: null } });
    if (url.pathname.endsWith("/contact")) return route.fulfill({ json: { contact: { email: null, phone: null } } });
    if (url.pathname.endsWith("/primary-location")) return route.fulfill({ json: { location: null } });
    return false;
  });
  await openPage(page, "/my-profile");
  const website = page.getByLabel("Business website (required; not published)", { exact: true });
  await expect(website).toHaveValue("https://a.example.test");
  await page.getByRole("combobox", { name: "Business (required)", exact: true }).selectOption(businessB);
  await expect(website).toHaveValue("https://b.example.test");
  await expect(page.getByLabel("Number of employees (required)", { exact: true })).toHaveValue("42");
  await page.getByRole("button", { name: "Save business details", exact: true }).click();
  await expect(page.getByText("Protected business details saved.", { exact: true })).toBeVisible();
  expect(writes).toEqual([{ path: `/api/v1/organizations/${org1}/businesses/${businessB}`, websiteUrl: "https://b.example.test", employeeCount: 42 }]);
});

test("choosing the fallback business on a fresh profile keeps contact saves enabled", async ({ page }) => {
  const writes = [];
  await setup(page, async (route, url) => {
    if (url.pathname.endsWith("/businesses")) return route.fulfill({ json: { businesses: [{ id: business, organizationId: org1, legalName: "A", websiteUrl: "https://a.example.test", employeeCount: 5 }] } });
    if (url.pathname.endsWith("/directory-profile")) return route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
    if (url.pathname.endsWith("/submission-readiness")) return route.fulfill({ json: { ready: true, missingFields: [] } });
    if (url.pathname.endsWith("/license")) return route.fulfill({ json: { license: null } });
    if (url.pathname.endsWith("/primary-location")) return route.fulfill({ json: { location: null } });
    if (url.pathname.endsWith("/contact")) {
      if (route.request().method() === "PUT") writes.push({ path: url.pathname, ...route.request().postDataJSON() });
      return route.fulfill({ json: { contact: { email: "a@example.test", phone: "555-010-1000" } } });
    }
    return false;
  });
  await openPage(page, "/my-profile");
  const save = page.getByRole("button", { name: "Save private contact", exact: true });
  await expect(save).toBeEnabled();
  await page.getByRole("combobox", { name: "Business (required)", exact: true }).selectOption(business);
  await expect(save).toBeEnabled();
  await expect(page.getByLabel("Business email (required; not published)", { exact: true })).toHaveValue("a@example.test");
  await expect(page.getByRole("button", { name: "Save business address", exact: true })).toBeEnabled();
  await save.click();
  await expect(page.getByText("Private business contact saved.", { exact: true })).toBeVisible();
  expect(writes).toEqual([{ path: `/api/v1/organizations/${org1}/businesses/${business}/contact`, email: "a@example.test", phone: "555-010-1000" }]);
});

test("organization change clears a selected logo and scoped business fields", async ({ page }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=", "base64");
  await setup(page, async (route, url) => {
    const organizationId = url.pathname.includes(org2) ? org2 : org1;
    if (url.pathname.endsWith("/businesses")) return route.fulfill({ json: { businesses: [{ id: business, organizationId, legalName: "Example", websiteUrl: organizationId === org1 ? "https://one.example.test" : "https://two.example.test", employeeCount: organizationId === org1 ? 5 : 12 }] } });
    if (url.pathname.endsWith("/directory-profile")) return route.fulfill({ json: { profile: { ...profile, organizationId, status: "draft", logoUrl: null } } });
    if (url.pathname.endsWith("/submission-readiness")) return route.fulfill({ json: { ready: true, missingFields: [] } });
    if (url.pathname.endsWith("/license")) return route.fulfill({ json: { license: null } });
    if (url.pathname.endsWith("/primary-location")) return route.fulfill({ json: { location: null } });
    if (url.pathname.endsWith("/contact")) return route.fulfill({ json: { contact: { email: organizationId === org1 ? "one@example.test" : "two@example.test", phone: "555-010-1000" } } });
    return false;
  });
  await openPage(page, "/my-profile");
  await page.getByLabel("Choose logo", { exact: true }).setInputFiles({ name: "one-logo.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("one-logo.png", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload logo", exact: true })).toBeEnabled();
  await page.getByRole("combobox", { name: "Organization (required)", exact: true }).selectOption(org2);
  await expect(page.getByLabel("Business website (required; not published)", { exact: true })).toHaveValue("https://two.example.test");
  await expect(page.getByLabel("Number of employees (required)", { exact: true })).toHaveValue("12");
  await expect(page.getByLabel("Business email (required; not published)", { exact: true })).toHaveValue("two@example.test");
  await expect(page.getByText("one-logo.png", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No logo uploaded", { exact: true })).toBeVisible();
  await expect(page.locator(".directory-logo-preview img")).toHaveCount(0);
  expect(await page.getByLabel("Choose logo", { exact: true }).evaluate((input) => input.files.length)).toBe(0);
  await expect(page.getByRole("button", { name: "Upload logo", exact: true })).toBeDisabled();
});

test("failed admin status load removes previous actionable cards", async ({ page }) => {
  const record = { id: profile.id, organization: { id: org1, name: "Example organization" }, business: { id: business, legalName: "Example Brand LLC" }, workingProfile: { ...profile, hasLogo: false }, status: "pending_review", submittedAt: null, hasPublishedVersion: false, verificationEligibility: { eligible: true } };
  await setup(page, async (route, url) => {
    if (url.pathname === "/api/v1/admin/directory-profiles") return url.searchParams.get("status") === "approved"
      ? route.fulfill({ status: 500, json: { message: "Filtered list failed" } })
      : route.fulfill({ json: { profiles: [record], pageInfo: { limit: 20, offset: 0, hasMore: false } } });
    return false;
  }, "owner", "standard", ["admin"]);
  await openPage(page, "/admin/directory-profiles");
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "approved", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toContainText("Filtered list failed");
  await expect(page.locator(".admin-directory-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
});

for (const failure of ["filter", "lookup refresh"]) {
  test(`failed EIN ${failure} removes old actionable rows`, async ({ page }) => {
    let failReads = false;
    const entry = { verificationCaseId: "case-pending", verificationItemId: "item-pending", organizationName: "Example organization", businessLegalName: "Pending business", itemType: "ein", status: "pending", caseSubmittedAt: null, itemUpdatedAt: "2026-10-21T10:00:00Z", einCheckState: "not_checked", einCheckMode: null, einLastCheckedAt: null, einSafeReason: null };
    await setup(page, async (route, url) => {
      if (url.pathname === "/api/v1/admin/business-licenses") return route.fulfill({ json: { licenses: [] } });
      if (url.pathname === "/api/v1/admin/verification-queue") return failReads || url.searchParams.get("status") === "verified"
        ? route.fulfill({ status: 500, json: { message: "EIN list failed" } })
        : route.fulfill({ json: { entries: [entry] } });
      if (url.pathname.endsWith("/ein/verify")) { failReads = true; return route.fulfill({ json: {} }); }
      return false;
    }, "owner", "standard", ["admin"]);
    await openPage(page, "/admin/verification");
    await expect(page.getByText("Pending business", { exact: true })).toBeVisible();
    if (failure === "filter") await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("verified");
    else {
      await page.getByRole("combobox", { name: "EIN lookup", exact: true }).selectOption("mock");
      await page.getByRole("button", { name: "Run check", exact: true }).click();
    }
    await expect(page.locator("main [role=alert]")).toContainText("EIN list failed");
    await expect(page.getByText("Pending business", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run check", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  });
}

test("a pending EIN action disables every row until the mutation completes", async ({ page }) => {
  let releaseLookup, markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const gate = new Promise((resolve) => { releaseLookup = resolve; });
  const mutations = [];
  const entries = ["x", "y", "z", "w"].map((id, index) => ({ verificationCaseId: `case-${id}`, verificationItemId: id, organizationName: "Example organization", businessLegalName: `Business ${id}`, itemType: "ein", status: "pending", caseSubmittedAt: null, itemUpdatedAt: "2026-10-21T10:00:00Z", einCheckState: index === 2 ? "match" : index === 3 ? "no_match" : "not_checked", einCheckMode: null, einLastCheckedAt: null, einSafeReason: null }));
  await setup(page, async (route, url) => {
    if (url.pathname === "/api/v1/admin/business-licenses") return route.fulfill({ json: { licenses: [] } });
    if (url.pathname === "/api/v1/admin/verification-queue") return route.fulfill({ json: { entries } });
    if (route.request().method() === "POST") { mutations.push(url.pathname); markStarted(); await gate; return route.fulfill({ json: {} }); }
    return false;
  }, "owner", "standard", ["admin"]);
  await openPage(page, "/admin/verification");
  await page.getByRole("combobox", { name: "EIN lookup", exact: true }).selectOption("mock");
  await page.locator("#verification-x").getByRole("button", { name: "Run check", exact: true }).click();
  await started;
  const second = page.locator("#verification-y").getByRole("button", { name: "Run check", exact: true });
  await expect(second).toBeDisabled();
  await expect(page.locator("#verification-z").getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await expect(page.locator("#verification-w").getByRole("button", { name: "Request correction", exact: true })).toBeDisabled();
  await expect(page.locator("#verification-w").getByRole("button", { name: "Reject", exact: true })).toBeDisabled();
  await second.evaluate((button) => button.click());
  expect(mutations).toEqual(["/api/v1/verification-items/x/ein/verify"]);
  releaseLookup();
  await expect(second).toBeEnabled();
});
