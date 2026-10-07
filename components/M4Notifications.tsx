"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { m4Api, type Notification, type NotificationPreferences, type OffsetPage } from "@/lib/m4/api";

const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "Notifications could not be loaded.";

export function NotificationBell() {
  const [count, setCount] = useState(0);
  useEffect(() => { let active = true; m4Api.notifications({ unreadOnly: true, limit: 50, offset: 0 }).then((page) => { if (active) setCount(page.total ?? page.items.length); }).catch(() => undefined); return () => { active = false; }; }, []);
  return <Link aria-label={count ? `${count} unread notifications` : "Notifications"} className="notification-bell" href="/notifications">🔔{count > 0 && <span>{count > 99 ? "99+" : count}</span>}</Link>;
}

export function NotificationList() {
  const [unreadOnly, setUnreadOnly] = useState(false); const [offset, setOffset] = useState(0); const [page, setPage] = useState<OffsetPage<Notification> | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(""); const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; m4Api.notifications({ unreadOnly, limit: 20, offset }).then((value) => { if (active) setPage(value); }).catch((cause) => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, [unreadOnly, offset, revision]);
  async function read(id: string) { setBusy(id); setError(""); try { await m4Api.markNotificationRead(id); setRevision((value) => value + 1); } catch (cause) { setError(errorText(cause)); } finally { setBusy(""); } }
  async function readAll() { setBusy("all"); setError(""); try { await m4Api.markAllNotificationsRead(); setRevision((value) => value + 1); } catch (cause) { setError(errorText(cause)); } finally { setBusy(""); } }
  return <div className="form-stack"><div className="feed-toolbar"><label className="check-row"><input checked={unreadOnly} onChange={(event) => { setUnreadOnly(event.target.checked); setOffset(0); }} type="checkbox" />Unread only</label><button className="button secondary" disabled={!!busy} onClick={() => void readAll()} type="button">{busy === "all" ? "Updating…" : "Mark all read"}</button><Link className="button secondary" href="/notifications/preferences">Preferences</Link></div>{error && <p className="form-error" role="alert">{error}</p>}{!page && !error && <p role="status">Loading notifications…</p>}{page && !page.items.length && <div className="empty-state"><h2>No notifications</h2><p>{unreadOnly ? "You have no unread notifications." : "New activity will appear here."}</p></div>}{page?.items.map((item) => <article className="content-card" key={item.id}><div className="card-topline"><div><p className="eyebrow">{item.type.replaceAll("_", " ")}</p><h2>{item.title}</h2></div><span className={`status-chip ${item.readAt ? "verified" : "pending"}`}>{item.readAt ? "Read" : "Unread"}</span></div><p>{item.body}</p><p className="form-hint">{new Date(item.createdAt).toLocaleString()}</p>{!item.readAt && <button className="button secondary" disabled={!!busy} onClick={() => void read(item.id)} type="button">{busy === item.id ? "Updating…" : "Mark read"}</button>}</article>)}{page && <div className="button-row"><button className="button secondary" disabled={page.offset === 0} onClick={() => setOffset(Math.max(0, page.offset - page.limit))} type="button">Previous</button><button className="button secondary" disabled={!page.hasMore} onClick={() => setOffset(page.offset + page.limit)} type="button">Next</button></div>}</div>;
}

const defaults: NotificationPreferences = { profile: { inApp: true, email: true }, contact: { inApp: true, email: true }, verification: { inApp: true, email: true } };
export function NotificationPreferencesForm() {
  const [preferences, setPreferences] = useState(defaults); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  useEffect(() => { let active = true; m4Api.getNotificationPreferences().then((value) => { if (active) setPreferences(value); }).catch((cause) => { if (active) setError(errorText(cause)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setNotice(""); try { setPreferences(await m4Api.updateNotificationPreferences(preferences)); setNotice("Notification preferences saved."); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); } }
  return <form className="content-card auth-form" onSubmit={submit}>{loading && <p role="status">Loading preferences…</p>}{error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{!loading && (["profile", "contact", "verification"] as const).map((category) => <fieldset key={category}><legend>{category[0].toUpperCase() + category.slice(1)}</legend>{(["inApp", "email"] as const).map((channel) => <label className="check-row" key={channel}><input checked={preferences[category][channel]} onChange={(event) => setPreferences((current) => ({ ...current, [category]: { ...current[category], [channel]: event.target.checked } }))} type="checkbox" />{channel === "inApp" ? "In-app notifications" : "Email notifications"}</label>)}</fieldset>)}<button className="button primary" disabled={loading || busy} type="submit">{busy ? "Saving…" : "Save preferences"}</button></form>;
}
