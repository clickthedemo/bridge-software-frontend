/* Phase 5 Early Engagement client: verified-profile posts, announcements and
   saved profiles. Contract: bridge-software-backend docs/phase-5-early-engagement-api.md. */
import { getBridgeApiBase } from "../phase3/client.ts";

export type EngagementStatus = "draft" | "published" | "archived";
export type EngagementItem = { id: string; title: string; body: string; status: EngagementStatus; publishedAt: string | null; createdAt: string; updatedAt: string };
export type PublicPost = { id: string; title: string; body: string; publishedAt: string; updatedAt: string; profile: { slug: string; displayName: string } };
export type PublicAnnouncement = { id: string; title: string; body: string; publishedAt: string; updatedAt: string };
export type SavedProfile = { slug: string; displayName: string; businessType: string | null; city: string | null; state: string | null; savedAt: string };
export type FeedCursor = { before: string; beforeId: string };
export type FeedPage<T> = { items: T[]; nextCursor: FeedCursor | null };
export type ItemInput = { title: string; body: string; publish: boolean };
export type ItemUpdate = { title?: string; body?: string; status?: EngagementStatus };

export class EngagementApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.name = "EngagementApiError"; this.status = status; this.code = code; }
}

/* Plain-language copy per failure so screens never show raw server text. */
export function engagementErrorMessage(error: unknown): string {
  if (!(error instanceof EngagementApiError)) return "Something went wrong. Try again.";
  if (error.status === 0) return "Bridge could not be reached. Check your connection and try again.";
  if (error.status === 401) return "Sign in to continue.";
  if (error.status === 403) return "This account does not have permission for that.";
  if (error.status === 404) return "That item is no longer available.";
  if (error.status === 409) return error.code === "ENGAGEMENT_INVALID_STATE"
    ? "Only an approved, verified profile can publish, and published items cannot go back to draft."
    : "That changed while you were working. Refresh and try again.";
  if (error.status === 400) return "Check the title and text, then try again.";
  return "Bridge is unavailable right now. Your text is still here, try again.";
}

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const nullable = (value: unknown) => typeof value === "string" ? value : null;
const status = (value: unknown): EngagementStatus => value === "published" || value === "archived" ? value : "draft";
const list = (value: unknown) => Array.isArray(value) ? value.map(object) : [];

export function parseItem(value: unknown): EngagementItem {
  const v = object(value);
  if (typeof v.id !== "string") throw new EngagementApiError(502, "INVALID_RESPONSE", "Bridge returned an unexpected response.");
  return { id: v.id, title: text(v.title), body: text(v.body), status: status(v.status), publishedAt: nullable(v.publishedAt), createdAt: text(v.createdAt), updatedAt: text(v.updatedAt) };
}
export function parseCursor(value: unknown): FeedCursor | null {
  const v = object(value);
  return typeof v.before === "string" && typeof v.beforeId === "string" ? { before: v.before, beforeId: v.beforeId } : null;
}

export function validateItemInput(input: ItemInput): string | null {
  const title = input.title.trim(), body = input.body.trim();
  if (!title) return "Add a title.";
  if (title.length > 160) return "Keep the title to 160 characters or fewer.";
  if (!body) return "Add the update text.";
  if (body.length > 5000) return "Keep the text to 5,000 characters or fewer.";
  return null;
}

function url(path: string) {
  const base = getBridgeApiBase();
  if (!base) throw new EngagementApiError(0, "API_NOT_CONFIGURED", "The live Bridge API is not configured.");
  return `${base.replace(/\/$/, "")}/api/v1${path}`;
}
// ponytail: mirrors lib/m4/api.ts request(); fold into one helper once the M4 import settles.
async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url(path), { ...init, credentials: "include", headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  } catch {
    throw new EngagementApiError(0, "NETWORK_ERROR", "Bridge could not be reached.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) { const e = object(payload); throw new EngagementApiError(response.status, text(e.error) || "UNKNOWN_ERROR", text(e.message) || `Request failed (${response.status}).`); }
  return payload;
}
const feedQuery = (cursor: FeedCursor | null, limit: number, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams({ limit: String(limit), ...extra });
  if (cursor) { q.set("before", cursor.before); q.set("beforeId", cursor.beforeId); }
  return q.toString();
};
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const engagementApi = {
  async publicPosts(options: { profile?: string; cursor?: FeedCursor | null; limit?: number } = {}): Promise<FeedPage<PublicPost>> {
    const root = object(await request(`/posts?${feedQuery(options.cursor ?? null, options.limit ?? 20, options.profile ? { profile: options.profile } : {})}`));
    return { items: list(root.posts).map((p) => ({ id: text(p.id), title: text(p.title), body: text(p.body), publishedAt: text(p.publishedAt), updatedAt: text(p.updatedAt), profile: { slug: text(object(p.profile).slug), displayName: text(object(p.profile).displayName) } })), nextCursor: parseCursor(root.nextCursor) };
  },
  async organizationPosts(organizationId: string): Promise<EngagementItem[]> {
    return list(object(await request(`/organizations/${encodeURIComponent(organizationId)}/posts?limit=100`)).posts).map(parseItem);
  },
  async createPost(organizationId: string, input: ItemInput) { return parseItem(await request(`/organizations/${encodeURIComponent(organizationId)}/posts`, json("POST", { title: input.title.trim(), body: input.body.trim(), publish: input.publish }))); },
  async updatePost(postId: string, update: ItemUpdate) { return parseItem(await request(`/posts/${encodeURIComponent(postId)}`, json("PATCH", update))); },
  async announcements(cursor: FeedCursor | null = null, limit = 20): Promise<FeedPage<PublicAnnouncement>> {
    const root = object(await request(`/announcements?${feedQuery(cursor, limit)}`));
    return { items: list(root.announcements).map((a) => ({ id: text(a.id), title: text(a.title), body: text(a.body), publishedAt: text(a.publishedAt), updatedAt: text(a.updatedAt) })), nextCursor: parseCursor(root.nextCursor) };
  },
  async adminAnnouncements(): Promise<EngagementItem[]> { return list(object(await request("/admin/announcements?limit=100")).announcements).map(parseItem); },
  async createAnnouncement(input: ItemInput) { return parseItem(await request("/admin/announcements", json("POST", { title: input.title.trim(), body: input.body.trim(), publish: input.publish }))); },
  async updateAnnouncement(id: string, update: ItemUpdate) { return parseItem(await request(`/admin/announcements/${encodeURIComponent(id)}`, json("PATCH", update))); },
  async savedProfiles(): Promise<SavedProfile[]> {
    return list(object(await request("/saved-profiles?limit=100")).savedProfiles).map((s) => ({ slug: text(s.slug), displayName: text(s.displayName), businessType: nullable(s.businessType), city: nullable(s.city), state: nullable(s.state), savedAt: text(s.savedAt) }));
  },
  async saveProfile(slug: string) { await request(`/saved-profiles/${encodeURIComponent(slug)}`, json("PUT")); return true; },
  async unsaveProfile(slug: string) { await request(`/saved-profiles/${encodeURIComponent(slug)}`, json("DELETE")); return false; },
};
