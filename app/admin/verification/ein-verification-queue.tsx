"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getPhase3Client, isPhase3LiveApi, Phase3Error } from "@/lib/phase3";
import { normalizeVerificationQueue, type VerificationQueueRow } from "@/lib/phase3/verification-queue";
import { useNotificationFocus } from "@/lib/m4/notification-focus";

const outcomes = ["match", "invalid_tin", "tin_not_issued", "name_mismatch", "invalid_request", "duplicate", "manual_review_6", "manual_review_7", "manual_review_8", "unavailable", "pending", "in_review"] as const;
const statuses = ["", "pending", "in_review", "verification_requested", "verified", "rejected", "correction_required", "not_applicable"] as const;
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const checkLabel: Record<VerificationQueueRow["checkState"], string> = { not_checked: "Not checked", checking: "Checking", match: "Match", no_match: "No match", incomplete: "Incomplete", manual_review: "Manual review", unavailable: "Unavailable" };

export function VerificationQueue() {
  const client = useMemo(() => getPhase3Client(), []), targetId = useSearchParams().get("verificationItemId");
  const [rows, setRows] = useState<VerificationQueueRow[]>([]), [status, setStatus] = useState(""), [itemType, setItemType] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [targetError, setTargetError] = useState(""), [notice, setNotice] = useState(""), [reload, setReload] = useState(0);
  const [mode, setMode] = useState<"mock" | "live">("live"), [mockOutcome, setMockOutcome] = useState<(typeof outcomes)[number]>("match"), [busyId, setBusyId] = useState<string | null>(null);
  useNotificationFocus("verificationItemId", rows.map((item) => item.id), ".verification-row");

  useEffect(() => {
    if (!targetId) return;
    let active = true;
    void (async () => {
      setTargetError("");
      for (const candidateStatus of statuses.slice(1)) {
        const entries = normalizeVerificationQueue(await client.getVerificationQueue({ status: candidateStatus, limit: 100 }));
        const item = entries.find((entry) => entry.id === targetId);
        if (item) { if (active) { setStatus(item.status); setItemType(item.itemType); setRows(entries); } return; }
      }
      if (active) setTargetError("The referenced verification record is unavailable or you no longer have access.");
    })().catch(() => { if (active) setTargetError("The referenced verification record could not be loaded."); });
    return () => { active = false; };
  }, [client, targetId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      client.getVerificationQueue({ status: status || undefined, itemType: itemType || undefined, limit: 100 })
        .then((response) => { if (active) setRows(normalizeVerificationQueue(response)); })
        .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "The verification queue could not be loaded."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [client, status, itemType, reload]);

  async function runCheck(item: VerificationQueueRow) {
    if (mode === "live" && !window.confirm("Run a live Cobalt TIN lookup? This consumes trial credit.")) return;
    setBusyId(item.id); setError(""); setNotice("");
    try {
      await client.runEinCheck(item.id, mode, mode === "mock" ? mockOutcome : undefined);
      setReload((value) => value + 1);
      setNotice(mode === "mock" ? "Mock test completed without contacting Cobalt. Review the refreshed result before approving." : "Live EIN check completed. Review the refreshed result before approving.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The EIN check could not be completed."); }
    finally { setBusyId(null); }
  }

  async function review(item: VerificationQueueRow, decision: "verified" | "rejected" | "correction_required") {
    if (decision === "verified" && !window.confirm(`Approve ${item.businessName}?`)) return;
    if (decision === "rejected" && !window.confirm(`Reject ${item.businessName}?`)) return;
    const reason = decision === "verified" ? "" : window.prompt(decision === "correction_required" ? "Correction reason" : "Rejection reason", item.safeReason ?? "")?.trim();
    if (decision !== "verified" && !reason) return;
    setBusyId(item.id); setError("");
    try { await client.reviewVerificationItem(item.id, decision, item.updatedAt, reason); setNotice("Verification review saved."); setReload((value) => value + 1); }
    catch (caught) {
      if (caught instanceof Phase3Error && caught.code === "conflict") setReload((value) => value + 1);
      setError(caught instanceof Error ? caught.message : "The review could not be saved.");
    } finally { setBusyId(null); }
  }

  return <section className="admin-review-stack"><div className="admin-section-heading"><div><h2>Verification cases</h2><p>Identity and supporting-document reviews.</p></div><span className="status-chip pending">{isPhase3LiveApi() ? "Live API" : "Preview"}</span></div><section className="admin-content-card admin-user-filters"><label>Status<select value={status} onChange={(event) => { setError(""); setStatus(event.target.value); }}>{statuses.map((value) => <option key={value || "active"} value={value}>{value ? label(value) : "Active queue"}</option>)}</select></label><label>Item type<select value={itemType} onChange={(event) => { setError(""); setItemType(event.target.value); }}><option value="">All types</option><option value="ein">EIN</option></select></label><label>EIN lookup<select value={mode} onChange={(event) => setMode(event.target.value as "mock" | "live")}><option value="live">Live lookup</option><option value="mock">Mock test mode (development and staging only; never counts as verified in production)</option></select></label>{mode === "mock" && <label>Mock outcome<select value={mockOutcome} onChange={(event) => setMockOutcome(event.target.value as typeof mockOutcome)}>{outcomes.map((outcome) => <option key={outcome} value={outcome}>{label(outcome)}</option>)}</select></label>}</section>{notice && <p className="success-message">{notice}</p>}{targetError && <p className="form-error" role="alert">{targetError}</p>}{error && <p className="form-error" role="alert">{error}</p>}{loading && <p role="status">Loading verification queue…</p>}{!loading && <div className="table-scroll"><table><thead><tr><th>Organization / business</th><th>Type</th><th>Check status</th><th>Last checked</th><th>Actions</th></tr></thead><tbody>{rows.map((item) => { const isEin = item.itemType === "ein", canRun = isEin && ["not_checked", "unavailable", "incomplete", "manual_review", "no_match"].includes(item.checkState), canCorrect = isEin && item.checkState === "no_match"; return <tr className="verification-row" id={`verification-${item.id}`} key={item.id}><td><strong>{item.organization}</strong><br/><span>{item.businessName}</span></td><td>{label(item.itemType)}</td><td><span className={`status-chip ${item.checkState === "match" ? "verified" : item.checkState === "no_match" || item.checkState === "unavailable" ? "warning" : "pending"}`}>{checkLabel[item.checkState]}</span>{item.checkMode && <><br/><small>{item.checkMode === "mock" ? "Mock test mode" : "Live lookup"}</small></>}{item.safeReason && <p className="form-hint">{item.safeReason}</p>}</td><td>{item.lastCheckedAt ? new Date(item.lastCheckedAt).toLocaleString() : "—"}</td><td><div className="button-row">{canRun && <button className="button secondary" disabled={busyId === item.id} onClick={() => void runCheck(item)}>Run check</button>}{item.checkState === "match" && <button className="button primary" disabled={busyId === item.id} onClick={() => void review(item, "verified")}>Approve</button>}{canCorrect && <><button className="button primary" onClick={() => void review(item, "correction_required")}>Request correction</button><button className="button secondary" onClick={() => void review(item, "rejected")}>Reject</button></>}</div></td></tr>; })}{!rows.length && <tr><td colSpan={5}>No verification cases match these filters.</td></tr>}</tbody></table></div>}</section>;
}
