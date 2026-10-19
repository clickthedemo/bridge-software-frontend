"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContactRequestForm } from "@/components/M4ContactRequests";
import { m4Api, type DirectoryPage, type DirectoryProfile, type DirectorySort, type OrganizationType } from "@/lib/m4/api";
import { getBridgeApiBase } from "@/lib/phase3/client";

const types: Record<OrganizationType, string> = { brand: "Brand", retailer: "Retailer", dispensary: "Dispensary" };
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The directory could not be loaded.";
type Filters = { q: string; organizationType: OrganizationType | ""; category: string; state: string; city: string; region: string; verified: "" | "true" | "false"; sort: DirectorySort };
const initialFilters: Filters = { q: "", organizationType: "", category: "", state: "", city: "", region: "", verified: "", sort: "name_asc" };
function apiFilters(filters: Filters) {
  return { ...filters, organizationType: filters.organizationType || undefined, verified: filters.verified === "" ? undefined : filters.verified === "true", limit: 20 };
}
function webUrl(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function logoUrl(value: string | null) {
  if (!value) return null;
  if (value.startsWith("/api/v1/directory/profiles/")) {
    const base = getBridgeApiBase();
    return base ? new URL(value, base).href : null;
  }
  return webUrl(value);
}

function Identity({ profile, heading = "h2" }: { profile: DirectoryProfile; heading?: "h1" | "h2" }) {
  const Heading = heading;
  return <><div className="card-topline"><span className="avatar" aria-hidden="true">{profile.displayName.split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span><span className={`status-chip ${profile.verified ? "verified" : "pending"}`}>{profile.verified ? "EIN verified" : "Published"}</span></div><Heading>{profile.displayName}</Heading><p className="muted">{profile.businessType ? types[profile.businessType] : "Business"}</p>{profile.legalName && <p>Legal name: {profile.legalName}</p>}{profile.dbaName && <p>DBA: {profile.dbaName}</p>}{[profile.city, profile.state, profile.region].some(Boolean) && <p className="muted">{[profile.city, profile.state, profile.region].filter(Boolean).join(" · ")}</p>}{profile.categories.length > 0 && <p>{profile.categories.join(" · ")}</p>}{profile.summary && <p>{profile.summary}</p>}</>;
}

export function LiveDirectory() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const field = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  return <div className="directory-layout"><aside className="filter-panel" aria-label="Directory filters">
    <label htmlFor="directory-q">Search</label><input id="directory-q" maxLength={100} placeholder="Business name or keyword" type="search" value={filters.q} onChange={(event) => field("q", event.target.value)} />
    <label htmlFor="directory-type">Business type</label><select id="directory-type" value={filters.organizationType} onChange={(event) => field("organizationType", event.target.value as OrganizationType | "")}><option value="">All business types</option>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    {(["category", "state", "city", "region"] as const).map((key) => <label key={key} htmlFor={`directory-${key}`}>{key[0].toUpperCase() + key.slice(1)}<input id={`directory-${key}`} maxLength={100} value={filters[key]} onChange={(event) => field(key, event.target.value)} /></label>)}
    <label htmlFor="directory-verified">Verification</label><select id="directory-verified" value={filters.verified} onChange={(event) => field("verified", event.target.value as Filters["verified"])}><option value="">All published businesses</option><option value="true">EIN verified</option><option value="false">Not EIN verified</option></select>
    <label htmlFor="directory-sort">Sort</label><select id="directory-sort" value={filters.sort} onChange={(event) => field("sort", event.target.value as DirectorySort)}><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option></select>
    <button className="button secondary" type="button" onClick={() => setFilters(initialFilters)}>Clear filters</button><Link className="button secondary" href="/my-profile">Manage your profile</Link>
  </aside><DirectoryResults key={JSON.stringify(filters)} filters={filters} /></div>;
}

function DirectoryResults({ filters }: { filters: Filters }) {
  const hasFilters = (Object.keys(initialFilters) as (keyof Filters)[]).some(key => key !== "sort" && filters[key] !== initialFilters[key]);
  const [result, setResult] = useState<DirectoryPage>({ profiles: [], pageInfo: { nextCursor: null, hasMore: false }, nextCursor: null, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    let current = true;
    const timer = window.setTimeout(() => {
      m4Api.listDirectory(apiFilters(filters)).then((page) => { if (current) { setResult(page); setError(""); } }).catch((cause) => { if (current) setError(errorText(cause)); }).finally(() => { if (current) setLoading(false); });
    }, 250);
    return () => { current = false; active.current = false; window.clearTimeout(timer); };
  }, [filters, revision]);
  const loadMore = useCallback(async () => {
    if (!result.nextCursor || loading || inFlight.current) return;
    inFlight.current = true; setLoadingMore(true); setError("");
    try {
      const page = await m4Api.listDirectory({ ...apiFilters(filters), cursor: result.nextCursor });
      if (active.current) setResult((current) => ({ ...page, profiles: [...current.profiles, ...page.profiles.filter((next) => !current.profiles.some((item) => item.slug === next.slug))] }));
    } catch (cause) { if (active.current) setError(errorText(cause)); }
    finally { inFlight.current = false; if (active.current) setLoadingMore(false); }
  }, [filters, result.nextCursor, loading]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !result.hasMore || loading || error || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void loadMore(); }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, result.hasMore, loading, error]);
  return <section aria-busy={loading || loadingMore}>
    {loading && <p role="status">Loading directory…</p>}
    {error && <div className="empty-state"><p className="form-error" role="alert">{error}</p><button className="button secondary" onClick={() => { if (result.profiles.length) void loadMore(); else { setLoading(true); setError(""); setRevision((value) => value + 1); } }} type="button">Try again</button></div>}
    {!loading && !error && !result.profiles.length && (hasFilters ? <div className="empty-state"><h2>No matching businesses</h2><p>{filters.verified === "false" ? "Only EIN-verified, approved businesses are currently published." : "Try changing or clearing your filters."}</p></div> : <div className="empty-state"><h2>No businesses published yet</h2><p>Approved business profiles appear here once they are published.</p></div>)}
    <p className="result-count" aria-live="polite">{result.profiles.length} business{result.profiles.length === 1 ? "" : "es"} loaded</p>
    <div className="card-grid two">{result.profiles.map((profile) => <article className="profile-card" key={profile.slug}><Identity profile={profile} /><Link className="button secondary" href={`/profile/${encodeURIComponent(profile.slug)}`}>View profile</Link></article>)}</div>
    <div ref={sentinel}>{result.hasMore && <button className="button secondary" disabled={loading || loadingMore} onClick={() => void loadMore()} type="button">{loadingMore ? "Loading more…" : "Load more"}</button>}</div>
  </section>;
}

