"use client";

import Image from "next/image";
import { isPhase3LiveApi } from "@/lib/phase3";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PostActions } from "@/components/PostActions";
import { collectionCount, collectionNames, useSocial } from "@/lib/social";
import { getPhase3Client } from "@/lib/phase3";
import type { PostRecord } from "@/lib/phase3/types";
import { US_STATE_OPTIONS } from "@/lib/states";

type FeedItem = {
  id: string;
  /* Includes the ContentType values the composer can produce, so a published
     promotion is the same shape as a sample story. */
  type: "Promotion" | "Product introduction" | "Vendor announcement" | "Industry news" | "Event" | "Education" | "Market signal" | "Service update" | "Update";
  title: string;
  org: string;
  audience: string;
  body: string;
  state: string;
  category: string;
  image: string;
  imageAlt: string;
  age: string;
  /* Set on anything the member published in this build, so the feed can mark
     it as theirs rather than passing it off as sample activity. */
  mine?: boolean;
};

const items: FeedItem[] = [
  { id: "1", type: "Promotion", title: "Fall wholesale calendar's open now", org: "Cascade Canna Co.", audience: "Verified retailers", body: "Menus and training are ready. Reach out before Aug 31.", state: "Oregon", category: "Edibles", image: "/bridge-editorial/community-oregon-edibles.webp", imageAlt: "Small-batch edible products prepared for an Oregon wholesale presentation", age: "2 hours ago" },
  { id: "2", type: "Market signal", title: "Michigan buyers are already planning fall resets", org: "Northstar Sales Group", audience: "Industry professionals", body: "What buyers keep asking for: a schedule they can trust.", state: "Michigan", category: "Retail", image: "/bridge-editorial/community-michigan-retail.webp", imageAlt: "Michigan retail buyers planning a cannabis shelf reset", age: "4 hours ago" },
  { id: "3", type: "Industry news", title: "What California growers are testing right now", org: "Signal Desk Media", audience: "All Bridge members", body: "New genetics, tighter production, formats built to travel.", state: "California", category: "Cultivation", image: "/bridge-editorial/community-california-cultivation.webp", imageAlt: "California cultivation team inspecting healthy plants and environmental controls", age: "Today" },
  { id: "4", type: "Event", title: "Education night at Harbor this week", org: "Harbor Dispensary", audience: "Adults 21+", body: "Local operators stop by to talk product. 21+, doors at 6.", state: "Maryland", category: "Events", image: "/bridge-editorial/community-maryland-education.webp", imageAlt: "Adults attending a professional cannabis education event in Maryland", age: "Tomorrow" },
  { id: "5", type: "Promotion", title: "New tincture line, lab results included", org: "Greenline Goods", audience: "Verified retailers", body: "Wholesale samples are out. Ask for the one-page sheet.", state: "New Jersey", category: "Wellness", image: "/bridge-editorial/community-new-jersey-wellness.webp", imageAlt: "Wellness tinctures arranged for a New Jersey wholesale review", age: "Yesterday" },
  { id: "6", type: "Service update", title: "Two new pickup routes in Southwest Michigan", org: "Purple Route Logistics", audience: "Verified businesses", body: "New windows open for retailers, labs, and manufacturers.", state: "Michigan", category: "Transport", image: "/bridge-editorial/community-michigan-logistics.webp", imageAlt: "Licensed Michigan transport coordinator planning secure routes", age: "Yesterday" },
  { id: "7", type: "Market signal", title: "Everyone's booking HVAC before winter hits", org: "Evergreen Facility Group", audience: "Industry professionals", body: "Facility work is booking up fast. Miss it, wait till spring.", state: "Ohio", category: "Services", image: "/bridge-editorial/community-ohio-facility.webp", imageAlt: "Ohio facility technician servicing cultivation climate controls", age: "2 days ago" },
  { id: "8", type: "Industry news", title: "Sample intake windows just went up", org: "Great Lakes Analytics", audience: "Verified businesses", body: "New turnaround schedule's up. Check it before you drop off.", state: "Michigan", category: "Testing", image: "/bridge-editorial/community-michigan-testing.webp", imageAlt: "Michigan analytical laboratory team receiving sealed samples", age: "3 days ago" },
  { id: "9", type: "Product introduction", title: "Phoenix buyers get the new formats first", org: "Mosaic Market", audience: "Verified retailers", body: "Ran the preview through three stores first. Feedback: good.", state: "Arizona", category: "Retail", image: "/bridge-editorial/community-arizona-retail-planning.webp", imageAlt: "Arizona dispensary buyers comparing packaged products and merchandising notes", age: "Today" },
  { id: "10", type: "Vendor announcement", title: "Office hours in Chicago this week", org: "Northstar Sales Group", audience: "Industry professionals", body: "Bring your route questions and whatever's on your mind.", state: "Illinois", category: "Services", image: "/bridge-editorial/community-illinois-route-planning.webp", imageAlt: "Illinois sales representative mapping Midwest retailer routes", age: "Today" },
  { id: "11", type: "Event", title: "Small meetup, Boston growers and buyers", org: "Union Street Collective", audience: "Verified businesses", body: "Nothing formal, just growers and buyers comparing notes.", state: "Massachusetts", category: "Events", image: "/bridge-editorial/community-massachusetts-meetup.webp", imageAlt: "Massachusetts dispensary team speaking with local cultivation partners", age: "This week" },
  { id: "12", type: "Education", title: "Fall education calendar's up for Erie", org: "Presque Isle Wellness", audience: "Adults 21+", body: "Short sessions on the products themselves, how they're made.", state: "Pennsylvania", category: "Wellness", image: "/bridge-editorial/community-pennsylvania-education.webp", imageAlt: "Pennsylvania dispensary educator preparing product-literacy materials", age: "This week" },
  { id: "13", type: "Promotion", title: "Office hours for craft founders, Mountain West", org: "Front Range Reps", audience: "Verified businesses", body: "Territory questions, retailer intros, route planning. Come by.", state: "Colorado", category: "Services", image: "/bridge-editorial/community-colorado-office-hours.webp", imageAlt: "Colorado territory representative meeting a craft cannabis founder", age: "Tomorrow" },
  { id: "14", type: "Event", title: "What to have ready before you talk to a bank", org: "Canopy Capital Services", audience: "Verified businesses", body: "The paperwork operators always forget, before it's too late.", state: "Colorado", category: "Events", image: "/bridge-editorial/community-colorado-finance-clinic.webp", imageAlt: "Cannabis-aware finance advisor leading an operator readiness clinic", age: "Next week" },
  { id: "15", type: "Product introduction", title: "New packaging, and yes, the paperwork's ready too", org: "Steel City Botanicals", audience: "Verified retailers", body: "Packaging, test results, restock timing, all before it ships.", state: "Pennsylvania", category: "Testing", image: "/bridge-editorial/community-pennsylvania-packaging.webp", imageAlt: "Pennsylvania manufacturing specialist reviewing compliant packaging details", age: "Yesterday" },
  { id: "16", type: "Vendor announcement", title: "Q4 production slots are open", org: "Lake Effect Manufacturing", audience: "Verified businesses", body: "Lead times, packaging, capacity, all laid out. Take a look.", state: "Michigan", category: "Services", image: "/bridge-editorial/community-michigan-production.webp", imageAlt: "Michigan manufacturing team reviewing production windows", age: "Yesterday" },
  { id: "17", type: "Industry news", title: "Operator interview series kicks off in New York", org: "Signal Desk Media", audience: "All Bridge members", body: "No spin, just operators saying what worked and what changed.", state: "New York", category: "Services", image: "/bridge-editorial/community-new-york-interview.webp", imageAlt: "New York cannabis journalist recording an operator interview", age: "2 days ago" },
  { id: "18", type: "Education", title: "Field notes: what's working in the greenhouse", org: "Golden State Genetics", audience: "Industry professionals", body: "Plant structure, consistency, the stuff you notice over time.", state: "California", category: "Cultivation", image: "/bridge-editorial/community-california-field-notes.webp", imageAlt: "California genetics specialist examining a plant and recording field notes", age: "2 days ago" },
  { id: "19", type: "Event", title: "Water-efficiency workshop hits the facility floor", org: "Root Zone Hydro", audience: "Verified businesses", body: "Walking the actual system this time, not slides.", state: "California", category: "Cultivation", image: "/bridge-editorial/community-california-water-workshop.webp", imageAlt: "California cultivation team reviewing irrigation controls with a technician", age: "3 days ago" },
  { id: "20", type: "Product introduction", title: "Sample kits are out for retail partners", org: "Cascade Canna Co.", audience: "Verified retailers", body: "Product, notes, and a quick staff briefing, all in one box.", state: "Oregon", category: "Edibles", image: "/bridge-editorial/community-oregon-sample-kit.webp", imageAlt: "Oregon edible producer assembling a retailer sample kit", age: "3 days ago" },
];

