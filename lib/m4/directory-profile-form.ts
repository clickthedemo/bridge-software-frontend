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

// Accepts 12-3456789 or 123456789 and returns the nine digits the API expects.
export const normalizeEin = (value: string): string => {
  const trimmed = value.trim();
  if (!/^[0-9]{2}-?[0-9]{7}$/.test(trimmed)) throw new Error("Enter the 9-digit EIN, for example 12-3456789.");
  return trimmed.replace("-", "");
};
