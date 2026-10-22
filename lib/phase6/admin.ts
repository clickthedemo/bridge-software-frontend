/* Phase 6 admin tools client: content reports, the admin report queue,
   dashboard counts and user management. Contract:
   bridge-software-backend docs/phase-6-admin-moderation-api.md. */
import { M4ApiError, request } from "../m4/api.ts";

export type FlagTargetType = "post" | "profile";
export type FlagReason = "spam" | "false_or_misleading" | "prohibited_or_medical_claim" | "harassment" | "other";
export type FlagResolution = "post_archived" | "profile_suspended" | "dismissed";
export type FlagStatus = "open" | "resolved";
export type ContentFlag = {
  id: string; targetType: FlagTargetType; targetId: string; targetLabel: string; targetSlug: string | null; targetAvailable: boolean;
  reason: FlagReason; note: string | null; status: FlagStatus; resolution: FlagResolution | null; resolutionNote: string | null;
  resolvedAt: string | null; reporterDisplayName: string | null; createdAt: string;
};
export type FlagPage = { flags: ContentFlag[]; hasMore: boolean };
export type ReportTarget = { type: "post"; postId: string; label: string } | { type: "profile"; slug: string; label: string };
export type DashboardSummary = {
  pendingEinChecks: number; profilesAwaitingReview: number; openFlags: number;
  publishedPosts: number; publishedAnnouncements: number; contactRequestsWaiting: number; generatedAt: string;
};
export type AccountType = "standard" | "sales_rep";
export type AdminUserMembership = {
  organizationId: string; organizationName: string; organizationStatus: string; role: string; status: string;
  directoryProfile: { status: string; slug: string | null } | null; einVerified: boolean;
};
export type AdminUserDetail = {
  user: { id: string; email: string | null; displayName: string | null; emailVerified: boolean; createdAt: string; lastSignInAt: string | null; deactivated: boolean; accountType: AccountType | null; platformRole: "admin" | null };
  memberships: AdminUserMembership[];
};

/* Default reason list (docs/decision-log.md, Phase 6 reports: Tori can change it later; the backend enum is the source). */
export const flagReasons: { value: FlagReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "false_or_misleading", label: "False or misleading claims" },
  { value: "prohibited_or_medical_claim", label: "Prohibited product or medical claim" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Other" },
];
export const flagReasonLabel = (reason: string) => flagReasons.find((item) => item.value === reason)?.label ?? reason;
export const resolutionLabels: Record<FlagResolution, string> = { post_archived: "Archive post", profile_suspended: "Suspend profile", dismissed: "Dismiss" };
export function resolutionsFor(flag: Pick<ContentFlag, "targetType" | "status">): FlagResolution[] {
  if (flag.status !== "open") return [];
  return flag.targetType === "post" ? ["post_archived", "profile_suspended", "dismissed"] : ["profile_suspended", "dismissed"];
}

const NOTE_MAX = 1000;
export function validateReportNote(note: string): string | null {
  return note.trim().length > NOTE_MAX ? `Keep the note to ${NOTE_MAX.toLocaleString()} characters or fewer.` : null;
}

