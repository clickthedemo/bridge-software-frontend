"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getPhase3Client, Phase3Error } from "@/lib/phase3";
import type { CurrentUser, OrganizationMembership } from "@/lib/phase3";

type AuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated" | "unavailable";
  refresh(): Promise<void>;
  refreshMemberships(): Promise<void>;
  user: CurrentUser | null;
  memberships: OrganizationMembership[];
  isAdmin: boolean;
  login(email: string, password: string): Promise<{ isAdmin: boolean }>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => getPhase3Client(), []);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const requestVersion = useRef(0);

  const checkSession = useCallback(() => {
    const version = ++requestVersion.current;
    return client.getCurrentUser().then((result) => {
      if (version !== requestVersion.current) return;
      setUser(result.user); setMemberships(result.memberships); setStatus("authenticated");
    }).catch((cause: unknown) => {
      if (version !== requestVersion.current) return;
      setUser(null); setMemberships([]);
      setStatus(cause instanceof Phase3Error && cause.code === "unauthenticated" ? "unauthenticated" : "unavailable");
    });
  }, [client]);

  const refresh = useCallback(() => {
    setStatus("loading");
    return checkSession();
  }, [checkSession]);

  useEffect(() => {
    const requests = requestVersion;
    void checkSession();
    return () => { ++requests.current; };
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string) => {
    const version = ++requestVersion.current;
    const identity = await client.login(email, password);
    if (version !== requestVersion.current) throw new Error("Session changed during sign in. Please try again.");
    setUser(identity.user); setMemberships(identity.memberships); setStatus("authenticated");
    return { isAdmin: identity.user.platformRoles.includes("admin") };
  }, [client]);

  const logout = useCallback(async () => {
    const version = ++requestVersion.current;
    await client.logout();
    if (version !== requestVersion.current) throw new Error("Session changed during sign out. Please try again.");
    setUser(null); setMemberships([]); setStatus("unauthenticated");
  }, [client]);
  const value = useMemo(() => ({ status, user, memberships,
    isAdmin: user?.platformRoles.includes("admin") ?? false, refresh, refreshMemberships: checkSession, login, logout }), [status, user, memberships, refresh, checkSession, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
