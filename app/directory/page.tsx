import { Suspense } from "react";
import { DirectoryClient } from "./directory-client";

export default function DirectoryPage() {
  return (
    <section className="page shell">
      <div className="page-heading">
        <p className="eyebrow">Member discovery</p>
        <h1>Find your next partner.</h1>
        <p className="lede">Search the directory by organization, role, market, or specialty.</p>
      </div>
      <Suspense fallback={<p role="status">Loading directory…</p>}><DirectoryClient /></Suspense>
    </section>
  );
}
