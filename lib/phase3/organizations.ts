import { Phase3Error, type OrganizationInput, type OrganizationRecord, type OrganizationType } from "./types.ts";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Phase3Error("unavailable", "The organization response could not be read. Refresh and try again.");
  return value as Record<string, unknown>;
}

function parseOrganization(value: unknown): OrganizationRecord {
  const org = object(value);
  const membership = object(org.membership);
  if (typeof org.id !== "string" || typeof org.name !== "string" || ![null, "brand", "retailer", "dispensary"].includes(org.organizationType as string | null) || !["owner", "admin", "reviewer", "member", "page_manager"].includes(membership.role as string) || !["active", "invited", "suspended", "removed"].includes(membership.status as string)) throw new Phase3Error("unavailable", "The organization response could not be read. Refresh and try again.");
  try { validateOrganizationId(org.id); } catch { throw new Phase3Error("unavailable", "The organization response contains an invalid organization identifier."); }
  return { id: org.id, name: org.name, organizationType: org.organizationType as OrganizationType | null, membership: { role: membership.role as OrganizationRecord["membership"]["role"], status: membership.status as OrganizationRecord["membership"]["status"] } };
}

export function parseOrganizationResponse(value: unknown): { organization: OrganizationRecord } {
  return { organization: parseOrganization(object(value).organization) };
}

export function parseOrganizationsResponse(value: unknown): { organizations: OrganizationRecord[] } {
  const response = object(value);
  if (!Array.isArray(response.organizations)) throw new Phase3Error("unavailable", "The organization list could not be read. Refresh and try again.");
  return { organizations: response.organizations.map(parseOrganization) };
}

export function organizationTypeForRole(role: string | null): OrganizationType | null {
  if (role === "Brand") return "brand";
  if (role === "Retailer") return "retailer";
  if (role === "Dispensary") return "dispensary";
  return null;
}

export function canEditOrganization(organization: OrganizationRecord): boolean {
  return organization.membership.status === "active" && ["owner", "admin"].includes(organization.membership.role);
}

export function validateOrganizationInput(input: Partial<OrganizationInput>, partial = false): Partial<OrganizationInput> {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !["name", "organizationType"].includes(key))) {
    throw new Phase3Error("validation", "Only organization name and type are supported.");
  }
  const result: Partial<OrganizationInput> = {};
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 200) throw new Phase3Error("validation", "Enter an organization name between 1 and 200 characters.");
    result.name = input.name.trim();
  }
  if (!partial || input.organizationType !== undefined) {
    if (!["brand", "retailer", "dispensary"].includes(input.organizationType ?? "")) throw new Phase3Error("validation", "Choose Brand, Retailer, or Dispensary.");
    result.organizationType = input.organizationType;
  }
  if (!Object.keys(result).length) throw new Phase3Error("validation", "At least one editable field is required.");
  return result;
}

export function validateOrganizationId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Phase3Error("validation", "Choose a valid organization.");
  return id;
}
