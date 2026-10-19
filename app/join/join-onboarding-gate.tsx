"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasCompletedOnboarding } from "@/lib/onboarding/access";

export function JoinOnboardingGate({ children }: { children: React.ReactNode }) {
  const { status, user, memberships, refresh } = useAuth();
  const router = useRouter();
  const redirect = status === "authenticated" && hasCompletedOnboarding(user, memberships);

  useEffect(() => {
    if (redirect) router.replace("/my-profile");
  }, [redirect, router]);

  if (status === "loading" || redirect) return <div className="page shell"><p role="status">Checking onboarding status…</p></div>;
  if (status === "unavailable") return <div className="page shell"><p role="alert">Your session could not be checked. Please try again.</p><button className="button primary" onClick={() => void refresh()} type="button">Try again</button></div>;
  return children;
}
