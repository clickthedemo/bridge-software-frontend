"use client";

/* Phase 6 admin tools: member reports, the admin report queue, the dashboard
   "needs you" list and the user detail panel. Every data view covers loading,
   empty, error with retry, permission denied, stale data and duplicate-submit
   protection (build spec Phase 5). */
import Link from "next/link";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { M4ApiError } from "@/lib/m4/api";
import { useNotificationFocus } from "@/lib/m4/notification-focus";
import {
  adminApi, flagReasonLabel, flagReasons, moderationErrorMessage, resolutionLabels, resolutionsFor, validateReportNote,
  type AccountType, type AdminUserDetail, type ContentFlag, type DashboardSummary, type FlagReason, type FlagResolution, type FlagStatus, type ReportTarget,
} from "@/lib/phase6/admin";

const when = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString() : "Not available";
const dateLabel = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="content-card"><p className="form-error" role="alert">{message}</p><button className="button secondary" onClick={onRetry} type="button">Try again</button></div>;
}

/* Report action shown on public profiles and each of their posts. */
export function ReportButton({ target }: { target: ReportTarget }) {
  const { status, memberships } = useAuth();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<FlagReason | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const label = target.type === "post" ? "Report this update" : "Report this profile";
  // One sign-in link per profile page (on the profile itself), returning to that profile.
  if (status === "unauthenticated") return target.type === "profile" ? <Link className="text-link" href={`/login?next=${encodeURIComponent(`/profile/${target.slug}`)}`}>Sign in to report</Link> : null;
  // POST /flags accepts only members with an active organization (platform admins and invitees get 403).
  if (status !== "authenticated" || !memberships.some((membership) => membership.status === "active")) return null;
  if (done) return <p className="form-hint" role="status">Thanks. Bridge admins will review this report.</p>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!reason) { setError("Choose a reason."); return; }
    const invalid = validateReportNote(note);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError("");
    try { await adminApi.report(target, reason, note); setDone(true); }
    catch (cause) {
      // An earlier report by this member already counts; show it as done.
      if (cause instanceof M4ApiError && cause.code === "MODERATION_DUPLICATE") { setDone(true); return; }
      setError(moderationErrorMessage(cause, "report"));
    }
    finally { setBusy(false); }
  }
  if (!open) return <button aria-label={`${label}: ${target.label}`} className="button ghost compact" onClick={() => setOpen(true)} type="button">{label}</button>;
  return <form aria-label={`${label}: ${target.label}`} className="form-stack report-form" onSubmit={submit}>
    <label htmlFor={`${id}-reason`}>Reason</label>
    <select aria-required="true" id={`${id}-reason`} onChange={(event) => setReason(event.target.value as FlagReason)} value={reason}><option disabled value="">Choose a reason</option>{flagReasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    <label htmlFor={`${id}-note`}>Details (optional)</label>
    <textarea id={`${id}-note`} maxLength={1000} onChange={(event) => setNote(event.target.value)} rows={3} value={note} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="button-row"><button className="button primary" disabled={busy} type="submit">{busy ? "Sending…" : "Send report"}</button><button className="button secondary" disabled={busy} onClick={() => { setOpen(false); setError(""); }} type="button">Cancel</button></div>
  </form>;
}

