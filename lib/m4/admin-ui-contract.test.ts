import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { showPublicSettings } from "./navigation.ts";
import { logoInitials } from "./profile-logo.ts";

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("platform administrators hide public Settings while normal users retain it", () => {
  assert.equal(showPublicSettings("authenticated", true), false);
  assert.equal(showPublicSettings("authenticated", false), true);
  assert.equal(showPublicSettings("unauthenticated", false), false);
});

test("Directory loading state is limited to active loading and preserves query state", () => {
  const directory = source("../../components/LiveDirectory.tsx");
  assert.match(directory, /\{loading && <p role="status">Loading directory/);
  // Loading ends only when a page for the current filter set arrives; pages for old filters are ignored.
  assert.match(directory, /const loading = !current/);
  assert.match(directory, /value\.key !== key \? value/);
  assert.match(directory, /serializeDirectoryQuery\(filters\)/);
  assert.match(directory, /const search = searchParams\.toString\(\)/);
  assert.match(directory, /if \(query !== search\) router\.replace/);
});

test("profile logo uses hidden-until-loaded image and initials fallback", () => {
  const logo = source("../../components/ProfileLogo.tsx");
  assert.equal(logoInitials("Evergreen Brand"), "EB");
  assert.match(logo, /setFailed\(true\); onLoadError\?\.\(\)/);
  assert.match(logo, /className=\{loaded \? "is-loaded" : ""\}/);
});

test("review reason editors render only after an action is selected", () => {
  const directory = source("../../components/AdminDirectoryReview.tsx");
  const licences = source("../../app/admin/verification/verification-client.tsx");
  assert.match(directory, /pending && pending\.action !== "approve"/);
  assert.match(licences, /pending\s*&&\s*pending\.action\s*!==\s*"verified"/);
  assert.match(directory, /Reason \(required\)/);
  assert.match(licences, /Reason \(required\)/);
});

test("notification cards expose contextual actions and read behavior", () => {
  const notifications = source("../../components/M4Notifications.tsx");
  assert.match(notifications, /item\.context\?\.organizationName/);
  assert.match(notifications, /item\.action\.label/);
  assert.match(notifications, /if \(!item\.readAt\) await m4Api\.markNotificationRead/);
  assert.match(notifications, /disabled=\{!!item\.readAt \|\| !!busy\}/);
  assert.match(notifications, /role=\{item\.action \? "link"/);
});

test("contact inbox displays sender first name and contact preference", () => {
  const inbox = source("../../components/M4ContactRequests.tsx");
  assert.match(inbox, /<strong>From:<\/strong> \{item\.firstName/);
  assert.match(inbox, /<strong>Contact preference:<\/strong> \{item\.contactPreference/);
});

test("Directory review deep links resolve the profile's current status queue", () => {
  const review = source("../../components/AdminDirectoryReview.tsx");
  const api = source("./api.ts");
  assert.match(review, /findAdminProfile\(targetProfileId\)/);
  assert.match(review, /setStatus\(result\.status\)/);
  assert.match(api, /for \(const status of \["pending_review", "approved", "correction_requested", "rejected", "suspended"\]/);
  assert.match(api, /if \(!page\.hasMore\) break/);
});

test("Directory review offers All while loading Pending Review by default", () => {
  const review = source("../../components/AdminDirectoryReview.tsx");
  assert.match(review, /\["", "pending_review", "approved", "correction_requested", "rejected", "suspended"\]/);
  assert.match(review, /useState<ProfileStatus \| "">\("pending_review"\)/);
  assert.match(review, /status \? \{ status \} : \{\}/);
});
