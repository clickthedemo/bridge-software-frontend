import type { DirectoryLink, DirectoryProfile, ProfileStatus } from "./api.ts";

export function resolveOrganizationId(selected: string, organizations: ReadonlyArray<{ organizationId: string }>) {
  return organizations.some((item) => item.organizationId === selected) ? selected : organizations[0]?.organizationId ?? "";
}

export function profileEditorPermissions(role: string, profile: Pick<DirectoryProfile, "status" | "hasPublishedVersion"> | null) {
  const managesBusiness = role === "owner" || role === "admin";
  const contentRole = managesBusiness || role === "page_manager";
  const editable = contentRole && (profile !== null || managesBusiness) && profile?.status !== "suspended";
  const submittable = new Set<ProfileStatus>(["draft", "correction_requested", "rejected"]);
  return {
    editable,
    managesBusiness,
    canReassignBusiness: managesBusiness && !profile?.hasPublishedVersion,
    canSubmit: managesBusiness && profile !== null && submittable.has(profile.status ?? "draft"),
  };
}

export function normalizeProfileLinks(links: ReadonlyArray<DirectoryLink>): DirectoryLink[] {
  if (links.length > 20) throw new Error("Use no more than 20 links.");
  return links.map((link, sortOrder) => {
    const url = link.url.trim();
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error("Every link needs a complete HTTP or HTTPS URL."); }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Links must use HTTP or HTTPS.");
    return { ...link, label: link.label.trim() || link.type, url, sortOrder };
  });
}
