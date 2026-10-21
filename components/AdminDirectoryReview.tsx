"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProfileLogo } from "@/components/ProfileLogo";
import { findAdminProfile, m4Api, type AdminDirectoryProfile, type OffsetPage, type ProfileStatus } from "@/lib/m4/api";
import { actionReasonError, directoryActions, type DirectoryReviewAction } from "@/lib/m4/review-actions";
import { useNotificationFocus } from "@/lib/m4/notification-focus";

const labels: Record<DirectoryReviewAction, string> = { approve: "Approve", "request-correction": "Request correction", reject: "Reject", suspend: "Suspend" };
const statuses: Array<ProfileStatus | ""> = ["", "pending_review", "approved", "correction_requested", "rejected", "suspended"];
const statusLabel = (value: string) => value ? value.replaceAll("_", " ") : "All";
const timestamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not available";

function DirectoryDetails({ profile }: { profile: AdminDirectoryProfile }) {
  const details = profile.workingProfile, publishedLogo = profile.hasPublishedVersion && details.hasLogo ? `/api/v1/directory/profiles/${encodeURIComponent(details.slug)}/logo` : null;
  return <section className="admin-profile-details" aria-label={`${details.displayName} details`} onClick={(event) => event.stopPropagation()}>
    <div className="admin-profile-identity"><ProfileLogo logoUrl={publishedLogo} name={details.displayName} size="detail"/><div><p className="eyebrow">Directory profile details</p><h3>{details.displayName}</h3><p className="form-hint">/{details.slug} · {details.businessType ?? "Unclassified"}</p>{details.hasLogo && !publishedLogo && <p className="form-hint">A working logo is uploaded; the current queue API does not expose a safe administrator preview URL.</p>}</div></div>
    <dl className="admin-details-grid">
      <div><dt>Organization</dt><dd>{profile.organization.name}</dd></div><div><dt>Business</dt><dd>{profile.business.dbaName || profile.business.legalName}</dd></div>
      <div><dt>Workflow status</dt><dd>{statusLabel(profile.status)}</dd></div><div><dt>Eligibility</dt><dd>{profile.verificationEligibility.eligible ? "Eligible" : "Not eligible"}</dd></div>
      <div><dt>Submitted</dt><dd>{timestamp(profile.submittedAt)}</dd></div><div><dt>Updated</dt><dd>Not supplied by the current queue API</dd></div>
    </dl>
    <div className="admin-profile-copy"><div><h4>Summary</h4><p>{details.summary || "Not provided"}</p></div><div><h4>Story</h4><p>{details.story || "Not provided"}</p></div></div>
    <div className="admin-profile-sections">
      <section><h4>Categories</h4>{details.categories.length ? <ul>{details.categories.map((category) => <li key={category}>{category}</li>)}</ul> : <p>None provided</p>}</section>
      <section><h4>Links</h4>{details.links.length ? <ul>{details.links.map((link) => <li key={`${link.type}:${link.url}`}><a href={link.url} rel="noreferrer" target="_blank">{link.label || statusLabel(link.type)}</a></li>)}</ul> : <p>None provided</p>}</section>
      <section><h4>Location</h4><p>{[details.city, details.state, details.region].filter(Boolean).join(", ") || "Not provided"}</p></section>
      <section><h4>Public contact</h4><p>{details.publicContact.email || "No public email"}<br/>{details.publicContact.phone || "No public phone"}</p></section>
      <section><h4>Licence summary</h4><p>{details.license ? [details.license.type, details.license.number].filter(Boolean).join(" · ") : "Not applicable or not provided"}</p></section>
      <section><h4>Eligibility checks</h4><ul><li>EIN: {profile.verificationEligibility.einVerified ? "verified" : "not verified"}</li><li>Organization: {profile.verificationEligibility.organizationActive ? "active" : "inactive"}</li><li>Business: {profile.verificationEligibility.businessActive ? "active" : "inactive"}</li></ul></section>
    </div>
    {details.workflowReason && <p className="boundary-note"><strong>Current workflow reason:</strong> {details.workflowReason}</p>}
    <div className="admin-history-summary"><h4>Status summary</h4><p>Current status: {statusLabel(profile.status)}. Submitted: {timestamp(profile.submittedAt)}.</p><p className="form-hint">Detailed workflow history is not supplied by the current supported queue API.</p></div>
    {profile.hasPublishedVersion && <Link className="button secondary" href={`/profile/${encodeURIComponent(details.slug)}`}>Open current published profile</Link>}
  </section>;
}

