import type { DirectorySort, OrganizationType } from "./api";

export type DirectoryQueryState = {
  q: string;
  organizationType: OrganizationType | "";
  category: string;
  state: string;
  city: string;
  region: string;
  sort: DirectorySort;
};

export const emptyDirectoryQuery: DirectoryQueryState = {
  q: "", organizationType: "", category: "", state: "", city: "", region: "", sort: "name_asc",
};

export function parseDirectoryQuery(params: URLSearchParams): DirectoryQueryState {
  const organizationType = params.get("organizationType");
  const sort = params.get("sort");
  return {
    q: (params.get("q") ?? "").slice(0, 100),
    organizationType: organizationType === "brand" || organizationType === "retailer" || organizationType === "dispensary" ? organizationType : "",
    category: (params.get("category") ?? "").slice(0, 100),
    state: (params.get("state") ?? "").slice(0, 100),
    city: (params.get("city") ?? "").slice(0, 100),
    region: (params.get("region") ?? "").slice(0, 100),
    sort: sort === "name_desc" ? "name_desc" : "name_asc",
  };
}

export function serializeDirectoryQuery(state: DirectoryQueryState): string {
  const params = new URLSearchParams();
  for (const key of ["q", "organizationType", "category", "state", "city", "region"] as const) {
    const value = state[key].trim();
    if (value) params.set(key, value);
  }
  if (state.sort !== "name_asc") params.set("sort", state.sort);
  return params.toString();
}

export const hasDirectoryFilters = (state: DirectoryQueryState) => serializeDirectoryQuery(state) !== "";
