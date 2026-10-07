"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { NotificationBell } from "@/components/M4Notifications";

const links = [
  { href: "/", label: "Home", match: (p: string) => p === "/" },
  { href: "/community", label: "Community News", match: (p: string) => p.startsWith("/community") },
  { href: "/create", label: "Create", match: (p: string) => p.startsWith("/create") },
  { href: "/my-profile", label: "My Profile", match: (p: string) => p.startsWith("/my-profile") },
  { href: "/explore", label: "Explore", match: (p: string) => p.startsWith("/explore") || p.startsWith("/directory") },
  { href: "/verified", label: "Verified", match: (p: string) => p.startsWith("/verified") },
] as const;

export function NavMenu() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { status, isAdmin, logout } = useAuth();

  async function signOut() {
    setSigningOut(true); setSignOutError("");
    try {
      await logout();
      setOpen(false);
      router.replace("/login");
    } catch {
      setSignOutError("Sign out could not be confirmed. Please try again.");
    } finally { setSigningOut(false); }
  }

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        aria-controls="site-nav"
        aria-expanded={open}
        className="nav-toggle"
        onClick={() => setOpen((value) => !value)}
        ref={toggleRef}
        type="button"
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span> Menu
      </button>
      <nav aria-label="Main navigation" data-open={open || undefined} id="site-nav">
        {links.map((link) => (
          <Link
            aria-current={link.match(pathname) ? "page" : undefined}
            href={link.href}
            key={link.href}
            onClick={() => setOpen(false)}
          >
            {link.label}
          </Link>
        ))}
        {status === "unauthenticated" && <Link aria-current={pathname === "/login" || pathname.startsWith("/auth/") ? "page" : undefined} href="/login" onClick={() => setOpen(false)}>Sign in</Link>}
        {status === "authenticated" && <NotificationBell />}
        {status === "authenticated" && <Link aria-current={pathname.startsWith("/requests") ? "page" : undefined} href="/requests" onClick={() => setOpen(false)}>Requests</Link>}
        {status === "authenticated" && isAdmin && <Link aria-current={pathname.startsWith("/admin") ? "page" : undefined} href="/admin/dashboard" onClick={() => setOpen(false)}>Admin dashboard</Link>}
        {status === "authenticated" && <button className="nav-sign-out" disabled={signingOut} onClick={() => void signOut()} type="button">{signingOut ? "Signing out…" : "Sign out"}</button>}
        {signOutError && <p role="alert">{signOutError}</p>}
      </nav>
    </>
  );
}
