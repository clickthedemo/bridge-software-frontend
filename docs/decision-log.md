# Bridge decision log

## AWS Amplify hosting kit prepared, not adopted — 2026-10-22

`amplify.yml`, `customHttp.yml` and `docs/deploy-aws-amplify.md` are an unproven plan for hosting this site in Bridge's own AWS account. Amplify's docs list managed SSR for Next.js 12 to 15 and this app is on 16, so a trial build must pass first; the fallback is a container on ECS Express Mode. Netlify stays the live host and `netlify.toml` is unchanged. D-06 below (is AWS a hard requirement) is still open.

## Phase Four source recovery — 2026-10-11

Recovered Miraj's vendor frontend at 6a40eb352b3ea6296bce871296216cc147a89aa0 and backend contract at 3892ac3cb407c1aa101b464356acc3440dea1135. The integration patch aligns profile roles/revisions/links and public Directory filters with Tori's October 6 workbook, preserving Connected styling. Backend authorization remains authoritative; recipient-scoped inbox authorization, real RLS tests and deployment bindings remain acceptance gaps. See `docs/m4-recovery-2026-10-11.md`. This records implementation scope, not a completed deployment or client QA receipt.

## Adult entry requirement restored — 2026-08-21

| Item | Recorded decision | Evidence boundary |
|---|---|---|
| 21+ entry gate | Require an explicit 21+ confirmation before any Bridge route, retain the under-21 blocked state, and remember an affirmative confirmation on that device | Restores the earlier product requirement without changing the Connected purple design. This front-end gate is not a substitute for Miraj's production authentication and age-eligibility claims. |
| Unified review deployment | Update the existing `bridge-connected-signal` Netlify site in place | Published as deploy `6a88e3ac3974a1b866ed5383`; previous deploy `6a8734af6ddd51415f88bbb7` remains the rollback point. The safety duplicate was not changed. |

## Tori feedback reconciliation — 2026-08-20

| Item | Recorded decision | Evidence boundary |
|---|---|---|
| Visual identity | Preserve Connected purple, the existing typography, and the exact Bridge mark across the review build | Dillon direction plus Tori's positive reaction to the dark purple direction in the full transcript; Tori's written production acceptance is still pending |
| First impression | State legal cannabis audience and nationwide network value immediately, with Join as the primary action and Explore as the secondary action | Mac feedback and Dillon approval |
| Content depth | Expand the review build across Community News, Explore, profiles, Create, pricing, and Bridge League concepts | Tori transcript; all records and market signals remain fictional prototype content |
| Motion treatment | Apply purple grain and slow editorial image movement to realistic cannabis industry imagery | Approved Bridge editorial treatment; reduced motion is supported |
| Production boundary | Represent unapproved pricing, rewards, ordering, and integrations as explicit concepts or pending connections | No billing, live provider connection, external send, or deployment was authorized in this pass |

Full mapping: `docs/phase3/03-tori-feedback-reconciliation.md`.

## Phase 3 frontend slice complete — 2026-08-19

| Item | Recorded decision | Evidence boundary |
|---|---|---|
| Current product/UX lane | Phase 3 is open: productionize Promotion create + protected profile projection | Phase 2 frontend is technically complete; Melissa said the team is good to move forward after Tori's payment work; Miraj reported Milestone 2 done pending his tests |
| Slice lock | Targeted Promotion creation plus protected profile projection / required monthly contact confirmation | Corrected to Tori's July 23 transcript: first login and monthly confirmation, not a 90-day cycle |
| Adapter | In-memory Phase 3 client by default; HTTP client when `NEXT_PUBLIC_BRIDGE_API_BASE` is set | Live bind still requires Miraj's inspectable staging origin |
| Dillon frontend lock | Create, My Profile, design-system mutation states, and contract tests are the internal deliverable | `docs/phase3/02-dillon-deliverable.md`; do not Slack, email, or update Netlify until Dillon asks |
| Unified review visual | Connected purple (Modern Network) on the same Phase 1/2 five-route product. Do not ship Trusted Current navy/teal on that URL. Do not substitute a different app or the Kimi suite. | Dillon 2026-08-19: restore the last purple Connected look with every Tori-instituted Phase 1/2 integration from the 2026-08-16 actual-work report. Trusted Current stays on `bridge-preview-current` |
| Still out of slice | Expanded directories, ranking, subscriptions/payments, in-platform ordering, EIN documents, production auth UI | Contract Section 10 / 2026-08-05 Slack alignment |