/* Plain-language copy per failure so screens never show raw server text. */
export function moderationErrorMessage(error: unknown, context: "report" | "admin" = "admin"): string {
  if (!(error instanceof M4ApiError)) return "Something went wrong. Try again.";
  if (error.status === 0) return "Bridge could not be reached. Check your connection and try again.";
  if (error.status === 401) return "Sign in to continue.";
  if (error.status === 403) return context === "report" ? "Only active members can report content." : "This account does not have permission for that.";
  if (error.status === 404) return context === "report" ? "This content is no longer public, so it cannot be reported." : "That record is no longer available.";
  if (error.status === 409) {
    if (error.code === "MODERATION_DUPLICATE") return "You already reported this. Bridge admins will review it.";
    if (error.code === "ADMIN_USER_INVALID_STATE") return "That change is not allowed for this user.";
    return "That changed while you were working. Refresh to see the latest.";
  }
  if (error.status === 400) return "Check the reason and note, then try again.";
  return "Bridge is unavailable right now. Try again.";
}

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const nullable = (value: unknown) => typeof value === "string" ? value : null;
const count = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export function parseFlag(value: unknown): ContentFlag {
  const v = object(value);
  if (typeof v.id !== "string") throw new M4ApiError(502, "INVALID_RESPONSE", "Bridge returned an unexpected report.");
  return {
    id: v.id, targetType: v.targetType === "profile" ? "profile" : "post", targetId: text(v.targetId), targetLabel: text(v.targetLabel) || "Reported content",
    targetSlug: nullable(v.targetSlug), targetAvailable: v.targetAvailable === true, reason: (flagReasons.some((item) => item.value === v.reason) ? v.reason : "other") as FlagReason,
    note: nullable(v.note), status: v.status === "resolved" ? "resolved" : "open", resolution: nullable(v.resolution) as FlagResolution | null,
    resolutionNote: nullable(v.resolutionNote), resolvedAt: nullable(v.resolvedAt), reporterDisplayName: nullable(v.reporterDisplayName), createdAt: text(v.createdAt),
  };
}
function parseDetail(value: unknown): AdminUserDetail {
  const root = object(value), u = object(root.user);
  if (typeof u.id !== "string") throw new M4ApiError(502, "INVALID_RESPONSE", "Bridge returned an unexpected user.");
  return {
    user: { id: u.id, email: nullable(u.email), displayName: nullable(u.displayName), emailVerified: u.emailVerified === true, createdAt: text(u.createdAt), lastSignInAt: nullable(u.lastSignInAt), deactivated: u.deactivated === true, accountType: (u.accountType === "sales_rep" || u.accountType === "standard" ? u.accountType : null) as AccountType | null, platformRole: u.platformRole === "admin" ? "admin" : null },
    memberships: (Array.isArray(root.memberships) ? root.memberships : []).map(object).map((m) => ({
      organizationId: text(m.organizationId), organizationName: text(m.organizationName), organizationStatus: text(m.organizationStatus), role: text(m.role), status: text(m.status),
      directoryProfile: m.directoryProfile ? { status: text(object(m.directoryProfile).status), slug: nullable(object(m.directoryProfile).slug) } : null, einVerified: m.einVerified === true,
    })),
  };
}

export const adminApi = {
  async report(target: ReportTarget, reason: FlagReason, note: string) {
    const body = target.type === "post" ? { targetType: "post", postId: target.postId, reason } : { targetType: "profile", slug: target.slug, reason };
    const root = object(await request("/api/v1/flags", json("POST", { ...body, ...(note.trim() ? { note: note.trim() } : {}) })));
    return { id: text(object(root.flag).id) };
  },
  async listFlags(status: FlagStatus, offset = 0, limit = 50): Promise<FlagPage> {
    const root = object(await request(`/api/v1/admin/flags?status=${status}&limit=${limit}&offset=${offset}`));
    const flags = (Array.isArray(root.flags) ? root.flags : []).map(parseFlag);
    return { flags, hasMore: object(root.pageInfo).hasMore === true };
  },
  async resolveFlag(flagId: string, resolution: FlagResolution, note: string) {
    return parseFlag(object(await request(`/api/v1/admin/flags/${encodeURIComponent(flagId)}/resolve`, json("POST", { resolution, note: note.trim() }))).flag);
  },
  async dashboardSummary(): Promise<DashboardSummary> {
    const s = object(object(await request("/api/v1/admin/dashboard/summary")).summary);
    return { pendingEinChecks: count(s.pendingEinChecks), profilesAwaitingReview: count(s.profilesAwaitingReview), openFlags: count(s.openFlags), publishedPosts: count(s.publishedPosts), publishedAnnouncements: count(s.publishedAnnouncements), contactRequestsWaiting: count(s.contactRequestsWaiting), generatedAt: text(s.generatedAt) };
  },
  async userDetail(userId: string) { return parseDetail(await request(`/api/v1/admin/users/${encodeURIComponent(userId)}`)); },
  async setAccountType(userId: string, accountType: AccountType) {
    const root = object(await request(`/api/v1/admin/users/${encodeURIComponent(userId)}/account-type`, json("PATCH", { accountType })));
    return { accountType: text(object(root.user).accountType) as AccountType };
  },
  async deactivateUser(userId: string, reason: string) { await request(`/api/v1/admin/users/${encodeURIComponent(userId)}/deactivate`, json("POST", { reason: reason.trim() })); return { active: false }; },
  async reactivateUser(userId: string, reason: string) { await request(`/api/v1/admin/users/${encodeURIComponent(userId)}/reactivate`, json("POST", reason.trim() ? { reason: reason.trim() } : {})); return { active: true }; },
  async removePlatformRole(userId: string, reason: string) { await request(`/api/v1/admin/users/${encodeURIComponent(userId)}/platform-role`, json("DELETE", reason.trim() ? { reason: reason.trim() } : {})); return { platformRole: null }; },
};
