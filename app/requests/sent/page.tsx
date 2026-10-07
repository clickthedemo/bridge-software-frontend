import Link from "next/link";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { SentContactRequests } from "@/components/M4ContactRequests";

export default function SentRequestsPage() {
  return <RequireAuth><main className="page shell"><header className="page-heading"><p className="eyebrow">Business connections</p><h1>Sent contact requests</h1><p>Track the requests you have sent to businesses.</p><Link className="text-link" href="/requests">View business inbox</Link></header><SentContactRequests /></main></RequireAuth>;
}
