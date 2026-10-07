import { ContactRequestInbox } from "@/components/M4ContactRequests";
import { NotificationList } from "@/components/M4Notifications";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { isPhase3LiveApi } from "@/lib/phase3";
import Link from "next/link";

const metrics = [["Profile views", "184", "+18%"], ["Search appearances", "726", "+9%"], ["Contact requests", "12", "+3"], ["Saved by members", "31", "+6"]];

export default function DashboardPage() {
  if (isPhase3LiveApi()) return <RequireAuth><main className="page shell"><header className="page-heading"><p className="eyebrow">Your Bridge</p><h1>Keep your connections close</h1><div className="button-row"><Link className="button secondary" href="/my-profile">Manage your profile</Link><Link className="button secondary" href="/requests">Contact requests</Link><Link className="button secondary" href="/notifications">All notifications</Link></div></header><div className="form-stack"><section><h2>Business contact requests</h2><ContactRequestInbox /></section><section><h2>Notifications</h2><NotificationList /></section></div></main></RequireAuth>;
  return (
    <section className="page shell">
      <div className="dashboard-heading"><div><p className="eyebrow">Brand dashboard</p><h1>Good morning, Tori.</h1><p className="lede">Here is what is happening around your profile. All metrics and requests below are fictional sample data.</p></div><button className="button secondary" disabled title="Profile editing opens in the post-decision build" type="button">Edit profile</button></div>
      <div className="metric-grid">{metrics.map(([label, value, delta]) => <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong><small>{delta} this month</small></article>)}</div>
      <div className="dashboard-grid">
        <article className="content-card">
          <div className="section-heading compact-heading"><div><p className="eyebrow">Inbox</p><h2>Contact requests</h2></div><span className="status-chip pending">3 new</span></div>
          {[["Harbor Dispensary", "Retail partnership", "2h"], ["Northstar Sales Group", "Territory representation", "Yesterday"], ["Mosaic Market", "Wholesale catalog", "Jul 8"]].map(([name, type, time]) => <div className="request-row" key={name}><span className="avatar small">{name.split(" ").map(x => x[0]).join("").slice(0,2)}</span><div><strong>{name}</strong><small>{type}</small></div><span className="muted">{time}</span><button disabled title="Request review opens in the post-decision build" type="button">Review</button></div>)}
          <p className="form-hint">Accepting or declining requests opens in the post-decision build.</p>
        </article>
        <aside className="content-card checklist-card">
          <p className="eyebrow">Profile strength</p><div className="score-row"><strong>82%</strong><span>Strong</span></div><div className="progress"><span style={{ width: "82%" }} /></div>
          <ul className="checklist"><li className="done">Business details</li><li className="done">License verification</li><li className="done">Logo and cover</li><li>Add product categories</li><li>Publish first announcement</li></ul>
          <Link className="button secondary full" href="/profile/cascade-canna">View public profile</Link>
        </aside>
      </div>
      <section className="content-card league-dashboard">
        <div><p className="eyebrow">Bridge League · private</p><h2>Your contribution, without a public rank</h2><p>Only you can see these participation signals. Bridge does not publish a leaderboard or pressure members to accept every connection.</p></div>
        <div className="private-signals">
          <p><strong>Current profile</strong><span>Monthly contacts are ready for confirmation</span></p>
          <p><strong>Useful activity</strong><span>Two relevant updates shared this month</span></p>
          <p><strong>Response habit</strong><span>Qualified introductions acknowledged</span></p>
        </div>
        <Link className="button secondary" href="/league">Review the Bridge League concept</Link>
      </section>
    </section>
  );
}