const categories = ["All", ...Array.from(new Set(items.map((item) => item.category)))];
const categoryImageByName: Record<string, string> = {
  All: "/bridge-network-night.webp",
  Edibles: "/bridge-editorial/community-category-edibles.webp",
  Retail: "/bridge-editorial/community-category-retail.webp",
  Cultivation: "/bridge-editorial/community-category-cultivation.webp",
  Events: "/bridge-editorial/community-category-events.webp",
  Wellness: "/bridge-editorial/community-category-wellness.webp",
  Transport: "/bridge-editorial/community-category-transport.webp",
  Services: "/bridge-editorial/community-category-services.webp",
  Testing: "/bridge-editorial/community-category-testing.webp",
};

/* Tori, 2026-09-16 (Screenshot 2026-09-16 at 9.31.01 PM), beside this rail:
   "Because it's not a shopping experience and more or less of an advertising
   space, let's add these vocab words :D" - then wrote one under each chip.
   Her words, unchanged, with one exception: she typed "Uniqe Services" and
   that is shipped as "Unique". "Blogger's & Scientist" is left exactly as she
   wrote it, because unlike the misspelling it could be deliberate voice.
   Both are flagged back to her rather than quietly rewritten.
   "All" has no note from her, so it has no sublabel. */
const categoryNoteByName: Record<string, string> = {
  Edibles: "New Edibles",
  Retail: "All Dispensary Deals",
  Cultivation: "What strains are growing",
  Events: "Events Coming Up",
  Wellness: "Blogger's & Scientist",
  Transport: "Job Finder",
  Services: "Unique Services",
};