/* Admin queue at /admin/flags: open and resolved reports with decisions. */
export function FlagQueue() {
  const [status, setStatus] = useState<FlagStatus>("open");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ flags: ContentFlag[]; hasMore: boolean } | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<{ flag: ContentFlag; resolution: FlagResolution } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useNotificationFocus("flagId", page?.flags.map((flag) => flag.id) ?? [], ".admin-flag-list .admin-review-card");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPage(null); setLoadError(null);
      adminApi.listFlags(status, offset).then((value) => {
        if (!active) return;
        // Resolving the last report on a later page empties it; show the previous page instead of "No open reports".
        if (!value.flags.length && offset > 0) setOffset(Math.max(0, offset - 50)); else setPage(value);
      }).catch((cause) => { if (active) setLoadError(cause); });
    });
    return () => { active = false; };
  }, [status, offset, revision]);
  const reload = () => { setLoadError(null); setRevision((value) => value + 1); };
  async function confirm() {
    if (!pending || busy) return;
    if (!note.trim()) { setError("A reason is required."); return; }
    setBusy(pending.flag.id); setError(""); setNotice("");
    try {
      await adminApi.resolveFlag(pending.flag.id, pending.resolution, note);
      setNotice(`${resolutionLabels[pending.resolution]} completed for ${pending.flag.targetLabel}.`);
      setPending(null); setNote(""); reload();
    } catch (cause) {
      if (cause instanceof M4ApiError && cause.status === 409) { setNotice("This report was already handled. The queue has been refreshed."); setPending(null); setNote(""); reload(); return; }
      setError(moderationErrorMessage(cause));
    } finally { setBusy(""); }
  }
  if (loadError instanceof M4ApiError && loadError.status === 403) return <div className="content-card"><p className="form-error" role="alert">This account does not have permission to review reports.</p></div>;
  return <div className="admin-review-stack">
    <nav aria-label="Report status" className="admin-status-tabs">{(["open", "resolved"] as FlagStatus[]).map((item) => <button aria-pressed={status === item} key={item} onClick={() => { setStatus(item); setOffset(0); }} type="button">{item === "open" ? "Open" : "Resolved"}</button>)}</nav>
    {notice && <p className="success-message" role="status">{notice}</p>}
    {error && !pending && <p className="form-error" role="alert">{error}</p>}
    {loadError ? <Retry message={moderationErrorMessage(loadError)} onRetry={reload} />
      : !page ? <p role="status">Loading reports…</p>
      : !page.flags.length ? <div className="empty-state"><h2>{status === "open" ? "No open reports" : "No resolved reports yet"}</h2><p>{status === "open" ? "Nothing needs a decision right now." : "Decisions will be listed here."}</p></div>
      : <div className="admin-flag-list admin-review-list">{page.flags.map((flag) => <article className="admin-review-card" id={`flag-${flag.id}`} key={flag.id}>
        <header><div><p className="eyebrow">{flag.targetType === "post" ? "Update" : "Profile"} · {flagReasonLabel(flag.reason)}</p><h2>{flag.targetSlug ? <Link href={`/profile/${encodeURIComponent(flag.targetSlug)}`}>{flag.targetLabel}</Link> : flag.targetLabel}</h2></div><span className={`status-chip ${flag.status === "open" ? "pending" : "verified"}`}>{flag.status === "open" ? "Open" : "Resolved"}</span></header>
        <div className="admin-record-grid"><p><span>Reported by</span><strong>{flag.reporterDisplayName ?? "Member"}</strong></p><p><span>Reported</span><strong>{when(flag.createdAt)}</strong></p><p><span>Content</span><strong>{flag.targetAvailable ? "Still public" : "No longer public"}</strong></p>{flag.resolution && <p><span>Decision</span><strong>{resolutionLabels[flag.resolution]} · {dateLabel(flag.resolvedAt)}</strong></p>}</div>
        {flag.note && <p className="boundary-note"><strong>Reporter note:</strong> {flag.note}</p>}
        {flag.resolutionNote && <p className="boundary-note"><strong>Reason:</strong> {flag.resolutionNote}</p>}
        {resolutionsFor(flag).length > 0 && <footer className="button-row">{resolutionsFor(flag).map((resolution) => <button className={resolution === "dismissed" ? "button secondary" : "button primary"} disabled={!!busy} key={resolution} onClick={() => { setPending({ flag, resolution }); setNote(""); setError(""); }} type="button">{resolutionLabels[resolution]}</button>)}</footer>}
      </article>)}</div>}
    {page && <nav aria-label="Report pages" className="admin-pagination"><button className="button secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))} type="button">Previous</button><button className="button secondary" disabled={!page.hasMore} onClick={() => setOffset(offset + 50)} type="button">Next</button></nav>}
    {pending && <div className="review-modal-backdrop"><section aria-labelledby="flag-confirm-title" aria-modal="true" className="review-modal" role="dialog">
      <h2 id="flag-confirm-title">{resolutionLabels[pending.resolution]}</h2>
      <p>{pending.resolution === "post_archived" ? "The update leaves the public feed and the business is told why." : pending.resolution === "profile_suspended" ? "The profile and all of its updates leave the directory until an admin reviews it again." : "The report closes and the content stays as it is."} Applies to <strong>{pending.flag.targetLabel}</strong>.</p>
      <label htmlFor="flag-reason">Reason (required)</label>
      <textarea autoFocus id="flag-reason" maxLength={2000} onChange={(event) => setNote(event.target.value)} required rows={4} value={note} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="button-row"><button className="button primary" disabled={!!busy} onClick={() => void confirm()} type="button">{busy ? "Working…" : `Confirm ${resolutionLabels[pending.resolution].toLowerCase()}`}</button><button className="button secondary" disabled={!!busy} onClick={() => { setPending(null); setError(""); }} type="button">Cancel</button></div>
    </section></div>}
  </div>;
}

