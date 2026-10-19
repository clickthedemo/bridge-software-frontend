import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { emptyDirectoryQuery, hasDirectoryFilters, parseDirectoryQuery, serializeDirectoryQuery } from "./directory-query-state.ts";

test("Directory URL state round-trips every supported filter", () => {
  const parsed = parseDirectoryQuery(new URLSearchParams("q=Mixed+Case&organizationType=retailer&category=Flower&city=Portland&state=OR&region=Northwest&sort=name_desc"));
  assert.deepEqual(parsed, { q: "Mixed Case", organizationType: "retailer", category: "Flower", city: "Portland", state: "OR", region: "Northwest", sort: "name_desc" });
  assert.equal(serializeDirectoryQuery(parsed), "q=Mixed+Case&organizationType=retailer&category=Flower&state=OR&city=Portland&region=Northwest&sort=name_desc");
});

test("invalid URL enums fail closed and clear filters removes all query state", () => {
  assert.deepEqual(parseDirectoryQuery(new URLSearchParams("organizationType=unknown&sort=newest")), emptyDirectoryQuery);
  assert.equal(hasDirectoryFilters(emptyDirectoryQuery), false);
  assert.equal(serializeDirectoryQuery({ ...emptyDirectoryQuery, q: "  " }), "");
});

test("live Directory exposes loading, error, empty, clear, accessible controls, and return-state UI", () => {
  const source = readFileSync(new URL("../../components/LiveDirectory.tsx", import.meta.url), "utf8");
  for (const text of ["Loading directory", "could not be loaded", "No matching businesses", "Clear filters", "aria-busy", "aria-live", "htmlFor=", "Back to Directory"]) assert.match(source, new RegExp(text));
  assert.match(source, /router\.replace/);
  assert.match(source, /from=/);
});
