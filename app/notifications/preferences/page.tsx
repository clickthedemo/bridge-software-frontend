import Link from "next/link";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { NotificationPreferencesForm } from "@/components/M4Notifications";
export default function NotificationPreferencesPage() { return <RequireAuth><main className="page shell"><header className="page-heading"><p className="eyebrow">Settings</p><h1>Notification preferences</h1><p>Choose how Bridge keeps you informed.</p><Link className="text-link" href="/notifications">Back to notifications</Link></header><NotificationPreferencesForm /></main></RequireAuth>; }