/* Dashboard "needs you" list: each count links to the queue that clears it. */
export function AdminDashboardSummary() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSummary(null); setError(null);
      adminApi.dashboardSummary().then((value) => { if (active) setSummary(value); }).catch((cause) => { if (active) setError(cause); });
    });
    return () => { active = false; };
  }, [revision]);
  if (error instanceof M4ApiError && error.status === 403) return <div className="content-card"><p className="form-error" role="alert">This account does not have permission to view the admin dashboard.</p></div>;
  if (error) return <Retry message={moderationErrorMessage(error)} onRetry={() => setRevision((value) => value + 1)} />;
  if (!summary) return <p role="status">Loading what needs you…</p>;
  const needs = [
    { label: "EIN checks waiting", count: summary.pendingEinChecks, href: "/admin/verification" },
    { label: "Profiles awaiting review", count: summary.profilesAwaitingReview, href: "/admin/directory-profiles" },
    { label: "Open reports", count: summary.openFlags, href: "/admin/flags" },
    { label: "Contact requests waiting on a business", count: summary.contactRequestsWaiting, href: null },
  ];
  const waiting = needs.filter((item) => item.count > 0);
  return <>
    <section aria-labelledby="needs-you-heading" className="admin-content-card">
      <div className="admin-card-heading"><div><h2 id="needs-you-heading">Needs you</h2><p>Work this list top to bottom once a day.</p><p className="form-hint">Counts as of {when(summary.generatedAt)}.</p></div></div>
      {waiting.length ? <ul className="admin-needs-list">{waiting.map((item) => <li key={item.label}>{item.href ? <Link href={item.href}><strong>{item.count}</strong> {item.label}</Link> : <span><strong>{item.count}</strong> {item.label}</span>}</li>)}</ul> : <p className="admin-empty-state">Nothing is waiting on you right now.</p>}
    </section>
    <section className="admin-stat-grid" aria-label="Published content">
      <Link className="admin-stat-card admin-stat-link" href="/admin/announcements"><div><span>Published announcements</span><strong>{summary.publishedAnnouncements}</strong></div><b>A</b></Link>
      <article className="admin-stat-card"><div><span>Published updates</span><strong>{summary.publishedPosts}</strong></div><b>▦</b></article>
      <Link className="admin-stat-card admin-stat-link" href="/admin/flags"><div><span>Open reports</span><strong>{summary.openFlags}</strong></div><b>!</b></Link>
      <Link className="admin-stat-card admin-stat-link" href="/admin/verification"><div><span>EIN checks waiting</span><strong>{summary.pendingEinChecks}</strong></div><b>✓</b></Link>
    </section>
  </>;
}

