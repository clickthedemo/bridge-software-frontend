import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { putDirectoryLogo, validateDirectoryLogo } from "./logo-upload.ts";
import { m4Api, mergeSavedDirectoryProfile, type DirectoryProfile } from "./api.ts";

const workingProfile = (logoUrl: string | null, displayName = "Example"): DirectoryProfile => ({ slug: "example", displayName, summary: null, story: null, businessType: "brand", categories: [], city: null, state: null, region: null, publicContact: { email: null, phone: null }, license: null, links: [], logoUrl, status: "draft", hasPublishedVersion: true });

test("logo validation accepts supported images and rejects invalid or oversized files", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp"]) assert.equal(validateDirectoryLogo({ type, size: 1024 }), null);
  assert.match(validateDirectoryLogo({ type: "image/svg+xml", size: 1024 }) ?? "", /PNG, JPEG, or WebP/);
  assert.match(validateDirectoryLogo({ type: "image/png", size: 2 * 1024 * 1024 + 1 }) ?? "", /2 MiB/);
  assert.match(validateDirectoryLogo({ type: "image/png", size: 0 }) ?? "", /non-empty/);
  assert.match(validateDirectoryLogo(null) ?? "", /Choose a logo/);
});

test("logo API requests a contract, uploads bytes, then finalizes", { concurrency: false }, async () => {
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  const originalFetch = globalThis.fetch, originalXhr = globalThis.XMLHttpRequest, calls: string[] = [];
  class UploadRequest { status = 200; withCredentials = true; upload = {}; onload?: () => void; open(method: string, url: string) { calls.push(`${method} ${url}`); } setRequestHeader() {} send() { assert.equal(this.withCredentials, false); this.onload?.(); } }
  globalThis.XMLHttpRequest = UploadRequest as unknown as typeof XMLHttpRequest;
  globalThis.fetch = async (input, init) => {
    calls.push(`${init?.method ?? "GET"} ${String(input)}`);
    const body = String(input).endsWith("/upload")
      ? { upload: { signedUrl: "https://storage.example/signed", uploadId: "upload-1", requiredHeaders: { "Content-Type": "image/png" } } }
      : { profile: { slug: "example", displayName: "Example", summary: null, story: null, businessType: "brand", categories: [], city: null, state: null, region: null, publicContact: { email: null, phone: null }, license: null, links: [], logoUrl: "/api/v1/organizations/org/directory-profile/logo", status: "draft", hasPublishedVersion: true } };
    return new Response(JSON.stringify(body), { status: String(input).endsWith("/upload") ? 201 : 200, headers: { "content-type": "application/json" } });
  };
  try {
    await m4Api.uploadLogo("org", new File(["png"], "logo.png", { type: "image/png" }));
    assert.deepEqual(calls, [
      "POST https://api.example.test/api/v1/organizations/org/directory-profile/logo/upload",
      "PUT https://storage.example/signed",
      "POST https://api.example.test/api/v1/organizations/org/directory-profile/logo/complete",
    ]);
  } finally { globalThis.fetch = originalFetch; globalThis.XMLHttpRequest = originalXhr; delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; }
});

test("signed upload reports progress and surfaces storage failure", { concurrency: false }, async () => {
  const original = globalThis.XMLHttpRequest;
  class FakeRequest {
    static status = 200; status = FakeRequest.status; withCredentials = true; upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
    onerror?: () => void; onload?: () => void;
    open(method: string, url: string) { assert.equal(method, "PUT"); assert.equal(url, "https://storage.example/signed"); }
    setRequestHeader() {}
    send() { assert.equal(this.withCredentials, false); this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 }); this.onload?.(); }
  }
  globalThis.XMLHttpRequest = FakeRequest as unknown as typeof XMLHttpRequest;
  try {
    const progress: number[] = [];
    await putDirectoryLogo("https://storage.example/signed", { "Content-Type": "image/png" }, new File(["x"], "logo.png", { type: "image/png" }), (value) => progress.push(value));
    assert.deepEqual(progress, [50]);
    FakeRequest.status = 500;
    await assert.rejects(putDirectoryLogo("https://storage.example/signed", {}, new File(["x"], "logo.png")), /could not be uploaded/);
  } finally { globalThis.XMLHttpRequest = original; }
});

test("editor supports reviewed replacement and keeps contract data private", () => {
  const source = readFileSync(new URL("../../components/DirectoryEditor.tsx", import.meta.url), "utf8");
  assert.match(source, /Profile logo/); assert.match(source, /Prepare profile update/); assert.match(source, /Prepare logo replacement/);
  assert.match(source, /existing published logo will remain public/);
  assert.match(source, /profile\.status === "approved" && preparingUpdate/);
  assert.match(source, /selectedMembership\?\.role === "owner" \|\| selectedMembership\?\.role === "admin"/);
  assert.doesNotMatch(source, /signedUrl|uploadId|requiredHeaders/);
  assert.match(source, /Logo uploaded to working revision/);
  assert.match(source, /setUploadProgress\(0\)/);
  assert.match(source, /logoInput\.current\.value = ""/);
  assert.match(source, /getWorkingLogo/);
  assert.match(source, /working logo preview could not be displayed/);
});

test("working logo reload uses the credentialed protected endpoint and rejects broken images", { concurrency: false }, async () => {
  process.env.NEXT_PUBLIC_BRIDGE_API_BASE = "https://api.example.test";
  const original = globalThis.fetch; let credentials: RequestCredentials | undefined;
  try {
    globalThis.fetch = async (_input, init) => { credentials = init?.credentials; return new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }); };
    assert.equal((await m4Api.getWorkingLogo("org")).type, "image/png"); assert.equal(credentials, "include");
    globalThis.fetch = async () => new Response("broken", { status: 200, headers: { "content-type": "text/plain" } });
    await assert.rejects(m4Api.getWorkingLogo("org"), /could not be loaded/);
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_BRIDGE_API_BASE; }
});

test("upload finalization survives Save responses for unchanged and edited fields", () => {
  const finalized = workingProfile("/api/v1/organizations/org/directory-profile/logo");
  assert.equal(mergeSavedDirectoryProfile(finalized, workingProfile(null)).logoUrl, finalized.logoUrl);
  const edited = mergeSavedDirectoryProfile(finalized, workingProfile(null, "Edited name"));
  assert.equal(edited.displayName, "Edited name"); assert.equal(edited.logoUrl, finalized.logoUrl);
});

test("reload and a later login restore the working logo without changing the public snapshot", () => {
  const finalized = workingProfile("/api/v1/organizations/org/directory-profile/logo");
  assert.equal(mergeSavedDirectoryProfile(null, finalized).logoUrl, finalized.logoUrl);
  assert.equal(mergeSavedDirectoryProfile(null, finalized).logoUrl, finalized.logoUrl);
  assert.equal(finalized.hasPublishedVersion, true);
});

test("ordinary saves cannot clear a working logo; only the explicit delete method can", () => {
  const source = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  assert.equal(mergeSavedDirectoryProfile(workingProfile("/working/logo"), workingProfile(null)).logoUrl, "/working/logo");
  assert.match(source, /async deleteLogo/); assert.match(source, /method: "DELETE"/);
  assert.doesNotMatch(source.match(/async saveProfile[^\n]+/)?.[0] ?? "", /logo/);
});
