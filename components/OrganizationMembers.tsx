"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { m4Api, type OrganizationMember } from "@/lib/m4/api";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "The member request could not be completed.";

export function OrganizationMembers() {
  const { memberships, refresh } = useAuth();
  const manageable = useMemo(() => memberships.filter((item) => item.status === "active" && ["owner", "admin"].includes(item.role)), [memberships]);
  const [organizationId, setOrganizationId] = useState("");
  const selectedId = organizationId || manageable[0]?.organizationId || "";
  const [members, setMembers] = useState<OrganizationMember[]>([]);
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

  useEffect(() => { if (selectedId) void m4Api.listOrganizationMembers(selectedId).then(setMembers).catch((cause) => setError(errorMessage(cause))); }, [selectedId]);

  async function assign(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const result = await m4Api.assignOrganizationMember(selectedId, { email, role }); if (!result) throw new Error("The API returned an empty membership response."); setEmail(""); setNotice(result.invitationSent ? "Invitation sent and membership assigned." : "Membership assigned."); await load(); }
    catch (cause) { setError(errorMessage(cause)); setBusy(false); }
  }

  async function remove(member: OrganizationMember) {
    if (!window.confirm(`Remove ${member.email} from this organization?`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await m4Api.removeOrganizationMember(selectedId, member.id); setNotice("Membership removed."); await Promise.all([load(), refresh()]); }
    catch (cause) { setError(errorMessage(cause)); setBusy(false); }
  }

  if (!manageable.length) return null;
  return <section className="content-card auth-form" aria-labelledby="organization-members-title">
    <h2 id="organization-members-title">Organization members</h2>
    <p className="form-hint">Owners and organization admins can assign members. Page managers can edit Directory content but cannot manage membership or submit profiles.</p>
    <label>Organization<select value={selectedId} onChange={(event) => { setOrganizationId(event.target.value); setMembers([]); }} disabled={busy}>{manageable.map((item) => <option key={item.organizationId} value={item.organizationId}>{item.organizationName}</option>)}</select></label>
    <form className="auth-form" onSubmit={assign}>
      <label>User email<input type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="page_manager">Page manager</option><option value="admin">Organization admin</option><option value="member">Member</option></select></label>
      <button className="button primary" disabled={busy}>{busy ? "Working…" : "Invite or assign user"}</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="form-stack" aria-live="polite">{members.map((member) => <article className="boundary-note" key={member.id}><p><strong>{member.displayName || member.email}</strong><br />{member.email}<br />{member.role.replaceAll("_", " ")} · {member.status}</p>{member.role !== "owner" && <button className="button secondary" disabled={busy} onClick={() => void remove(member)} type="button">Remove</button>}</article>)}</div>
  </section>;
}
