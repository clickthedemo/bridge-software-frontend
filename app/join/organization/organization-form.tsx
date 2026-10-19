"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { canEditOrganization, getPhase3Client, isPhase3LiveApi, organizationTypeForRole, Phase3Error, type OrganizationRecord, type OrganizationType } from "@/lib/phase3";

export function OrganizationForm() {
  const client = useMemo(() => getPhase3Client(), []);
  const live = isPhase3LiveApi();
  const requestedRole = useSearchParams().get("role");
  const requestedType = organizationTypeForRole(requestedRole);
  const unsupported = Boolean(requestedRole && !requestedType);
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [selected, setSelected] = useState<OrganizationRecord | null>(null);
  const [name, setName] = useState("");
  const [organizationType, setOrganizationType] = useState<OrganizationType | "">(requestedType ?? "");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [message, setMessage] = useState("");
  const [uncertainCreate, setUncertainCreate] = useState(false);
  const [refreshedAfterFailure, setRefreshedAfterFailure] = useState(false);
  const saving = useRef(false);
  const readSequence = useRef(0);

  function show(organization: OrganizationRecord | null) {
    setSelected(organization);
    setName(organization?.name ?? "");
    setOrganizationType(organization?.organizationType ?? (organization ? "" : requestedType ?? ""));
  }

  async function refresh() {
    const sequence = ++readSequence.current;
    setLoading(true); setError(""); setMessage(""); setReady(false);
    try {
      const response = await client.listOrganizations();
      if (sequence !== readSequence.current) return;
      setOrganizations(response.organizations); setReady(true); setSignedOut(false);
      show(null);
      if (uncertainCreate) setRefreshedAfterFailure(true);
    } catch (caught) {
      if (sequence !== readSequence.current) return;
      setError(caught instanceof Error ? caught.message : "Could not load organizations.");
      setSignedOut(caught instanceof Phase3Error && caught.code === "unauthenticated");
    } finally { if (sequence === readSequence.current) setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    client.listOrganizations().then((response) => {
      if (active) { setOrganizations(response.organizations); setReady(true); }
    }).catch((caught) => {
      if (active) { setError(caught instanceof Error ? caught.message : "Could not load organizations."); setSignedOut(caught instanceof Phase3Error && caught.code === "unauthenticated"); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client]);

  async function select(id: string) {
    if (!id) { readSequence.current++; show(null); setError(""); setMessage(""); return; }
    const sequence = ++readSequence.current;
    setLoading(true); setError(""); setMessage("");
    try {
      const { organization } = await client.getOrganization(id);
      if (sequence === readSequence.current) show(organization);
    } catch (caught) {
      if (sequence === readSequence.current) { show(null); setReady(false); setError(caught instanceof Error ? caught.message : "Could not load this organization. Refresh and try again."); }
    } finally { if (sequence === readSequence.current) setLoading(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || loading || !ready || (!selected && (unsupported || uncertainCreate)) || (selected && !canEditOrganization(selected))) return;
    setError(""); setMessage("");
    if (!name.trim() || name.trim().length > 200) return setError("Enter an organization name between 1 and 200 characters.");
    if (!organizationType) return setError("Choose an organization type.");
    saving.current = true; setBusy(true);
    try {
      const input = { name: name.trim(), organizationType };
      const { organization } = selected ? await client.updateOrganization(selected.id, input) : await client.createOrganization(input);
      setOrganizations((current) => [...current.filter(({ id }) => id !== organization.id), organization]);
      show(organization);
      setMessage(live ? (selected ? "Organization details saved." : "Organization created. You are its owner.") : "Preview saved for this session. No real organization was created or changed.");
      setUncertainCreate(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The save could not be confirmed.");
      if (!selected && (!(caught instanceof Phase3Error) || caught.code === "unavailable")) { setUncertainCreate(true); setRefreshedAfterFailure(false); }
    } finally { saving.current = false; setBusy(false); }
  }

  const editable = !selected || canEditOrganization(selected);
  const continuation = `/join/organization${requestedRole ? `?role=${encodeURIComponent(requestedRole)}` : ""}`;
  return <section className="auth-card">
    {!live && <p className="boundary-note"><strong>Preview mode.</strong> Organizations are examples and changes last only for this session.</p>}
    <p className="boundary-note">This step saves an organization name and type. Next, add the business EIN, private contact and address on your business profile page so Bridge can verify you.</p>
    {unsupported && <p className="boundary-note">Organization setup for <strong>{requestedRole}</strong> is pending support. Existing memberships remain available below. <Link className="text-link" href="/join">Change role</Link></p>}
    {loading && <p role="status">Loading organizations…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {signedOut ? <Link className="button primary" href={`/login?next=${encodeURIComponent(continuation)}`}>Sign in to continue</Link> : <>
      <div className="auth-form">
        <label htmlFor="organization-selection">Your organizations</label>
        <select id="organization-selection" value={selected?.id ?? ""} onChange={(event) => void select(event.target.value)} disabled={loading || busy || !ready}>
          <option value="">{unsupported ? "Select an existing organization" : "Create a new organization"}</option>
          {organizations.map((org) => <option key={org.id} value={org.id}>{org.name} ({org.membership.role})</option>)}
        </select>
        <button type="button" className="button secondary" disabled={loading || busy} onClick={() => void refresh()}>Refresh organizations</button>
      </div>
      {uncertainCreate && <div className="boundary-note"><p>The creation response was not confirmed. Refresh and check your existing organizations before trying again; the first request may have succeeded.</p>{refreshedAfterFailure && <label><input type="checkbox" checked={false} onChange={() => setUncertainCreate(false)} /> I checked the refreshed list and want to create a new organization.</label>}</div>}
      {ready && (!unsupported || selected) && <form className="auth-form" onSubmit={submit}>
        {selected && <p className="form-hint">Membership: {selected.membership.role} · {selected.membership.status}</p>}
        {!editable && <p className="boundary-note">Only active organization owners and admins can edit these details.</p>}
        <label htmlFor="organization-name">Organization name</label>
        <input id="organization-name" value={name} maxLength={200} required disabled={!editable || busy || loading} onChange={(event) => setName(event.target.value)} autoComplete="organization" />
        <label htmlFor="organization-type">Organization type</label>
        <select id="organization-type" value={organizationType} required disabled={!editable || busy || loading} onChange={(event) => setOrganizationType(event.target.value as OrganizationType)}>
          <option value="">Choose a type</option><option value="brand">Brand</option><option value="retailer">Retailer</option><option value="dispensary">Dispensary</option>
        </select>
        {editable && <button className="button primary" type="submit" disabled={busy || loading || (!selected && uncertainCreate)}>{busy ? "Saving…" : selected ? (live ? "Save organization" : "Save preview changes") : (live ? "Create organization" : "Create preview organization")}</button>}
      </form>}
    </>}
    <p className="auth-secondary"><Link href="/my-profile">Go to your profile</Link></p>
  </section>;
}
