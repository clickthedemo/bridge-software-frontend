import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test/";
const { engagementApi, engagementErrorMessage, EngagementApiError, parseCursor, parseItem, validateItemInput } = await import("./engagement.ts");

type Call = { url: string; init: RequestInit };
function stubFetch(status: number, payload: unknown, calls: Call[] = []) {
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }) as typeof fetch;
  return calls;
}

test("input validation blocks empty and oversized posts before any request", () => {
  assert.equal(validateItemInput({ title: "  ", body: "x", publish: false }), "Add a title.");
  assert.equal(validateItemInput({ title: "x".repeat(161), body: "x", publish: false }), "Keep the title to 160 characters or fewer.");
  assert.equal(validateItemInput({ title: "x", body: " ", publish: false }), "Add the update text.");
  assert.equal(validateItemInput({ title: "x", body: "y".repeat(5001), publish: false }), "Keep the text to 5,000 characters or fewer.");
  assert.equal(validateItemInput({ title: "Fall line", body: "Now shipping", publish: true }), null);
});

test("responses are parsed defensively", () => {
  assert.throws(() => parseItem({ title: "no id" }), EngagementApiError);
  assert.equal(parseItem({ id: "1", status: "bogus" }).status, "draft");
  assert.equal(parseCursor(null), null);
  assert.equal(parseCursor({ before: "2026-10-19T12:00:00Z" }), null);
  assert.deepEqual(parseCursor({ before: "t", beforeId: "i" }), { before: "t", beforeId: "i" });
});

test("public post feed sends cursor and profile, includes cookies, maps rows", async () => {
  const calls = stubFetch(200, { posts: [{ id: "p1", title: "T", body: "B", publishedAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z", profile: { slug: "fixture-a", displayName: "Fixture A" } }], nextCursor: { before: "2026-10-19T12:00:00Z", beforeId: "p1" } });
  const page = await engagementApi.publicPosts({ profile: "fixture-a", cursor: { before: "2026-10-20T00:00:00Z", beforeId: "p0" }, limit: 1 });
  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, "https://api.example.test/api/v1/posts");
  assert.equal(url.searchParams.get("profile"), "fixture-a");
  assert.equal(url.searchParams.get("beforeId"), "p0");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(page.items[0].profile.displayName, "Fixture A");
  assert.deepEqual(page.nextCursor, { before: "2026-10-19T12:00:00Z", beforeId: "p1" });
});

test("creating a post trims text and posts JSON to the organization", async () => {
  const calls = stubFetch(201, { id: "p2", title: "Hi", body: "There", status: "published", publishedAt: "2026-10-19T12:00:00Z", createdAt: "x", updatedAt: "x" });
  const item = await engagementApi.createPost("org/1", { title: "  Hi ", body: " There ", publish: true });
  assert.equal(calls[0].url, "https://api.example.test/api/v1/organizations/org%2F1/posts");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { title: "Hi", body: "There", publish: true });
  assert.equal(item.status, "published");
});

test("saved profiles use PUT and DELETE on the encoded slug", async () => {
  const calls = stubFetch(200, { slug: "a", saved: true });
  assert.equal(await engagementApi.saveProfile("fixture-a"), true);
  assert.equal(await engagementApi.unsaveProfile("fixture-a"), false);
  assert.deepEqual(calls.map((c) => c.init.method), ["PUT", "DELETE"]);
  assert.ok(calls.every((c) => c.url.endsWith("/api/v1/saved-profiles/fixture-a")));
});

test("server errors become typed errors with plain-language copy", async () => {
  stubFetch(409, { error: "ENGAGEMENT_INVALID_STATE", message: "x" });
  await assert.rejects(engagementApi.createPost("o", { title: "t", body: "b", publish: true }), (e: unknown) => e instanceof EngagementApiError && e.status === 409 && e.code === "ENGAGEMENT_INVALID_STATE");
  assert.match(engagementErrorMessage(new EngagementApiError(409, "ENGAGEMENT_INVALID_STATE", "")), /approved, verified profile/);
  assert.equal(engagementErrorMessage(new EngagementApiError(403, "FORBIDDEN", "")), "This account does not have permission for that.");
  assert.equal(engagementErrorMessage(new EngagementApiError(0, "NETWORK_ERROR", "")), "Bridge could not be reached. Check your connection and try again.");
  assert.equal(engagementErrorMessage(new Error("boom")), "Something went wrong. Try again.");
  globalThis.fetch = (async () => { throw new TypeError("offline"); }) as typeof fetch;
  await assert.rejects(engagementApi.announcements(), (e: unknown) => e instanceof EngagementApiError && e.status === 0);
});
