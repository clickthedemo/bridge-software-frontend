import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveDirectoryDetail } from "@/components/LiveDirectory";
import { isPhase3LiveApi } from "@/lib/phase3";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactRequestForm } from "@/components/ContactRequestForm";
import { StatusChip } from "@/components/StatusChip";
import { getProfile, profiles } from "@/lib/data";

type ProfilePageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return profiles.map((profile) => ({ slug: profile.slug }));
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = isPhase3LiveApi() ? null : getProfile(slug);
  return { title: profile ? `${profile.name} — Bridge` : isPhase3LiveApi() ? "Member profile — Bridge" : "Member not found — Bridge" };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { slug } = await params;
  const profile = isPhase3LiveApi() ? null : getProfile(slug);
  if (isPhase3LiveApi()) return <Suspense fallback={<p role="status">Loading profile…</p>}><LiveDirectoryDetail key={slug} identifier={slug} /></Suspense>;
  if (!profile) notFound();

  return (
    <section className="page shell profile-page">
      <Link className="text-link back-link" href="/explore">← Back to Explore</Link>
      <div className="profile-hero">
        <div className="profile-identity">
          <span className="avatar xlarge" aria-hidden="true">{profile.initials}</span>
          <div>
            <p className="eyebrow">{profile.role}</p>
            <h1>{profile.name}</h1>
            <p>{profile.location} · {profile.serving}</p>
          </div>
        </div>
        <StatusChip verified={profile.verified} />
      </div>
      <nav className="profile-utility-bar" aria-label={`${profile.name} utilities`}>
        {profile.menuItems && <a href="#live-menu">View live menu</a>}
        {profile.orderProvider && <a href="#order-online">Order online</a>}
        <a href={`https://maps.apple.com/?q=${encodeURIComponent(`${profile.name} ${profile.location}`)}`} rel="noreferrer" target="_blank">Directions</a>
        <a href="#recent-activity">Recent activity</a>
      </nav>
      <div className="profile-layout">
        <article className="content-card">
          {profile.imageSrc && (
            <div className="grain-image profile-feature-image">
              <Image alt={profile.imageAlt ?? ""} fill priority sizes="(max-width: 980px) 100vw, 760px" src={profile.imageSrc} />
            </div>
          )}
          <h2>About {profile.name}</h2>
          <p className="lede small">{profile.about}</p>
          {profile.marketSignal && <div className="profile-signal"><p className="eyebrow">Current market signal</p><strong>{profile.marketSignal}</strong></div>}
          <h3>What we are looking for</h3>
          <div className="tag-row">
            {profile.lookingFor.map((item) => <span className="tag" key={item}>{item}</span>)}
          </div>
          {profile.products && (
            <>
              <h3>Products and capabilities</h3>
              <div className="tag-row">{profile.products.map((item) => <span className="tag" key={item}>{item}</span>)}</div>
            </>
          )}
          {profile.menuItems && (
            <section className="profile-subsection" id="live-menu">
              <p className="eyebrow">Live menu preview</p>
              <h3>What customers can find now</h3>
              <div className="menu-list">{profile.menuItems.map((item) => <div key={item}><strong>{item}</strong><span>Available in the prototype menu</span></div>)}</div>
              <p className="form-hint">Production inventory requires the approved menu provider.</p>
            </section>
          )}
          {profile.orderProvider && (
            <section className="profile-subsection" id="order-online">
              <p className="eyebrow">Order online</p>
              <h3>Continue through {profile.orderProvider}</h3>
              <p>The final Bridge profile can send customers directly into the dispensary ordering provider. No order is placed in this prototype.</p>
              <button className="button primary" disabled type="button">Ordering connection pending</button>
            </section>
          )}
          {profile.channels && (
            <section className="profile-subsection">
              <p className="eyebrow">Outside channels</p>
              <h3>Keep the full relationship connected</h3>
              <div className="channel-row">{profile.channels.map((channel) => <button className="button secondary" disabled key={channel} type="button">{channel}</button>)}</div>
              <p className="form-hint">Profile owners provide their approved channel URLs before production launch.</p>
            </section>
          )}
          {profile.recentActivity && (
            <section className="profile-subsection" id="recent-activity">
              <p className="eyebrow">Recent activity</p>
              <h3>What this member is doing on Bridge</h3>
              <div className="activity-list">{profile.recentActivity.map((item) => <div key={item.title}><strong>{item.title}</strong><span>{item.meta}</span></div>)}</div>
            </section>
          )}
          {profile.announcement && (
            <>
              <h3>Recent announcement</h3>
              <div className="announcement">
                <span className="signal-dot" />
                <div>
                  <strong>{profile.announcement.title}</strong>
                  <p>{profile.announcement.body}</p>
                </div>
              </div>
            </>
          )}
        </article>
        <aside className="contact-card" id="contact-request" tabIndex={-1}>
          <ContactRequestForm profileName={profile.name} profileSlug={profile.slug} />
        </aside>
      </div>
    </section>
  );
}
