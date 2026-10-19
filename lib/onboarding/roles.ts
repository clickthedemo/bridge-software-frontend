import type { MemberRole } from "../types.ts";

export type JoinRole = {
  name: MemberRole;
  description: string;
  nextTitle: string;
  requirements: string;
  milestone4Supported: boolean;
};

export const joinRoles: readonly JoinRole[] = [
  { name: "Brand", description: "Show products, markets, and retail partnership needs.", nextTitle: "Organization details", requirements: "Legal name, public name, EIN, license, location, and contact owner.", milestone4Supported: true },
  { name: "Dispensary", description: "Find brands and representatives aligned with your customers.", nextTitle: "Organization details", requirements: "Legal name, dispensary license, locations, and contact owner.", milestone4Supported: true },
  { name: "Retailer", description: "Build a verified organization profile for partner discovery.", nextTitle: "Organization details", requirements: "Legal name, retail license or permit, locations, and contact owner.", milestone4Supported: true },
  { name: "Sales rep", description: "Represent territories, specialties, and available relationships.", nextTitle: "Representative details", requirements: "Name, territories, current lines, references, and license where a state requires one.", milestone4Supported: false },
  { name: "Cultivator", description: "Share cultivation capabilities, genetics, availability, and licensed markets.", nextTitle: "Cultivation details", requirements: "Legal name, EIN, cultivation license, facilities, markets, and contact owner.", milestone4Supported: false },
  { name: "Manufacturer", description: "Connect products, production capacity, brands, and retail partners.", nextTitle: "Manufacturing details", requirements: "Legal name, EIN, manufacturing license, facilities, capabilities, and contact owner.", milestone4Supported: false },
  { name: "Lab", description: "Keep current testing contacts, services, and intake information visible.", nextTitle: "Laboratory details", requirements: "Legal name, EIN, laboratory credentials, service markets, references, and contact owner.", milestone4Supported: false },
  { name: "Transport", description: "Publish licensed routes, capacity, and operational availability.", nextTitle: "Transport details", requirements: "Legal name, EIN, transport credentials, service area, references, and contact owner.", milestone4Supported: false },
  { name: "Bank", description: "Support verified cannabis operators with appropriate financial services.", nextTitle: "Financial service details", requirements: "Legal name, regulated entity information, service markets, references, and contact owner.", milestone4Supported: false },
  { name: "Service", description: "Offer HVAC, electrical, construction, legal, accounting, and facility expertise.", nextTitle: "Service details", requirements: "Legal name, EIN, credentials, cannabis references, service area, and contact owner.", milestone4Supported: false },
  { name: "Media", description: "Publish credible cannabis reporting, education, and market explainers.", nextTitle: "Publisher details", requirements: "Publication name, editorial contact, coverage focus, references, and disclosure policy.", milestone4Supported: false },
  { name: "Hydroponics", description: "Connect cultivation teams with equipment, systems, and facility support.", nextTitle: "Supplier details", requirements: "Legal name, EIN, product categories, service markets, references, and contact owner.", milestone4Supported: false },
];

export function parseMemberRole(value: string | null | undefined): MemberRole | null {
  return joinRoles.find((role) => role.name === value)?.name ?? null;
}

export function accountPathForRole(role: MemberRole): string {
  return `/join/account?role=${encodeURIComponent(role)}`;
}
