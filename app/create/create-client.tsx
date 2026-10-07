"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { emptyPostModeValues, isPostModeValid, type PostModeId, type PostModeValues } from "@/lib/phase3/post-modes";
import { PostModeFields } from "@/components/PostModeFields";
import { PostModePicker } from "@/components/PostModePicker";
import {
  Phase3Error,
  audienceCatalog,
  reachCatalog,
  reachLabel,
  audienceLabel,
  applySimulatedFailure,
  applyUnverifiedOrganization,
  canCreatePromotion,
  canPublishPost,
  contentTypes,
  getPhase3Client,
  isPhase3LiveApi,
  resolveEffectiveAudiences,
  validateUploadFile,
  visiblePostsForView,
  type ContentType,
  type PostRecord,
  type SessionClaims,
  type UploadIntent,
} from "@/lib/phase3";

type PublishStatus = "idle" | "pending" | "success" | "error";
type SessionStatus = "loading" | "ready" | "error";
type UploadStatus = "idle" | "pending" | "accepted" | "error";

export function CreateClient() { return isPhase3LiveApi() ? <section className="content-card"><p className="eyebrow">Posting unavailable</p><h2>News and announcements are not connected yet</h2><p>The current backend does not provide a supported posts endpoint. Bridge will not send requests to the retired engagement API or pretend that a post was saved.</p></section> : <><p className="boundary-note">Preview mode · sample promotion tools</p><PreviewCreateClient /></>; }
function PreviewCreateClient() {
  const client = useMemo(() => getPhase3Client(), []);
  const [claims, setClaims] = useState<SessionClaims | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("loading");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [contentType, setContentType] = useState<ContentType>("Promotion");
  const [message, setMessage] = useState("");
  const [protectedDetail, setProtectedDetail] = useState(false);
  const [selected, setSelected] = useState<string[]>(["retailers"]);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadIntent | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [status, setStatus] = useState<PublishStatus>("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [unverifiedOrg, setUnverifiedOrg] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [creativeDirection, setCreativeDirection] = useState<"Signal" | "Product" | "Editorial">("Signal");
  const [reach, setReach] = useState<string>("everyone");
  const [postMode, setPostMode] = useState<PostModeId>("update");
  const [modeValues, setModeValues] = useState<PostModeValues>(() => emptyPostModeValues("update"));
  const [workflowMessage, setWorkflowMessage] = useState("");
  const uploadRequestId = useRef(0);

  const effectiveAudiences = useMemo(
    () => resolveEffectiveAudiences(selected, protectedDetail),
    [protectedDetail, selected],
  );
  const eligible = claims ? canCreatePromotion(claims) : false;
  const hasMessage = message.trim().length > 0;
  const uploadReady = file === null || (uploadStatus === "accepted" && upload !== null);
  const modeComplete = isPostModeValid(postMode, modeValues);
  const canPublish = eligible
    && modeComplete
    && canPublishPost(selected, protectedDetail, fileError)
    && hasMessage
    && uploadReady
    && uploadStatus !== "pending"
    && status !== "success"
    && status !== "pending";

  useEffect(() => {
    let cancelled = false;
    Promise.all([client.getSession(), client.listPosts()])
      .then(([session, listed]) => {
        if (cancelled) return;
        setClaims(session);
        setPosts(listed);
        setSessionStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSessionStatus("error");
        setSessionError(error instanceof Phase3Error ? error.userMessage : "The session could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function requestUpload(next: File) {
    const requestId = ++uploadRequestId.current;
    setUpload(null);
    setUploadStatus("pending");
    setFileError(null);
    try {
      applySimulatedFailure(client, simulateFailure);
      if (simulateFailure) setSimulateFailure(false);
      const intent = await client.createUploadIntent(next);
      if (requestId !== uploadRequestId.current) return;
      setUpload(intent);
      setUploadStatus("accepted");
    } catch (error: unknown) {
      if (requestId !== uploadRequestId.current) return;
      setUploadStatus("error");
      setFileError(error instanceof Phase3Error ? error.userMessage : "The upload could not be accepted.");
    }
  }

  async function onFile(next: File | null) {
    uploadRequestId.current += 1;
    setFileError(null);
    setFileMeta(null);
    setFile(null);
    setUpload(null);
    setUploadStatus("idle");
    if (!next) return;
    const problem = validateUploadFile(next);
    if (problem) {
      setFileError(problem);
      return;
    }
    setFile(next);
    setFileMeta({ name: next.name, size: next.size });
    await requestUpload(next);
  }

  function toggleAudience(id: string) {
    if (protectedDetail && id === "adults") return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  function resetComposer() {
    uploadRequestId.current += 1;
    setContentType("Promotion");
    setMessage("");
    setProtectedDetail(false);
    setSelected(["retailers"]);
    setFileMeta(null);
    setFile(null);
    setFileError(null);
    setUpload(null);
    setUploadStatus("idle");
    setStatus("idle");
    setPublishError(null);
    setPublishedId(null);
    setCreativeDirection("Signal");
    setWorkflowMessage("");
  }

  function saveLocally(kind: "draft" | "library") {
    const record = {
      contentType,
      message,
      protectedDetail,
      audienceIds: effectiveAudiences,
      reach,
      postMode,
      modeValues,
      fileName: fileMeta?.name ?? null,
      creativeDirection,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(`bridge-create-${kind}`, JSON.stringify(record));
    setWorkflowMessage(kind === "draft" ? "Draft saved on this device." : "Creative saved to the prototype library.");
  }

  function routeForReview() {
    if (!message.trim()) {
      setWorkflowMessage("Add a message before routing this promotion for review.");
      return;
    }
    saveLocally("draft");
    setWorkflowMessage("Promotion routed to the prototype review queue. Production review notifications still require the live API.");
  }

  function downloadPreview() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) return;
    const palettes = {
      Signal: ["#09060d", "#7900c9", "#ff7968"],
      Product: ["#17111e", "#3b0064", "#b983ff"],
      Editorial: ["#0d0812", "#6500a8", "#f7f2fb"],
    } as const;
    const [background, accent, text] = palettes[creativeDirection];
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = accent;
    context.beginPath();
    context.arc(970, 210, 270, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = text;
    context.font = "800 54px Arial";
    context.fillText("BRIDGE", 92, 120);
    context.font = "700 32px Arial";
    context.fillText(creativeDirection.toUpperCase(), 92, 180);
    context.font = "700 58px Arial";
    const words = (message.trim() || "Your promotion preview").split(/\s+/);
    let line = "";
    let y = 490;
    for (const word of words) {
      const test = `${line}${word} `;
      if (context.measureText(test).width > 930 && line) {
        context.fillText(line.trim(), 92, y);
        line = `${word} `;
        y += 78;
      } else {
        line = test;
      }
    }
    context.fillText(line.trim(), 92, y);
    context.font = "500 28px Arial";
    context.fillText(`Audience: ${effectiveAudiences.map(audienceLabel).join(", ") || "Not selected"}`, 92, 1080);
    const anchor = document.createElement("a");
    anchor.download = `bridge-${creativeDirection.toLowerCase()}-promotion.png`;
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
    setWorkflowMessage("PNG preview downloaded.");
  }

  async function reloadSession() {
    setSessionStatus("loading");
    setSessionError(null);
    try {
      const [session, listed] = await Promise.all([client.getSession(), client.listPosts()]);
      setClaims(session);
      setPosts(listed);
      setSessionStatus("ready");
    } catch (error: unknown) {
      setSessionStatus("error");
      setSessionError(error instanceof Phase3Error ? error.userMessage : "The session could not be loaded.");
    }
  }

  async function publish() {
    if (!canPublish) return;
    setStatus("pending");
    setPublishError(null);
    try {
      applySimulatedFailure(client, simulateFailure);
      if (simulateFailure) setSimulateFailure(false);
      const post = await client.createPost({
        contentType,
        message,
        uploadId: upload?.uploadId ?? null,
        audienceIds: effectiveAudiences,
        protectedDetail,
      });
      setPublishedId(post.postId);
      setPosts((current) => [post, ...current.filter((item) => item.postId !== post.postId)]);
      setStatus("success");
      try {
        setPosts(await client.listPosts());
      } catch {
        setPublishError("Promotion published, but the promotion list could not refresh. Do not publish it again; refresh the page instead.");
      }
    } catch (error: unknown) {
      setStatus("error");
      setPublishError(error instanceof Phase3Error ? error.userMessage : "The promotion could not be published.");
    }
  }

  const visiblePosts = visiblePostsForView(posts, "protected");

  if (sessionStatus === "loading") {
    return <p className="form-hint" aria-busy="true">Loading creator session…</p>;
  }

  if (sessionStatus === "error") {
    return <p className="form-error" role="alert">{sessionError}</p>;
  }

  return (
    <div className="create-layout">
      <form className="content-card create-form" onSubmit={(event) => { event.preventDefault(); void publish(); }}>
        {!eligible && (
          <p className="form-error" role="alert">
            This account cannot create promotions until membership is active and the organization is verified.
          </p>
        )}
        {status === "success" && (
          <p className="status-chip verified" role="status">
            Promotion accepted{publishedId ? ` · ${publishedId}` : ""}. Access is limited to {effectiveAudiences.map(audienceLabel).join(", ")}.
          </p>
        )}
        <label htmlFor="content-type">Content type</label>
        <select
          disabled={!eligible || status === "pending" || status === "success"}
          id="content-type"
          value={contentType}
          onChange={(event) => setContentType(event.target.value as ContentType)}
        >
          {contentTypes.filter((type) => type === "Promotion").map((type) => <option key={type}>{type}</option>)}
        </select>
        <PostModePicker
          disabled={!eligible || status === "pending" || status === "success"}
          onChange={(next) => { setPostMode(next); setModeValues(emptyPostModeValues(next)); }}
          value={postMode}
        />
        <PostModeFields
          disabled={!eligible || status === "pending" || status === "success"}
          mode={postMode}
          onChange={setModeValues}
          values={modeValues}
        />
        <label htmlFor="message">Message</label>
        <textarea
          disabled={!eligible || status === "pending" || status === "success"}
          id="message"
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Describe the offer or update"
        />
        <fieldset className="creative-directions">
          <legend>Choose a creative direction</legend>
          <p className="form-hint">Three Bridge routes use the same approved purple identity with a different information emphasis.</p>
          <div className="direction-choice-grid">
            {(["Signal", "Product", "Editorial"] as const).map((direction) => (
              <button aria-pressed={creativeDirection === direction} className={`direction-choice direction-${direction.toLowerCase()}`} key={direction} onClick={() => setCreativeDirection(direction)} type="button">
                <strong>{direction}</strong>
                <span>{direction === "Signal" ? "Fast promotion and audience" : direction === "Product" ? "Product first merchandising" : "News and education framing"}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <label htmlFor="asset">I already have an image or PDF. Upload it here.</label>
        <input
          disabled={!eligible || status === "pending" || status === "success"}
          id="asset"
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
          onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
        />
        {fileMeta && <p className="form-hint">Selected: <strong>{fileMeta.name}</strong> ({Math.round(fileMeta.size / 1024)} KB)</p>}
        {uploadStatus === "pending" && <p className="form-hint" aria-busy="true">Requesting upload intent…</p>}
        {upload && <p className="form-hint">Upload intent accepted: {upload.uploadId}</p>}
        {fileError && <p className="form-error" role="alert">{fileError}</p>}
        {uploadStatus === "error" && file && (
          <button className="button secondary" type="button" onClick={() => void requestUpload(file)}>
            Retry upload intent
          </button>
        )}
        <fieldset className="audience-fieldset">
          <legend>Who do you want to see this?</legend>
          {reachCatalog.map((item) => (
            <label key={item.id} className="check-row">
              <input type="radio" name="post-reach" checked={reach === item.id} disabled={!eligible || status === "pending" || status === "success"} onChange={() => setReach(item.id)} />
              <span>{item.label} <span className="muted">· {item.hint}</span></span>
            </label>
          ))}
          <p className="form-hint">Reach is who you are talking to. The 21+ and verified-access rules below still apply on top of it.</p>
        </fieldset>

        <fieldset className="audience-fieldset">
          <legend>Access rules</legend>
          {audienceCatalog.map((audience) => {
            const disabled = !eligible || status === "pending" || status === "success" || (protectedDetail && audience.id === "adults");
            const checked = effectiveAudiences.includes(audience.id);
            return (
              <label key={audience.id} className="check-row">
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleAudience(audience.id)} />
                <span>{audience.label}{protectedDetail && audience.id === "adults" ? " (removed while protected detail is on)" : ""}</span>
              </label>
            );
          })}
        </fieldset>
        <label className="check-row">
          <input
            type="checkbox"
            checked={protectedDetail}
            disabled={!eligible || status === "pending" || status === "success"}
            onChange={(event) => {
              setProtectedDetail(event.target.checked);
              if (event.target.checked) setSelected((prev) => prev.filter((id) => id !== "adults"));
            }}
          />
          <span>Include protected wholesale / business-only detail</span>
        </label>
        {protectedDetail && <p className="form-hint">Protected detail limits this post to verified audiences. Adults 21+ is disabled.</p>}
        {publishError && <p className="form-error" role="alert">{publishError}</p>}
        <div className="create-workflow-actions">
          <button className="button secondary" onClick={() => saveLocally("draft")} type="button">Save draft</button>
          <button className="button secondary" onClick={() => saveLocally("library")} type="button">Save to library</button>
          <button className="button secondary" onClick={routeForReview} type="button">Route for review</button>
          <button className="button secondary" onClick={downloadPreview} type="button">Download PNG</button>
        </div>
        <p aria-live="polite" className="form-hint">{workflowMessage || "Draft, library, review, and download actions remain on this device until the production API is connected."}</p>
        {status === "success" ? (
          <button className="button secondary full" type="button" onClick={resetComposer}>Create another promotion</button>
        ) : (
          <button className="button primary full" type="submit" disabled={!canPublish}>
            {status === "pending" ? "Publishing…" : canPublish ? "Publish promotion" : "Publish unavailable"}
          </button>
        )}
        {!canPublish && status !== "success" && (
          <p className="form-hint">Publish requires an eligible creator, a message, at least one eligible audience, and a finished upload when a file is attached.</p>
        )}
        {!isPhase3LiveApi() && (
          <details className="demo-controls">
            <summary>Phase 3 adapter controls</summary>
            <label className="check-row">
              <input checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} type="checkbox" />
              Simulate a network failure
            </label>
            <label className="check-row">
              <input
                checked={unverifiedOrg}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setUnverifiedOrg(enabled);
                  applyUnverifiedOrganization(client, enabled);
                  void reloadSession();
                }}
                type="checkbox"
              />
              Use an unverified organization
            </label>
            <p className="form-hint">Using the in-memory adapter. Server authorization is still required in production.</p>
          </details>
        )}
      </form>
      <aside className="content-card create-preview" aria-live="polite">
        <p className="eyebrow">Preview</p>
        <h3>{contentType}</h3>
        <p className="status-chip">{creativeDirection} direction</p>
        <p>{message || "Message preview appears here."}</p>
        {fileMeta && <p className="muted">Asset: {fileMeta.name}</p>}
        <p className="muted">Reach: {reachLabel(reach)} · Access level: {protectedDetail ? "Verified audiences only" : "As selected"}</p>
        <div className="tag-row">
          {effectiveAudiences.length === 0
            ? <span className="tag">No eligible audience</span>
            : effectiveAudiences.map((id) => <span className="tag" key={id}>{audienceLabel(id)}</span>)}
        </div>
        <p className="form-hint">
          {isPhase3LiveApi() ? "Publishing through the live /api/v1 contract." : "Phase 3 mock adapter. Server authorization is required in production."}
        </p>
      </aside>
      <section className="content-card published-feed" aria-live="polite">
        <p className="eyebrow">Persisted promotions</p>
        <h3>Multi-audience records stay on this organization</h3>
        {visiblePosts.length === 0 ? (
          <p className="muted">No promotions recorded yet. Publish one to see audience persistence here and on My Profile.</p>
        ) : (
          visiblePosts.map((post) => (
            <article className="published-item" key={post.postId}>
              <h4>{post.contentType} · {post.postId}</h4>
              <p>{post.message}</p>
              <p className="muted">{post.protectedDetail ? "Verified audiences only" : "As selected"}</p>
              <div className="tag-row">
                {post.audienceIds.map((id) => <span className="tag" key={id}>{audienceLabel(id)}</span>)}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
