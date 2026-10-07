import { getBridgeApiBase } from "@/lib/phase3/client";

export type OrganizationType = "brand" | "retailer" | "dispensary";
export type ProfileStatus = "draft" | "pending_review" | "published" | "correction_requested" | "rejected" | "suspended";
export type ContactRequestStatus = "new" | "viewed" | "responded" | "closed";
export type DirectorySort = "name_asc" | "name_desc";

export type Business = {
  id: string;
  organizationId?: string;
  legalName: string;
  dbaName: string | null;
  status?: string;
};

export type DirectoryProfile = {
  id: string;
  organizationId?: string;
  businessId?: string;
  organizationType: OrganizationType;
  slug: string;
  displayName: string;
  summary: string | null;
  websiteUrl: string | null;
  status: ProfileStatus;
  logoUrl?: string | null;
};

export type DirectoryProfileInput = {
  businessId: string;
  slug: string;
  displayName: string;
  summary: string | null;
  websiteUrl: string | null;
};

export type DirectoryPage = {
  profiles: DirectoryProfile[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type ContactRequest = {
  id: string;
  slug?: string;
  profileId?: string;
  organizationId?: string;
  firstName: string;
  workEmail: string;
  phoneNumber: string;
  yearsOfService: number;
  contactPreference: string;
  message: string | null;
  status: ContactRequestStatus;
  createdAt: string;
  updatedAt?: string;
  targetDisplayName?: string;
};

export type ContactRequestInput = Pick<ContactRequest, "firstName" | "workEmail" | "phoneNumber" | "yearsOfService" | "contactPreference" | "message">;

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationPreferences = Record<"profile" | "contact" | "verification", { inApp: boolean; email: boolean }>;

export type OffsetPage<T> = { items: T[]; total: number | null; limit: number; offset: number; hasMore: boolean };

export class M4ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "M4ApiError";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
function nullableText(value: unknown): string | null { return typeof value === "string" ? value : null; }

function unwrap(value: unknown, ...keys: string[]): unknown {
  const source = record(value);
  for (const key of keys) if (source[key] !== undefined) return source[key];
  return value;
}

function apiUrl(path: string): string {
  const base = getBridgeApiBase();
  if (!base) throw new M4ApiError(0, "The live Bridge API is not configured.");
  return `${base.replace(/\/$/, "")}${path}`;
}

async function request<T>(path: string, init: RequestInit = {}, allow404 = false): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    throw new M4ApiError(0, cause instanceof Error ? cause.message : "The API could not be reached.");
  }
  if (allow404 && response.status === 404) return null;
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = record(payload);
    throw new M4ApiError(response.status, text(error.message) || text(error.error) || `Request failed (${response.status}).`);
  }
  return payload as T;
}

function business(value: unknown): Business {
  const item = record(value);
  return {
    id: text(item.id || item.businessId),
    organizationId: nullableText(item.organizationId) ?? undefined,
    legalName: text(item.legalName),
    dbaName: nullableText(item.dbaName),
    status: nullableText(item.status) ?? undefined,
  };
}

function profile(value: unknown): DirectoryProfile {
  const item = record(value);
  const organization = record(item.organization);
  return {
    id: text(item.id || item.profileId),
    organizationId: nullableText(item.organizationId) ?? undefined,
    businessId: nullableText(item.businessId) ?? undefined,
    organizationType: text(item.organizationType || organization.organizationType, "brand") as OrganizationType,
    slug: text(item.slug),
    displayName: text(item.displayName),
    summary: nullableText(item.summary),
    websiteUrl: nullableText(item.websiteUrl),
    status: text(item.status, "draft") as ProfileStatus,
    logoUrl: nullableText(item.logoUrl),
  };
}