## Phase 2 scope reconciliation — 2026-08-15

| Item | Current status | Evidence boundary |
|---|---|---|
| Community default | Unresolved; News Grid is Dillon's recommendation and Classic remains available for comparison | Tori's written choice is still required |
| MVP feed behavior | Basic chronological/non-algorithmic | Later scope alignment narrowed the MVP; no ranking system is approved |
| Approved MVP roles | Brands, retailers, dispensaries, sales representatives, and administrators | Final claim names and permissions require Miraj confirmation |
| Public/member/business fields | Working matrix only | Tori must approve exact fields; Miraj must confirm enforceable projections |
| Vendor visibility | Deny protected fields by default | Relationship-based access remains an unresolved product/legal/technical decision |
| Private Bridge League/rewards | Future scope | Interest or discussion is not written approval |
| Expanded live directories | Future scope/change order | Sample search and filters do not promise a production directory dataset |
| Subscriptions and payments | Future scope/change order | Pricing discussion is not an approved build requirement |
| Marketplace or ordering | Future scope/change order | MVP may use external links only |
| HR functionality | Future scope/change order | Requires separate discovery and privacy/legal review |

No unresolved item in this table is an approved decision.

## Unified review deployment — 2026-08-16

| Item | Recorded decision | Evidence boundary |
|---|---|---|
| Client review URL | `https://bridge-connected-signal.netlify.app` is the one unified review destination | Existing Netlify site updated in place; no replacement client URL created |
| Visual direction | **Superseded 2026-08-19.** Connected purple is the unified-review visual. Trusted Current remains an alternate preview only. | Dillon restored Connected on the existing five-route app. Tori still owns formal brand acceptance |
| August 15 sites | Trusted Current, Modern Network, and Botanical Ledger are visual variants of the same canonical application | They do not contain separate product functionality and are not additional client deliverables |
| Legacy links | `/studio`, `/business`, and `/signal` redirect to `/create`, `/my-profile`, and `/explore` | Live desktop and mobile verification passed |
| Deployment format | Native Next.js deployment is required for the unified site | Static export produced failed background route prefetch requests and was replaced before final verification |

## Confirmed from written history

| Decision | Status | Evidence/owner |
|---|---|---|
| Product is a browser-based web application | Confirmed | Proposal and Miraj email |
| Working backend is Supabase/PostgreSQL | Confirmed direction | Miraj/proposal; final integration design pending |
| AI-assisted development includes Claude and Cursor | Confirmed | Miraj email/proposal |
| Dillon owns front-end/UX/product-structure contribution | Confirmed | Email, Slack role discussion, execution plan |
| Next.js + React + TypeScript is the recommended front end | Team-aligned working decision | Dillon's Slack explanation; Miraj replied that he understood |
| Product name changed from The Ecosystem to Bridge | Confirmed | Tori email, 2026-06-07 |
| Tori has or had a Claude-built prototype | Confirmed, not delivered | Tori/Slack references |

## Provisional decisions made for this prototype

| Decision | Why it was made | Approval needed |
|---|---|---|
| Trusted Current is the default visual direction | **Superseded 2026-08-19 for the unified review URL.** Connected / Modern Network is now the review default. Trusted Current remains an alternate at `bridge-preview-current`. | Dillon (unified URL); Tori still owns formal brand acceptance |
| Exact Bridge mark | Reuse `public/bridge-mark.svg` from the established Connected build; do not substitute a new logo | Tori still owns formal production brand acceptance |
| Retailer and dispensary are shown as separate roles | Both appear in project language | Tori + Miraj |
| Contact starts as a structured request | Matches scope and protects private details without adding direct messaging | Tori + Miraj |
| Verification uses explicit pending/verified/attention states | Makes admin and member UX testable | Compliance definition needed |

## Provisional decisions made during Phase 1 defect repair (2026-07-11)

All Phase 1 work repaired existing defects without pre-approving product or brand choices. These implementation assumptions need review, not the underlying scope:

