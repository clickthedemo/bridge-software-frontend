"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { AdminDashboardSummary } from "@/components/Phase6Moderation";

export default function AdminDashboardPage() {
  const { user, memberships } = useAuth();
  const active = memberships.filter((item) => item.status === "active");

  return <>
    <div className="admin-page-heading"><div><p className="admin-eyebrow">Overview</p><h1>Dashboard</h1><p>Welcome back, {user?.profile?.displayName ?? user?.email}.</p></div></div>
    <AdminDashboardSummary />
    <div className="admin-dashboard-grid">
      <section className="admin-content-card"><div className="admin-card-heading"><div><h2>Organizations</h2><p>Your active organization memberships.</p></div></div><div className="admin-membership-list">{active.length ? active.map((item) => <div key={item.organizationId}><span className="admin-list-icon">▣</span><div><strong>{item.organizationName}</strong><span>{item.organizationType ?? "Unclassified"} · {item.role}</span></div></div>) : <p className="admin-empty-state">No active organization memberships.</p>}</div></section>
    </div>
  </>;
}
