import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const me = { user: { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test", accountType: "standard", platformRoles: [], profile: { displayName: "Owner" } }, memberships: [{ organizationId: ORG, organizationName: "Fixture A", organizationType: "brand", role: "owner", status: "active" }] };
const item = (over) => ({ id: "p1", title: "Fall line", body: "Now shipping", status: "draft", publishedAt: null, createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z", ...over });

async function setup(page, handler) {
  await page.addInitScript(() => localStorage.setItem("bridge-age-confirmed-v1", "confirmed"));
  await page.route("https://bridge-api.example.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/auth/me") return route.fulfill({ json: me });
    if (url.pathname === "/api/v1/notifications") return route.fulfill({ json: { notifications: [], pageInfo: { limit: 50, offset: 0, hasMore: false } } });
    return handler(route, url);
  });
}
async function openPage(page, path) {
  await page.goto(path);
  await expect(page.locator(".age-gated-content")).toHaveAttribute("aria-hidden", "false", { timeout: 15000 });
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
async function evidence(page, testInfo, name) {
  await mkdir("/tmp/bridge-m4-evidence", { recursive: true });
  const path = `/tmp/bridge-m4-evidence/${testInfo.project.name}-phase5-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("announcements recover from an outage and page with the cursor", async ({ page }, testInfo) => {
  let reads = 0;
  await setup(page, async (route, url) => {
    expect(url.pathname).toBe("/api/v1/announcements");
    reads++;
    if (reads === 1) return route.fulfill({ status: 503, json: { error: "ENGAGEMENT_UNAVAILABLE", message: "x" } });
    if (!url.searchParams.get("before")) return route.fulfill({ json: { announcements: [{ id: "a2", title: "Bridge is live in Michigan", body: "Details", publishedAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" }], nextCursor: { before: "2026-10-19T12:00:00Z", beforeId: "a2" } } });
    expect(url.searchParams.get("beforeId")).toBe("a2");
    return route.fulfill({ json: { announcements: [{ id: "a1", title: "Welcome to Bridge", body: "Hello", publishedAt: "2026-10-18T12:00:00Z", updatedAt: "2026-10-18T12:00:00Z" }], nextCursor: null } });
  });
  await openPage(page, "/announcements");
  await expect(page.locator(".form-error[role=\"alert\"]")).toHaveText("Bridge is unavailable right now. Your text is still here, try again.");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Bridge is live in Michigan" })).toBeVisible();
  await page.getByRole("button", { name: "Show older announcements" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Bridge" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show older announcements" })).toHaveCount(0);
  await noOverflow(page);
  await evidence(page, testInfo, "announcements");
});

test("a business owner drafts, is blocked from publishing unverified, then publishes", async ({ page }, testInfo) => {
  const writes = [];
  await setup(page, async (route, url) => {
    const method = route.request().method();
    if (url.pathname === `/api/v1/organizations/${ORG}/posts` && method === "GET") return route.fulfill({ json: { posts: [], pageInfo: { limit: 100, offset: 0, hasMore: false } } });
    if (url.pathname === `/api/v1/organizations/${ORG}/posts` && method === "POST") {
      const body = route.request().postDataJSON(); writes.push(body);
      if (body.publish && writes.length === 1) return route.fulfill({ status: 409, json: { error: "ENGAGEMENT_INVALID_STATE", message: "x" } });
      return route.fulfill({ status: 201, json: item({ title: body.title, body: body.body }) });
    }
    if (url.pathname === "/api/v1/posts/p1" && method === "PATCH") { writes.push(route.request().postDataJSON()); return route.fulfill({ json: item({ status: "published", publishedAt: "2026-10-19T13:00:00Z" }) }); }
    return route.fulfill({ status: 404, json: { error: "NOT_FOUND", message: "x" } });
  });
  await openPage(page, "/create");
  await expect(page.getByRole("heading", { name: "No updates yet" })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".form-error[role=\"alert\"]")).toHaveText("Add a title.");
  expect(writes).toHaveLength(0);
  await page.getByLabel("Title").fill("Fall line");
  await page.getByLabel("Text").fill("Now shipping");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".form-error[role=\"alert\"]")).toContainText("approved, verified profile");
  await expect(page.getByLabel("Title")).toHaveValue("Fall line");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fall line" })).toBeVisible();
  await page.getByRole("article").getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Update published.")).toBeVisible();
  expect(writes).toEqual([{ title: "Fall line", body: "Now shipping", publish: true }, { title: "Fall line", body: "Now shipping", publish: false }, { status: "published" }]);
  await noOverflow(page);
  await evidence(page, testInfo, "create-post");
});

test("a signed-in member saves a profile and sees its updates", async ({ page }, testInfo) => {
  const saves = [];
  await setup(page, async (route, url) => {
    const method = route.request().method();
    if (url.pathname === "/api/v1/directory/profiles/fixture-a") return route.fulfill({ json: { profile: { slug: "fixture-a", displayName: "Fixture A", summary: "Brand", categories: [], links: [], publicContact: { email: null, phone: null }, verified: true } } });
    if (url.pathname === "/api/v1/saved-profiles" && method === "GET") return route.fulfill({ json: { savedProfiles: [], pageInfo: { limit: 100, offset: 0, hasMore: false } } });
    if (url.pathname === "/api/v1/saved-profiles/fixture-a") { saves.push(method); return route.fulfill({ json: { slug: "fixture-a", saved: method === "PUT" } }); }
    if (url.pathname === "/api/v1/posts") { expect(url.searchParams.get("profile")).toBe("fixture-a"); return route.fulfill({ json: { posts: [{ id: "p1", title: "Fall line", body: "Now shipping", publishedAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z", profile: { slug: "fixture-a", displayName: "Fixture A" } }], nextCursor: null } }); }
    return route.fulfill({ status: 404, json: { error: "NOT_FOUND", message: "x" } });
  });
  await openPage(page, "/profile/fixture-a");
  await expect(page.getByRole("heading", { name: "Updates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fall line" })).toBeVisible();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "View saved profiles" })).toBeVisible();
  await page.getByRole("button", { name: "Saved" }).click();
  await expect(page.getByRole("button", { name: "Save profile" })).toHaveAttribute("aria-pressed", "false");
  expect(saves).toEqual(["PUT", "DELETE"]);
  await noOverflow(page);
  await evidence(page, testInfo, "profile-save");
});
