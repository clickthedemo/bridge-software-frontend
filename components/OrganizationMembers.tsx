"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { m4Api, type OrganizationInvitation, type OrganizationMember } from "@/lib/m4/api";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "The member request could not be completed.";

export function OrganizationMembers() {
  const { status, memberships, refresh } = useAuth();
  const manageable = useMemo(() => memberships.filter((item) => item.status === "active" && ["owner", "admin"].includes(item.role)), [memberships]);
  const [organizationId, setOrganizationId] = useState("");
  const selectedId = organizationId || manageable[0]?.organizationId || "";
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "page_manager" | "member">("page_manager");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(target = selectedId) {
    if (!target) return;
    setBusy(true); setError("");
    try { setMembers(await m4Api.listOrganizationMembers(target)); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  useEffect(() => { if (status === "authenticated") void m4Api.listMyOrganizationInvitations().then(setInvitations).catch((cause) => setError(errorMessage(cause))); }, [status]);
  useEffect(() => { if (selectedId) void m4Api.listOrganizationMembers(selectedId).then(setMembers).catch((cause) => setError(errorMessage(cause))); }, [selectedId]);

  async function assign(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await m4Api.assignOrganizationMember(selectedId, { email, role });
      if (!result) throw new Error("The API returned an empty invitation response.");
      setEmail("");
      setNotice("Organization invitation created. Access begins only after the user accepts it.");
      await load();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function accept(invitation: OrganizationInvitation) {
    setBusy(true); setError(""); setNotice("");
    try {
      await m4Api.acceptOrganizationInvitation(invitation.id);
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      setNotice(`You joined ${invitation.organizationName}.`);
      await refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function remove(member: OrganizationMember) {
    if (!window.confirm(`Remove ${member.email} from this organization?`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await m4Api.removeOrganizationMember(selectedId, member.id); setNotice("Membership removed."); await Promise.all([load(), refresh()]); }
    catch (cause) { setError(errorMessage(cause)); setBusy(false); }
  }

  if (!manageable.length && !invitations.length) return null;
  return <section className="content-card auth-form" aria-labelledby="organization-members-title">
    <h2 id="organization-members-title">Organization members</h2>
    {invitations.length > 0 && <section aria-labelledby="organization-invitations-title">
      <h3 id="organization-invitations-title">Pending invitations</h3>
      <div className="form-stack">{invitations.map((invitation) => <article className="boundary-note" key={invitation.id}><p><strong>{invitation.organizationName}</strong><br />Invited as {invitation.role.replaceAll("_", " ")}</p><button className="button primary" disabled={busy} onClick={() => void accept(invitation)} type="button">Accept invitation</button></article>)}</div>
    </section>}
    {manageable.length > 0 && <>
      <p className="form-hint">Owners and organization admins can invite members. Page managers can edit Directory content but cannot manage membership or submit profiles.</p>
      <label>Organization<select value={selectedId} onChange={(event) => { setOrganizationId(event.target.value); setMembers([]); }} disabled={busy}>{manageable.map((item) => <option key={item.organizationId} value={item.organizationId}>{item.organizationName}</option>)}</select></label>
      <form className="auth-form" onSubmit={assign}>
        <label>User email<input type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="page_manager">Page manager</option><option value="admin">Organization admin</option><option value="member">Member</option></select></label>
        <button className="button primary" disabled={busy}>{busy ? "Working…" : "Invite user"}</button>
      </form>
      <div className="form-stack" aria-live="polite">{members.map((member) => <article className="boundary-note" key={member.id}><p><strong>{member.displayName || member.email}</strong><br />{member.email}<br />{member.role.replaceAll("_", " ")} · {member.status}</p>{member.role !== "owner" && <button className="button secondary" disabled={busy} onClick={() => void remove(member)} type="button">Remove</button>}</article>)}</div>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
