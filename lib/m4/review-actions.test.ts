import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessLicense, ProfileStatus } from "./api.ts";
import { actionReasonError, directoryActions, licenseActionLabel, licenseActions, licenseDisplayStatus } from "./review-actions.ts";

test("directory actions match every workflow status", () => {
  const expected: Record<ProfileStatus, string[]> = {
    draft: [], pending_review: ["approve", "request-correction", "reject"],
    correction_requested: [], approved: ["suspend"], rejected: [], suspended: []
  };
  for (const [status, actions] of Object.entries(expected)) assert.deepEqual(directoryActions(status as ProfileStatus), actions);
});

test("licence actions match every supported display status", () => {
  const fixture = (status: BusinessLicense["status"], reviewReason: string | null = null) => ({ status, reviewReason } as BusinessLicense);
  assert.deepEqual(licenseActions(fixture("pending")), ["verified", "correction_required", "rejected"]);
  assert.equal(licenseDisplayStatus(fixture("pending", "Correct the number")), "correction_requested");
  assert.deepEqual(licenseActions(fixture("pending", "Correct the number")), []);
  assert.deepEqual(licenseActions(fixture("verified")), ["suspended"]);
  for (const status of ["rejected", "suspended", "expired"] as const) assert.deepEqual(licenseActions(fixture(status)), []);
});

test("verified licence action says Suspend licence, never Suspended", () => {
  const verified = { status: "verified", reviewReason: null } as BusinessLicense;
  assert.deepEqual(licenseActions(verified), ["suspended"]);
  assert.equal(licenseActionLabel(licenseActions(verified)[0]!), "Suspend licence");
  assert.notEqual(licenseActionLabel("suspended"), "Suspended");
});

test("destructive and correction actions require a reason", () => {
  for (const action of ["request-correction", "reject", "suspend", "correction_required", "rejected", "suspended"] as const) assert.match(actionReasonError(action, "") ?? "", /reason/i);
  assert.equal(actionReasonError("approve", ""), null);
  assert.equal(actionReasonError("verified", ""), null);
});
