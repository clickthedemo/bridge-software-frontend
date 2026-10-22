import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN_ID = "55555555-5555-4555-8555-555555555555";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const POST_ID = "44444444-4444-4444-8444-444444444444";
const FLAG_ID = "66666666-6666-4666-8666-666666666666";
const TARGET_ID = "77777777-7777-4777-8777-777777777777";
const member = { user: { id: MEMBER_ID, email: "owner-b@example.test", accountType: "standard", platformRoles: [], profile: { displayName: "Owner B" } }, memberships: [{ organizationId: ORG_B, organizationName: "Fixture B", organizationType: "brand", role: "owner", status: "active" }] };
const admin = { user: { id: ADMIN_ID, email: "admin@example.test", accountType: "standard", platformRoles: ["admin"], profile: { displayName: "Bridge Admin" } }, memberships: [] };
const profile = { profile: { slug: "fixture-a", displayName: "Fixture A", summary: "Brand", categories: [], links: [], publicContact: { email: null, phone: null }, verified: true } };
const post = { id: POST_ID, title: "Fall line", body: "Now shipping", publishedAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z", profile: { slug: "fixture-a", displayName: "Fixture A" } };
const flag = (over) => ({ id: FLAG_ID, targetType: "post", targetId: POST_ID, targetLabel: "Fall line", targetSlug: "fixture-a", targetAvailable: true, reason: "spam", note: "Seen it twice", status: "open", resolution: null, resolutionNote: null, resolvedAt: null, reporterDisplayName: "Owner B", createdAt: "2026-10-22T12:00:00Z", ...over });

async function setup(page, state, handler) {
  await page.addInitScript(() => localStorage.setItem("bridge-age-confirmed-v1", "confirmed"));
  await page.route("https://bridge-api.example.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/auth/me") return route.fulfill({ json: state.me });
    if (url.pathname === "/api/v1/notifications") return route.fulfill({ json: { notifications: [], pageInfo: { limit: 50, offset: 0, hasMore: false } } });
    if (url.pathname === "/api/v1/saved-profiles") return route.fulfill({ json: { savedProfiles: [], pageInfo: { limit: 100, offset: 0, hasMore: false } } });
    const result = await handler(route, url);
    if (result !== false) return;
    return route.fulfill({ status: 404, json: { error: "NOT_FOUND", message: `Unexpected fixture route ${url.pathname}` } });
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
  const path = `/tmp/bridge-m4-evidence/${testInfo.project.name}-phase6-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("a member reports an update, an admin archives it, and it leaves the public feed", async ({ page }, testInfo) => {
  const state = { me: member, archived: false, reports: [], decisions: [] };
  await setup(page, state, async (route, url) => {
    const method = route.request().method();
    if (url.pathname === "/api/v1/directory/profiles/fixture-a") return route.fulfill({ json: profile });
    if (url.pathname === "/api/v1/posts") return route.fulfill({ json: { posts: state.archived ? [] : [post], nextCursor: null } });
    if (url.pathname === "/api/v1/flags" && method === "POST") { state.reports.push(route.request().postDataJSON()); return route.fulfill({ status: 201, json: { flag: { id: FLAG_ID, targetType: "post", status: "open", createdAt: "2026-10-22T12:00:00Z" } } }); }
    if (url.pathname === "/api/v1/admin/flags") {
      const open = url.searchParams.get("status") === "open";
      const flags = open ? (state.archived ? [] : [flag()]) : (state.archived ? [flag({ status: "resolved", resolution: "post_archived", resolutionNote: "Repeated spam", resolvedAt: "2026-10-22T13:00:00Z", targetAvailable: false })] : []);
      return route.fulfill({ json: { flags, pageInfo: { limit: 50, offset: 0, hasMore: false } } });
    }
    if (url.pathname === `/api/v1/admin/flags/${FLAG_ID}/resolve` && method === "POST") { state.decisions.push(route.request().postDataJSON()); state.archived = true; return route.fulfill({ json: { flag: flag({ status: "resolved", resolution: "post_archived", resolutionNote: "Repeated spam", resolvedAt: "2026-10-22T13:00:00Z" }) } }); }
    return false;
  });

  // Member: the profile shows the update with a report action.
  await openPage(page, "/profile/fixture-a");
  await expect(page.getByRole("heading", { name: "Fall line" })).toBeVisible();
  await page.getByRole("button", { name: "Report this update" }).click();
  const form = page.getByRole("form", { name: "Report this update: Fall line" });
  await form.getByLabel("Reason").selectOption("spam");
  await form.getByLabel("Details (optional)").fill("Seen it twice");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thanks. Bridge admins will review this report.")).toBeVisible();
  expect(state.reports).toEqual([{ targetType: "post", postId: POST_ID, reason: "spam", note: "Seen it twice" }]);
  await noOverflow(page);
  await evidence(page, testInfo, "report");

  // Admin: the report is in the queue; archive it with a reason.
  state.me = admin;
  await openPage(page, `/admin/flags?flagId=${FLAG_ID}`);
  const card = page.locator(`#flag-${FLAG_ID}`);
  await expect(card.getByRole("heading", { name: "Fall line" })).toBeVisible();
  await expect(card.getByText("Reporter note: Seen it twice")).toBeVisible();
  await card.getByRole("button", { name: "Archive post" }).click();
  const dialog = page.getByRole("dialog", { name: "Archive post" });
  await dialog.getByRole("button", { name: "Confirm archive post" }).click();
  await expect(dialog.locator(".form-error[role=\"alert\"]")).toHaveText("A reason is required.");
  await dialog.getByLabel("Reason (required)").fill("Repeated spam");
  await dialog.getByRole("button", { name: "Confirm archive post" }).click();
  await expect(page.getByRole("status")).toHaveText("Archive post completed for Fall line.");
  await expect(page.getByRole("heading", { name: "No open reports" })).toBeVisible();
  expect(state.decisions).toEqual([{ resolution: "post_archived", note: "Repeated spam" }]);
  await page.getByRole("button", { name: "Resolved" }).click();
  await expect(page.getByText("Reason: Repeated spam")).toBeVisible();
  await expect(page.getByText("No longer public")).toBeVisible();
  await noOverflow(page);
  await evidence(page, testInfo, "queue");

  // Public feed: the archived update is gone.
  await openPage(page, "/profile/fixture-a");
  await expect(page.getByText("No updates from this business yet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fall line" })).toHaveCount(0);
});

