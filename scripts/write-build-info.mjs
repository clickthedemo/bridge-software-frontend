import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function buildInfo(env) {
  const candidate = env.COMMIT_REF || env.GITHUB_SHA || "";
  const commitSha = /^[a-f0-9]{40}$/i.test(candidate) ? candidate.toLowerCase() : null;
  const contexts = ["production", "deploy-preview", "branch-deploy", "dev"];
  const context = contexts.includes(env.CONTEXT) ? env.CONTEXT : env.GITHUB_ACTIONS === "true" ? "ci" : "unknown";
  return { schemaVersion: 1, commitSha, context };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mkdir("public", { recursive: true });
  await writeFile("public/build-info.json", JSON.stringify(buildInfo(process.env)) + "\n");
}
