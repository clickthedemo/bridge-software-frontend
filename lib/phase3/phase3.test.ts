import assert from "node:assert/strict";
import test from "node:test";
import {
  canCreatePromotion,
  canPublishPost,
  canViewProtectedProfile,
  resolveEffectiveAudiences,
  validateContacts,
  validateUploadFile,
  visiblePostsForView,
} from "./audiences.ts";
import { HttpPhase3Client } from "./http-client.ts";
import { MockPhase3Client, mockHarborClaims } from "./mock-client.ts";
import { Phase3Error, type PostRecord } from "./types.ts";

test("protected detail removes Adults 21+ from the effective audience set", () => {
  assert.deepEqual(
    resolveEffectiveAudiences(["adults", "retailers", "adults"], true),
    ["retailers"],
  );
});

test("publish is blocked when no eligible audience remains", () => {
  assert.equal(canPublishPost(["adults"], true, null), false);
  assert.equal(canPublishPost(["retailers"], true, null), true);
  assert.equal(canPublishPost(["retailers"], false, "File exceeds 25 MB."), false);
});

test("upload validation accepts only the contracted file types and size", () => {
  const png = new File(["ok"], "promo.png", { type: "image/png" });
  assert.equal(validateUploadFile(png), null);

  const gif = new File(["no"], "promo.gif", { type: "image/gif" });
  assert.match(validateUploadFile(gif) ?? "", /Unsupported type/);

  const huge = new File(["ok"], "promo.png", { type: "image/png" });
  Object.defineProperty(huge, "size", { value: 25 * 1024 * 1024 + 1 });
  assert.match(validateUploadFile(huge) ?? "", /25 MB/);
});

test("verified dispensary with create_promotion can publish; unverified cannot", () => {
  assert.equal(canCreatePromotion(mockHarborClaims), true);
  assert.equal(
    canCreatePromotion({ ...mockHarborClaims, organizationVerificationState: "pending" }),
    false,
  );
  assert.equal(
    canViewProtectedProfile({ ...mockHarborClaims, delegatedPermissions: ["create_promotion"] }),
    false,
  );
});

test("mock promotion slice records an upload and a protected post", async () => {
  const client = new MockPhase3Client();
  const file = new File(["asset"], "menu.png", { type: "image/png" });
  const upload = await client.createUploadIntent(file);
  const post = await client.createPost({
    contentType: "Promotion",
    message: "Autumn flower special for verified retailers",
    uploadId: upload.uploadId,
    audienceIds: ["retailers"],
    protectedDetail: true,
  });
  assert.equal(post.moderationState, "published");
  assert.deepEqual(post.audienceIds, ["retailers"]);
  assert.equal(post.protectedDetail, true);
  const listed = await client.listPosts();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.postId, post.postId);
});

test("mock promotion slice rejects protected detail aimed at Adults 21+", async () => {
  const client = new MockPhase3Client();
  await assert.rejects(
    () => client.createPost({
      contentType: "Promotion",
      message: "Public wholesale price list",
      uploadId: null,
      audienceIds: ["adults"],
      protectedDetail: true,
    }),
    (error: unknown) => error instanceof Phase3Error && error.code === "validation",
  );
});

test("mock promotion slice rejects an empty message", async () => {
  const client = new MockPhase3Client();
  await assert.rejects(
    () => client.createPost({
      contentType: "Promotion",
      message: "   ",
      uploadId: null,
      audienceIds: ["retailers"],
      protectedDetail: false,
    }),
    (error: unknown) => error instanceof Phase3Error && error.code === "validation",
  );
});

test("promotion permission cannot publish Update or Event content", async () => {
  const client = new MockPhase3Client();
  for (const contentType of ["Update", "Event"] as const) {
    await assert.rejects(
      () => client.createPost({
        contentType,
        message: `${contentType} cannot use the Promotion-only Phase 3 slice`,
        uploadId: null,
        audienceIds: ["retailers"],
        protectedDetail: false,
      }),
      (error: unknown) => error instanceof Phase3Error && error.code === "validation",
    );
  }
});

test("unverified organization cannot upload or publish", async () => {
  const client = new MockPhase3Client({
    claims: { ...mockHarborClaims, organizationVerificationState: "unverified" },
  });
  const file = new File(["asset"], "menu.png", { type: "image/png" });
  await assert.rejects(
    () => client.createUploadIntent(file),
    (error: unknown) => error instanceof Phase3Error && error.code === "forbidden",
  );
  await assert.rejects(
    () => client.createPost({
      contentType: "Promotion",
      message: "Should not publish",
      uploadId: null,
      audienceIds: ["retailers"],
      protectedDetail: false,
    }),
    (error: unknown) => error instanceof Phase3Error && error.code === "forbidden",
  );
});

test("protected profile projection hides contacts in public view and records confirmation", async () => {
  const now = new Date("2026-08-19T17:00:00.000Z");
  const client = new MockPhase3Client({ now: () => now });
  const publicView = await client.getProfileProjection("public");
  const protectedView = await client.getProfileProjection("protected");
  assert.equal(publicView.contacts.length, 0);
  assert.equal(protectedView.contacts.length, 2);
  assert.equal(protectedView.confirmation.status, "needed");

  const confirmation = await client.confirmContacts({ organizationId: "org-harbor" });
  assert.equal(confirmation.actorUserId, "user-harbor-owner");
  assert.equal(confirmation.nextDue, "2026-09-18T17:00:00.000Z");

  const after = await client.getProfileProjection("protected");
  assert.equal(after.confirmation.status, "confirmed");
  assert.equal(after.confirmation.confirmedAt, confirmation.confirmedAt);
});

