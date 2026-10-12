import { AccountSettings } from "@/components/AccountSettings";
import { RequireAuth } from "@/components/auth/RequireAuth";
export default function SettingsPage() { return <RequireAuth><main className="page shell"><header className="page-heading"><p className="eyebrow">Account</p><h1>Settings</h1><p className="lede">Update the profile information associated with your account.</p></header><AccountSettings /></main></RequireAuth>; }
