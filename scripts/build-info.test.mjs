import test from "node:test";
import assert from "node:assert/strict";
import { buildInfo } from "./write-build-info.mjs";
const netlify = "a".repeat(40), github = "b".repeat(40);
test("Netlify deployed source wins over CI metadata", () => assert.deepEqual(buildInfo({COMMIT_REF:netlify,GITHUB_SHA:github,CONTEXT:"branch-deploy"}),{schemaVersion:1,commitSha:netlify,context:"branch-deploy"}));
test("invalid source identity is never reported as a verified SHA", () => assert.equal(buildInfo({COMMIT_REF:"not-a-sha",GITHUB_SHA:github}).commitSha,null));
test("only bounded public metadata is emitted", () => assert.deepEqual(buildInfo({GITHUB_SHA:github,GITHUB_ACTIONS:"true",CONTEXT:"private-value",API_KEY:"secret",DEPLOY_URL:"private-value"}),{schemaVersion:1,commitSha:github,context:"ci"}));
