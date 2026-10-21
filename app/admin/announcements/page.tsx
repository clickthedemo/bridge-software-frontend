import { AnnouncementManager } from "@/components/Phase5Engagement";

export default function AdminAnnouncementsPage() {
  return <><header className="page-heading"><p className="eyebrow">Bridge admin</p><h1>Announcements</h1><p>Publishing notifies every active member in the app. Archived announcements leave the public list.</p></header><AnnouncementManager /></>;
}
