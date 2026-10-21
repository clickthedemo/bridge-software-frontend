"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { m4Api, mergeSavedDirectoryProfile, type Business, type DirectoryProfile, type DirectoryProfileInput } from "@/lib/m4/api";
import { canManageDirectoryProfile, directoryProfileBusinessType, normalizeEin, withPrimaryWebsite } from "@/lib/m4/directory-profile-form";
import { validateDirectoryLogo } from "@/lib/m4/logo-upload";
import { ProfileLogo } from "@/components/ProfileLogo";

const blank: DirectoryProfileInput = { businessId: "", slug: "", displayName: "", summary: null, story: null, businessType: "brand", categories: [], city: null, state: null, region: null, publicEmail: null, publicPhone: null, licenseType: null, licenseNumber: null, links: [] };
const editableStatuses = new Set(["draft", "correction_requested", "rejected"]);
const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export function DirectoryEditor() {
  const { memberships } = useAuth();
  const organizations = useMemo(() => memberships.filter(canManageDirectoryProfile), [memberships]);
  const [organizationId, setOrganizationId] = useState(organizations[0]?.organizationId ?? "");
  const selectedOrganizationId = organizationId || organizations[0]?.organizationId || "";
  const selectedMembership = organizations.find((item) => item.organizationId === selectedOrganizationId);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [profile, setProfile] = useState<DirectoryProfile | null>(null);
  const [draft, setDraft] = useState(blank);
  const [categories, setCategories] = useState("");
  const [website, setWebsite] = useState("");
  const [legalName, setLegalName] = useState("");
  const [dbaName, setDbaName] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseType, setLicenseType] = useState<"medical" | "adult_use" | "dual">("adult_use");
  const [issuingState, setIssuingState] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [licenseStatus, setLicenseStatus] = useState("");
  const [licenseReason, setLicenseReason] = useState<string | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [logoPreviewName, setLogoPreviewName] = useState("");
  const [logoLoadError, setLogoLoadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preparingUpdate, setPreparingUpdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [missingSubmissionFields, setMissingSubmissionFields] = useState<string[]>([]);
  const [readinessLoaded, setReadinessLoaded] = useState(false);
  const [ein, setEin] = useState("");
  const [einLastFour, setEinLastFour] = useState("");
  const [privateDetailsKey, setPrivateDetailsKey] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState({ addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "" });
  const canSubmit = selectedMembership?.role === "owner" || selectedMembership?.role === "admin";
  const logoInput = useRef<HTMLInputElement>(null);
  const activeBusiness = businesses.find((item) => item.id === draft.businessId) ?? businesses[0];
  const privateBusinessId = !loading && activeBusiness?.organizationId === selectedOrganizationId ? activeBusiness.id : "";
  const privateScope = `${selectedOrganizationId}:${privateBusinessId}`;
  const privateDetailsReady = !!privateBusinessId && privateDetailsKey === privateScope;

  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  useEffect(() => {
    if (!selectedOrganizationId) return;
    let active = true;
    Promise.all([m4Api.listBusinesses(selectedOrganizationId), m4Api.getProfile(selectedOrganizationId), canSubmit ? m4Api.getProfileSubmissionReadiness(selectedOrganizationId).catch(() => null) : Promise.resolve(null)])
      .then(([items, value, readiness]) => {
        if (!active) return;
        setBusinesses(items); setProfile(value); setLogoLoadError("");
        if (value?.logoUrl) void m4Api.getWorkingLogo(selectedOrganizationId).then((blob) => { if (active) { setLogoPreview(URL.createObjectURL(blob)); setLogoPreviewName("Working revision logo"); } }).catch(() => { if (active) setLogoLoadError("The working logo preview could not be loaded. Try refreshing the page."); });
        const selectedBusiness = items.find((item) => item.id === value?.businessId) ?? items[0];
        setBusinessWebsite(selectedBusiness?.websiteUrl ?? "");
        setEmployeeCount(selectedBusiness?.employeeCount ? String(selectedBusiness.employeeCount) : "");
        setMissingSubmissionFields(readiness?.missingFields ?? []); setReadinessLoaded(!!readiness);
        const businessType = directoryProfileBusinessType(selectedMembership);
        if (value) {
          setDraft({ businessId: value.businessId ?? "", slug: value.slug, displayName: value.displayName, summary: value.summary, story: value.story, businessType: value.businessType ?? businessType, categories: value.categories, city: value.city, state: value.state, region: value.region, publicEmail: value.publicContact.email, publicPhone: value.publicContact.phone, licenseType: value.license?.type ?? null, licenseNumber: value.license?.number ?? null, links: value.links });
          setCategories(value.categories.join(", ")); setWebsite(value.links.find((link) => link.type === "website")?.url ?? "");
        } else {
          setDraft({ ...blank, businessType }); setCategories(""); setWebsite("");
        }
      })
      .catch((cause) => { if (active) setError(message(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedOrganizationId, selectedMembership, canSubmit, revision]);

  useEffect(() => {
    if (!canSubmit || !privateBusinessId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPrivateDetailsKey(""); setContactEmail(""); setContactPhone("");
      setLicenseNumber(""); setLicenseType("adult_use"); setIssuingState(""); setExpiresOn(""); setLicenseStatus(""); setLicenseReason(null);
      setAddress({ addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "" });
      Promise.all([
        m4Api.getBusinessLicense(selectedOrganizationId, privateBusinessId),
        m4Api.getBusinessContact(selectedOrganizationId, privateBusinessId),
        m4Api.getPrimaryLocation(selectedOrganizationId)
      ]).then(([licenseResult, contactResult, locationResult]) => {
        if (!active) return;
        if (licenseResult?.license) {
          setLicenseNumber(licenseResult.license.licenseNumber); setLicenseType(licenseResult.license.licenseType);
          setIssuingState(licenseResult.license.issuingState); setExpiresOn(licenseResult.license.expiresOn);
          setLicenseStatus(licenseResult.license.status); setLicenseReason(licenseResult.license.reviewReason);
        }
        setContactEmail(contactResult?.contact.email ?? ""); setContactPhone(contactResult?.contact.phone ?? "");
        const location = locationResult?.location;
        setAddress(location ? { addressLine1: location.addressLine1, addressLine2: location.addressLine2 ?? "", city: location.city, state: location.state ?? "", postalCode: location.postalCode ?? "" } : { addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "" });
        setPrivateDetailsKey(`${selectedOrganizationId}:${privateBusinessId}`);
      }).catch((cause) => { if (active) setError(message(cause)); });
    });
    return () => { active = false; };
  }, [selectedOrganizationId, privateBusinessId, canSubmit, revision]);

  async function createBusiness(event: FormEvent) {
    event.preventDefault(); setBusy("business"); setError("");
    try { const created = await m4Api.createBusiness(selectedOrganizationId, { legalName: legalName.trim(), dbaName: dbaName.trim() || null, websiteUrl: businessWebsite.trim(), employeeCount: Number(employeeCount) }); setBusinesses((items) => [...items, created]); setDraft((value) => ({ ...value, businessId: created.id })); setNotice("Business created."); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }

  async function saveBusiness(event: FormEvent) {
    event.preventDefault(); const business = activeBusiness;
    if (!business) return; setBusy("business-details"); setError("");
    try { await m4Api.updateBusiness(selectedOrganizationId, business.id, { websiteUrl: businessWebsite.trim(), employeeCount: Number(employeeCount) }); setNotice("Protected business details saved."); setRevision((value) => value + 1); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }

  async function refreshReadiness() {
    try { const readiness = await m4Api.getProfileSubmissionReadiness(selectedOrganizationId); setMissingSubmissionFields(readiness?.missingFields ?? []); setReadinessLoaded(!!readiness); }
    catch { setReadinessLoaded(false); }
  }

  async function saveEin(event: FormEvent) {
    event.preventDefault(); if (!activeBusiness) return; setError(""); setNotice("");
    let digits: string; try { digits = normalizeEin(ein); } catch (cause) { setError(message(cause)); return; }
    setBusy("ein");
    try { const result = await m4Api.putBusinessEin(selectedOrganizationId, activeBusiness.id, digits); setEin(""); setEinLastFour(result?.einLastFour ?? digits.slice(-4)); setNotice("EIN saved. Bridge verifies it before your profile can be published."); await refreshReadiness(); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault(); if (!activeBusiness || !privateDetailsReady) return; setBusy("contact"); setError(""); setNotice("");
    try { const result = await m4Api.putBusinessContact(selectedOrganizationId, activeBusiness.id, { email: contactEmail, phone: contactPhone }); setContactEmail(result?.contact.email ?? ""); setContactPhone(result?.contact.phone ?? ""); setNotice("Private business contact saved."); await refreshReadiness(); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }

  async function saveAddress(event: FormEvent) {
    event.preventDefault(); if (!privateDetailsReady) return; setBusy("address"); setError(""); setNotice("");
    try { const result = await m4Api.putPrimaryLocation(selectedOrganizationId, { addressLine1: address.addressLine1.trim(), addressLine2: address.addressLine2.trim() || null, city: address.city.trim(), state: address.state.trim() || null, postalCode: address.postalCode.trim(), country: "US" }); const saved = result?.location; if (saved) setAddress({ addressLine1: saved.addressLine1, addressLine2: saved.addressLine2 ?? "", city: saved.city, state: saved.state ?? "", postalCode: saved.postalCode ?? "" }); setNotice("Business address saved."); await refreshReadiness(); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }

  async function saveLicense(event: FormEvent) {
    event.preventDefault(); const business = activeBusiness;
    if (!business || !privateDetailsReady) return; setBusy("license"); setError("");
    try { const result = await m4Api.putBusinessLicense(selectedOrganizationId, business.id, { licenseNumber: licenseNumber.trim(), licenseType, issuingState: issuingState.trim(), expiresOn }); setLicenseStatus(result?.license.status ?? "pending"); setLicenseReason(result?.license.reviewReason ?? null); setNotice("Licence submitted for administrator verification."); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy("save"); setError(""); setNotice("");
    const categoryValues = categories.split(",").map((value) => value.trim()).filter(Boolean);
    const links = withPrimaryWebsite(draft.links, website);
    try { const saved = await m4Api.saveProfile(selectedOrganizationId, { ...draft, businessType: directoryProfileBusinessType(selectedMembership), slug: draft.slug.trim().toLowerCase(), displayName: draft.displayName.trim(), summary: draft.summary?.trim() || null, story: draft.story?.trim() || null, categories: categoryValues, links }); setProfile((current) => mergeSavedDirectoryProfile(current, saved)); setDraft((value) => ({ ...value, businessType: saved.businessType ?? directoryProfileBusinessType(selectedMembership), categories: categoryValues, links })); if (canSubmit) { const readiness = await m4Api.getProfileSubmissionReadiness(selectedOrganizationId); setMissingSubmissionFields(readiness?.missingFields ?? []); } setNotice("Draft saved."); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }

  async function submit() { if (!window.confirm("Submit this profile for administrator review?")) return; setBusy("submit"); setError(""); try { setProfile(await m4Api.submitProfile(selectedOrganizationId)); setNotice("Profile submitted for review."); } catch (cause) { setError(message(cause)); } finally { setBusy(""); } }
  async function upload() { if (!logo) return; const validation = validateDirectoryLogo(logo); if (validation) { setError(validation); return; } setBusy("logo"); setError(""); setNotice(""); setUploadProgress(0); try { const updated = await m4Api.uploadLogo(selectedOrganizationId, logo, setUploadProgress); setProfile(updated); setLogo(null); setLogoPreviewName("Working revision logo"); setLogoLoadError(""); setUploadProgress(0); if (logoInput.current) logoInput.current.value = ""; setPreparingUpdate(false); setNotice("Logo uploaded to working revision. Your published logo is unchanged until this update is submitted and approved."); } catch (cause) { setError(message(cause)); } finally { setBusy(""); } }
  async function removeLogo() { if (!window.confirm("Remove this working profile logo?")) return; setBusy("logo"); try { setProfile(await m4Api.deleteLogo(selectedOrganizationId)); setNotice("Logo removed."); } catch (cause) { setError(message(cause)); } finally { setBusy(""); } }

  if (!organizations.length) return <section className="content-card"><h2>Business profile</h2><p>You need an active owner, admin, or page-manager organization membership before managing a Directory profile.</p><Link className="button primary" href="/join/organization">Create or join an organization</Link></section>;
  const missing = new Set(missingSubmissionFields);
  const gateStatus = (fields: string[], done: string, todo: string) => !readinessLoaded ? "status unavailable" : fields.some((item) => missing.has(item)) ? todo : done;
  const einStatus = !readinessLoaded ? "status unavailable" : !missing.has("ein_verification") ? "verified" : einLastFour ? `EIN ending ${einLastFour} saved, waiting for Bridge to verify` : "not verified yet";
  const editable = !profile || editableStatuses.has(profile.status ?? "draft") || (profile.status === "approved" && preparingUpdate);
  const field = <K extends keyof DirectoryProfileInput>(key: K, value: DirectoryProfileInput[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return <div className="form-stack">
    <section className="content-card">
      <h2>Business and Directory profile</h2>
      <p className="form-hint">Fields marked required must be completed. Every other field is optional while the profile is a draft.</p>
      <label htmlFor="m4-org">Organization (required)</label>
      <select id="m4-org" disabled={!!busy} required value={selectedOrganizationId} onChange={(event) => { setLoading(true); setLogo(null); setLogoPreview(""); setLogoPreviewName(""); setLogoLoadError(""); setUploadProgress(0); setPreparingUpdate(false); if (logoInput.current) logoInput.current.value = ""; setBusinessWebsite(""); setEmployeeCount(""); setLegalName(""); setDbaName(""); setPrivateDetailsKey(""); setEin(""); setEinLastFour(""); setContactEmail(""); setContactPhone(""); setAddress({ addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "" }); setReadinessLoaded(false); setOrganizationId(event.target.value); setRevision((value) => value + 1); }}>{organizations.map((item) => <option key={item.organizationId} value={item.organizationId}>{item.organizationName}</option>)}</select>
      {loading && <p role="status">Loading profile…</p>}{error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{profile?.workflowReason && <p className="boundary-note"><strong>Administrator feedback:</strong> {profile.workflowReason}</p>}
    </section>
    {!loading && !profile && !canSubmit && <section className="content-card"><h2>Profile setup required</h2><p>An organization owner or admin must create the business profile before you can edit its content.</p></section>}
    {!loading && !businesses.length && canSubmit && <form className="content-card auth-form" onSubmit={createBusiness}><h2>Create business record</h2><label>Legal name (required)<input required maxLength={200} value={legalName} onChange={(event) => setLegalName(event.target.value)} /></label><label>DBA name (optional)<input maxLength={200} value={dbaName} onChange={(event) => setDbaName(event.target.value)} /></label><label>Business website (required, protected)<input required type="url" pattern="https://.*" value={businessWebsite} onChange={(event) => setBusinessWebsite(event.target.value)} /></label><label>Number of employees (required)<input required type="number" min={1} max={1000000} value={employeeCount} onChange={(event) => setEmployeeCount(event.target.value)} /></label><button className="button primary" disabled={!!busy}>Create business</button></form>}
    {!loading && businesses.length > 0 && canSubmit && <form className="content-card auth-form" onSubmit={saveBusiness}><h2>Protected business details</h2><label>Business website (required; not published)<input required type="url" pattern="https://.*" value={businessWebsite} onChange={(event) => setBusinessWebsite(event.target.value)} /></label><label>Number of employees (required)<input required type="number" min={1} max={1000000} value={employeeCount} onChange={(event) => setEmployeeCount(event.target.value)} /></label><button className="button secondary" disabled={!!busy}>Save business details</button></form>}
    {!loading && businesses.length > 0 && canSubmit && <form className="content-card auth-form" onSubmit={saveEin}><h2>Business EIN</h2><p className="form-hint">Required before submission. Stored encrypted and never published. Status: {einStatus}.</p><label>EIN (required)<input required type="password" autoComplete="off" inputMode="numeric" maxLength={10} pattern="[0-9]{2}-?[0-9]{7}" placeholder="12-3456789" value={ein} onChange={(event) => setEin(event.target.value)} /></label><p className="form-hint">The EIN must match the legal name {activeBusiness?.legalName ? <strong>{activeBusiness.legalName}</strong> : "on the business record"}. Saving a new EIN restarts verification.</p><button className="button secondary" disabled={!!busy}>{busy === "ein" ? "Saving…" : "Save EIN"}</button></form>}
    {!loading && businesses.length > 0 && canSubmit && <form className="content-card auth-form" onSubmit={saveContact}><fieldset disabled={!!busy || !privateDetailsReady}><h2>Private business contact</h2><p className="form-hint">Required before submission. Only Bridge administrators see this. Status: {gateStatus(["private_email", "private_phone"], "saved", "not provided")}.</p><label>Business email (required; not published)<input required type="email" maxLength={320} autoComplete="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></label><label>Business phone (required; not published)<input required type="tel" minLength={7} maxLength={32} autoComplete="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></label><button className="button secondary" disabled={!!busy}>{busy === "contact" ? "Saving…" : "Save private contact"}</button></fieldset></form>}
    {!loading && businesses.length > 0 && canSubmit && <form className="content-card auth-form" onSubmit={saveAddress}><fieldset disabled={!!busy || !privateDetailsReady}><h2>Business address</h2><p className="form-hint">Required before submission. Not published. Status: {gateStatus(["business_address"], "saved", "not provided")}.</p><label>Street address (required)<input required maxLength={200} autoComplete="address-line1" value={address.addressLine1} onChange={(event) => setAddress((value) => ({ ...value, addressLine1: event.target.value }))} /></label><label>Suite or unit (optional)<input maxLength={200} autoComplete="address-line2" value={address.addressLine2} onChange={(event) => setAddress((value) => ({ ...value, addressLine2: event.target.value }))} /></label><label>Address city (required)<input required maxLength={100} autoComplete="address-level2" value={address.city} onChange={(event) => setAddress((value) => ({ ...value, city: event.target.value }))} /></label><label>Address state (required)<input required pattern="[A-Za-z]{2}" maxLength={2} autoComplete="address-level1" value={address.state} onChange={(event) => setAddress((value) => ({ ...value, state: event.target.value.toUpperCase() }))} /></label><label>ZIP code (required)<input required inputMode="numeric" pattern="[0-9]{5}(-[0-9]{4})?" maxLength={10} autoComplete="postal-code" value={address.postalCode} onChange={(event) => setAddress((value) => ({ ...value, postalCode: event.target.value }))} /></label><button className="button secondary" disabled={!!busy}>{busy === "address" ? "Saving…" : "Save business address"}</button></fieldset></form>}
    {!loading && businesses.length > 0 && canSubmit && selectedMembership?.organizationType !== "brand" && <form className="content-card auth-form" onSubmit={saveLicense}><fieldset disabled={!!busy || !privateDetailsReady}><h2>Business licence</h2><p className="form-hint">All licence fields are required and remain protected. Status: {licenseStatus || "not submitted"}.</p>{licenseReason && <p className="boundary-note">Review feedback: {licenseReason}</p>}<label>Licence number (required)<input required maxLength={200} value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} /></label><label>Licence type (required)<select value={licenseType} onChange={(event) => setLicenseType(event.target.value as typeof licenseType)}><option value="medical">Medical</option><option value="adult_use">Adult use</option><option value="dual">Dual</option></select></label><label>Issuing state (required)<input required pattern="[A-Za-z]{2}" maxLength={2} value={issuingState} onChange={(event) => setIssuingState(event.target.value.toUpperCase())} /></label><label>Expiration date (required)<input required type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label><button className="button secondary" disabled={!!busy}>{busy === "license" ? "Saving…" : "Save licence"}</button></fieldset></form>}
    {!loading && businesses.length > 0 && (canSubmit || profile) && <form className="content-card auth-form" onSubmit={save}>
      <div className="card-topline"><h2>Directory profile</h2>{profile?.status && <span className="status-chip pending">{profile.status.replaceAll("_", " ")}</span>}</div>
      {!editable && profile?.status === "approved" && <div className="boundary-note"><p>Your approved profile remains public while you prepare changes. Updates require administrator review before publication.</p><button className="button secondary" onClick={() => setPreparingUpdate(true)} type="button">Prepare profile update</button></div>}
      {!editable && profile?.status !== "approved" && <p className="boundary-note">This profile cannot be edited while it is {profile?.status?.replaceAll("_", " ")}.</p>}
      <fieldset disabled={!!busy || !editable}>
        <label>Business (required)<select required value={draft.businessId} onChange={(event) => { const businessId = event.target.value; const next = businesses.find((item) => item.id === businessId) ?? businesses[0]; setBusinessWebsite(next?.websiteUrl ?? ""); setEmployeeCount(next?.employeeCount ? String(next.employeeCount) : ""); setEin(""); setEinLastFour(""); field("businessId", businessId); }}><option value="">Choose a business</option>{businesses.map((item) => <option key={item.id} value={item.id}>{item.dbaName || item.legalName}</option>)}</select></label>
        <label>Profile URL (required)<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={draft.slug} onChange={(event) => field("slug", event.target.value.toLowerCase())} /></label>
        <label>Display name (required)<input required maxLength={200} value={draft.displayName} onChange={(event) => field("displayName", event.target.value)} /></label>
        <label>Business type (required; set by organization)<select disabled value={draft.businessType}><option value="brand">Brand</option><option value="retailer">Retailer</option><option value="dispensary">Dispensary</option></select></label>
        <label>Summary (optional)<textarea rows={3} value={draft.summary ?? ""} onChange={(event) => field("summary", event.target.value || null)} /></label>
        <label>Story (optional)<textarea rows={6} value={draft.story ?? ""} onChange={(event) => field("story", event.target.value || null)} /></label>
        <label>Categories (optional; comma separated)<input value={categories} onChange={(event) => setCategories(event.target.value)} /></label>
        <label>City (optional)<input value={draft.city ?? ""} onChange={(event) => field("city", event.target.value || null)} /></label>
        <label>State (optional)<input value={draft.state ?? ""} onChange={(event) => field("state", event.target.value || null)} /></label>
        <label>Region (optional)<input value={draft.region ?? ""} onChange={(event) => field("region", event.target.value || null)} /></label>
        <label>Public email (optional)<input type="email" value={draft.publicEmail ?? ""} onChange={(event) => field("publicEmail", event.target.value || null)} /></label>
        <label>Public phone (optional)<input type="tel" value={draft.publicPhone ?? ""} onChange={(event) => field("publicPhone", event.target.value || null)} /></label>
        <label>Website (optional)<input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
        <label>License type (optional)<input value={draft.licenseType ?? ""} onChange={(event) => field("licenseType", event.target.value || null)} /></label>
        <label>License number (optional)<input value={draft.licenseNumber ?? ""} onChange={(event) => field("licenseNumber", event.target.value || null)} /></label>
        <button className="button primary">{busy === "save" ? "Saving…" : "Save draft"}</button>
      </fieldset>
      {canSubmit && profile && editable && <><button className="button secondary" disabled={!!busy || missingSubmissionFields.length > 0} onClick={() => void submit()} type="button">{busy === "submit" ? "Submitting…" : profile.status === "correction_requested" ? "Resubmit for review" : "Submit for review"}</button>{missingSubmissionFields.length > 0 && <p className="boundary-note">Complete before submission: {missingSubmissionFields.join(", ").replaceAll("_", " ")}.</p>}</>}{profile?.status === "approved" && <Link className="text-link" href={`/profile/${profile.slug}`}>View public profile</Link>}
    </form>}
    {profile && <section className="content-card auth-form" aria-labelledby="profile-logo-heading"><h2 id="profile-logo-heading">Profile logo</h2><p className="form-hint">PNG, JPEG, or WebP · maximum 2 MiB.</p><div className="directory-logo-preview"><ProfileLogo logoUrl={logoPreview || profile.logoUrl} name={profile.displayName || "Organization"} size="detail" onLoadError={() => setLogoLoadError("The working logo preview could not be displayed. Try refreshing the page.")} /><div><strong>{logoPreview ? "Preview" : profile.logoUrl ? "Current published or working logo" : "No logo uploaded"}</strong><p className="form-hint">{logoPreview ? (logoPreviewName || "Working revision logo") : profile.logoUrl ? "The published logo stays visible while a replacement is reviewed." : "Your initials are shown as a placeholder."}</p></div></div>{logoLoadError && <p className="form-error" role="alert">{logoLoadError}</p>}{profile.status === "approved" && !preparingUpdate ? <div className="boundary-note"><p>Replacing this logo creates a working revision. The current published logo remains visible until administrator approval.</p><button className="button secondary" onClick={() => setPreparingUpdate(true)} type="button">Prepare logo replacement</button></div> : <><label>Choose logo<input accept="image/png,image/jpeg,image/webp" disabled={!!busy} ref={logoInput} type="file" onChange={(event) => { const file = event.target.files?.[0] ?? null; setLogo(file); setLogoPreview(file ? URL.createObjectURL(file) : ""); setLogoPreviewName(file?.name ?? ""); setLogoLoadError(""); setError(file ? validateDirectoryLogo(file) ?? "" : ""); setNotice(""); }} /></label>{busy === "logo" && <div><progress aria-label="Logo upload progress" max={100} value={uploadProgress} /><p role="status">Uploading logo… {uploadProgress}%</p></div>}<div className="button-row"><button className="button primary" disabled={!logo || !!busy || !!validateDirectoryLogo(logo)} onClick={() => void upload()} type="button">{busy === "logo" ? "Uploading…" : profile.logoUrl ? "Replace logo" : "Upload logo"}</button>{profile.logoUrl && <button className="button secondary" disabled={!!busy} onClick={() => void removeLogo()} type="button">Remove logo</button>}</div>{profile.hasPublishedVersion && <p className="boundary-note">Logo changes are saved to a working revision and require submission and administrator approval. The existing published logo will remain public until then.</p>}</>}</section>}
  </div>;
}