/* User detail panel on /admin/users: memberships, verification state, access actions. */
export function AdminUserPanel({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const { user: actor } = useAuth();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [accountType, setAccountType] = useState<AccountType>("standard");
  const [pending, setPending] = useState<"deactivate" | "reactivate" | "remove-admin" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(() => adminApi.userDetail(userId), [userId]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoadError(null);
      load().then((value) => { if (active) { setDetail(value); setAccountType(value.user.accountType ?? "standard"); } }).catch((cause) => { if (active) setLoadError(cause); });
    });
    return () => { active = false; };
  }, [load, revision]);
  const self = actor?.id === userId;
  async function run(action: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(message); setPending(null); setReason(""); setRevision((value) => value + 1); onChanged(); }
    catch (cause) { setError(moderationErrorMessage(cause)); }
    finally { setBusy(false); }
  }
  function confirmPending() {
    if (!pending) return;
    if (pending === "deactivate" && !reason.trim()) { setError("A reason is required."); return; }
    if (pending === "deactivate") void run(() => adminApi.deactivateUser(userId, reason), "User deactivated. Their sessions were ended and sign-in is blocked.");
    if (pending === "reactivate") void run(() => adminApi.reactivateUser(userId, reason), "User reactivated. They can sign in again.");
    if (pending === "remove-admin") void run(() => adminApi.removePlatformRole(userId, reason), "Platform administrator role removed.");
  }
  if (loadError instanceof M4ApiError && loadError.status === 403) return <p className="form-error" role="alert">This account does not have permission to view users.</p>;
  if (loadError) return <Retry message={moderationErrorMessage(loadError)} onRetry={() => setRevision((value) => value + 1)} />;
  if (!detail) return <p role="status">Loading user…</p>;
  const { user, memberships } = detail;
  const pendingLabel = pending === "deactivate" ? "Deactivate user" : pending === "reactivate" ? "Reactivate user" : "Remove administrator role";
  return <section aria-label={`${user.displayName ?? user.email ?? "User"} details`} className="admin-profile-details">
    {notice && <p className="success-message" role="status">{notice}</p>}
    {error && !pending && <p className="form-error" role="alert">{error}</p>}
    <dl className="admin-details-grid">
      <div><dt>Email</dt><dd>{user.email ?? "No email"} · {user.emailVerified ? "verified" : "unverified"}</dd></div>
      <div><dt>Status</dt><dd>{user.deactivated ? "Deactivated" : "Active"}</dd></div>
      <div><dt>Platform role</dt><dd>{user.platformRole === "admin" ? "Administrator" : "Member"}</dd></div>
      <div><dt>Last sign in</dt><dd>{when(user.lastSignInAt)}</dd></div>
      <div><dt>Created</dt><dd>{when(user.createdAt)}</dd></div>
    </dl>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void run(() => adminApi.setAccountType(userId, accountType), "Account type saved."); }}>
      <label htmlFor={`account-type-${userId}`}>Account type</label>
      <div className="button-row"><select disabled={busy} id={`account-type-${userId}`} onChange={(event) => setAccountType(event.target.value as AccountType)} value={accountType}><option value="standard">Standard user</option><option value="sales_rep">Sales representative</option></select><button className="button secondary" disabled={busy || accountType === (user.accountType ?? "standard")} type="submit">Save account type</button></div>
      <p className="form-hint">Sales representatives can be chosen as a business&apos;s contact for Directory requests.</p>
    </form>
    <section><h4>Organizations</h4>{memberships.length ? <div className="table-scroll"><table><thead><tr><th>Organization</th><th>Role</th><th>Membership</th><th>Profile</th><th>EIN</th></tr></thead><tbody>{memberships.map((membership) => <tr key={membership.organizationId}><td>{membership.organizationName}{membership.organizationStatus !== "active" ? ` (${membership.organizationStatus})` : ""}</td><td>{membership.role.replaceAll("_", " ")}</td><td>{membership.status}</td><td>{membership.directoryProfile ? <>{membership.directoryProfile.status.replaceAll("_", " ")}{membership.directoryProfile.slug && <> · <Link href={`/profile/${encodeURIComponent(membership.directoryProfile.slug)}`}>view</Link></>}</> : "No profile"}</td><td>{membership.einVerified ? "Verified" : "Not verified"}</td></tr>)}</tbody></table></div> : <p className="form-hint">No organization memberships.</p>}</section>
    {self ? <p className="form-hint">You cannot change your own access or role from here.</p> : <div className="button-row">
      {user.deactivated ? <button className="button primary" disabled={busy} onClick={() => { setPending("reactivate"); setReason(""); setError(""); }} type="button">Reactivate user</button>
        : <button className="button secondary" disabled={busy} onClick={() => { setPending("deactivate"); setReason(""); setError(""); }} type="button">Deactivate user</button>}
      {user.platformRole === "admin" && <button className="button secondary" disabled={busy} onClick={() => { setPending("remove-admin"); setReason(""); setError(""); }} type="button">Remove administrator role</button>}
    </div>}
    {pending && <div className="review-modal-backdrop"><section aria-labelledby="user-confirm-title" aria-modal="true" className="review-modal" role="dialog">
      <h2 id="user-confirm-title">{pendingLabel}</h2>
      <p>{pending === "deactivate" ? "Sign-in is blocked immediately and every active session ends. You can reactivate later." : pending === "reactivate" ? "The user can sign in again right away." : "They keep their account and organization roles but lose the Bridge admin portal."} Applies to <strong>{user.displayName ?? user.email}</strong>.</p>
      <label htmlFor="user-reason">{pending === "deactivate" ? "Reason (required)" : "Reason (optional)"}</label>
      <textarea autoFocus id="user-reason" maxLength={2000} onChange={(event) => setReason(event.target.value)} required={pending === "deactivate"} rows={4} value={reason} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="button-row"><button className="button primary" disabled={busy} onClick={confirmPending} type="button">{busy ? "Working…" : `Confirm ${pendingLabel.toLowerCase()}`}</button><button className="button secondary" disabled={busy} onClick={() => { setPending(null); setError(""); }} type="button">Cancel</button></div>
    </section></div>}
  </section>;
}
