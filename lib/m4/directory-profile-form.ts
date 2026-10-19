import type { OrganizationMembership } from "@/lib/phase3";
import type { DirectoryLink } from "@/lib/m4/api";

export const canManageDirectoryProfile = (
  membership: OrganizationMembership,
): boolean => membership.status === "active"
  && ["owner", "admin", "page_manager"].includes(membership.role);

export const directoryProfileBusinessType = (
  membership: OrganizationMembership | undefined,
): "brand" | "retailer" | "dispensary" => membership?.organizationType ?? "brand";

// Edits only the primary website link and keeps every other link, including
// additional website links, so saving an approved revision never drops links.
export const withPrimaryWebsite = (
  links: ReadonlyArray<DirectoryLink>,
  website: string,
): DirectoryLink[] => {
  const url = website.trim();
  const index = links.findIndex((link) => link.type === "website");
  const next = [...links];
  if (index >= 0) {
    if (url) next[index] = { ...next[index], url };
    else next.splice(index, 1);
  } else if (url) {
    next.unshift({ type: "website", label: "Website", url, sortOrder: 0 });
  }
  return next.map((link, sortOrder) => ({ ...link, sortOrder }));
};
