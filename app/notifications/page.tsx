import { RequireAuth } from "@/components/auth/RequireAuth";
import { NotificationList } from "@/components/M4Notifications";
export default function NotificationsPage() { return <RequireAuth><main className="page shell"><header className="page-heading"><p className="eyebrow">Activity</p><h1>Notifications</h1><p>Profile, contact, and verification updates.</p></header><NotificationList /></main></RequireAuth>; }
