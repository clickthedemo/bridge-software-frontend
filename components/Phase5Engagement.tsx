"use client";

/* Phase 5 Early Engagement screens: announcements, verified-profile posts and
   saved profiles. Every data view covers loading, empty, error with retry,
   permission denied and duplicate-submit protection (build spec Phase 5). */
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  engagementApi, engagementErrorMessage, EngagementApiError, validateItemInput,
  type EngagementItem, type EngagementStatus, type FeedCursor, type ItemInput, type ItemUpdate,
  type PublicAnnouncement, type PublicPost, type SavedProfile,
} from "@/lib/phase5/engagement";
import { isPhase3LiveApi } from "@/lib/phase3";
import { ReportButton } from "@/components/Phase6Moderation";

const dateLabel = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
const statusLabel: Record<EngagementStatus, string> = { draft: "Draft", published: "Published", archived: "Archived" };

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="content-card"><p className="form-error" role="alert">{message}</p><button className="button secondary" onClick={onRetry} type="button">Try again</button></div>;
}

/* Cursor feed shared by announcements and profile posts. */
function useFeed<T>(load: (cursor: FeedCursor | null) => Promise<{ items: T[]; nextCursor: FeedCursor | null }>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    load(null).then((page) => { if (active) { setItems(page.items); setCursor(page.nextCursor); } })
      .catch((cause) => { if (active) setError(engagementErrorMessage(cause)); });
    return () => { active = false; };
  }, [load, revision]);
  const retry = () => { setError(""); setItems(null); setRevision((value) => value + 1); };
  async function more() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true); setError("");
    try { const page = await load(cursor); setItems((current) => [...(current ?? []), ...page.items]); setCursor(page.nextCursor); }
    catch (cause) { setError(engagementErrorMessage(cause)); }
    finally { setLoadingMore(false); }
  }
  return { items, cursor, error, loadingMore, retry, more };
}

export function AnnouncementsFeed() {
  const load = useCallback((cursor: FeedCursor | null) => engagementApi.announcements(cursor), []);
  const feed = useFeed<PublicAnnouncement>(load);
  if (!isPhase3LiveApi()) return <p className="boundary-note">Preview mode · announcements appear here once the live API is connected.</p>;
  if (feed.error && !feed.items) return <Retry message={feed.error} onRetry={feed.retry} />;
  if (!feed.items) return <p role="status">Loading announcements…</p>;
  if (!feed.items.length) return <div className="empty-state"><h3>No announcements yet</h3><p>Bridge updates and industry news will show up here.</p></div>;
  return <div className="form-stack">
    {feed.items.map((item) => <article className="content-card" id={`announcement-${item.id}`} key={item.id}><p className="eyebrow">{dateLabel(item.publishedAt)}</p><h2>{item.title}</h2><p style={{ whiteSpace: "pre-line" }}>{item.body}</p></article>)}
    {feed.error && <p className="form-error" role="alert">{feed.error}</p>}
    {feed.cursor && <button className="button secondary" disabled={feed.loadingMore} onClick={() => void feed.more()} type="button">{feed.loadingMore ? "Loading…" : "Show older announcements"}</button>}
  </div>;
}

export function ProfilePosts({ slug }: { slug: string }) {
  const load = useCallback((cursor: FeedCursor | null) => engagementApi.publicPosts({ profile: slug, cursor, limit: 10 }), [slug]);
  const feed = useFeed<PublicPost>(load);
  return <section aria-labelledby="profile-posts-heading" className="content-card">
    <h2 id="profile-posts-heading">Updates</h2>
    {feed.error && !feed.items ? <><p className="form-error" role="alert">{feed.error}</p><button className="button secondary" onClick={feed.retry} type="button">Try again</button></>
      : !feed.items ? <p role="status">Loading updates…</p>
      : !feed.items.length ? <p>No updates from this business yet.</p>
      : <>{feed.items.map((post) => <article key={post.id}><h3>{post.title}</h3><p className="form-hint">{dateLabel(post.publishedAt)}</p><p style={{ whiteSpace: "pre-line" }}>{post.body}</p><ReportButton target={{ type: "post", postId: post.id, label: post.title }} /></article>)}
        {feed.error && <p className="form-error" role="alert">{feed.error}</p>}
        {feed.cursor && <button className="button secondary" disabled={feed.loadingMore} onClick={() => void feed.more()} type="button">{feed.loadingMore ? "Loading…" : "Show older updates"}</button>}</>}
  </section>;
}

