import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const directions = ["current", "network", "botanical"];
const directionLabels = { current: "Trusted Current", network: "Modern Network", botanical: "Botanical Ledger" };
const expectedRoutes = [
  "index.html",
  "community/index.html",
  "create/index.html",
  "my-profile/index.html",
  "explore/index.html",
  "directory/index.html",
  "join/index.html",
  "dashboard/index.html",
  "admin/verification/index.html",
  "directions/index.html",
  "design-system/index.html",
  "profile/cascade-canna/index.html",
];

for (const direction of directions) {
  const outputRoot = join(root, "staging", direction);
  assert.ok(existsSync(outputRoot), `Missing staging output for ${direction}`);

  const redirects = readFileSync(join(outputRoot, "_redirects"), "utf8");
  assert.match(redirects, /^\/studio \/create 301$/m, `${direction} is missing the legacy Create redirect`);
  assert.match(redirects, /^\/business \/my-profile 301$/m, `${direction} is missing the legacy My Profile redirect`);
  assert.match(redirects, /^\/signal \/explore 301$/m, `${direction} is missing the legacy Explore redirect`);

  const home = readFileSync(join(outputRoot, "index.html"), "utf8");
  assert.match(home, new RegExp(`data-theme=\\"${direction}\\"`), `${direction} theme is not pinned`);
  assert.ok(home.includes(`preview-chip">${directionLabels[direction]}<`), `${direction} preview is missing its ${directionLabels[direction]} direction chip`);
  assert.match(home, /noindex/, `${direction} preview is missing noindex metadata`);

  for (const route of expectedRoutes) {
    assert.ok(existsSync(join(outputRoot, route)), `${direction} is missing ${route}`);
  }

  const community = readFileSync(join(outputRoot, "community/index.html"), "utf8");
  assert.match(community, /Visual news/, `${direction} Community News is missing Visual news`);
  assert.match(community, /Classic feed/, `${direction} Community News is missing Classic feed`);

  const create = readFileSync(join(outputRoot, "create/index.html"), "utf8");
  assert.match(create, /PNG, JPEG, WebP, or PDF/, `${direction} Create is missing upload guidance`);
  assert.match(create, /Protected (?:business )?detail/, `${direction} Create is missing the protected-detail boundary`);

  const profile = readFileSync(join(outputRoot, "my-profile/index.html"), "utf8");
  // The Public view / B2B toggle renders client-side after sign-in; lib/phase3 tests cover its projection.
  assert.match(profile, /Checking access/, `${direction} My Profile is missing its sign-in gate`);

  const explore = readFileSync(join(outputRoot, "explore/index.html"), "utf8");
  assert.match(explore, /All states/, `${direction} Explore is missing nationwide state selection`);
  assert.match(explore, /Favorites only/, `${direction} Explore is missing favorites filtering`);
}

console.log(`Verified ${directions.length} direction builds and ${expectedRoutes.length} routes per build.`);