test("reports surface permission denied and duplicate states without a second submit", async ({ page }) => {
  let attempts = 0;
  await setup(page, { me: member }, async (route, url) => {
    if (url.pathname === "/api/v1/directory/profiles/fixture-a") return route.fulfill({ json: profile });
    if (url.pathname === "/api/v1/posts") return route.fulfill({ json: { posts: [], nextCursor: null } });
    if (url.pathname === "/api/v1/flags") { attempts++; return route.fulfill({ status: attempts === 1 ? 403 : 409, json: { error: attempts === 1 ? "MODERATION_FORBIDDEN" : "MODERATION_DUPLICATE", message: "x" } }); }
    return false;
  });
  await openPage(page, "/profile/fixture-a");
  await page.getByRole("button", { name: "Report this profile" }).click();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.locator(".report-form .form-error[role=\"alert\"]")).toHaveText("Only active members can report content.");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thanks. Bridge admins will review this report.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send report" })).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("the admin dashboard lists what needs attention and the user panel deactivates a user", async ({ page }, testInfo) => {
  const state = { me: admin, deactivated: false, actions: [] };
  const listed = () => ({ users: [{ id: TARGET_ID, email: "target@example.test", displayName: "Target User", emailVerified: true, createdAt: "2026-10-01T00:00:00Z", lastSignInAt: "2026-10-20T12:00:00Z", deactivated: state.deactivated, accountType: "standard", platformRole: null, organizationMemberships: [{ organizationId: ORG_B, organizationName: "Fixture B", role: "owner" }] }], pagination: { page: 1, pageSize: 50, total: 1 } });
  await setup(page, state, async (route, url) => {
    const method = route.request().method();
    if (url.pathname === "/api/v1/admin/dashboard/summary") return route.fulfill({ json: { summary: { pendingEinChecks: 2, profilesAwaitingReview: 1, openFlags: 3, publishedPosts: 4, publishedAnnouncements: 1, contactRequestsWaiting: 0, generatedAt: "2026-10-22T12:00:00Z" } } });
    if (url.pathname === "/api/v1/admin/users" && method === "GET") return route.fulfill({ json: listed() });
    if (url.pathname === `/api/v1/admin/users/${TARGET_ID}` && method === "GET") return route.fulfill({ json: { user: { ...listed().users[0], bannedUntil: null }, memberships: [{ organizationId: ORG_B, organizationName: "Fixture B", organizationStatus: "active", role: "owner", status: "active", directoryProfile: { status: "approved", slug: "fixture-b" }, einVerified: true }] } });
    if (url.pathname === `/api/v1/admin/users/${TARGET_ID}/deactivate` && method === "POST") { state.actions.push(route.request().postDataJSON()); state.deactivated = true; return route.fulfill({ json: { user: { id: TARGET_ID, active: false } } }); }
    return false;
  });
  await openPage(page, "/admin/dashboard");
  const needs = page.getByRole("region", { name: "Needs you" });
  await expect(needs.getByRole("link", { name: "2 EIN checks waiting" })).toHaveAttribute("href", "/admin/verification");
  await expect(needs.getByRole("link", { name: "3 Open reports" })).toHaveAttribute("href", "/admin/flags");
  await expect(needs.getByText("Contact requests waiting")).toHaveCount(0);
  await noOverflow(page);
  await evidence(page, testInfo, "dashboard");

  await openPage(page, "/admin/users");
  await page.getByRole("button", { name: "Target User" }).click();
  const panel = page.getByRole("region", { name: "Target User details" });
  await expect(panel.getByText("Verified", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Deactivate user" }).click();
  const dialog = page.getByRole("dialog", { name: "Deactivate user" });
  await dialog.getByLabel("Reason (required)").fill("Left the company");
  await dialog.getByRole("button", { name: "Confirm deactivate user" }).click();
  await expect(panel.getByRole("status")).toHaveText("User deactivated. Their sessions were ended and sign-in is blocked.");
  await expect(page.locator("table").getByText("Deactivated")).toHaveCount(2);
  expect(state.actions).toEqual([{ reason: "Left the company" }]);
  await noOverflow(page);
  await evidence(page, testInfo, "users");
});
