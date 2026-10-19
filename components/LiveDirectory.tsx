"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ContactRequestForm } from "@/components/M4ContactRequests";
import { ProfileLogo } from "@/components/ProfileLogo";
import { m4Api, type DirectoryPage, type DirectoryProfile, type DirectorySort, type OrganizationType } from "@/lib/m4/api";
import { emptyDirectoryQuery, hasDirectoryFilters, parseDirectoryQuery, serializeDirectoryQuery, type DirectoryQueryState } from "@/lib/m4/directory-query-state";

const types: Record<OrganizationType, string> = { brand: "Brand", retailer: "Retailer", dispensary: "Dispensary" };
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The directory could not be loaded.";

function Identity({ profile, heading = "h2", showLogo = true }: { profile: DirectoryProfile; heading?: "h1" | "h2"; showLogo?: boolean }) {
  const Heading = heading;
  return <><div className="card-topline">{showLogo && <ProfileLogo logoUrl={profile.logoUrl} name={profile.displayName} />}<span className="status-chip verified">Published</span></div><Heading>{profile.displayName}</Heading><p className="muted">{profile.businessType ? types[profile.businessType] : "Business"}</p>{profile.summary && <p>{profile.summary}</p>}</>;
}

export function LiveDirectory() {
  const searchParams = useSearchParams(); const pathname = usePathname(); const router = useRouter();
  const search = searchParams.toString();
  const initial = useMemo(() => parseDirectoryQuery(new URLSearchParams(search)), [search]);
  const [filters, setFilters] = useState<DirectoryQueryState>(initial);
  const [result, setResult] = useState<DirectoryPage>({ profiles: [], pageInfo: { nextCursor: null, hasMore: false }, nextCursor: null, hasMore: false });
  const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);

  // Browser back/forward navigation is an external URL-state change that must replace local controls.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setFilters(initial); }, [initial]);
  useEffect(() => {
    const timer = window.setTimeout(() => { const query = serializeDirectoryQuery(filters); if (query !== search) router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }); }, 200);
    return () => window.clearTimeout(timer);
  }, [filters, pathname, router, search]);
  useEffect(() => {
    let active = true; const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      m4Api.listDirectory({ ...filters, organizationType: filters.organizationType || undefined, limit: 20 }).then((page) => { if (active) setResult(page); }).catch((cause) => { if (active) setError(errorText(cause)); }).finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [filters, revision]);

  async function loadMore() {
    if (!result.nextCursor || loadingMore) return; setLoadingMore(true); setError("");
    try { const page = await m4Api.listDirectory({ ...filters, organizationType: filters.organizationType || undefined, limit: 20, cursor: result.nextCursor }); setResult((current) => ({ profiles: [...current.profiles, ...page.profiles.filter((next) => !current.profiles.some((item) => item.slug === next.slug))], pageInfo: page.pageInfo, nextCursor: page.nextCursor, hasMore: page.hasMore })); }
    catch (cause) { setError(errorText(cause)); } finally { setLoadingMore(false); }
  }
  useEffect(() => { const node = sentinel.current; if (!node || !result.hasMore) return; const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void loadMore(); }, { rootMargin: "300px" }); observer.observe(node); return () => observer.disconnect(); });

  const update = <K extends keyof DirectoryQueryState>(key: K, value: DirectoryQueryState[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const returnQuery = serializeDirectoryQuery(filters);
  return <div className="directory-layout"><aside className="filter-panel" aria-label="Directory filters">
    <label htmlFor="directory-q">Search</label><input id="directory-q" maxLength={100} placeholder="Name, summary, story, location, or category" type="search" value={filters.q} onChange={(event) => update("q", event.target.value)} />
    <label htmlFor="directory-type">Business type</label><select id="directory-type" value={filters.organizationType} onChange={(event) => update("organizationType", event.target.value as OrganizationType | "")}><option value="">All business types</option>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <label htmlFor="directory-category">Category</label><input id="directory-category" maxLength={100} value={filters.category} onChange={(event) => update("category", event.target.value)} />
    <label htmlFor="directory-city">City</label><input id="directory-city" maxLength={100} value={filters.city} onChange={(event) => update("city", event.target.value)} />
    <label htmlFor="directory-state">State</label><input id="directory-state" maxLength={100} value={filters.state} onChange={(event) => update("state", event.target.value)} />
    <label htmlFor="directory-region">Region</label><input id="directory-region" maxLength={100} value={filters.region} onChange={(event) => update("region", event.target.value)} />
    <label htmlFor="directory-sort">Sort</label><select id="directory-sort" value={filters.sort} onChange={(event) => update("sort", event.target.value as DirectorySort)}><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option></select>
    <button className="text-button" disabled={!hasDirectoryFilters(filters)} onClick={() => setFilters(emptyDirectoryQuery)} type="button">Clear filters</button><Link className="button secondary" href="/my-profile">Manage your profile</Link>
  </aside><section aria-busy={loading}>{loading && <p role="status">Loading directory…</p>}{error && <div className="empty-state"><p className="form-error" role="alert">The Directory could not be loaded. {error}</p><button className="button secondary" onClick={() => setRevision((value) => value + 1)} type="button">Try again</button></div>}{!loading && !error && !result.profiles.length && <div className="empty-state"><h2>No matching businesses</h2><p>Try changing or clearing the current filters.</p><button className="button secondary" disabled={!hasDirectoryFilters(filters)} onClick={() => setFilters(emptyDirectoryQuery)} type="button">Clear filters</button></div>}<p className="result-count" aria-live="polite">{result.profiles.length} business{result.profiles.length === 1 ? "" : "es"} loaded</p><div className="card-grid two">{result.profiles.map((profile) => <article className="profile-card" key={profile.slug}><Identity profile={profile} /><Link className="button secondary" href={`/profile/${encodeURIComponent(profile.slug)}${returnQuery ? `?from=${encodeURIComponent(returnQuery)}` : ""}`}>View profile</Link></article>)}</div><div ref={sentinel}>{result.hasMore && <button className="button secondary" disabled={loadingMore} onClick={() => void loadMore()} type="button">{loadingMore ? "Loading more…" : "Load more"}</button>}</div></section></div>;
}

export function LiveDirectoryDetail({ identifier }: { identifier: string }) {
  const searchParams = useSearchParams(); const from = searchParams.get("from"); const backHref = from ? `/directory?${from}` : "/directory";
  const [profile, setProfile] = useState<DirectoryProfile | null>(null); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; m4Api.getPublicProfile(identifier).then((value) => { if (active) setProfile(value); }).catch((cause) => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, [identifier, revision]);
  const website = profile?.links.find((link) => link.type === "website");
  return <section className="page shell profile-page"><Link className="text-link back-link" href={backHref}>← Back to Directory</Link>{error ? <div className="empty-state"><h1>Profile unavailable</h1><p role="alert">{error}</p><button className="button secondary" onClick={() => setRevision((value) => value + 1)} type="button">Try again</button></div> : !profile ? <p role="status">Loading profile…</p> : <article className="content-card public-profile-card"><div className="public-profile-heading"><ProfileLogo logoUrl={profile.logoUrl} name={profile.displayName} size="detail" /><Identity heading="h1" profile={{ ...profile, logoUrl: null }} /></div>{profile.story && <p>{profile.story}</p>}{profile.categories.length > 0 && <p className="tag-row">{profile.categories.map((category) => <span className="tag" key={category}>{category}</span>)}</p>}<div className="public-profile-details">{profile.city && <p><strong>Location</strong><span>{[profile.city, profile.state, profile.region].filter(Boolean).join(" · ")}</span></p>}{profile.publicContact.email && <p><strong>Email</strong><a className="text-link" href={`mailto:${profile.publicContact.email}`}>{profile.publicContact.email}</a></p>}{profile.publicContact.phone && <p><strong>Phone</strong><a className="text-link" href={`tel:${profile.publicContact.phone}`}>{profile.publicContact.phone}</a></p>}{website && <p><strong>Website</strong><a className="text-link" href={website.url} rel="noreferrer" target="_blank">Visit website</a></p>}</div><section id="contact-request"><ContactRequestForm profileName={profile.displayName} slug={profile.slug} /></section></article>}</section>;
}
