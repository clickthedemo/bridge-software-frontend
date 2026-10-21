# STOP: verify the Bridge repository first

This repository is **Bridge software development** for Tori's cannabis-industry professional-network application.

It is **not** Bridge of Hope OTC, an SEO client, a marketing audit, or a generic client-meeting-prep project. Do not use unrelated memory, vault files, or similarly named projects to identify this work.

The correct repository is:

- GitHub: `dillonmohr8777/bridge-software-frontend`
- Default branch: `production`; integration work starts from `development`
- Application stack: Next.js + React + TypeScript
- Primary work: Greencubes API integration into the approved Bridge frontend, preview QA, and controlled production promotion

If you cannot read this repository, stop and say exactly: `The Bridge GitHub repository is not connected to this session.` Do not search memory for another Bridge.

# Claude handoff: Bridge frontend integration

## Mission

Help the team turn Tori's Bridge concept into a clear, accessible, scalable MVP without treating provisional discovery work as final client approval.

Bridge is a browser-based cannabis industry directory and professional network for brands, dispensaries, retailers, sales representatives, and administrators.

## Start here

Read these files before changing code:

1. `docs/INTEGRATION-PIPELINE.md`
2. `docs/INTEGRATION-API-CONTRACT.md`
3. `CONTRIBUTING.md`
4. `CLAUDE_BUILD_SPEC.md`
5. `.agents/marketing-context.md`
6. `docs/product-definition.md`
7. `docs/decision-log.md`
8. `docs/source-and-asset-audit.md`
9. `brand/bridge-provisional-brand-kit.md`

The repository is the canonical integration frontend. It still uses fictional member data and the in-memory API adapter until `NEXT_PUBLIC_BRIDGE_API_BASE` is configured with an inspectable Greencubes origin.

## Commands

```bash
npm install
npm run dev
npm run test:phase3
npm run typecheck
npm run lint
npm run build
npm run build:staging
npm run build:staging:current
npm run build:staging:network
npm run build:staging:botanical
npm run test:staging
```

Do not claim a change is complete until typecheck, lint, and build pass.
When staging output is involved, also require the cross-platform staging build
and artifact verification commands to pass.

## Architecture

- Next.js App Router
- React
- TypeScript in strict mode
- Plain CSS with semantic design tokens and three runtime themes
- Mock data in `lib/data.ts`
- Phase 3 vertical slice adapters in `lib/phase3/` (in-memory by default; live `/api/v1` only when `NEXT_PUBLIC_BRIDGE_API_BASE` is set)
- Reusable presentational components in `components/`
- No production Supabase, authentication, or real verification yet

Miraj owns the Supabase/PostgreSQL/auth/storage contracts and API implementation. Use the checked-in frontend contract, flag mismatches, and do not invent production database or authorization behavior without an inspectable staging origin.

## Routes

- `/` — landing/value proposition
- `/directory` — working member filters
- `/join` — role selection/onboarding direction
- `/profile/cascade-canna` — member profile/contact request
- `/dashboard` — member dashboard
- `/admin/verification` — admin review direction
- `/directions` — three visual directions
- `/design-system` — provisional tokens/components

## Non-negotiable context

- No approved Bridge logo, palette, font system, or downloadable Tori prototype was found in accessible history.
- The green/gold proposal styling is Momentum branding, not Bridge branding.
- `Trusted Current` is a provisional recommendation, not an approved identity.
- Tori's original prototype must be reviewed in an NDA-safe walkthrough.
- Next.js + React + TypeScript is the working front-end direction agreed in team conversation.
- Supabase/PostgreSQL is the working backend direction from Miraj and the proposal.

## MVP boundaries

In scope: directory, profiles, search/filter, structured contact requests, business/license verification workflow, saved profiles, basic announcements, notifications, and admin moderation.

Out of scope unless a documented scope change is approved: full social feed, direct messaging, subscriptions, marketplace/payments, native mobile apps, advanced recommendation AI, and advanced analytics.

## Implementation standards

- Preserve semantic HTML, keyboard access, visible focus, readable contrast, and responsive behavior.
- Test at desktop and phone widths; do not introduce horizontal page overflow.
- Model loading, empty, error, permission, pending, rejection, and success states explicitly.
- Keep components small and typed; avoid duplicating design values outside CSS tokens.
- Never imply that Bridge verification is a legal guarantee.
- Never commit credentials, personal data, client documents, or production records.
- Do not add a Supabase dependency until the schema, RLS intent, and API boundary are reviewed with Miraj.
- Record material product assumptions in `docs/decision-log.md`.

## Recommended Claude workflow

1. Read approved decisions and the exact task acceptance criteria.
2. Identify affected roles, states, routes, components, and data contracts.
3. State assumptions that require Dillon, Tori, or Miraj approval.
4. Implement the smallest coherent vertical slice.
5. Run typecheck, lint, build, and relevant interaction/responsive checks.
6. Summarize changed behavior, evidence, remaining risks, and decisions needed.

See `docs/claude-workflow.md` for the full human/AI operating model.

## Browser error assertions, October 21, 2026

Scope Playwright error assertions to the intended form or `.form-error[role="alert"]`. Next.js also renders `#__next-route-announcer__` with `role="alert"`, so an unscoped `getByRole("alert")` matches both.
