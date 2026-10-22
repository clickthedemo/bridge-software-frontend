import { Suspense } from "react";
import { FlagQueue } from "@/components/Phase6Moderation";

export default function AdminFlagsPage() {
  return <section>
    <div className="admin-page-heading"><div><p className="admin-eyebrow">Moderation</p><h1>Reports</h1><p>Members report updates and profiles. Archive the update, suspend the profile, or dismiss, each with a reason the business can read. The reporter is never told who decided.</p></div></div>
    <Suspense fallback={<p role="status">Loading reports…</p>}><FlagQueue /></Suspense>
  </section>;
}
