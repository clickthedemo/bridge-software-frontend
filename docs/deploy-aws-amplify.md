# Deploying the Bridge website to AWS Amplify Hosting

Runbook for moving the site from Netlify to Bridge's own AWS account. Nothing here has been run yet. It needs Bridge's AWS account with billing, the product domain in Route 53, and the go-ahead to deploy. The API side is in bridge-software-backend `docs/deploy-aws.md`.

`netlify.toml` stays as it is, and Netlify keeps building `production` until someone switches it off, so Netlify remains a working fallback during the cutover.

## Files in this repo

- `amplify.yml`: the build. Node 22 (same as `netlify.toml`), `npm ci`, `npm run build`, output `.next` (Next.js server rendering). It reads the commit with `git rev-parse HEAD` (Amplify sets `AWS_COMMIT_ID` to the literal `HEAD` on rebuilds, which would write a null SHA) and maps `AWS_BRANCH` onto the `COMMIT_REF` and `CONTEXT` variables `scripts/write-build-info.mjs` already reads, so `/build-info.json` reports the deployed commit and `production` on the production branch. Amplify web previews of pull requests are not covered; they would report `branch-deploy`.
- `customHttp.yml`: Amplify ignores Netlify's `public/_headers` and `public/_redirects`, so this file repeats the `_headers` rule (noindex, `nosniff`, no referrer) and adds `Cache-Control: no-store` on `/build-info.json` (same as `netlify.toml`) so deploy checks never read a cached SHA. Redirects are in "Redirects" below.

## Gate 1: Next.js version on Amplify (check first)

Amplify's documentation lists managed server rendering for Next.js 12 through 15 (https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html). This app runs Next.js 16, so treat this kit as unproven and do not rely on Amplify until this gate passes. Before anything else, connect the `development` branch to a test Amplify app and confirm that the build succeeds, `/`, `/explore`, `/profile/<a real slug>` and `/admin/dashboard` render, and sign-in works against the staging API. For that trial the staging API's `CORS_ORIGINS` must also list the trial app's own origin (`https://development.<appid>.amplifyapp.com`), and its cookies stay `SameSite=None` because the origins are not same-site yet; without both, sign-in fails and looks like a Next.js 16 problem. Also check that `/build-info.json` shows the SHA after a Redeploy (not `null`) and that `curl -sI` on `/` shows the `customHttp.yml` headers.

If Amplify cannot serve Next.js 16, use the fallback: run the site as a container next to the API on ECS Express Mode (the two services share one load balancer). That needs `output: "standalone"` behind an environment switch in `next.config.ts` and a small Dockerfile; it is not built yet because the Amplify path may work as is.

## Gate 2: the preview label on a new domain

`components/DirectionLockChip.tsx` hides the design-direction chip ("Modern Network") only on `bridge-connected-signal.netlify.app` (`UNIFIED_REVIEW_HOST` in `lib/direction-lock.ts`). On `<DOMAIN>` the chip would show in the header. Fix that in code before the domain goes live (for example, treat the production domain like the review host, or drop the chip now that one direction is final). Also in code before launch: `app/layout.tsx` hard-codes `metadataBase` and `openGraph.url` to `bridge-connected-signal.netlify.app`, so on `<DOMAIN>` the share-preview URLs and `og:image` point at Netlify and break when Netlify is switched off. And noindex is set in three places (`robots` in `app/layout.tsx`, `public/_headers`, `customHttp.yml`); when the site goes public, remove it from all three.

## One-time setup