function contactRequest(value: unknown): ContactRequest {
  const item = record(value);
  return {
    id: text(item.id || item.requestId),
    slug: nullableText(item.slug) ?? nullableText(item.profileSlug) ?? undefined,
    profileId: nullableText(item.profileId) ?? undefined,
    organizationId: nullableText(item.organizationId) ?? undefined,
    firstName: text(item.firstName),
    workEmail: text(item.workEmail),
    phoneNumber: text(item.phoneNumber),
    yearsOfService: Number(item.yearsOfService ?? 0),
    contactPreference: text(item.contactPreference, "email"),
    message: nullableText(item.message),
    status: text(item.status, "new") as ContactRequestStatus,
    createdAt: text(item.createdAt, new Date(0).toISOString()),
    updatedAt: nullableText(item.updatedAt) ?? undefined,
    targetDisplayName: nullableText(item.targetDisplayName) ?? nullableText(item.displayName) ?? undefined,
  };
}

function notification(value: unknown): Notification {
  const item = record(value);
  return {
    id: text(item.id || item.notificationId), type: text(item.type), title: text(item.title), body: text(item.body || item.message),
    createdAt: text(item.createdAt, new Date(0).toISOString()), readAt: nullableText(item.readAt),
  };
}

function offsetPage<T>(value: unknown, keys: string[], parser: (item: unknown) => T, requestedLimit: number, requestedOffset: number): OffsetPage<T> {
  const root = record(value);
  let raw: unknown = [];
  for (const key of keys) if (Array.isArray(root[key])) { raw = root[key]; break; }
  if (!Array.isArray(raw) && Array.isArray(root.items)) raw = root.items;
  const items = Array.isArray(raw) ? raw.map(parser) : [];
  const total = Number.isSafeInteger(root.total) ? root.total as number : null;
  const limit = Number.isSafeInteger(root.limit) ? root.limit as number : requestedLimit;
  const offset = Number.isSafeInteger(root.offset) ? root.offset as number : requestedOffset;
  return { items, total, limit, offset, hasMore: typeof root.hasMore === "boolean" ? root.hasMore : total !== null ? offset + items.length < total : items.length === limit };
}

