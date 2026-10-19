import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVerificationQueue } from "./verification-queue.ts";

const entry = {
  verificationCaseId: "case-1", verificationItemId: "item-1", organizationId: "org-1",
  organizationName: "Example", businessId: "business-1", businessLegalName: "Example LLC",
  itemType: "ein", status: "pending", verificationMethod: "manual",
  caseCreatedAt: "2026-09-01T12:00:00Z", caseSubmittedAt: "2026-09-02T12:00:00Z",
  itemCreatedAt: "2026-09-01T12:00:00Z", itemUpdatedAt: "2026-09-02T12:00:00Z", reviewedAt: null,
  einCheckState: "not_checked", einCheckMode: null, einLastCheckedAt: null,
  einSafeReason: null, einResponseCode: null, einProviderReference: null,
};

test("backend entries retain distinct item IDs, shared case IDs, and submitted timestamp", () => {
  const rows = normalizeVerificationQueue({ entries: [entry, { ...entry, verificationItemId: "item-2", itemType: "document", caseSubmittedAt: null }] });
  assert.deepEqual(rows.map(({ id, caseId, submittedAt }) => ({ id, caseId, submittedAt })), [
    { id: "item-1", caseId: "case-1", submittedAt: entry.caseSubmittedAt },
    { id: "item-2", caseId: "case-1", submittedAt: null },
  ]);
  assert.deepEqual(normalizeVerificationQueue({ entries: [] }), []);
});

test("malformed queues cannot be mistaken for empty successful queues", () => {
  for (const payload of [null, {}, { items: [] }, { entries: [null] }, { entries: [{}] }, { entries: [entry, entry] }, { entries: [{ ...entry, caseSubmittedAt: "bad" }] }]) {
    assert.throws(() => normalizeVerificationQueue(payload), /response was invalid/);
  }
});
