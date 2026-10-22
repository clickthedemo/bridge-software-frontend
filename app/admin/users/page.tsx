"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AdminUserPanel } from "@/components/Phase6Moderation";
import { getPhase3Client } from "@/lib/phase3";
import type { AdminUser, AdminUsersResponse } from "@/lib/phase3";

const PAGE_SIZE = 50;

function userName(user: AdminUser) {
  return user.displayName?.trim() || user.email || "Unnamed user";
}

export default function AdminUsersPage() {
  const client = useMemo(() => getPhase3Client(), []);
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError("");
      client.listAdminUsers(page, PAGE_SIZE)
        .then((response) => { if (active) setData(response); })
        .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Users could not be loaded."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [client, page, reload]);

  const users = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (data?.users ?? []).filter((user) => {
      const matchesSearch = !search || userName(user).toLowerCase().includes(search) || user.email?.toLowerCase().includes(search);
      const matchesRole = role === "all" || (role === "member" ? !user.platformRole : user.platformRole === role);
      const matchesStatus = status === "all" || (status === "verified" ? user.emailVerified : !user.emailVerified);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [data, query, role, status]);

  const pagination = data?.pagination;
  const lastPage = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

  return <>
    <div className="admin-page-heading"><div><p className="admin-eyebrow">User management</p><h1>Users</h1><p>Review accounts, roles, verification, and organization access.</p></div><Link className="button primary" href="/admin/users/new">Create user</Link></div>
    <section className="admin-content-card admin-user-filters" aria-label="User filters">
      <label><span>Search current page</span><input type="search" placeholder="Name or email" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label><span>Platform role</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All roles</option><option value="admin">Admin</option><option value="member">Member</option></select></label>
      <label><span>Email status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="verified">Verified</option><option value="unverified">Unverified</option></select></label>
    </section>
    <section className="content-card table-card admin-users-table">
      <div className="result-bar"><strong>{pagination?.total ?? 0} total users</strong>{pagination && <span className="form-hint">Page {pagination.page} of {lastPage}</span>}</div>
      {loading && <p className="admin-users-empty" role="status">Loading users…</p>}
      {!loading && error && <div className="admin-users-error" role="alert"><p>{error}</p><button className="button" type="button" onClick={() => setReload((value) => value + 1)}>Try again</button></div>}
      {!loading && !error && <div className="table-scroll"><table><thead><tr><th>User</th><th>Account</th><th>Role</th><th>Status</th><th>Email</th><th>Organizations</th><th>Last sign in</th></tr></thead><tbody>
        {users.map((user) => <Fragment key={user.id}><tr>
          <td><div className="admin-user-identity"><span>{userName(user).charAt(0).toUpperCase()}</span><div><strong><button aria-controls={`user-details-${user.id}`} aria-expanded={openId === user.id} className="admin-directory-toggle" onClick={() => setOpenId(openId === user.id ? null : user.id)} type="button">{userName(user)}</button></strong><small>{user.email ?? "No email"}</small></div></div></td>
          <td>{user.accountType === "sales_rep" ? "Sales rep" : user.accountType ?? "—"}</td>
          <td>{user.platformRole ?? "Member"}</td>
          <td><span className={`status-chip ${user.deactivated ? "warning" : "verified"}`}>{user.deactivated ? "Deactivated" : "Active"}</span></td>
          <td><span className={`status-chip ${user.emailVerified ? "verified" : "pending"}`}>{user.emailVerified ? "Verified" : "Unverified"}</span></td>
          <td>{user.organizationMemberships.length ? user.organizationMemberships.map((membership) => `${membership.organizationName} (${membership.role})`).join(", ") : "—"}</td>
          <td>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"}</td>
        </tr>
        <tr hidden={openId !== user.id} id={`user-details-${user.id}`}><td colSpan={7}>{openId === user.id && <AdminUserPanel onChanged={() => setReload((value) => value + 1)} userId={user.id} />}</td></tr></Fragment>)}
        {!users.length && <tr><td colSpan={7} className="admin-users-empty">No users match these filters.</td></tr>}
      </tbody></table></div>}
      {!loading && !error && pagination && <div className="admin-users-pagination"><button className="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Previous</button><span>Page {page} of {lastPage}</span><button className="button" disabled={page >= lastPage} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div>}
    </section>
  </>;
}
