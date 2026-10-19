export const contentTypes = ["Promotion", "Update", "Event"] as const;
export type ContentType = (typeof contentTypes)[number];

export const audienceIds = ["adults", "retailers", "industry"] as const;
export type AudienceId = (typeof audienceIds)[number];

export type MembershipStatus = "none" | "pending" | "active" | "suspended";
export type OrganizationVerificationState =
  | "unverified"
  | "pending"
  | "verified"
  | "changes_requested"
  | "rejected";
export type BridgeRole = "brand" | "dispensary" | "retailer" | "sales_rep" | "admin";
export type DelegatedPermission =
  | "create_promotion"
  | "create_update"
  | "view_protected_profile"
  | "confirm_contacts";

export type SessionClaims = {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  ageEligible: boolean;
  membershipStatus: MembershipStatus;
  organizationId: string | null;
  organizationVerificationState: OrganizationVerificationState;
  role: BridgeRole | null;
  delegatedPermissions: DelegatedPermission[];
  stateLicenseEligibility: string[];
  adminScope: boolean;
};

export type OrganizationMembership = {
  organizationId: string;
  organizationName: string;
  organizationType: "brand" | "retailer" | "dispensary" | null;
  role: "owner" | "admin" | "page_manager" | "reviewer" | "member";
  status: "active" | "invited" | "suspended" | "removed";
};

export type CurrentUser = {
  id: string;
  email: string | null;
  accountType: "standard" | "sales_rep" | null;
  platformRoles: "admin"[];
  profile: { displayName: string | null; phone: string | null } | null;
};

export type CurrentUserResponse = { user: CurrentUser; memberships: OrganizationMembership[] };

export type OrganizationType = "brand" | "retailer" | "dispensary";
export type OrganizationInput = { name: string; organizationType: OrganizationType };
export type OrganizationRecord = {
  id: string;
  name: string;
  organizationType: OrganizationType | null;
  membership: Pick<OrganizationMembership, "role" | "status">;
};

export type AdminUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  accountType: string | null;
  platformRole: string | null;
  organizationMemberships: { organizationId: string; organizationName: string; role: string }[];
};

export type AdminUsersResponse = {
  users: AdminUser[];
  pagination: { page: number; pageSize: number; total: number };
};

export type UploadIntent = {
  uploadId: string;
  status: "accepted" | "processing" | "rejected";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type PostRecord = {
  postId: string;
  contentType: ContentType;
  message: string;
  uploadId: string | null;
  audienceIds: AudienceId[];
  protectedDetail: boolean;
  moderationState: "draft" | "published";
  createdAt: string;
};

export type ResponsibleContact = {
  kind: "sales" | "accounting";
  name: string;
  email: string;
  phone: string;
};

export type ProfileProjection = {
  view: "public" | "protected";
  organizationId: string;
  displayName: string;
  roleLabel: string;
  location: string;
  publicDescription: string;
  tags: string[];
  verificationState: OrganizationVerificationState;
  contacts: ResponsibleContact[];
  confirmation: {
    status: "needed" | "confirmed";
    confirmedAt: string | null;
    nextDue: string;
    actorUserId: string | null;
  };
};

export type ConfirmContactsInput = {
  organizationId: string;
};

export type ConfirmContactsResult = {
  confirmedAt: string;
  nextDue: string;
  actorUserId: string;
};

export type UpdateContactsInput = {
  organizationId: string;
  contacts: ResponsibleContact[];
};

export type CreatePostInput = {
  contentType: ContentType;
  message: string;
  uploadId: string | null;
  audienceIds: AudienceId[];
  protectedDetail: boolean;
};

export type Phase3ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "validation"
  | "conflict"
  | "unavailable";

export class Phase3Error extends Error {
  readonly code: Phase3ErrorCode;
  readonly userMessage: string;

  constructor(code: Phase3ErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "Phase3Error";
    this.code = code;
    this.userMessage = userMessage;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export type Phase3Client = {
  listOrganizations(): Promise<{ organizations: OrganizationRecord[] }>;
  getOrganization(organizationId: string): Promise<{ organization: OrganizationRecord }>;
  createOrganization(input: OrganizationInput): Promise<{ organization: OrganizationRecord }>;
  updateOrganization(organizationId: string, input: Partial<OrganizationInput>): Promise<{ organization: OrganizationRecord }>;
  register(email: string, password: string, displayName: string): Promise<void>;
  login(email: string, password: string): Promise<CurrentUserResponse>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<CurrentUserResponse>;
  forgotPassword(email: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
  resetPassword(newPassword: string): Promise<void>;
  establishRecoverySession(accessToken: string, refreshToken: string): Promise<void>;
  listAdminUsers(page: number, pageSize: number): Promise<AdminUsersResponse>;
  getVerificationQueue(filters?: { status?: string; itemType?: string; limit?: number }): Promise<unknown>;
  runEinCheck(verificationItemId: string, mode: "mock" | "live", mockOutcome?: string): Promise<unknown>;
  reviewVerificationItem(verificationItemId: string, decision: "verified" | "rejected" | "correction_required", reason?: string): Promise<unknown>;
  getSession(): Promise<SessionClaims>;
  createUploadIntent(file: File): Promise<UploadIntent>;
  createPost(input: CreatePostInput): Promise<PostRecord>;
  listPosts(): Promise<PostRecord[]>;
  getProfileProjection(view: "public" | "protected"): Promise<ProfileProjection>;
  confirmContacts(input: ConfirmContactsInput): Promise<ConfirmContactsResult>;
  updateContacts(input: UpdateContactsInput): Promise<ProfileProjection>;
};
