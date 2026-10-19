export type VerificationQueueRow = {
  id: string;
  caseId: string;
  organization: string;
  businessName: string;
  itemType: string;
  status: string;
  submittedAt: string | null;
  checkState: "not_checked" | "checking" | "match" | "no_match" | "incomplete" | "manual_review" | "unavailable";
  checkMode: "mock" | "live" | null;
  lastCheckedAt: string | null;
  safeReason: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeVerificationQueue(payload: unknown): VerificationQueueRow[] {
  const entries = record(payload)?.entries;
  const invalid = () => new Error("The verification queue response was invalid. Please try again.");
  if (!Array.isArray(entries)) throw invalid();
  const ids = new Set<string>();
  return entries.map((value) => {
    const item = record(value);
    if (!item) throw invalid();
    const { verificationItemId, verificationCaseId, organizationName, businessLegalName, itemType, status, caseSubmittedAt, einCheckState, einCheckMode, einLastCheckedAt, einSafeReason } = item;
    if (![verificationItemId, verificationCaseId, organizationName, businessLegalName, itemType, status].every((field) => typeof field === "string" && field.trim())) throw invalid();
    if (caseSubmittedAt !== null && (typeof caseSubmittedAt !== "string" || !Number.isFinite(Date.parse(caseSubmittedAt)))) throw invalid();
    const states = ["not_checked", "checking", "match", "no_match", "incomplete", "manual_review", "unavailable"];
    if (!states.includes(String(einCheckState)) || (einCheckMode !== null && einCheckMode !== "mock" && einCheckMode !== "live")) throw invalid();
    if (einLastCheckedAt !== null && (typeof einLastCheckedAt !== "string" || !Number.isFinite(Date.parse(einLastCheckedAt)))) throw invalid();
    if (einSafeReason !== null && typeof einSafeReason !== "string") throw invalid();
    const id = verificationItemId as string;
    if (ids.has(id)) throw invalid();
    ids.add(id);
    return { id, caseId: verificationCaseId as string, organization: organizationName as string, businessName: businessLegalName as string, itemType: itemType as string, status: status as string, submittedAt: caseSubmittedAt as string | null, checkState: einCheckState as VerificationQueueRow["checkState"], checkMode: einCheckMode as VerificationQueueRow["checkMode"], lastCheckedAt: einLastCheckedAt as string | null, safeReason: einSafeReason as string | null };
  });
}
