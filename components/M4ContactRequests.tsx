"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { m4Api, type ContactPreference, type ContactRequest, type ContactRequestStatus, type OffsetPage } from "@/lib/m4/api";

const statuses: ContactRequestStatus[] = ["new", "viewed", "responded", "closed"];
const transitions: Record<ContactRequestStatus, ContactRequestStatus[]> = { new: ["viewed", "responded", "closed"], viewed: ["responded", "closed"], responded: ["closed"], closed: [] };
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The request could not be completed.";

export function ContactRequestForm({ slug, profileName }: { slug: string; profileName: string }) {
  const { status, user } = useAuth();
  const [firstName, setFirstName] = useState(user?.profile?.displayName ?? ""); const [workEmail, setWorkEmail] = useState(user?.email ?? ""); const [phoneNumber, setPhoneNumber] = useState(""); const [yearsOfService, setYearsOfService] = useState(0); const [contactPreference, setContactPreference] = useState<ContactPreference>("email"); const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [receipt, setReceipt] = useState<ContactRequest | null>(null);
  if (status === "loading") return <p role="status">Checking your account…</p>;
  if (!user) return <p><Link className="button primary" href={`/login?next=${encodeURIComponent(`/profile/${slug}#contact-request`)}`}>Sign in to contact this business</Link></p>;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { setReceipt(await m4Api.createContactRequest(slug, { firstName: firstName.trim(), workEmail: workEmail.trim(), phoneNumber: phoneNumber.trim(), yearsOfService, contactPreference, message: message.trim() })); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  if (receipt) return <div className="empty-state" role="status"><h2>Request sent</h2><p>Your contact request was sent to {profileName}.</p><p className="form-hint">Reference: {receipt.id}</p><Link className="button secondary" href="/requests/sent">View sent requests</Link></div>;
  return <form className="auth-form" onSubmit={submit}><p className="eyebrow">Contact request</p><h2>Contact {profileName}</h2><label htmlFor="contact-first-name">First name</label><input id="contact-first-name" required value={firstName} onChange={(event) => setFirstName(event.target.value)} /><label htmlFor="contact-work-email">Work email</label><input id="contact-work-email" required type="email" value={workEmail} onChange={(event) => setWorkEmail(event.target.value)} /><label htmlFor="contact-phone">Phone number</label><input id="contact-phone" required type="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} /><label htmlFor="contact-years">Years of service</label><input id="contact-years" required min={0} step={1} type="number" value={yearsOfService} onChange={(event) => setYearsOfService(event.target.valueAsNumber || 0)} /><label htmlFor="contact-preference">Contact preference</label><select id="contact-preference" value={contactPreference} onChange={(event) => setContactPreference(event.target.value as ContactPreference)}><option value="email">Email</option><option value="phone">Phone</option><option value="either">Either</option></select><label htmlFor="contact-message">Message</label><textarea id="contact-message" required maxLength={2000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} />{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy} type="submit">{busy ? "Sending…" : "Send contact request"}</button></form>;
}

function RequestCards({ page, organizationId, onChanged }: { page: OffsetPage<ContactRequest>; organizationId?: string; onChanged(): void }) {
  const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  async function update(id: string, status: ContactRequestStatus) {
    if (!organizationId) return; setBusy(id); setError("");
    try { if (status !== "new") await m4Api.updateContactStatus(organizationId, id, status); onChanged(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(""); }
  }
  return <>{error && <p className="form-error" role="alert">{error}</p>}{!page.items.length && <div className="empty-state"><h2>No contact requests</h2><p>New requests will appear here.</p></div>}{page.items.map((item) => <article className="content-card" key={item.id}><div className="card-topline"><h2>{item.target?.displayName || item.firstName || "Contact request"}</h2><span className={`status-chip ${item.status === "closed" ? "verified" : "pending"}`}>{item.status}</span></div>{item.message && <p>{item.message}</p>}{item.workEmail && <p className="muted">{item.workEmail} · {item.phoneNumber} · {item.yearsOfService} years</p>}<p className="form-hint">{new Date(item.createdAt).toLocaleString()} · Reference {item.id}</p>{organizationId && transitions[item.status].length > 0 && <div className="button-row">{transitions[item.status].map((status) => <button className={status === "closed" ? "button secondary" : "button primary"} disabled={!!busy} key={status} onClick={() => void update(item.id, status)} type="button">Mark {status}</button>)}</div>}</article>)}</>;
}

export function ContactRequestInbox() {
  const { memberships } = useAuth(); const organizations = useMemo(() => memberships.filter((item) => item.status === "active" && ["owner", "admin"].includes(item.role)), [memberships]);
  const [organizationId, setOrganizationId] = useState(organizations[0]?.organizationId ?? ""); const [filter, setFilter] = useState<ContactRequestStatus | "">(""); const [offset, setOffset] = useState(0); const [page, setPage] = useState<OffsetPage<ContactRequest> | null>(null); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  const selectedOrganizationId = organizationId || organizations[0]?.organizationId || "";
  useEffect(() => { if (!selectedOrganizationId) return; let active = true; m4Api.inbox(selectedOrganizationId, { status: filter || undefined, limit: 20, offset }).then((value) => { if (active) setPage(value); }).catch((cause) => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, [selectedOrganizationId, filter, offset, revision]);
  if (!organizations.length) return <div className="empty-state"><h2>No manageable organization</h2><p>An owner or admin membership is required to view a business inbox.</p></div>;
  return <div className="form-stack"><div className="feed-toolbar"><label htmlFor="inbox-organization">Organization</label><select id="inbox-organization" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setOffset(0); }}>{organizations.map((item) => <option key={item.organizationId} value={item.organizationId}>{item.organizationName}</option>)}</select><label htmlFor="inbox-status">Status</label><select id="inbox-status" value={filter} onChange={(event) => { setFilter(event.target.value as ContactRequestStatus | ""); setOffset(0); }}><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select><Link className="button secondary" href="/requests/sent">Sent requests</Link></div>{error && <p className="form-error" role="alert">{error}</p>}{!page && !error && <p role="status">Loading contact requests…</p>}{page && <><RequestCards organizationId={organizationId} page={page} onChanged={() => setRevision((value) => value + 1)} /><Pager page={page} setOffset={setOffset} /></>}</div>;
}

export function SentContactRequests() {
  const [offset, setOffset] = useState(0); const [page, setPage] = useState<OffsetPage<ContactRequest> | null>(null); const [error, setError] = useState("");
  useEffect(() => { let active = true; m4Api.sent({ limit: 20, offset }).then((value) => { if (active) setPage(value); }).catch((cause) => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, [offset]);
  return <>{error && <p className="form-error" role="alert">{error}</p>}{!page && !error && <p role="status">Loading sent requests…</p>}{page && <><RequestCards page={page} onChanged={() => undefined} /><Pager page={page} setOffset={setOffset} /></>}</>;
}

function Pager({ page, setOffset }: { page: OffsetPage<unknown>; setOffset(value: number): void }) { return <nav aria-label="Request pages" className="button-row"><button className="button secondary" disabled={page.offset === 0} onClick={() => setOffset(Math.max(0, page.offset - page.limit))} type="button">Previous</button><button className="button secondary" disabled={!page.hasMore} onClick={() => setOffset(page.offset + page.limit)} type="button">Next</button></nav>; }
