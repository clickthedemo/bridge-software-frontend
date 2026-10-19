import { Suspense } from "react";
import { OrganizationForm } from "./organization-form";
import { OrganizationMembers } from "@/components/OrganizationMembers";

export default function OrganizationPage() {
  return <div className="page shell auth-page"><div className="join-auth-layout">
    <header className="join-auth-heading"><p className="eyebrow">Organization setup</p><h1>Your organization.</h1><p className="lede">Choose an existing organization or create one with its name and organization type.</p></header>
    <Suspense fallback={<p role="status">Loading organization setup…</p>}><OrganizationForm /></Suspense>
    <OrganizationMembers />
  </div></div>;
}
