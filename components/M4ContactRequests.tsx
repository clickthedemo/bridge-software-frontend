"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { m4Api, type ContactPreference, type ContactRequest, type ContactRequestStatus, type OffsetPage } from "@/lib/m4/api";
import { useNotificationFocus } from "@/lib/m4/notification-focus";

const statuses: ContactRequestStatus[] = ["new", "viewed", "responded", "closed"];
const transitions: Record<ContactRequestStatus, ContactRequestStatus[]> = { new: ["viewed", "responded", "closed"], viewed: ["responded", "closed"], responded: ["closed"], closed: [] };
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The request could not be completed.";

export function ContactRequestForm({ slug, profileName }: { slug: string; profileName: string }) {
  const { status, user } = useAuth();
  const [firstName, setFirstName] = useState(user?.profile?.displayName ?? ""); const [workEmail, setWorkEmail] = useState(user?.email ?? ""); const [phoneNumber, setPhoneNumber] = useState("");
  const [yearsOfService, setYearsOfService] = useState(0); const [contactPreference, setContactPreference] = useState<ContactPreference>("email"); const [subject, setSubject] = useState(""); const [message, setMessage] = useState("");
  const idempotencyKey = useRef<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [receipt, setReceipt] = useState<ContactRequest | null>(null);
  if (status === "loading") return <p role="status">Checking your account…</p>;
  if (!user) return <p><Link className="button primary" href={`/login?next=${encodeURIComponent(`/profile/${slug}#contact-request`)}`}>Sign in to contact this business</Link></p>;
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); idempotencyKey.current ??= crypto.randomUUID(); try { setReceipt(await m4Api.createContactRequest(slug, { idempotencyKey: idempotencyKey.current, firstName: firstName.trim(), workEmail: workEmail.trim(), phoneNumber: phoneNumber.trim(), yearsOfService, contactPreference, subject: subject.trim(), message: message.trim() })); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); } }
  if (receipt) return <div className="empty-state" role="status"><h2>Request sent</h2><p>Your contact request was sent to {profileName}.</p><p className="form-hint">Reference: {receipt.id}</p><Link className="button secondary" href="/requests/sent">View sent requests</Link></div>;
  return <form className="auth-form" onSubmit={submit}><p className="eyebrow">Contact request</p><h2>Contact {profileName}</h2>
    <label htmlFor="contact-first-name">First name</label><input id="contact-first-name" maxLength={100} required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
    <label htmlFor="contact-work-email">Work email</label><input id="contact-work-email" maxLength={320} required type="email" value={workEmail} onChange={(event) => setWorkEmail(event.target.value)} />
    <label htmlFor="contact-phone">Phone number</label><input id="contact-phone" maxLength={32} required type="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
    <label htmlFor="contact-years">Years of service</label><input id="contact-years" max={80} min={0} required step={1} type="number" value={yearsOfService} onChange={(event) => setYearsOfService(event.target.valueAsNumber || 0)} />
    <label htmlFor="contact-preference">Contact preference</label><select id="contact-preference" value={contactPreference} onChange={(event) => setContactPreference(event.target.value as ContactPreference)}><option value="email">Email</option><option value="phone">Phone</option><option value="either">Either</option></select>
    <label htmlFor="contact-subject">Subject</label><input id="contact-subject" maxLength={200} required value={subject} onChange={(event) => setSubject(event.target.value)} />
    <label htmlFor="contact-message">Message</label><textarea id="contact-message" maxLength={2000} required rows={5} value={message} onChange={(event) => setMessage(event.target.value)} />
    {error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy} type="submit">{busy ? "Sending…" : "Send contact request"}</button></form>;
}

