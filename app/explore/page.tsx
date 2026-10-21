import { Suspense } from "react";
import { ExploreClient } from "./explore-client";
export default function ExplorePage() {
  return (
    <div className="page shell">
      <div className="page-heading">
        <p className="eyebrow">Explore the Cannabis Industry</p>
        <h1>Find verified cannabis businesses nationwide</h1>
        <p className="lede small">Brands, dispensaries, cultivators, sales teams, and service partners across all 50 states and D.C.</p>
          <p className="handwrite right">every state, every role, one search</p>
      </div>
      <Suspense fallback={<p role="status">Loading directory…</p>}><ExploreClient /></Suspense>
    </div>
  );
}
