"use client";
import { useEffect, useState } from "react";
import { getBridgeApiBase } from "@/lib/phase3/client";
import { logoInitials } from "@/lib/m4/profile-logo";

export const publicLogoUrl = (value: string | null) => value ? (value.startsWith("/") ? `${getBridgeApiBase()?.replace(/\/$/, "") ?? ""}${value}` : value) : null;

export function ProfileLogo({ name, logoUrl, size = "card", onLoadError }: { name: string; logoUrl: string | null; size?: "card" | "detail"; onLoadError?: () => void }) {
  const source = publicLogoUrl(logoUrl), [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) { setLoaded(false); setFailed(false); } }); return () => { active = false; }; }, [source]);
  return <span className={`profile-logo ${size}`}><span aria-hidden={loaded && !failed}>{logoInitials(name)}</span>{source && !failed && <img alt={`${name} logo`} className={loaded ? "is-loaded" : ""} onError={() => { setFailed(true); onLoadError?.(); }} onLoad={() => setLoaded(true)} src={source} />}</span>;
}
