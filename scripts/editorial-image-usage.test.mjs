import test from "node:test";
import assert from "node:assert/strict";
import { editorialUsageFailures } from "./editorial-image-usage.mjs";
const path = "/bridge-editorial/example.webp";
const reviewed = [{ path, locations: ["app/example.tsx", "components/Preview.tsx"], reason: "Preview mirrors the canonical example." }];
const check = (locations, entries = reviewed) => editorialUsageFailures(new Map([[path, locations]]), entries);
test("exact reviewed preview use passes regardless of traversal order", () => assert.deepEqual(check(["components/Preview.tsx", "app/example.tsx"]), []));
test("a new third use is rejected", () => assert.equal(check(["app/example.tsx", "components/Preview.tsx", "app/other.tsx"]).length, 1));
test("same count in an unreviewed surface is rejected", () => assert.equal(check(["app/example.tsx", "app/other.tsx"]).length, 1));
test("removed preview requires declaration cleanup", () => assert.equal(check(["app/example.tsx"]).length, 1));
test("repeated occurrences in one file are counted", () => assert.equal(check(["app/example.tsx", "app/example.tsx"]).length, 1));
test("undeclared duplicates fail and single assignments pass", () => {
  assert.equal(check(["app/example.tsx", "app/other.tsx"], []).length, 1);
  assert.deepEqual(check(["app/example.tsx"], []), []);
});
test("stale declarations fail", () => assert.equal(editorialUsageFailures(new Map(), reviewed).length, 1));
test("duplicate declarations fail", () => assert.ok(check(["app/example.tsx", "components/Preview.tsx"], [...reviewed, ...reviewed]).length));
test("unexplained declarations fail", () => assert.ok(check(["app/example.tsx", "components/Preview.tsx"], [{ ...reviewed[0], reason: "" }]).length));
