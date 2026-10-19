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
function identity(role = "owner") {
  return { user: { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test", accountType: "standard", platformRoles: [], profile: { displayName: "Example Owner", phone: null } },
    memberships: [org1, org2].map((organizationId, index) => ({ organizationId, organizationName: index ? "Second organization" : "First organization", organizationType: "brand", role, status: "active" })) };
}
async function setup(page, handler, role = "owner") {
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
      return route.fulfill({ json: identity(role) });
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
  let missing = ["private_email", "private_phone", "ein_verification", "business_address"];
  const errors = await setup(page, async (route, url) => {
    const method = route.request().method();
    if (url.pathname.endsWith("/businesses")) return route.fulfill({ json: { businesses: [{ id: business, organizationId: org1, legalName: "Example Brand LLC", dbaName: "Example Brand", websiteUrl: "https://example.test", employeeCount: 12, status: "active" }] } });
    if (url.pathname.endsWith("/submission-readiness")) return route.fulfill({ json: { ready: missing.length === 0, missingFields: missing } });
    if (url.pathname.endsWith("/license")) return route.fulfill({ json: { license: null } });
    if (url.pathname.endsWith("/directory-profile")) return route.fulfill({ json: { profile: { ...profile, status: "draft", hasPublishedVersion: false } } });
    if (method === "PUT" && url.pathname.endsWith(`/businesses/${business}/ein`)) { writes.push([url.pathname, route.request().postDataJSON()]); return route.fulfill({ json: { businessId: business, einLastFour: "6789" } }); }
    if (method === "PUT" && url.pathname.endsWith(`/businesses/${business}/contact`)) { writes.push([url.pathname, route.request().postDataJSON()]); missing = missing.filter((item) => !item.startsWith("private_")); return route.fulfill({ json: { contact: { businessId: business, ...route.request().postDataJSON() } } }); }
    if (method === "PUT" && url.pathname.endsWith(`/organizations/${org1}/primary-location`)) { writes.push([url.pathname, route.request().postDataJSON()]); missing = missing.filter((item) => item !== "business_address"); return route.fulfill({ json: { location: {} } }); }
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