export function AdminDirectoryReview() {
  const targetProfileId = useSearchParams().get("profileId");
  const [status, setStatus] = useState<ProfileStatus | "">("pending_review"), [offset, setOffset] = useState(0), [selectedId, setSelectedId] = useState<string | null>(targetProfileId);
  const [page, setPage] = useState<OffsetPage<AdminDirectoryProfile> | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [targetError, setTargetError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(""), [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<{ profile: AdminDirectoryProfile; action: DirectoryReviewAction } | null>(null), [reason, setReason] = useState("");
  useNotificationFocus("profileId", page?.items.map((item) => item.id) ?? [], ".admin-review-list .admin-review-card");

  useEffect(() => {
    if (!targetProfileId) return;
    let active = true;
    findAdminProfile(targetProfileId).then((result) => {
      if (!active) return;
      if (!result) { setTargetError("The referenced Directory profile is unavailable or you no longer have access."); return; }
      setTargetError(""); setSelectedId(result.profile.id); setStatus(result.status); setOffset(result.offset);
    }).catch(() => { if (active) setTargetError("The referenced Directory profile could not be loaded."); });
    return () => { active = false; };
  }, [targetProfileId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (!active) return; setLoading(true); setError(""); m4Api.listAdminProfiles({ ...(status ? { status } : {}), limit: 20, offset }).then((value) => { if (active) setPage(value); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "The review queue could not be loaded."); }).finally(() => { if (active) setLoading(false); }); });
    return () => { active = false; };
  }, [status, offset, revision]);

  function choose(profile: AdminDirectoryProfile, action: DirectoryReviewAction) { if (["approve", "reject", "suspend"].includes(action) && !window.confirm(`${labels[action]} ${profile.workingProfile.displayName}?`)) return; const selection = { profile, action }; setPending(selection); setReason(""); setError(""); if (action === "approve") void confirmAction(selection, ""); }
  async function confirmAction(selection = pending, value = reason) { if (!selection) return; const validation = actionReasonError(selection.action, value); if (validation) { setError(validation); return; } setBusy(selection.profile.id); setError(""); setNotice(""); try { await m4Api.reviewProfile(selection.profile.id, selection.action, value.trim() || undefined); setNotice(`${labels[selection.action]} completed for ${selection.profile.workingProfile.displayName}.`); setPending(null); setReason(""); setRevision((current) => current + 1); } catch (cause) { setError(cause instanceof Error ? cause.message : "The review action could not be completed."); } finally { setBusy(""); } }

  return <div className="admin-review-stack"><section className="admin-summary-grid" aria-label="Directory review summary"><div><strong>{page?.items.length ?? 0}</strong><span>Visible records</span></div><div><strong>{statusLabel(status)}</strong><span>Current queue</span></div><div><strong>{page?.items.filter((item) => item.verificationEligibility.eligible).length ?? 0}</strong><span>Eligible</span></div></section><nav className="admin-status-tabs" aria-label="Directory profile status">{statuses.map((item) => <button aria-pressed={status === item} key={item} onClick={() => { setStatus(item); setOffset(0); setSelectedId(null); }} type="button">{statusLabel(item)}</button>)}</nav>{notice && <p className="success-message" role="status">{notice}</p>}{targetError && <p className="form-error" role="alert">{targetError}</p>}{error && <p className="form-error" role="alert">{error}</p>}{loading && <p role="status">Loading Directory profile review queue…</p>}{!loading && !error && !page?.items.length && <div className="empty-state"><h2>No profiles in this queue</h2><p>Select another status to continue reviewing.</p></div>}<div className="admin-review-list">{page?.items.map((profile) => { const actions = directoryActions(profile.status), selected = selectedId === profile.id; return <article aria-expanded={selected} className={`admin-review-card admin-directory-card${selected ? " is-selected" : ""}`} id={`profile-${profile.id}`} key={profile.id} onClick={() => setSelectedId(selected ? null : profile.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(selected ? null : profile.id); } }} role="button" tabIndex={0}><header><div><p className="eyebrow">{profile.workingProfile.businessType ?? "Unclassified"}</p><h2>{profile.workingProfile.displayName || profile.business.dbaName || profile.business.legalName}</h2></div><span className={`status-chip ${profile.status === "approved" ? "verified" : profile.status === "rejected" || profile.status === "suspended" ? "warning" : "pending"}`}>{statusLabel(profile.status)}</span></header><div className="admin-record-grid"><p><span>Organization</span><strong>{profile.organization.name}</strong></p><p><span>Business</span><strong>{profile.business.dbaName || profile.business.legalName}</strong></p><p><span>Submitted</span><strong>{timestamp(profile.submittedAt)}</strong></p><p><span>Eligibility</span><strong>{profile.verificationEligibility.eligible ? "Eligible" : "Not eligible"}</strong></p></div>{profile.status === "correction_requested" && <p className="boundary-note">Waiting for organization resubmission</p>}{selected && <DirectoryDetails profile={profile}/>} {actions.length > 0 && <footer className="button-row" onClick={(event) => event.stopPropagation()}>{actions.map((action) => <button className={action === "approve" ? "button primary" : "button secondary"} disabled={!!busy} key={action} onClick={() => choose(profile, action)} type="button">{labels[action]}</button>)}</footer>}</article>; })}</div>{page && <nav className="admin-pagination" aria-label="Review queue pages"><button className="button secondary" disabled={page.pageInfo.offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - page.pageInfo.limit))}>Previous</button><button className="button secondary" disabled={!page.pageInfo.hasMore || loading} onClick={() => setOffset(offset + page.pageInfo.limit)}>Next</button></nav>}{pending && pending.action !== "approve" && <div className="review-modal-backdrop"><section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-confirm-title"><h2 id="review-confirm-title">{labels[pending.action]}</h2><p>Apply this action to <strong>{pending.profile.workingProfile.displayName}</strong>.</p><label htmlFor="review-reason">Reason (required)</label><textarea autoFocus id="review-reason" maxLength={2000} required rows={4} value={reason} onChange={(event) => setReason(event.target.value)}/><div className="button-row"><button className="button primary" disabled={!!busy} onClick={() => void confirmAction()}>{busy ? "Working…" : `Confirm ${labels[pending.action].toLowerCase()}`}</button><button className="button secondary" disabled={!!busy} onClick={() => setPending(null)}>Cancel</button></div></section></div>}</div>;
}
