import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { directoryActions } from "./review-actions.ts";

const directory = readFileSync(new URL("../../components/AdminDirectoryReview.tsx", import.meta.url), "utf8");
const verification = readFileSync(new URL("../../app/admin/verification/ein-verification-queue.tsx", import.meta.url), "utf8");
const licenses = readFileSync(new URL("../../app/admin/verification/verification-client.tsx", import.meta.url), "utf8");
const contacts = readFileSync(new URL("../../components/M4ContactRequests.tsx", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../../components/M4Notifications.tsx", import.meta.url), "utf8");

test("admin notification destinations consume their exact resource identifiers", () => {
  assert.match(directory, /get\("profileId"\)/);
  assert.match(verification, /get\("verificationItemId"\)/);
  assert.match(licenses, /get\("licenseId"\)/);
  assert.match(contacts, /get\("requestId"\)/);
  assert.doesNotMatch(verification, /get\("profileId"\)/);
});

test("destination pages locate filtered records and report unavailable deep links", () => {
  assert.match(directory, /findAdminProfile\(targetProfileId\)/);
  assert.match(verification, /for \(const candidateStatus of statuses\.slice\(1\)\)/);
  assert.match(licenses, /listAdminBusinessLicenses\(\)/);
  assert.match(contacts, /inboundContactRequest\(targetId\)/);
  for (const source of [directory, verification, licenses, contacts]) assert.match(source, /referenced .* unavailable|referenced .* could not be loaded/i);
});

test("opening a notification preserves mark-as-read before navigation", () => {
  assert.match(notifications, /if \(!item\.readAt\) await m4Api\.markNotificationRead\(item\.id\)/);
  assert.match(notifications, /finally \{ setBusy\(""\); router\.push\(item\.action\.href\); \}/);
});

test("Directory cards are clickable, keyboard operable, and expose selection state", () => {
  assert.match(directory, /className={`admin-review-card admin-directory-card/);
  assert.match(directory, /role="button" tabIndex={0}/);
  assert.match(directory, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(directory, /aria-expanded={selected}/);
});

test("Directory details contain every safe field supported by the queue contract", () => {
  for (const label of ["Directory profile details", "Organization", "Business", "Workflow status", "Eligibility", "Submitted", "Updated", "Summary", "Story", "Categories", "Links", "Location", "Public contact", "Licence summary", "Eligibility checks", "Status summary"]) assert.match(directory, new RegExp(label));
  assert.match(directory, /Open current published profile/);
  assert.match(directory, /ProfileLogo/);
  assert.doesNotMatch(directory, /encrypted|storage_path|signedUrl|accessToken|fullEin/i);
});

test("Directory actions exactly match the supported backend state machine", () => {
  assert.deepEqual(directoryActions("pending_review"), ["approve", "request-correction", "reject"]);
  assert.deepEqual(directoryActions("approved"), ["suspend"]);
  for (const status of ["draft", "correction_requested", "rejected", "suspended"] as const) assert.deepEqual(directoryActions(status), []);
});
