"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ContactRequestForm } from "@/components/M4ContactRequests";
import { m4Api, type DirectoryPage, type DirectoryProfile, type DirectorySort, type OrganizationType } from "@/lib/m4/api";

const types: Record<OrganizationType, string> = { brand: "Brand", retailer: "Retailer", dispensary: "Dispensary" };
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The directory could not be loaded.";

function Identity({ profile, heading = "h2" }: { profile: DirectoryProfile; heading?: "h1" | "h2" }) {
  const Heading = heading;
  return <><div className="card-topline"><span className="avatar" aria-hidden="true">{profile.displayName.split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span><span className="status-chip verified">Published</span></div><Heading>{profile.displayName}</Heading><p className="muted">{profile.businessType ? types[profile.businessType] : "Business"}</p>{profile.summary && <p>{profile.summary}</p>}</>;
}

export function LiveDirectory() {
  const [q, setQ] = useState(""); const [organizationType, setOrganizationType] = useState<OrganizationType | "">(""); const [sort, setSort] = useState<DirectorySort>("name_asc");
  const [result, setResult] = useState<DirectoryPage>({ profiles: [], pageInfo: { nextCursor: null, hasMore: false }, nextCursor: null, hasMore: false });
  const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true; const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      m4Api.listDirectory({ q, organizationType: organizationType || undefined, sort, limit: 20 }).then((page) => { if (active) setResult(page); }).catch((cause) => { if (active) setError(errorText(cause)); }).finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [q, organizationType, sort, revision]);

  async function loadMore() {
    if (!result.nextCursor || loadingMore) return; setLoadingMore(true); setError("");
    try { const page = await m4Api.listDirectory({ q, organizationType: organizationType || undefined, sort, limit: 20, cursor: result.nextCursor }); setResult((current) => ({ profiles: [...current.profiles, ...page.profiles.filter((next) => !current.profiles.some((item) => item.slug === next.slug))], pageInfo: page.pageInfo, nextCursor: page.nextCursor, hasMore: page.hasMore })); }
    catch (cause) { setError(errorText(cause)); } finally { setLoadingMore(false); }
  }

  useEffect(() => {
    const node = sentinel.current; if (!node || !result.hasMore) return;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void loadMore(); }, { rootMargin: "300px" }); observer.observe(node); return () => observer.disconnect();
  });

  return <div className="directory-layout"><aside className="filter-panel" aria-label="Directory filters"><label htmlFor="directory-q">Search</label><input id="directory-q" maxLength={100} placeholder="Business name or keyword" type="search" value={q} onChange={(event) => setQ(event.target.value)} /><label htmlFor="directory-type">Business type</label><select id="directory-type" value={organizationType} onChange={(event) => setOrganizationType(event.target.value as OrganizationType | "")}><option value="">All business types</option>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label htmlFor="directory-sort">Sort</label><select id="directory-sort" value={sort} onChange={(event) => setSort(event.target.value as DirectorySort)}><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option></select><Link className="button secondary" href="/my-profile">Manage your profile</Link></aside><section aria-busy={loading}>{loading && <p role="status">Loading directory…</p>}{error && <div className="empty-state"><p className="form-error" role="alert">{error}</p><button className="button secondary" onClick={() => setRevision((value) => value + 1)} type="button">Try again</button></div>}{!loading && !error && !result.profiles.length && <div className="empty-state"><h2>No matching businesses</h2><p>Try another search or business type.</p></div>}<p className="result-count" aria-live="polite">{result.profiles.length} business{result.profiles.length === 1 ? "" : "es"} loaded</p><div className="card-grid two">{result.profiles.map((profile) => <article className="profile-card" key={profile.id}><Identity profile={profile} /><Link className="button secondary" href={`/profile/${encodeURIComponent(profile.slug)}`}>View profile</Link></article>)}</div><div ref={sentinel}>{result.hasMore && <button className="button secondary" disabled={loadingMore} onClick={() => void loadMore()} type="button">{loadingMore ? "Loading more…" : "Load more"}</button>}</div></section></div>;
}

export function LiveDirectoryDetail({ identifier }: { identifier: string }) {
  const [profile, setProfile] = useState<DirectoryProfile | null>(null); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; m4Api.getPublicProfile(identifier).then((value) => { if (active) setProfile(value); }).catch((cause) => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, [identifier, revision]);
  const website = profile?.links.find((link) => link.type === "website");
  return <section className="page shell profile-page"><Link className="text-link back-link" href="/explore">← Back to Explore</Link>{error ? <div className="empty-state"><h1>Profile unavailable</h1><p role="alert">{error}</p><button className="button secondary" onClick={() => setRevision((value) => value + 1)} type="button">Try again</button></div> : !profile ? <p role="status">Loading profile…</p> : <article className="content-card">{profile.logoUrl && <Image unoptimized alt={`${profile.displayName} logo`} height={96} src={profile.logoUrl} width={96} />}<Identity heading="h1" profile={profile} />{profile.story && <p>{profile.story}</p>}{website && <p><a className="text-link" href={website.url} rel="noreferrer" target="_blank">Visit website</a></p>}<section id="contact-request"><ContactRequestForm profileName={profile.displayName} slug={profile.slug} /></section></article>}</section>;
}
