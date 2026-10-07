"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { m4Api, type Business, type DirectoryProfile, type DirectoryProfileInput } from "@/lib/m4/api";

const blank: DirectoryProfileInput = { businessId: "", slug: "", displayName: "", summary: null, websiteUrl: null };
const editableStatuses = new Set(["draft", "correction_requested"]);
const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export function DirectoryEditor() {
  const { memberships } = useAuth();
  const organizations = useMemo(() => memberships.filter((item) => item.status === "active" && ["owner", "admin"].includes(item.role)), [memberships]);
  const [organizationId, setOrganizationId] = useState(organizations[0]?.organizationId ?? "");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [profile, setProfile] = useState<DirectoryProfile | null>(null);
  const [draft, setDraft] = useState<DirectoryProfileInput>(blank);
  const [legalName, setLegalName] = useState(""); const [dbaName, setDbaName] = useState(""); const [logo, setLogo] = useState<File | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [revision, setRevision] = useState(0);

  const selectedOrganizationId = organizationId || organizations[0]?.organizationId || "";
  useEffect(() => {
    if (!selectedOrganizationId) return;
    let active = true;
    Promise.all([m4Api.listBusinesses(selectedOrganizationId), m4Api.getProfile(selectedOrganizationId)]).then(([items, nextProfile]) => {
      if (!active) return; setBusinesses(items); setProfile(nextProfile);
      setDraft(nextProfile ? { businessId: nextProfile.businessId ?? "", slug: nextProfile.slug, displayName: nextProfile.displayName, summary: nextProfile.summary, websiteUrl: nextProfile.websiteUrl } : blank);
    }).catch((cause) => { if (active) setError(message(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedOrganizationId, revision]);

  async function createBusiness(event: FormEvent) {
    event.preventDefault(); setBusy("business"); setError(""); setNotice("");
    try { const created = await m4Api.createBusiness(organizationId, { legalName: legalName.trim(), dbaName: dbaName.trim() || null }); setBusinesses((current) => [...current, created]); setDraft((current) => ({ ...current, businessId: created.id })); setLegalName(""); setDbaName(""); setNotice("Business created. You can now complete its directory profile."); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setBusy("profile"); setError(""); setNotice("");
    try { const saved = await m4Api.saveProfile(organizationId, { ...draft, slug: draft.slug.trim().toLowerCase(), displayName: draft.displayName.trim(), summary: draft.summary?.trim() || null, websiteUrl: draft.websiteUrl?.trim() || null }); setProfile(saved); setNotice("Directory profile saved."); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }
  async function submitProfile() {
    setBusy("submit"); setError(""); setNotice("");
    try { setProfile(await m4Api.submitProfile(organizationId)); setNotice("Profile submitted for Bridge review."); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }
  async function uploadLogo() {
    if (!logo) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(logo.type) || logo.size > 2_097_152) { setError("Choose a PNG, JPEG, or WebP logo no larger than 2 MiB."); return; }
    setBusy("logo"); setError(""); setNotice("");
    try { await m4Api.uploadLogo(organizationId, logo); setLogo(null); setNotice("Logo uploaded."); setRevision((value) => value + 1); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }
  async function deleteLogo() { setBusy("logo"); setError(""); try { await m4Api.deleteLogo(organizationId); setNotice("Logo removed."); setRevision((value) => value + 1); } catch (cause) { setError(message(cause)); } finally { setBusy(""); } }

  if (!organizations.length) return <section className="content-card"><h2>Business profile</h2><p>You need an active owner or admin organization membership before managing a business directory profile.</p><Link className="button primary" href="/join/organization">Create or join an organization</Link></section>;
  const editable = !profile || editableStatuses.has(profile.status);
  return <div className="form-stack">
    <section className="content-card"><h2>Business and directory profile</h2><label htmlFor="m4-organization">Organization</label><select id="m4-organization" value={organizationId} disabled={!!busy} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((item) => <option key={item.organizationId} value={item.organizationId}>{item.organizationName}</option>)}</select>{loading && <p role="status">Loading business profile…</p>}{error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</section>
    {!loading && !businesses.length && <form className="content-card auth-form" onSubmit={createBusiness}><p className="eyebrow">Step 1</p><h2>Create the business record</h2><label htmlFor="business-legal-name">Legal name</label><input id="business-legal-name" required maxLength={200} value={legalName} onChange={(event) => setLegalName(event.target.value)} /><label htmlFor="business-dba-name">DBA name (optional)</label><input id="business-dba-name" maxLength={200} value={dbaName} onChange={(event) => setDbaName(event.target.value)} /><button className="button primary" disabled={!!busy} type="submit">{busy === "business" ? "Creating…" : "Create business"}</button></form>}
    {!loading && businesses.length > 0 && <form className="content-card auth-form" onSubmit={saveProfile}><div className="card-topline"><div><p className="eyebrow">Step 2</p><h2>Create or edit the public profile</h2></div>{profile && <span className={`status-chip ${profile.status === "published" ? "verified" : "pending"}`}>{profile.status.replaceAll("_", " ")}</span>}</div>{!editable && <p className="boundary-note">This profile cannot be edited while it is {profile?.status.replaceAll("_", " ")}.</p>}<fieldset disabled={!!busy || !editable} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: ".75rem" }}><label htmlFor="profile-business">Business</label><select id="profile-business" required value={draft.businessId} onChange={(event) => setDraft((current) => ({ ...current, businessId: event.target.value }))}><option value="">Choose a business</option>{businesses.map((item) => <option key={item.id} value={item.id}>{item.dbaName || item.legalName}</option>)}</select><label htmlFor="profile-slug">Profile URL</label><input id="profile-slug" required minLength={3} maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={draft.slug} onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value.toLowerCase() }))} /><label htmlFor="profile-name">Display name</label><input id="profile-name" required maxLength={200} value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} /><label htmlFor="profile-summary">Summary</label><textarea id="profile-summary" rows={5} maxLength={1000} value={draft.summary ?? ""} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value || null }))} /><label htmlFor="profile-website">Website</label><input id="profile-website" type="url" maxLength={2048} value={draft.websiteUrl ?? ""} onChange={(event) => setDraft((current) => ({ ...current, websiteUrl: event.target.value || null }))} /><button className="button primary" type="submit">{busy === "profile" ? "Saving…" : "Save profile"}</button></fieldset>{profile && editable && <button className="button secondary" disabled={!!busy} onClick={() => void submitProfile()} type="button">{busy === "submit" ? "Submitting…" : "Submit for review"}</button>}{profile?.status === "published" && <Link className="text-link" href={`/profile/${profile.slug}`}>View public profile</Link>}</form>}
    {profile && <section className="content-card auth-form"><p className="eyebrow">Logo</p><h2>Business logo</h2><p className="form-hint">PNG, JPEG, or WebP. Maximum 2 MiB.</p><input accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogo(event.target.files?.[0] ?? null)} type="file" /><div className="button-row"><button className="button primary" disabled={!logo || !!busy} onClick={() => void uploadLogo()} type="button">{busy === "logo" ? "Working…" : "Upload logo"}</button><button className="button secondary" disabled={!!busy} onClick={() => void deleteLogo()} type="button">Remove logo</button></div></section>}
  </div>;
}
