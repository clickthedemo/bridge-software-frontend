import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { SavedProfilesList } from "@/components/Phase5Engagement";

export const metadata: Metadata = { title: "Saved profiles — Bridge" };

export default function SavedProfilesPage() {
  return <RequireAuth><div className="page shell"><header className="page-heading"><p className="eyebrow">Your Bridge</p><h1>Saved profiles</h1><p>Businesses you saved for quick access. Only you can see this list.</p></header><SavedProfilesList /></div></RequireAuth>;
}