| Decision | Why it was made | Approval needed |
|---|---|---|
| Mobile navigation uses a disclosure menu button in the header | Navigation disappeared entirely below 980px; disclosure pattern is the smallest accessible repair | Dillon (UX) |
| Every directory member resolves to `/profile/[slug]` from typed mock data | Every card previously linked to Cascade Canna, which would mislead the walkthrough | Dillon (UX); fictional profile copy is placeholder only |
| Contact request submission uses a typed mock adapter (`lib/contact.ts`) with simulated pending/success/error | The route's required states were untestable with an inert button; the adapter shape is a proposal for Miraj, not a contract | Miraj (contract), Tori (flow) |
| Join step 1 shows role-specific requirement copy from a typed map | The static preview showed organization/EIN fields for every role, including sales reps | Tori/Miraj/compliance (D-03); copy labeled provisional in the UI |
| Non-functional controls are disabled with a visible reason instead of looking active | Dead active-looking buttons read as broken in a client demo | Dillon (UX) |
| Direction-card swatches were corrected to the hexes the themes actually apply | The cards showed colors that differ from what previewing applies, which would distort Tori's comparison | None — consistency fix; Tori still chooses the direction |
| Fictional data is labeled in place on landing, directory, dashboard, and admin | Prototype metrics could be mistaken for production data in the meeting | None — required by build spec |
| One Netlify staging link per provisional direction (`bridge-preview-current` / `-network` / `-botanical` .netlify.app) | Lets Tori compare the three directions side by side on real flows; each build is pinned via `NEXT_PUBLIC_DIRECTION_LOCK`, labeled "Provisional preview", and marked noindex | None for the demo tooling; Tori still owns the direction choice (D-01) |
| Directory search matches ANDed word-prefix tokens across name/location/role/serving/description/specialties, with US state abbreviations expanding to state names (`lib/search.ts`) | "Erie, PA" returned 0 results on staging: the old matcher required the whole query as one literal substring and ignored the serving field; whole-network search itself still requires the backend | Miraj — confirm as the server-side search contract at gate B |
| Sample network expanded to 10 fictional profiles across more roles and markets, including Erie and Pittsburgh, PA | Natural demo queries should return results; target launch states are unknown (open D-07), so markets are placeholders re-seeded once Tori names them | Tori/Melissa — D-07 decides the real market list |
| Directory empty state echoes active constraints, offers clear actions, shows near-filter matches, and states the prototype searches sample data only | A zero-result search looked broken and implied a live network exists | None — required-state coverage per build spec |

## Open decision register

| ID | Question | Decision owner | Needed by |
|---|---|---|---|
| D-01 | Is the dark Connected purple direction formally approved for production? | Tori | Before production brand lock |
| D-02 | Are retailer and dispensary distinct account types? | Tori/Miraj | Data model lock |
| D-03 | What exact evidence is required per role? | Tori/Miraj/compliance | Verification build |
| D-04 | What does the public “Verified” label promise? | Mac/Tori/compliance | Copy approval |
| D-05 | Which profile/contact fields are public, member-only, or private? | Tori | Schema/API lock |
| D-06 | Is AWS a hard hosting requirement or a proposal-level direction? | Miraj/Mac | Architecture review |
| D-07 | What is the first geographic market and priority user role? | Tori/Melissa | Launch plan |
| D-08 | Who approves design and scope between live sessions? | Tori/Mac | Monday close |
| D-09 | Is `getonthebridge0-max/thebridge` the canonical Bridge frontend repository, replacing `dillonmohr8777/bridge-software-frontend`? **Recommended answer: no.** `gh api repos/getonthebridge0-max/thebridge` returned HTTP 404 to a `repo`-scoped admin token on 2026-09-02, and `getonthebridge0-max` is still a pending invitee. Canonical stays `dillonmohr8777/bridge-software-frontend`; Greencubes reverts the four pointer lines in `CLAUDE.md`, `CLAUDE_BUILD_SPEC.md`, and `CLAUDE_SESSION_PROMPT.md`. A later transfer is its own decision and its own commit. **Applied 2026-09-21** — all four lines reverted to their exact pre-`93ba32b` text. The revert had gone unexecuted for nineteen days and the rewrite reached `production` in the interim, so the "STOP" guard on the default branch pointed at a 404 for that window. | Dillon/Mac | Applied 2026-09-21 |
| D-10 | Does Bridge auth use httpOnly cookie sessions (contract as written) or pure bearer tokens in web storage (as implemented on `feature/admin-login`)? | Dillon/Miraj | Before production auth lock |