export function LiveDirectoryDetail({ identifier }: { identifier: string }) {
  return <DirectoryDetail key={identifier} identifier={identifier} />;
}

function DirectoryDetail({ identifier }: { identifier: string }) {
  const [profile, setProfile] = useState<DirectoryProfile | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; m4Api.getPublicProfile(identifier).then((value) => { if (active) { setProfile(value); setError(""); } }).catch((cause) => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, [identifier, revision]);
  const logo = logoUrl(profile?.logoUrl ?? null);
  return <section className="page shell profile-page"><Link className="text-link back-link" href="/explore">← Back to Explore</Link>{error ? <div className="empty-state"><h1>Profile unavailable</h1><p role="alert">{error}</p><button className="button secondary" onClick={() => setRevision((value) => value + 1)} type="button">Try again</button></div> : !profile ? <p role="status">Loading profile…</p> : <article className="content-card">{logo && <Image unoptimized alt={`${profile.displayName} logo`} height={96} src={logo} width={96} />}<Identity heading="h1" profile={profile} />{profile.story && <p>{profile.story}</p>}{profile.license && <p>{profile.license.type || "License"}: {profile.license.number || "Not provided"}</p>}
    {profile.links.length > 0 && <ul>{[...profile.links].sort((a, b) => a.sortOrder - b.sortOrder).map((link, index) => { const url = webUrl(link.url); return url ? <li key={index}><a className="text-link" href={url} rel="noopener noreferrer" target="_blank">{link.label || link.type}</a></li> : null; })}</ul>}
    <section id="contact-request"><ContactRequestForm profileName={profile.displayName} slug={profile.slug} /></section></article>}</section>;
}