test("contact updates persist in B2B view and stay hidden in public view", async () => {
  const client = new MockPhase3Client();
  const updated = await client.updateContacts({
    organizationId: "org-harbor",
    contacts: [
      {
        kind: "sales",
        name: "Avery Chen",
        email: "avery.chen@example-harbor.invalid",
        phone: "(410) 555-0101",
      },
      {
        kind: "accounting",
        name: "Riley Patel",
        email: "riley.patel@example-harbor.invalid",
        phone: "(410) 555-0102",
      },
    ],
  });
  assert.equal(updated.contacts[0]?.name, "Avery Chen");
  const publicView = await client.getProfileProjection("public");
  assert.equal(publicView.contacts.length, 0);
  const protectedView = await client.getProfileProjection("protected");
  assert.equal(protectedView.contacts[1]?.name, "Riley Patel");
});

test("contact updates require both sales and accounting details", () => {
  assert.match(
    validateContacts([{ kind: "sales", name: "Only Sales", email: "a@b.c", phone: "1" }]) ?? "",
    /sales contact and one accounting/,
  );
});

test("public projection hides protected promotions while B2B keeps them", () => {
  const posts: PostRecord[] = [
    {
      postId: "post-1",
      contentType: "Promotion",
      message: "Retailer wholesale",
      uploadId: null,
      audienceIds: ["retailers"],
      protectedDetail: true,
      moderationState: "published",
      createdAt: "2026-08-19T17:00:00.000Z",
    },
    {
      postId: "post-2",
      contentType: "Promotion",
      message: "Public special",
      uploadId: null,
      audienceIds: ["adults"],
      protectedDetail: false,
      moderationState: "published",
      createdAt: "2026-08-19T17:00:00.000Z",
    },
  ];
  assert.deepEqual(visiblePostsForView(posts, "protected").map((post) => post.postId), ["post-1", "post-2"]);
  assert.deepEqual(visiblePostsForView(posts, "public").map((post) => post.postId), ["post-2"]);
});

test("mock client maps a forced failure to a retryable unavailable error", async () => {
  const client = new MockPhase3Client({ failNext: true });
  await assert.rejects(
    () => client.getSession(),
    (error: unknown) => error instanceof Phase3Error && error.code === "unavailable",
  );
  const session = await client.getSession();
  assert.equal(session.userId, "user-harbor-owner");
});

async function withMockFetch(
  impl: typeof fetch,
  run: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("http client maps 401, 403, 422, and network failure to typed errors", async () => {
  const client = new HttpPhase3Client("https://api.example.invalid");

  await withMockFetch(async () => new Response("no", { status: 401 }), async () => {
    await assert.rejects(
      () => client.getSession(),
      (error: unknown) => error instanceof Phase3Error && error.code === "unauthenticated",
    );
  });

  await withMockFetch(async () => new Response("no", { status: 403 }), async () => {
    await assert.rejects(
      () => client.createPost({
        contentType: "Promotion",
        message: "Blocked",
        uploadId: null,
        audienceIds: ["retailers"],
        protectedDetail: false,
      }),
      (error: unknown) => error instanceof Phase3Error && error.code === "forbidden",
    );
  });

  await withMockFetch(async () => new Response("no", { status: 422 }), async () => {
    await assert.rejects(
      () => client.updateContacts({ organizationId: "org-harbor", contacts: [] }),
      (error: unknown) => error instanceof Phase3Error && error.code === "validation",
    );
  });

  await withMockFetch(async () => {
    throw new TypeError("Failed to fetch");
  }, async () => {
    await assert.rejects(
      () => client.listPosts(),
      (error: unknown) => error instanceof Phase3Error && error.code === "unavailable",
    );
  });
});

test("http client returns JSON from a successful session read", async () => {
  await withMockFetch(async () => new Response(JSON.stringify(mockHarborClaims), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }), async () => {
    const client = new HttpPhase3Client("https://api.example.invalid");
    const session = await client.getSession();
    assert.equal(session.userId, "user-harbor-owner");
  });
});

test("http client sends credentialed requests to the versioned API origin", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  await withMockFetch(async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify(mockHarborClaims), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }, async () => {
    const client = new HttpPhase3Client("https://api.example.invalid/");
    await client.getSession();
  });

  assert.equal(requestUrl, "https://api.example.invalid/api/v1/session");
  assert.equal(requestInit?.credentials, "include");
});

test("http client maps malformed success JSON to a retryable unavailable error", async () => {
  await withMockFetch(async () => new Response("not-json", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }), async () => {
    const client = new HttpPhase3Client("https://api.example.invalid");
    await assert.rejects(
      () => client.getSession(),
      (error: unknown) => error instanceof Phase3Error && error.code === "unavailable",
    );
  });
});

test("verification review sends the refreshed row version and preserves a clear conflict message", async () => {
  let requestBody: unknown;
  await withMockFetch(async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ error: "VERIFICATION_CONFLICT", message: "That verification item changed. The latest version has been reloaded; review it and try again." }), {
      status: 409, headers: { "Content-Type": "application/json" }
    });
  }, async () => {
    const client = new HttpPhase3Client("https://api.example.invalid");
    await assert.rejects(
      () => client.reviewVerificationItem("item-1", "verified", "2026-10-21T10:00:00.000Z"),
      (error: unknown) => error instanceof Phase3Error && error.code === "conflict" && /latest version/.test(error.message)
    );
  });
  assert.deepEqual(requestBody, { decision: "verified", reason: null, expectedUpdatedAt: "2026-10-21T10:00:00.000Z" });
});
