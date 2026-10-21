import type { Metadata } from "next";
import { AnnouncementsFeed } from "@/components/Phase5Engagement";

export const metadata: Metadata = { title: "Announcements — Bridge" };

export default function AnnouncementsPage() {
  return <div className="page shell"><header className="page-heading"><p className="eyebrow">Bridge updates</p><h1>Announcements</h1><p>Industry news and updates from the Bridge team.</p></header><AnnouncementsFeed /></div>;
}
