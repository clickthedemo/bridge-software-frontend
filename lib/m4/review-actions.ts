import type { BusinessLicense, ProfileStatus } from "./api.ts";

export type DirectoryReviewAction = "approve" | "request-correction" | "reject" | "suspend";
export type LicenseReviewAction = "verified" | "correction_required" | "rejected" | "suspended";

export function directoryActions(status: ProfileStatus): DirectoryReviewAction[] {
  if (status === "pending_review") return ["approve", "request-correction", "reject"];
  if (status === "approved") return ["suspend"];
  return [];
}

export function licenseDisplayStatus(license: BusinessLicense) {
  if (license.status === "pending" && license.reviewReason) return "correction_requested" as const;
  if (license.status === "pending") return "pending_review" as const;
  return license.status;
}

export function licenseActions(license: BusinessLicense): LicenseReviewAction[] {
  const status = licenseDisplayStatus(license);
  if (status === "pending_review") return ["verified", "correction_required", "rejected"];
  if (status === "verified") return ["suspended"];
  return [];
}

export function licenseActionLabel(action: LicenseReviewAction) {
  return ({ verified: "Approve", correction_required: "Request correction", rejected: "Reject", suspended: "Suspend licence" } as const)[action];
}

export function actionReasonError(action: DirectoryReviewAction | LicenseReviewAction, reason: string) {
  const needsReason = !["approve", "verified"].includes(action);
  return needsReason && !reason.trim() ? "A reason is required for this action." : null;
}
