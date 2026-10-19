import type { CurrentUser, OrganizationMembership } from "../phase3/types.ts";

export function hasCompletedOnboarding(
  user: CurrentUser | null,
  memberships: readonly OrganizationMembership[],
): boolean {
  const profileComplete = Boolean(user?.profile?.displayName?.trim());
  const hasActiveMembership = memberships.some((membership) => membership.status === "active");
  return profileComplete && hasActiveMembership;
}
