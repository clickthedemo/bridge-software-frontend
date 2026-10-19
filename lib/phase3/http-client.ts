import { parseOrganizationResponse, parseOrganizationsResponse, validateOrganizationId, validateOrganizationInput } from "./organizations.ts";
import {
  type OrganizationInput,
  Phase3Error,
  type ConfirmContactsInput,
  type ConfirmContactsResult,
  type AdminUsersResponse,
  type CreatePostInput,
  type CurrentUserResponse,
  type Phase3Client,
  type Phase3ErrorCode,
  type ProfileProjection,
  type SessionClaims,
  type UpdateContactsInput,
  type UploadIntent,
  type PostRecord,
} from "./types.ts";

function mapStatus(status: number): Phase3ErrorCode {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (status === 422 || status === 400) return "validation";
  return "unavailable";
}

function userMessageFor(code: Phase3ErrorCode): string {
  switch (code) {
    case "unauthenticated":
      return "Sign in to continue.";
    case "forbidden":
      return "This account does not have permission for that action.";
    case "validation":
      return "Check the highlighted fields and try again.";
    case "conflict":
      return "That record changed. Refresh and try again.";
    default:
      return "The request could not be completed. Your work is still here — try again.";
  }
}

export class HttpPhase3Client implements Phase3Client {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private endpoint(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  protected async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.endpoint(path), {
        ...init,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });
    } catch (cause) {
      throw new Phase3Error("unavailable", userMessageFor("unavailable"), cause);
    }

    if (!response.ok) {
      const code = mapStatus(response.status);
      throw new Phase3Error(code, userMessageFor(code));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new Phase3Error("unavailable", userMessageFor("unavailable"), cause);
    }
  }

  async register(email: string, password: string, displayName: string) {
    await this.request<unknown>(this.endpointPath.register, {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    });
  }

  listOrganizations() {
    return this.request<unknown>("/api/v1/organizations").then(parseOrganizationsResponse);
  }

  getOrganization(organizationId: string) {
    return this.request<unknown>(`/api/v1/organizations/${validateOrganizationId(organizationId)}`).then(parseOrganizationResponse);
  }

  createOrganization(input: OrganizationInput) {
    return this.request<unknown>("/api/v1/organizations", {
      method: "POST", body: JSON.stringify(validateOrganizationInput(input)),
    }).then(parseOrganizationResponse);
  }

  updateOrganization(organizationId: string, input: Partial<OrganizationInput>) {
    return this.request<unknown>(`/api/v1/organizations/${validateOrganizationId(organizationId)}`, {
      method: "PATCH", body: JSON.stringify(validateOrganizationInput(input, true)),
    }).then(parseOrganizationResponse);
  }

  async login(email: string, password: string) {
    await this.request<unknown>(this.endpointPath.login, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return this.getCurrentUser();
  }

  async logout() {
    await this.request<void>(this.endpointPath.logout, { method: "POST" });
  }

  getCurrentUser() {
    return this.request<CurrentUserResponse>(this.endpointPath.me);
  }

  async forgotPassword(email: string) {
    await this.request<unknown>(this.endpointPath.forgotPassword, {
      method: "POST", body: JSON.stringify({ email }),
    });
  }

  async resendVerification(email: string) {
    await this.request<unknown>(this.endpointPath.resendVerification, {
      method: "POST", body: JSON.stringify({ email }),
    });
  }

  async resetPassword(newPassword: string) {
    await this.request<unknown>(this.endpointPath.resetPassword, {
      method: "POST", body: JSON.stringify({ newPassword }),
    });
  }

  async establishRecoverySession(accessToken: string, refreshToken: string) {
    await this.request<void>(this.endpointPath.recoverySession, {
      method: "POST", body: JSON.stringify({ accessToken, refreshToken }),
    });
  }

  listAdminUsers(page: number, pageSize: number) {
    return this.request<AdminUsersResponse>(`${this.endpointPath.adminUsers}?page=${page}&pageSize=${pageSize}`);
  }

  getVerificationQueue(filters?: { status?: string; itemType?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (filters?.status) query.set("status", filters.status);
    if (filters?.itemType) query.set("itemType", filters.itemType);
    query.set("limit", String(filters?.limit ?? 50));
    return this.request<unknown>(`${this.endpointPath.verificationQueue}?${query.toString()}`);
  }

  runEinCheck(verificationItemId: string, mode: "mock" | "live", mockOutcome?: string) {
    return this.request<unknown>(`/api/v1/verification-items/${encodeURIComponent(verificationItemId)}/ein/verify`, {
      method: "POST", body: JSON.stringify({ mode, ...(mode === "mock" && mockOutcome ? { mockOutcome } : {}) }),
    });
  }

  reviewVerificationItem(verificationItemId: string, decision: "verified" | "rejected" | "correction_required", reason?: string) {
    return this.request<unknown>(`/api/v1/admin/verification-items/${encodeURIComponent(verificationItemId)}/review`, {
      method: "POST", body: JSON.stringify({ decision, reason: reason || null }),
    });
  }

  getSession() {
    return this.request<SessionClaims>(this.endpointPath.session);
  }

  createUploadIntent(file: File) {
    return this.request<UploadIntent>(this.endpointPath.uploads, {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    });
  }

  createPost(input: CreatePostInput) {
    return this.request<PostRecord>(this.endpointPath.posts, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listPosts() {
    return this.request<PostRecord[]>(this.endpointPath.posts);
  }

  getProfileProjection(view: "public" | "protected") {
    return this.request<ProfileProjection>(`${this.endpointPath.profile}?view=${view}`);
  }

  confirmContacts(input: ConfirmContactsInput) {
    return this.request<ConfirmContactsResult>(this.endpointPath.confirmContacts, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateContacts(input: UpdateContactsInput) {
    return this.request<ProfileProjection>(this.endpointPath.contacts, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  private readonly endpointPath = {
    register: "/api/v1/auth/register",
    login: "/api/v1/auth/login",
    logout: "/api/v1/auth/logout",
    me: "/api/v1/auth/me",
    forgotPassword: "/api/v1/auth/forgot-password",
    resendVerification: "/api/v1/auth/resend-verification",
    resetPassword: "/api/v1/auth/reset-password",
    recoverySession: "/api/v1/auth/recovery-session",
    adminUsers: "/api/v1/admin/users",
    verificationQueue: "/api/v1/admin/verification-queue",
    session: "/api/v1/session",
    uploads: "/api/v1/uploads/intent",
    posts: "/api/v1/posts",
    profile: "/api/v1/profiles/current",
    confirmContacts: "/api/v1/contacts/confirm",
    contacts: "/api/v1/contacts",
  } as const;
}