export function SaveProfileButton({ slug }: { slug: string }) {
  const { status } = useAuth();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    engagementApi.savedProfiles().then((items) => { if (active) setSaved(items.some((item) => item.slug === slug)); }).catch(() => { if (active) setSaved(false); });
    return () => { active = false; };
  }, [slug, status]);
  if (status === "unauthenticated") return <Link className="button secondary" href={`/login?next=${encodeURIComponent(`/profile/${slug}`)}`}>Sign in to save</Link>;
  if (status !== "authenticated" || saved === null) return null;
  async function toggle() {
    setBusy(true); setError("");
    try { setSaved(saved ? await engagementApi.unsaveProfile(slug) : await engagementApi.saveProfile(slug)); }
    catch (cause) { setError(engagementErrorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="button-row"><button aria-pressed={saved} className={saved ? "button primary" : "button secondary"} disabled={busy} onClick={() => void toggle()} type="button">{busy ? "Saving…" : saved ? `Saved` : "Save profile"}</button>{saved && <Link className="button secondary" href="/saved">View saved profiles</Link>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}

export function SavedProfilesList() {
  const [items, setItems] = useState<SavedProfile[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; engagementApi.savedProfiles().then((value) => { if (active) setItems(value); }).catch((cause) => { if (active) setError(engagementErrorMessage(cause)); }); return () => { active = false; }; }, [revision]);
  async function remove(slug: string) {
    setBusy(slug); setError("");
    try { await engagementApi.unsaveProfile(slug); setItems((current) => (current ?? []).filter((item) => item.slug !== slug)); }
    catch (cause) { setError(engagementErrorMessage(cause)); }
    finally { setBusy(""); }
  }
  if (error && !items) return <Retry message={error} onRetry={() => { setError(""); setRevision((value) => value + 1); }} />;
  if (!items) return <p role="status">Loading saved profiles…</p>;
  if (!items.length) return <div className="empty-state"><h3>Nothing saved yet</h3><p>Save a business from its profile to find it here quickly.</p><Link className="button primary" href="/directory">Browse the directory</Link></div>;
  return <div className="form-stack">{error && <p className="form-error" role="alert">{error}</p>}{items.map((item) => <article className="content-card" key={item.slug}><h2><Link href={`/profile/${encodeURIComponent(item.slug)}`}>{item.displayName}</Link></h2><p className="form-hint">{[item.city, item.state].filter(Boolean).join(", ")}{item.city || item.state ? " · " : ""}Saved {dateLabel(item.savedAt)}</p><button className="button secondary" disabled={busy === item.slug} onClick={() => void remove(item.slug)} type="button">{busy === item.slug ? "Removing…" : "Remove"}</button></article>)}</div>;
}

/* Composer plus list used by both business posts and admin announcements. */
function ItemManager({ noun, load, create, update }: { noun: string; load: () => Promise<EngagementItem[]>; create: (input: ItemInput) => Promise<EngagementItem>; update: (id: string, change: ItemUpdate) => Promise<EngagementItem> }) {
  const [items, setItems] = useState<EngagementItem[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; load().then((value) => { if (active) setItems(value); }).catch((cause) => { if (active) setLoadError(cause); }); return () => { active = false; }; }, [load, revision]);
  async function submit(publish: boolean) {
    if (busy) return;
    const input = { title, body, publish }, invalid = validateItemInput(input);
    if (invalid) { setError(invalid); return; }
    setBusy("new"); setError(""); setNotice("");
    try { const created = await create(input); setItems((current) => [created, ...(current ?? [])]); setTitle(""); setBody(""); setNotice(publish ? `${noun} published.` : "Draft saved."); }
    catch (cause) { setError(engagementErrorMessage(cause)); }
    finally { setBusy(""); }
  }
  async function move(item: EngagementItem, status: EngagementStatus) {
    setBusy(item.id); setError(""); setNotice("");
    try { const next = await update(item.id, { status }); setItems((current) => (current ?? []).map((value) => value.id === next.id ? next : value)); setNotice(status === "published" ? `${noun} published.` : `${noun} archived.`); }
    catch (cause) { setError(engagementErrorMessage(cause)); }
    finally { setBusy(""); }
  }
  if (loadError instanceof EngagementApiError && loadError.status === 403) return <div className="content-card"><p className="form-error" role="alert">This account does not have permission to manage {noun.toLowerCase()}s.</p></div>;
  if (loadError) return <Retry message={engagementErrorMessage(loadError)} onRetry={() => { setLoadError(null); setRevision((value) => value + 1); }} />;
  const describedBy = error ? "engagement-error" : undefined;
  return <div className="form-stack">
    <form className="content-card form-stack" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void submit(true); }}>
      <h2>New {noun.toLowerCase()}</h2>
      <label htmlFor="engagement-title">Title</label>
      <input aria-describedby={describedBy} id="engagement-title" maxLength={160} onChange={(event) => setTitle(event.target.value)} value={title} />
      <label htmlFor="engagement-body">Text</label>
      <textarea aria-describedby={describedBy} id="engagement-body" maxLength={5000} onChange={(event) => setBody(event.target.value)} rows={6} value={body} />
      <p className="form-hint">Plain text. {noun === "Announcement" ? "Authorized platform administrators can publish announcements without a business profile." : "Publishing needs an approved, verified profile."}</p>
      {error && <p className="form-error" id="engagement-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="button-row"><button className="button primary" disabled={!!busy} type="submit">{busy === "new" ? "Saving…" : "Publish"}</button><button className="button secondary" disabled={!!busy} onClick={() => void submit(false)} type="button">Save draft</button></div>
    </form>
    {!items ? <p role="status">Loading…</p> : !items.length ? <div className="empty-state"><h3>No {noun.toLowerCase()}s yet</h3><p>Your first one will show up here.</p></div>
      : items.map((item) => <article className="content-card" key={item.id}>
        <p className="eyebrow">{statusLabel[item.status]}{item.publishedAt ? ` · ${dateLabel(item.publishedAt)}` : ""}</p>
        <h3>{item.title}</h3><p style={{ whiteSpace: "pre-line" }}>{item.body}</p>
        <div className="button-row">
          {item.status === "draft" && <button className="button primary" disabled={!!busy} onClick={() => void move(item, "published")} type="button">{busy === item.id ? "Saving…" : "Publish"}</button>}
          {item.status !== "archived" && <button className="button secondary" disabled={!!busy} onClick={() => void move(item, "archived")} type="button">Archive</button>}
        </div>
      </article>)}
  </div>;
}