function RequestCards({ page, organizationId, direct = false, onChanged }: { page: OffsetPage<ContactRequest>; organizationId?: string; direct?: boolean; onChanged(): void }) {
  const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  useNotificationFocus("requestId", page.items.map((item) => item.id), ".form-stack .content-card");
  async function update(id: string, nextStatus: ContactRequestStatus) { if (!organizationId && !direct) return; setBusy(id); setError(""); try { if (nextStatus !== "new") { if (direct) await m4Api.updateAssignedContactStatus(id, nextStatus); else await m4Api.updateContactStatus(organizationId!, id, nextStatus); } onChanged(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(""); } }
  return <>{error && <p className="form-error" role="alert">{error}</p>}{!page.items.length && <div className="empty-state"><h2>No contact requests</h2><p>New requests will appear here.</p></div>}{page.items.map((item) => <article className="content-card" key={item.id}><div className="card-topline"><h2>{item.subject || item.target?.displayName || item.firstName || "Contact request"}</h2><span className={`status-chip ${item.status === "closed" ? "verified" : "pending"}`}>{item.status}</span></div><p><strong>From:</strong> {item.firstName || "Not provided"}</p><p><strong>Contact preference:</strong> {item.contactPreference ? item.contactPreference[0].toUpperCase() + item.contactPreference.slice(1) : "Not provided"}</p>{item.message && <p>{item.message}</p>}{item.workEmail && <p className="muted">{item.workEmail} · {item.phoneNumber} · {item.yearsOfService} years</p>}<p className="form-hint">{new Date(item.createdAt).toLocaleString()} · Reference {item.id}</p>{(organizationId || direct) && transitions[item.status].length > 0 && <div className="button-row">{transitions[item.status].map((nextStatus) => <button className={nextStatus === "closed" ? "button secondary" : "button primary"} disabled={!!busy} key={nextStatus} onClick={() => void update(item.id, nextStatus)} type="button">Mark {nextStatus}</button>)}</div>}</article>)}</>;
}

export function ContactRequestInbox() {
  const targetId = useSearchParams().get("requestId");
  const { memberships } = useAuth();
  const organizations = useMemo(() => memberships.filter((item) => item.status === "active" && ["owner", "admin"].includes(item.role)), [memberships]);
  const [organizationId, setOrganizationId] = useState("");
  const [filter, setFilter] = useState<ContactRequestStatus | "">("");
  const [offset, setOffset] = useState(0), [revision, setRevision] = useState(0);
  const selectedOrganizationId = organizationId || organizations[0]?.organizationId || "";
  const retry = () => setRevision((value) => value + 1);
  if (!targetId && !organizations.length) return <div className="empty-state"><h2>No accessible inbox</h2><p>Organization owners and admins can view their inbox. Assigned sales representatives can open only requests routed to them.</p></div>;
  return <div className="form-stack">{!targetId && <div className="feed-toolbar"><label htmlFor="inbox-organization">Organization</label><select id="inbox-organization" value={selectedOrganizationId} onChange={(event) => { setOrganizationId(event.target.value); setOffset(0); }}>{organizations.map((item) => <option key={item.organizationId} value={item.organizationId}>{item.organizationName}</option>)}</select><label htmlFor="inbox-status">Status</label><select id="inbox-status" value={filter} onChange={(event) => { setFilter(event.target.value as ContactRequestStatus | ""); setOffset(0); }}><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><Link className="button secondary" href="/requests/sent">Sent requests</Link></div>}
    <InboxRequests key={JSON.stringify([targetId, selectedOrganizationId, filter, offset, revision])} targetId={targetId} organizationId={selectedOrganizationId} filter={filter} offset={offset} onRetry={retry} onOffset={setOffset}/>
  </div>;
}

function InboxRequests({ targetId, organizationId, filter, offset, onRetry, onOffset }: { targetId: string | null; organizationId: string; filter: ContactRequestStatus | ""; offset: number; onRetry(): void; onOffset(value: number): void }) {
  const [page, setPage] = useState<OffsetPage<ContactRequest> | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const request = targetId
      ? m4Api.inboundContactRequest(targetId).then((item): OffsetPage<ContactRequest> => ({ items: [item], limit: 1, offset: 0, hasMore: false, total: 1, pageInfo: { limit: 1, offset: 0, hasMore: false } }))
      : m4Api.inbox(organizationId, { status: filter || undefined, limit: 20, offset });
    request.then((value) => { if (active) setPage(value); }).catch((cause) => { if (active) { setPage(null); setError(errorText(cause)); } });
    return () => { active = false; };
  }, [targetId, organizationId, filter, offset]);
  return <>{error && <div><p className="form-error" role="alert">{error}</p><button className="button secondary" type="button" onClick={onRetry}>Try again</button></div>}{!page && !error && <p role="status">{targetId ? "Loading contact request…" : "Loading contact requests…"}</p>}{page && <><RequestCards direct={!!targetId} {...(targetId ? {} : { organizationId })} page={page} onChanged={onRetry}/>{!targetId && <Pager page={page} setOffset={onOffset}/>}</>}</>;
}

export function SentContactRequests() {
  const targetId = useSearchParams().get("requestId");
  return <SentRequestList key={targetId ?? "sent"} targetId={targetId}/>;
}

function SentRequestList({ targetId }: { targetId: string | null }) {
  const [offset, setOffset] = useState(0), [revision, setRevision] = useState(0);
  const [page, setPage] = useState<OffsetPage<ContactRequest> | null>(null), [error, setError] = useState("");
  const located = useRef(!targetId);
  useEffect(() => {
    let active = true;
    void (async () => {
      if (targetId && !located.current) {
        let candidateOffset = 0;
        while (active) {
          const candidate = await m4Api.sent({ limit: 20, offset: candidateOffset });
          if (!active) return;
          if (candidate.items.some((item) => item.id === targetId)) { located.current = true; setPage(candidate); return; }
          if (!candidate.hasMore) throw new Error("The referenced contact request is unavailable or you no longer have access.");
          candidateOffset += candidate.limit;
        }
      } else {
        const value = await m4Api.sent({ limit: 20, offset });
        if (active) setPage(value);
      }
    })().catch((cause) => { if (active) { setPage(null); setError(errorText(cause)); } });
    return () => { active = false; };
  }, [targetId, offset, revision]);
  function reload(nextOffset = offset) { setPage(null); setError(""); setOffset(nextOffset); setRevision((value) => value + 1); }
  return <>{error && <div><p className="form-error" role="alert">{error}</p><button className="button secondary" type="button" onClick={() => reload()}>Try again</button></div>}{!page && !error && <p role="status">Loading sent requests…</p>}{page && <><RequestCards page={page} onChanged={() => undefined}/><Pager page={page} setOffset={reload}/></>}</>;
}

function Pager({ page, setOffset }: { page: OffsetPage<unknown>; setOffset(value: number): void }) { return <nav aria-label="Request pages" className="button-row"><button className="button secondary" disabled={page.offset === 0} onClick={() => setOffset(Math.max(0, page.offset - page.limit))} type="button">Previous</button><button className="button secondary" disabled={!page.hasMore} onClick={() => setOffset(page.offset + page.limit)} type="button">Next</button></nav>; }
