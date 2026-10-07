"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

const navigation = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/admin/verification", label: "Verification", icon: "✓" },
  { href: "/admin/directory-profiles", label: "Directory profiles", icon: "D" },
  { href: "/admin/users", label: "Users", icon: "+" },
  { href: "/admin/settings", label: "Settings", icon: "⚙", exact: true },
  { href: "/admin/settings/password", label: "Password", icon: "◇" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { logout, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const displayName = user?.profile?.displayName ?? "BRIDGE User";

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      await logout();
      router.replace("/login");
    } catch {
      setSignOutError("Sign out could not be confirmed. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return <div className="admin-shell">
    <button aria-label="Open navigation" className="admin-sidebar-toggle" onClick={() => setIsOpen(true)} type="button">☰</button>
    {isOpen && <button aria-label="Close navigation" className="admin-sidebar-backdrop" onClick={() => setIsOpen(false)} type="button" />}
    <aside className={`admin-sidebar${isOpen ? " admin-sidebar--open" : ""}`}>
      <div className="admin-sidebar-brand">
        <Image alt="" height={36} src="/bridge-mark.svg" width={58} />
        <div><strong>BRIDGE</strong><span>Admin Portal</span></div>
        <button aria-label="Close navigation" className="admin-sidebar-close" onClick={() => setIsOpen(false)} type="button">×</button>
      </div>
      <nav aria-label="Admin navigation" className="admin-sidebar-nav">
        <p>WORKSPACE</p>
        {navigation.map((item) => {
          const active = pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));
          return <Link aria-current={active ? "page" : undefined} href={item.href} key={item.href} onClick={() => setIsOpen(false)}><span aria-hidden="true" className="admin-nav-icon">{item.icon}</span><span>{item.label}</span></Link>;
        })}
        <p className="admin-nav-section">WEBSITE</p>
        <Link href="/" onClick={() => setIsOpen(false)}><span aria-hidden="true" className="admin-nav-icon">←</span><span>Back to website</span></Link>
      </nav>
      <div className="admin-sidebar-account">
        <div className="admin-account-avatar">{displayName.charAt(0).toUpperCase()}</div>
        <div className="admin-account-copy"><strong>{displayName}</strong><span>Admin</span></div>
        <button aria-label="Sign out" disabled={signingOut} onClick={() => void signOut()} title="Sign out" type="button">↪</button>
      </div>
      {signOutError && <p role="alert">{signOutError}</p>}
      <div className="admin-sidebar-org"><span aria-hidden="true">▣</span><span>{user?.email}</span></div>
    </aside>
    <div className="admin-main"><div className="admin-page">{children}</div></div>
  </div>;
}