export function PostManager() {
  const { memberships } = useAuth();
  const organizations = memberships.filter((item) => item.status === "active" && ["owner", "admin", "page_manager"].includes(item.role));
  const [chosen, setChosen] = useState("");
  const organizationId = organizations.some((item) => item.organizationId === chosen) ? chosen : organizations[0]?.organizationId ?? "";
  if (!organizations.length) return <div className="content-card"><h2>No business to post for</h2><p>Owners, admins and page managers of a business can post updates once its profile is approved and verified.</p><Link className="button primary" href="/my-profile">Go to my profile</Link></div>;
  return <div className="form-stack">
    {organizations.length > 1 && <section className="content-card"><label htmlFor="post-organization">Business</label><select id="post-organization" onChange={(event) => setChosen(event.target.value)} value={organizationId}>{organizations.map((item) => <option key={item.organizationId} value={item.organizationId}>{item.organizationName}</option>)}</select></section>}
    <OrganizationPosts key={organizationId} organizationId={organizationId} />
  </div>;
}

function OrganizationPosts({ organizationId }: { organizationId: string }) {
  const load = useCallback(() => engagementApi.organizationPosts(organizationId), [organizationId]);
  const create = useCallback((input: ItemInput) => engagementApi.createPost(organizationId, input), [organizationId]);
  return <ItemManager create={create} load={load} noun="Update" update={engagementApi.updatePost} />;
}

export function AnnouncementManager() {
  const load = useCallback(() => engagementApi.adminAnnouncements(), []);
  return <ItemManager create={engagementApi.createAnnouncement} load={load} noun="Announcement" update={engagementApi.updateAnnouncement} />;
}