export const m4Api = {
  async listBusinesses(organizationId: string) {
    const value = await request<unknown>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/businesses`);
    const root = record(value); const rows = Array.isArray(root.businesses) ? root.businesses : Array.isArray(value) ? value : [];
    return rows.map(business);
  },
  async createBusiness(organizationId: string, input: { legalName: string; dbaName: string | null }) {
    const value = await request<unknown>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/businesses`, { method: "POST", body: JSON.stringify(input) });
    return business(unwrap(value, "business"));
  },
  async getProfile(organizationId: string) {
    const value = await request<unknown>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/directory-profile`, {}, true);
    return value === null ? null : profile(unwrap(value, "profile", "directoryProfile"));
  },
  async saveProfile(organizationId: string, input: DirectoryProfileInput) {
    const value = await request<unknown>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/directory-profile`, { method: "PUT", body: JSON.stringify(input) });
    return profile(unwrap(value, "profile", "directoryProfile"));
  },
  async submitProfile(organizationId: string) {
    const value = await request<unknown>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/directory-profile/submit`, { method: "POST", body: "{}" });
    return profile(unwrap(value, "profile", "directoryProfile"));
  },
  async listDirectory(filters: { q?: string; organizationType?: OrganizationType; sort?: DirectorySort; limit?: number; cursor?: string } = {}) {
    const query = new URLSearchParams();
    if (filters.q?.trim()) query.set("q", filters.q.trim());
    if (filters.organizationType) query.set("organizationType", filters.organizationType);
    if (filters.sort) query.set("sort", filters.sort);
    query.set("limit", String(filters.limit ?? 20));
    if (filters.cursor) query.set("cursor", filters.cursor);
    const value = await request<unknown>(`/api/v1/directory/profiles?${query}`);
    const root = record(value); const rows = Array.isArray(root.profiles) ? root.profiles : Array.isArray(root.items) ? root.items : [];
    const nextCursor = nullableText(root.nextCursor) ?? nullableText(record(root.pagination).nextCursor);
    return { profiles: rows.map(profile), nextCursor, hasMore: typeof root.hasMore === "boolean" ? root.hasMore : nextCursor !== null } satisfies DirectoryPage;
  },
  async getPublicProfile(slug: string) {
    const value = await request<unknown>(`/api/v1/directory/profiles/${encodeURIComponent(slug)}`);
    return profile(unwrap(value, "profile", "directoryProfile"));
  },
  logoUrl(slug: string) { return apiUrl(`/api/v1/directory/profiles/${encodeURIComponent(slug)}/logo`); },
  async uploadLogo(organizationId: string, file: File) {
    const intentValue = await request<unknown>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/directory-profile/logo/upload`, { method: "POST", body: JSON.stringify({ contentType: file.type, fileSize: file.size }) });
    const intent = record(unwrap(intentValue, "upload", "signedUpload"));
    const uploadUrl = text(intent.uploadUrl || intent.signedUrl || intent.url);
    if (!uploadUrl) throw new M4ApiError(500, "The backend did not return a signed upload URL.");
    const headers = record(intent.headers);
    const response = await fetch(uploadUrl, { method: text(intent.method, "PUT"), headers: { "Content-Type": file.type, ...Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }, body: file });
    if (!response.ok) throw new M4ApiError(response.status, "The logo could not be uploaded to storage.");
    return intentValue;
  },
  async deleteLogo(organizationId: string) { await request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/directory-profile/logo`, { method: "DELETE" }); },
  async createContactRequest(slug: string, input: ContactRequestInput) {
    const value = await request<unknown>(`/api/v1/directory/profiles/${encodeURIComponent(slug)}/contact-requests`, { method: "POST", body: JSON.stringify(input) });
    return contactRequest(unwrap(value, "contactRequest", "request"));
  },
  async inbox(organizationId: string, filters: { status?: ContactRequestStatus; limit?: number; offset?: number } = {}) {
    const limit = filters.limit ?? 20, offset = filters.offset ?? 0; const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (filters.status) query.set("status", filters.status);
    const value = await request<unknown>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/contact-requests?${query}`);
    return offsetPage(value, ["contactRequests", "requests"], contactRequest, limit, offset);
  },
  async sent(filters: { limit?: number; offset?: number } = {}) {
    const limit = filters.limit ?? 20, offset = filters.offset ?? 0;
    const value = await request<unknown>(`/api/v1/contact-requests/sent?limit=${limit}&offset=${offset}`);
    return offsetPage(value, ["contactRequests", "requests"], contactRequest, limit, offset);
  },
  async updateContactStatus(organizationId: string, requestId: string, status: ContactRequestStatus) {
    const value = await request<unknown>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/contact-requests/${encodeURIComponent(requestId)}/status`, { method: "POST", body: JSON.stringify({ status }) });
    return contactRequest(unwrap(value, "contactRequest", "request"));
  },
  async notifications(filters: { unreadOnly?: boolean; limit?: number; offset?: number } = {}) {
    const limit = filters.limit ?? 20, offset = filters.offset ?? 0;
    const query = new URLSearchParams({ unreadOnly: String(filters.unreadOnly ?? false), limit: String(limit), offset: String(offset) });
    const value = await request<unknown>(`/api/v1/notifications?${query}`);
    return offsetPage(value, ["notifications"], notification, limit, offset);
  },
  async markNotificationRead(id: string) { await request(`/api/v1/notifications/${encodeURIComponent(id)}/read`, { method: "POST", body: "{}" }); },
  async markAllNotificationsRead() { return request<{ updatedCount: number }>("/api/v1/notifications/read-all", { method: "POST", body: "{}" }); },
  async getNotificationPreferences() {
    const value = await request<unknown>("/api/v1/notification-preferences");
    return unwrap(value, "preferences") as NotificationPreferences;
  },
  async updateNotificationPreferences(preferences: NotificationPreferences) {
    const value = await request<unknown>("/api/v1/notification-preferences", { method: "PUT", body: JSON.stringify(preferences) });
    return unwrap(value, "preferences") as NotificationPreferences;
  },
  async reviewProfile(profileId: string, action: "approve" | "request-correction" | "reject" | "suspend", reason?: string) {
    return request<unknown>(`/api/v1/admin/directory-profiles/${encodeURIComponent(profileId)}/${action}`, { method: "POST", body: JSON.stringify(action === "approve" ? {} : { reason }) });
  },
};
