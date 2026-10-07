import { ContactRequestInbox } from "@/components/M4ContactRequests";
import { RequireAuth } from "@/components/auth/RequireAuth";

export default function RequestsPage() {
  return <RequireAuth><main className="page shell"><header className="page-heading"><p className="eyebrow">Business connections</p><h1>Contact request inbox</h1><p>Review and update requests sent to your business.</p></header><ContactRequestInbox /></main></RequireAuth>;
}
