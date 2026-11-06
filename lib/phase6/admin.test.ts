import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test/";
const { adminApi, flagReasonLabel, moderationErrorMessage, parseFlag, resolutionsFor, validateReportNote } = await import("./admin.ts");
const { M4ApiError } = await import("../m4/api.ts");

type Call = { url: string; init: RequestInit };
function stubFetch(status: number, payload: unknown, calls: Call[] = []) {
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }) as typeof fetch;
  return calls;
}
const flagRow = { id: "f1", targetType: "post", targetId: "p1", targetLabel: "Fall line", targetSlug: "fixture-a", targetAvailable: true, reason: "spam", note: "Twice", status: "open", resolution: null, resolutionNote: null, resolvedAt: null, reporterDisplayName: "Owner B", createdAt: "2026-10-22T12:00:00Z" };

test("resolutions follow the target: posts can be archived, profiles only suspended or dismissed, resolved reports offer nothing", () => {
  assert.deepEqual(resolutionsFor({ targetType: "post", status: "open" }), ["post_archived", "profile_suspended", "dismissed"]);
  assert.deepEqual(resolutionsFor({ targetType: "profile", status: "open" }), ["profile_suspended", "dismissed"]);
  assert.deepEqual(resolutionsFor({ targetType: "post", status: "resolved" }), []);
  assert.equal(flagReasonLabel("prohibited_or_medical_claim"), "Prohibited product or medical claim");
  assert.equal(flagReasonLabel("unknown"), "unknown");
  assert.equal(validateReportNote("x".repeat(1001)), "Keep the note to 1,000 characters or fewer.");
  assert.equal(validateReportNote(" fine "), null);
});

test("reports send one target reference, trim the note and omit it when blank", async () => {
  const calls = stubFetch(201, { flag: { id: "f1", status: "open" } });
  assert.deepEqual(await adminApi.report({ type: "post", postId: "p1", label: "Fall line" }, "spam", "  Twice  "), { id: "f1" });
  assert.equal(calls[0].url, "https://api.example.test/api/v1/flags");
  assert.equal(calls[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { targetType: "post", postId: "p1", reason: "spam", note: "Twice" });
  await adminApi.report({ type: "profile", slug: "fixture-a", label: "Fixture A" }, "other", "   ");
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { targetType: "profile", slug: "fixture-a", reason: "other" });
});

test("the admin queue parses rows defensively and resolves with a trimmed note", async () => {
  const calls = stubFetch(200, { flags: [flagRow, { id: "f2", reason: "bogus", status: "weird" }], pageInfo: { limit: 50, offset: 0, hasMore: true } });
  const page = await adminApi.listFlags("open", 50);
  assert.equal(calls[0].url, "https://api.example.test/api/v1/admin/flags?status=open&limit=50&offset=50");
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.flags[0], { ...flagRow, resolution: null });
  assert.equal(page.flags[1].reason, "other");
  assert.equal(page.flags[1].status, "open");
  assert.equal(page.flags[1].targetLabel, "Reported content");
  assert.throws(() => parseFlag({ status: "open" }), M4ApiError);
  stubFetch(200, { flag: { ...flagRow, status: "resolved", resolution: "dismissed", resolutionNote: "Not a violation" } }, calls);
  const resolved = await adminApi.resolveFlag("f1", "dismissed", " Not a violation ");
  assert.equal(calls[1].url, "https://api.example.test/api/v1/admin/flags/f1/resolve");
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { resolution: "dismissed", note: "Not a violation" });
  assert.equal(resolved.resolution, "dismissed");
});

test("dashboard counts and user detail are parsed into numbers and typed fields", async () => {
  stubFetch(200, { summary: { pendingEinChecks: "2", profilesAwaitingReview: 1, openFlags: null, publishedPosts: 4, publishedAnnouncements: 1, contactRequestsWaiting: 3, generatedAt: "2026-10-22T12:00:00Z" } });
  assert.deepEqual(await adminApi.dashboardSummary(), { pendingEinChecks: 2, profilesAwaitingReview: 1, openFlags: 0, publishedPosts: 4, publishedAnnouncements: 1, contactRequestsWaiting: 3, generatedAt: "2026-10-22T12:00:00Z" });
  const calls = stubFetch(200, { user: { id: "u1", email: "t@example.test", displayName: "Target", emailVerified: true, createdAt: "x", lastSignInAt: null, deactivated: true, accountType: "sales_rep", platformRole: "admin" }, memberships: [{ organizationId: "o1", organizationName: "Fixture A", organizationStatus: "active", role: "owner", status: "active", directoryProfile: { status: "approved", slug: "fixture-a" }, einVerified: true }] });
  const detail = await adminApi.userDetail("u1");
  assert.equal(calls[0].url, "https://api.example.test/api/v1/admin/users/u1");
  assert.equal(detail.user.deactivated, true);
  assert.equal(detail.user.platformRole, "admin");
  assert.deepEqual(detail.memberships[0].directoryProfile, { status: "approved", slug: "fixture-a" });
  stubFetch(200, { user: { id: "u1", active: false } }, calls);
  await adminApi.deactivateUser("u1", " Left ");
  await adminApi.reactivateUser("u1", "");
  await adminApi.removePlatformRole("u1", "Rotation");
  await adminApi.setAccountType("u1", "standard");
  assert.deepEqual(calls.slice(1).map((c) => [c.url.replace("https://api.example.test/api/v1/admin/users/u1", ""), c.init.method, c.init.body ? JSON.parse(String(c.init.body)) : null]), [
    ["/deactivate", "POST", { reason: "Left" }], ["/reactivate", "POST", {}], ["/platform-role", "DELETE", { reason: "Rotation" }], ["/account-type", "PATCH", { accountType: "standard" }],
  ]);
});

test("server errors become plain-language copy for members and admins", () => {
  assert.equal(moderationErrorMessage(new M4ApiError(403, "MODERATION_FORBIDDEN", ""), "report"), "Only active members can report content.");
  assert.equal(moderationErrorMessage(new M4ApiError(403, "FORBIDDEN", "")), "This account does not have permission for that.");
  assert.equal(moderationErrorMessage(new M4ApiError(409, "MODERATION_DUPLICATE", ""), "report"), "You already reported this. Bridge admins will review it.");
  assert.equal(moderationErrorMessage(new M4ApiError(409, "MODERATION_INVALID_STATE", "")), "That changed while you were working. Refresh to see the latest.");
  assert.equal(moderationErrorMessage(new M4ApiError(409, "ADMIN_USER_INVALID_STATE", "")), "That change is not allowed for this user.");
  assert.equal(moderationErrorMessage(new M4ApiError(404, "MODERATION_NOT_FOUND", ""), "report"), "This content is no longer public, so it cannot be reported.");
  assert.equal(moderationErrorMessage(new M4ApiError(0, "NETWORK_ERROR", "")), "Bridge could not be reached. Check your connection and try again.");
  assert.equal(moderationErrorMessage(new Error("boom")), "Something went wrong. Try again.");
});
