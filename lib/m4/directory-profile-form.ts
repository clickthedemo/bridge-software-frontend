import type { OrganizationMembership } from "@/lib/phase3";

export const canManageDirectoryProfile = (
  membership: OrganizationMembership,
): boolean => membership.status === "active"
  && ["owner", "admin", "page_manager"].includes(membership.role);

export const directoryProfileBusinessType = (
  membership: OrganizationMembership | undefined,
): "brand" | "retailer" | "dispensary" => membership?.organizationType ?? "brand";