/* First line of the message becomes the card title; the composer is a single
   free-text field, so there is nothing else to use. */
function firstLine(message: string): string {
  const [head] = message.split(String.fromCharCode(10));
  return head.trim().slice(0, 72) || "Your promotion";
}

export function CommunityClient() { return <><p className="boundary-note">{isPhase3LiveApi() ? "Illustrative community preview · live posts are unavailable until a backend posts contract is approved" : "Preview mode · illustrative news and promotions"}</p><PreviewCommunityClient /></>; }
function PreviewCommunityClient() {
  const [layout, setLayout] = useState<"grid" | "aligned" | "classic">("grid");
  const [category, setCategory] = useState("All");
  const [state, setState] = useState("All states");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  /* null means every saved post, regardless of folder. */
  const [folder, setFolder] = useState<string | null>(null);
  // PostActions writes favourites to the shared social store, so the filter
  // must read the same place or the page grows two favourite systems.
  const social = useSocial();
  const [followingOnly, setFollowingOnly] = useState(false);
  /* Anything published on Create shows up here, at the top, marked as yours.
     Without this the composer posts into nothing and the loop never closes. */
  const [mine, setMine] = useState<FeedItem[]>([]);

  useEffect(() => {
    let live = true;
    getPhase3Client()
      .listPosts()
      .then((posts: PostRecord[]) => {
        if (!live) return;
        setMine(posts.map((post) => ({
          id: post.postId,
          type: post.contentType,
          title: firstLine(post.message),
          org: "Your organization",
          audience: post.protectedDetail ? "Verified audiences" : "As selected",
          body: post.message,
          state: "All states",
          category: "All",
          image: "/bridge-editorial/create-promotion-studio.webp",
          imageAlt: "",
          age: "Just now",
          mine: true,
        })));
      })
      .catch(() => { /* Signed out or the mock threw; the sample feed still renders. */ });
    return () => { live = false; };
  }, []);
  const sampleStates = useMemo(
    () => Array.from(new Set(items.map((item) => item.state))).sort(),
    [],
  );

  const allItems = useMemo(() => [...mine, ...items], [mine]);
  const visibleItems = useMemo(
    () => allItems.filter((item) => {
      if (category !== "All" && item.category !== category) return false;
      if (state !== "All states" && item.state !== state) return false;
      if (favoritesOnly && !social.favorites.includes(item.id)) return false;
      if (favoritesOnly && folder && !(social.collections[folder] ?? []).includes(item.id)) return false;
      if (followingOnly && !social.following.includes(item.org)) return false;
      return true;
    }),
    [allItems, category, favoritesOnly, folder, followingOnly, social.collections, social.favorites, social.following, state],
  );
  const noSampleForState = state !== "All states" && !sampleStates.includes(state) && visibleItems.length === 0;

  return (
    <div>
      <div className="visual-category-rail" aria-label="Filter Community News by cannabis category">
        {categories.map((item) => (
          <button aria-pressed={category === item} className="visual-category" key={item} onClick={() => setCategory(item)} type="button">
            <span className="category-thumb grain-image" aria-hidden="true" style={{ backgroundImage: `url(${categoryImageByName[item]})` }} />
            <strong>{item}</strong>
            {categoryNoteByName[item] ? <span className="category-note">{categoryNoteByName[item]}</span> : null}
          </button>
        ))}
      </div>

      <div className="feed-toolbar" aria-label="Community News controls">
        <div className="layout-toggle-group">
        <p className="experience-label" id="choose-your-experience">Choose your experience</p>
        <div className="layout-toggle" role="group" aria-labelledby="choose-your-experience">
          <button type="button" className={layout === "grid" ? "button primary" : "button secondary"} aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>Visual news</button>
          <button type="button" className={layout === "aligned" ? "button primary" : "button secondary"} aria-pressed={layout === "aligned"} onClick={() => setLayout("aligned")}>Aligned rows</button>
          <button type="button" className={layout === "classic" ? "button primary" : "button secondary"} aria-pressed={layout === "classic"} onClick={() => setLayout("classic")}>Classic feed</button>
        </div>
        </div>
        <label className="compact-control" htmlFor="community-state">
          Market
          <select id="community-state" value={state} onChange={(event) => setState(event.target.value)}>
            {US_STATE_OPTIONS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="check-row favorites-control"><input checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} type="checkbox" /><span>Saved only</span></label>
        <label className="check-row favorites-control"><input checked={followingOnly} onChange={(event) => setFollowingOnly(event.target.checked)} type="checkbox" /><span>Following only</span></label>
      </div>

      {/* Tori: "when a user saves a post, it can go under a specific folder
          like SAVED EVENTS, or SAVED DEALS or maybe they can custom their own".
          The chips only exist while Saved only is on, because outside that view
          they would filter against posts the member has not saved. */}
      {favoritesOnly && (
        <div className="folder-filter" role="group" aria-label="Filter saved posts by folder">
          <button
            type="button"
            className="folder-chip"
            aria-pressed={folder === null}
            onClick={() => setFolder(null)}
          >
            All saved<span className="folder-chip-count">{social.favorites.length}</span>
          </button>
          {collectionNames(social).map((name) => (
            <button
              key={name}
              type="button"
              className="folder-chip"
              aria-pressed={folder === name}
              onClick={() => setFolder(folder === name ? null : name)}
            >
              {name}<span className="folder-chip-count">{collectionCount(name, social)}</span>
            </button>
          ))}
        </div>
      )}

      <p className="review-notice">Heads up: this is a review build. The posts below are sample content, not live activity. Filters, layouts and saving all work for real.</p>
      <p className="handwrite">what the industry actually sounds like</p>

      <p className="feed-sample-summary" aria-live="polite"><strong>{visibleItems.length}</strong> {visibleItems.length === 1 ? "post" : "posts"} · {sampleStates.length} sample markets so far · all 50 states + D.C. filterable</p>

      {noSampleForState ? (
        <div className="empty-state"><h3>Nothing here for {state} yet</h3><p>We&apos;ve only written sample posts for {sampleStates.join(", ")} so far. Empty here means we haven&apos;t caught up with {state}, not that it&apos;s quiet.</p></div>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state"><h3>Nothing saved yet</h3><p>Try a different market or category, or save a few posts you want to come back to.</p></div>
      ) : (
        <div className={`${layout === "grid" ? "news-grid" : layout === "aligned" ? "news-aligned" : "news-classic"} editorial-feed`} data-layout={layout}>
          {visibleItems.map((item) => {
            return (
              <article key={item.id} className="content-card news-card media-card">
                <div className="grain-image news-image">
                  <Image alt={item.imageAlt} fill sizes={layout === "grid" ? "(max-width: 720px) 100vw, 50vw" : "220px"} src={item.image} />
                </div>
                <div className="news-card-copy">
                  <div className="card-topline"><span className="status-chip">{item.type}</span><span className="tag">{item.audience}</span></div>
                  <p className="eyebrow">{item.mine ? "Published by you" : `${item.state} · ${item.category}`}</p>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.org} · {item.age}</p>
                  <p className="news-card-summary">{item.body}</p>
                  <div className="news-actions">
                    <PostActions postId={item.id} postTitle={item.title} />
                    <Link className="text-link" href="/explore">Explore related members</Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="form-hint">No paid placement in this feed. Nothing here is a live market claim.</p>
    </div>
  );
}