1. Amplify console (Bridge's account, same region as the API), Create new app, GitHub. Authorize the AWS Amplify GitHub App for the repository owner's account and pick `bridge-software-frontend`.
2. Branch: `production`. Amplify detects Next.js and uses `amplify.yml` from the repo. Confirm the platform shows "Web compute" (server rendering), not static.
3. Build image settings, Live package updates: Node.js version `22`. `amplify.yml` also runs `nvm install 22`; setting it here pins the runtime Amplify uses to serve the app.
4. Service role: let Amplify create one, so server-rendering logs reach CloudWatch.
5. Environment variables (next section), then Save and deploy. Deploy `production` only after `api.<DOMAIN>` answers `/health`: a build with `NEXT_PUBLIC_BRIDGE_API_BASE` unset ships demo data, and one pointing at an API that is not up yet fails every read. Use the `development` branch for the first trial.
6. Optional staging: connect the `development` branch to the same app with its own variables and map it to `staging.<DOMAIN>`.

## Environment variables

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_BRIDGE_API_BASE` | Production: `https://api.<DOMAIN>`. Staging: `https://api.staging.<DOMAIN>`. | Origin only, no trailing `/api/v1`; the client adds the paths. Required: without it the site silently runs on built-in demo data (`lib/phase3/client.ts`). |
| `NEXT_PUBLIC_DIRECTION_LOCK` | Staging only: `network`. Leave unset on production. | `DEFAULT_THEME` is already `network`; the lock also makes `/directions` print "archival staging build" wording (`.env.example` marks it staging-only). |

`NEXT_PUBLIC_` values are written into the JavaScript at build time and are public. Never put a key or token here. Changing one needs a new build (Redeploy), not just a save. Set values per branch (App settings, Environment variables, override for branch) so staging and production point at different APIs.

## Custom domain on Route 53

1. Amplify console, Hosting, Custom domains, Add domain, choose `<DOMAIN>` from the Route 53 list.
2. Map the root `<DOMAIN>` and `www` to `production` (www redirects to the root). Map `staging` to `development` if staging is on.
3. Amplify requests and renews the certificate (AWS Certificate Manager) and writes the DNS records itself when the zone is in Route 53 in the same account. Wait for "Available".
4. Check: `curl -sI https://<DOMAIN>/` returns 200 with a valid certificate.

## Redirects

Netlify serves `public/_redirects` (`/studio` to `/create`, `/business` to `/my-profile`, `/signal` to `/explore`, all 301); Amplify does not read it, so those three URLs would 404. Until they move into `next.config.ts` (feature lane, also covers Netlify), add them under Amplify console, Hosting, Rewrites and redirects: source `/studio`, target `/create`, type 301 (Permanent redirect); likewise `/business` to `/my-profile` and `/signal` to `/explore`.

## Pointing the site at api.<DOMAIN>

1. API first: `api.<DOMAIN>` answers `/health` (backend runbook).
2. On the API service, `CORS_ORIGINS` lists exactly `https://<DOMAIN>,https://www.<DOMAIN>`. Without the site origin, sign-in and every save fail with a CORS or 403 error.
3. In Supabase Auth, URL Configuration: Site URL `https://<DOMAIN>`, and add `https://<DOMAIN>/login?verified=true` and `https://<DOMAIN>/auth/reset-password` to Redirect URLs.
4. Set `NEXT_PUBLIC_BRIDGE_API_BASE=https://api.<DOMAIN>` on the production branch and Redeploy.
5. Once both sites are same-site, switch the API cookies to `SameSite=Lax` (backend runbook, "Session cookies").

## Deploy and verify

Every merge into `production` builds and deploys on its own. After each deploy:

- `curl -s https://<DOMAIN>/build-info.json` shows the merge commit SHA and `"context":"production"`, and `curl -sI https://<DOMAIN>/build-info.json` shows `cache-control: no-store`.
- Signed-out pages load; sign in, open My Profile and the admin dashboard; sign out.
- iPhone Safari: sign in, reload, the session holds.

## Rollback

- Amplify console, the `production` branch, Deployments: pick the last good deployment and choose Redeploy this version. Check `/build-info.json` shows its SHA.
- Or revert the bad merge on `production`; Amplify builds the revert.
- Full cutover rollback (first days only): add `<DOMAIN>` as a custom domain on the Netlify site and point DNS there. Netlify keeps building `production` until it is switched off.
