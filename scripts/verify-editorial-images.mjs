import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDirectory = path.join(root, "public", "bridge-editorial");
const sourceRoots = ["app", "components", "lib"].map((directory) => path.join(root, directory));

// These assets intentionally connect previews and supporting pages to their
// canonical content. Keep the expected locations explicit so a new,
// accidental reuse still fails this check.
const intentionalEditorialReuse = new Map([
  ["/bridge-editorial/community-oregon-edibles.webp", ["app/community/community-client.tsx", "components/PostPeek.tsx", "components/SuitePeek.tsx"]],
  ["/bridge-editorial/community-michigan-retail.webp", ["app/community/community-client.tsx", "components/SuitePeek.tsx"]],
  ["/bridge-editorial/community-california-cultivation.webp", ["app/community/community-client.tsx", "components/SuitePeek.tsx"]],
  ["/bridge-editorial/community-michigan-testing.webp", ["app/community/community-client.tsx", "app/verified/page.tsx"]],
  ["/bridge-editorial/community-illinois-route-planning.webp", ["app/community/community-client.tsx", "app/verified/page.tsx"]],
  ["/bridge-editorial/community-massachusetts-meetup.webp", ["app/community/community-client.tsx", "components/SuitePeek.tsx"]],
  ["/bridge-editorial/community-new-york-interview.webp", ["app/community/community-client.tsx", "app/verified/page.tsx"]],
  ["/bridge-editorial/community-oregon-sample-kit.webp", ["app/community/community-client.tsx", "app/verified/page.tsx"]],
  ["/bridge-editorial/create-promotion-studio.webp", ["app/community/community-client.tsx", "app/create/page.tsx"]],
  ["/bridge-editorial/category-flower-genetics.webp", ["app/explore/explore-client.tsx", "components/SuitePeek.tsx"]],
  ["/bridge-editorial/category-prerolls-vapes.webp", ["app/explore/explore-client.tsx", "components/SuitePeek.tsx"]],
  ["/bridge-editorial/category-edibles-wellness.webp", ["app/explore/explore-client.tsx", "components/SuitePeek.tsx"]],
  ["/bridge-editorial/profile-protected-details.webp", ["app/my-profile/page.tsx", "app/verified/page.tsx"]],
  ["/bridge-editorial/verified-licence-check.webp", ["app/verified/page.tsx", "app/verified/page.tsx"]],
  ["/bridge-editorial/profile-harbor-dispensary.webp", ["app/verified/page.tsx", "lib/data.ts"]],
]);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(absolute));
    else if (/\.(css|ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

const failures = [];
const usage = new Map();
for (const file of (await Promise.all(sourceRoots.map(sourceFiles))).flat()) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/\/bridge-editorial\/([a-z0-9-]+\.webp)/g)) {
    const publicPath = `/bridge-editorial/${match[1]}`;
    const locations = usage.get(publicPath) ?? [];
    locations.push(path.relative(root, file).replaceAll(path.sep, "/"));
    usage.set(publicPath, locations);
  }
  if (/bridge-industry-(products|networking)\.png|bridge-cultivation-lab\.png/.test(source)) {
    failures.push(`Legacy repeated imagery remains in ${path.relative(root, file)}`);
  }
}

for (const [publicPath, locations] of usage) {
  const actualLocations = [...locations].sort();
  const expectedLocations = [...(intentionalEditorialReuse.get(publicPath) ?? [locations[0]])].sort();
  if (actualLocations.length !== expectedLocations.length || actualLocations.some((location, index) => location !== expectedLocations[index])) {
    failures.push(`${publicPath} is assigned ${locations.length} times: ${locations.join(", ")}`);
  }
}

const files = (await readdir(assetDirectory)).filter((file) => file.endsWith(".webp")).sort();
const referencedFiles = [...usage.keys()].map((publicPath) => path.basename(publicPath)).sort();
const unreferenced = files.filter((file) => !referencedFiles.includes(file));
const missing = referencedFiles.filter((file) => !files.includes(file));
if (unreferenced.length) failures.push(`Unreferenced editorial assets: ${unreferenced.join(", ")}`);
if (missing.length) failures.push(`Missing editorial assets: ${missing.join(", ")}`);

const hashToFiles = new Map();
for (const file of files) {
  const bytes = await readFile(path.join(assetDirectory, file));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const matches = hashToFiles.get(hash) ?? [];
  matches.push(file);
  hashToFiles.set(hash, matches);
}
for (const [hash, matches] of hashToFiles) {
  if (matches.length > 1) failures.push(`Duplicate binary hash ${hash}: ${matches.join(", ")}`);
}

const manifest = JSON.parse(await readFile(path.join(assetDirectory, "BRIDGE-IMAGE-PROVENANCE.json"), "utf8"));
if (manifest.assets.length !== files.length) failures.push(`Provenance has ${manifest.assets.length} assets; filesystem has ${files.length}`);
for (const asset of manifest.assets) {
  const matches = hashToFiles.get(asset.sha256) ?? [];
  if (!matches.includes(asset.file)) failures.push(`Provenance hash mismatch for ${asset.file}`);
  if (!asset.promptId || !asset.model || !asset.dimensions || !asset.businessRoute) failures.push(`Incomplete provenance for ${asset.file}`);
}

const statesSource = await readFile(path.join(root, "lib", "states.ts"), "utf8");
const states = [...statesSource.matchAll(/^\s+"([^"]+)",?$/gm)].map((match) => match[1]);
if (states.length !== 52 || states[0] !== "All states" || !states.includes("District of Columbia")) {
  failures.push(`Nationwide state source must contain All states, 50 states, and D.C.; found ${states.length} entries`);
}
for (const relative of ["app/community/community-client.tsx", "app/explore/explore-client.tsx"]) {
  const source = await readFile(path.join(root, relative), "utf8");
  if (!source.includes("US_STATE_OPTIONS.map")) failures.push(`${relative} does not use the shared nationwide selector`);
}

const communitySource = await readFile(path.join(root, "app", "community", "community-client.tsx"), "utf8");
const communityPostImages = [...communitySource.matchAll(/image:\s*"\/bridge-editorial\/community-[a-z0-9-]+\.webp"/g)];
if (communityPostImages.length !== 20) failures.push(`Community must contain 20 image-led sample posts; found ${communityPostImages.length}`);
for (const requiredType of ["Product introduction", "Vendor announcement", "Promotion", "Event"]) {
  if (!communitySource.includes(`type: "${requiredType}"`)) failures.push(`Community is missing Tori-requested sample post type: ${requiredType}`);
}
const globalCss = await readFile(path.join(root, "app", "globals.css"), "utf8");
if (globalCss.includes("feTurbulence")) failures.push("Inline synthetic SVG turbulence remains; use the reusable raster film-grain texture");
await readFile(path.join(root, "public", "textures", "bridge-film-grain.webp"));

const report = {
  passed: failures.length === 0,
  editorialAssets: files.length,
  assignedEditorialPaths: usage.size,
  uniqueBinaryHashes: hashToFiles.size,
  nationwideOptions: states.length,
  communitySamplePosts: communityPostImages.length,
  intentionalReuseExceptions: [
    "/bridge-mark.svg",
    "/textures/bridge-film-grain.webp",
    ...intentionalEditorialReuse.keys(),
  ],
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
