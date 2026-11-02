"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { m4Api, type BusinessLicense } from "@/lib/m4/api";
import { actionReasonError, licenseActionLabel, licenseActions, licenseDisplayStatus, type LicenseReviewAction } from "@/lib/m4/review-actions";
import { useNotificationFocus } from "@/lib/m4/notification-focus";
export { VerificationQueue } from "./ein-verification-queue";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function BusinessLicenseQueue() {
  const targetId = useSearchParams().get("licenseId");
  const [licenses, setLicenses] = useState<BusinessLicense[]>([]), [error, setError] = useState(""), [targetError, setTargetError] = useState(""), [notice, setNotice] = useState(""), [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true), [reviewing, setReviewing] = useState(false), [status, setStatus] = useState<"" | BusinessLicense["status"]>("pending"), [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<{ license: BusinessLicense; action: LicenseReviewAction } | null>(null);
  const reviewInFlight = useRef(false);
  useNotificationFocus("licenseId", licenses.map((item) => item.id), ".license-review-card");

  useEffect(() => {
    if (!targetId) return;
    let active = true;
    m4Api.listAdminBusinessLicenses().then((items) => {
      if (!active) return;
      const target = items.find((item) => item.id === targetId);
      if (!target) { setTargetError("The referenced business licence is unavailable or you no longer have access."); return; }
      setTargetError(""); setLoading(true); setLicenses([]); setStatus(target.status); setRevision((current) => current + 1);
    }).catch(() => { if (active) setTargetError("The referenced business licence could not be loaded."); });
    return () => { active = false; };
  }, [targetId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (!active) return; setLoading(true); setLicenses([]); setError(""); m4Api.listAdminBusinessLicenses(status || undefined).then((value) => { if (active) setLicenses(value); }).catch((caught) => { if (active) { setLicenses([]); setError(caught instanceof Error ? caught.message : "The licence queue could not be loaded."); } }).finally(() => { if (active) setLoading(false); }); });
    return () => { active = false; };
  }, [status, revision]);

  function reload() { setPending(null); setReason(""); setLoading(true); setLicenses([]); setError(""); setRevision((current) => current + 1); }
  function choose(license: BusinessLicense, action: LicenseReviewAction) { if (reviewInFlight.current || pending || loading) return; if (action === "verified" && !window.confirm("Approve this licence?")) return; const selection = { license, action }; setPending(selection); setReason(""); setError(""); if (action === "verified") void review(selection, ""); }
  async function review(selection = pending, value = reason) { if (!selection || reviewInFlight.current || loading || !licenses.some((item) => item.id === selection.license.id)) return; const validation = actionReasonError(selection.action, value); if (validation) { setError(validation); return; } reviewInFlight.current = true; setReviewing(true); setError(""); setNotice(""); try { await m4Api.reviewBusinessLicense(selection.license.id, selection.action, value.trim() || undefined); setReason(""); setPending(null); setNotice(selection.action === "suspended" ? "Licence suspended." : "Licence review saved."); reload(); } catch (caught) { if (selection.action === "verified") setPending(null); setError(caught instanceof Error ? caught.message : "The licence could not be reviewed."); } finally { reviewInFlight.current = false; setReviewing(false); } }

  return <section className="admin-review-stack"><div className="admin-section-heading"><div><h2>Business licences</h2><p>Protected licence records and review decisions.</p></div><span className="status-chip pending">{licenses.length} records</span></div><nav className="admin-status-tabs" aria-label="Licence status">{(["", "pending", "verified", "rejected", "suspended", "expired"] as const).map((item) => <button aria-pressed={status === item} disabled={reviewing || pending !== null} key={item || "all"} onClick={() => { if (item === status) return; setLoading(true); setLicenses([]); setStatus(item); }} type="button">{item ? label(item) : "All"}</button>)}</nav>{notice && <p className="success-message" role="status">{notice}</p>}{targetError && <p className="form-error" role="alert">{targetError}</p>}{error && <div><p className="form-error" role="alert">{error}</p><button className="button secondary" disabled={loading || reviewing} onClick={reload} type="button">Retry licence queue</button></div>}{loading && <p role="status">Loading licences…</p>}{!loading && !error && !licenses.length && <div className="empty-state"><h3>No licences found</h3><p>Select another status.</p></div>}<div className="admin-review-list">{!loading && licenses.map((license) => { const displayStatus = licenseDisplayStatus(license), actions = licenseActions(license); return <article className="admin-review-card license-review-card" id={`license-${license.id}`} key={license.id}><header><div><p className="eyebrow">{label(license.licenseType)}</p><h3>{license.businessName || "Business licence"}</h3><p>{license.organizationName || "Organization name unavailable"}</p></div><span className={`status-chip ${displayStatus === "verified" ? "verified" : displayStatus === "rejected" || displayStatus === "suspended" ? "warning" : "pending"}`}>{label(displayStatus)}</span></header><div className="admin-record-grid"><p><span>Licence number</span><strong>{license.licenseNumber}</strong></p><p><span>Business reference</span><strong>{license.businessId}</strong></p><p><span>Organization reference</span><strong>{license.organizationId}</strong></p><p><span>Expiration</span><strong>{license.expiresOn}</strong></p><p><span>Verification</span><strong>{license.verifiedAt ? new Date(license.verifiedAt).toLocaleDateString() : "Not verified"}</strong></p></div>{displayStatus === "correction_requested" && <p className="boundary-note">Waiting for resubmission</p>}{license.reviewReason && <p className="form-hint">Review feedback: {license.reviewReason}</p>}{actions.length > 0 && <footer className="button-row">{actions.map((action) => <button className={action === "verified" ? "button primary" : "button secondary"} disabled={reviewing || pending !== null} key={action} onClick={() => choose(license, action)} type="button">{licenseActionLabel(action)}</button>)}</footer>}</article>; })}</div>{pending && !loading && licenses.some((item) => item.id === pending.license.id) && pending.action !== "verified" && <div className="review-modal-backdrop"><section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="license-review-title"><h2 id="license-review-title">{licenseActionLabel(pending.action)}</h2><p>Confirm this action for {pending.license.issuingState} licence <strong>{pending.license.licenseNumber}</strong>, business {pending.license.businessName || pending.license.businessId}, organization {pending.license.organizationName || pending.license.organizationId}.</p><label htmlFor="license-review-reason">{pending.action === "suspended" ? "Suspension reason (required)" : "Reason (required)"}</label><textarea autoFocus disabled={reviewing} id="license-review-reason" maxLength={2000} required rows={4} value={reason} onChange={(event) => setReason(event.target.value)}/><div className="button-row"><button className="button primary" disabled={reviewing} onClick={() => void review()}>{reviewing ? "Saving…" : `Confirm ${licenseActionLabel(pending.action).toLowerCase()}`}</button><button className="button secondary" disabled={reviewing} onClick={() => setPending(null)}>Cancel</button></div></section></div>}</section>;
}
