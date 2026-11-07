# Think-first upgrade — codebase assessment and Phase 1 plan

Date: 2026-11-07 · Branch: `think-first` · Inspected: repository `main@4c16462`, live Supabase project
`vovupikwumeckppuotgk`, Vercel project `groundwork`.

> Source note: the two earlier instructions referenced in the brief ("Think-first frontend upgrade" and
> "four-pillar architecture clarification") were not available in this working session. This plan follows the
> latest brief; assumptions are listed in §E.4 for confirmation.

---

## A. Existing architecture

| Layer | What exists (verified in code) |
|---|---|
| Monorepo | pnpm workspace: `apps/web` (Next.js 16 App Router, Tailwind v4), `apps/mobile` (Expo SDK 58, Expo Router), `packages/shared` (types, zod validation, tokens, Think report schema, typed API client), `supabase/` (6 migration files, 3 edge functions, SQL tests). |
| Backend | One Supabase project (Postgres 17). 41 public tables, RLS on all. Business rules live in SECURITY DEFINER RPCs (matching, search, connections, messaging, blocks/reports, export, admin). |
| Auth | Supabase Auth. Web: `@supabase/ssr` cookies, `proxy.ts` session refresh + `/app`, `/admin` gate, `/auth/callback` (PKCE code + token_hash). Android: AsyncStorage session, PKCE OAuth helper. Email+password sign-up with confirmation; Google button now hidden unless enabled. |
| Think | `think` edge function: provider-agnostic AI layer (Gemini / OpenAI-compatible / Ollama), quotas, usage ledger, non-AI checklist fallback. Report = 20 sections, evidence labels enforced by `normalizeReport`. |
| Design system | Tokens in `packages/shared/src/tokens.ts`, mirrored as CSS variables (`globals.css`); web UI kit `components/ui`; mobile kit `components/ui.tsx`. Inter, black/white/grey + deep-green accent. |
| Deployment | Vercel project `groundwork` (root `apps/web`, Node 22, auto-deploys `main` to production; previews protected by Vercel Authentication). Edge functions deployed. No EAS project yet. |

## B. Inventory — working vs incomplete

| Area | Status | Evidence |
|---|---|---|
| Marketing site (13 pages, legal drafts) | **Working** in production | Fetched live; 200s |
| Email sign-up / login / reset | **Code works; delivery blocked** | Supabase confirmation on; Resend has no verified domain; Site URL still default |
| Google sign-in | **Not enabled** (button hidden) | `/auth/v1/settings` → `google: false` |
| Onboarding wizard (6 steps) | Working (tested locally); **blocks all of `/app` until completed** | `(shell)/layout.tsx` redirect |
| Profiles, skills, links, experience, startup | Working (RLS tested live) | SQL suite on live DB |
| Discover: recommendations + search + saved | Working (SQL-verified); no real users yet | `compute_matches`, `search_profiles` |
| Connections, messaging (realtime), notifications | Working (SQL-verified); realtime not exercised live | — |
| Think workspace (20-section AI report, follow-ups, export, share) | **Code complete; AI disabled** (all providers off, master switch off). Checklist mode works without AI. | `ai_provider_configs`, `feature_flags` |
| Anonymous "try Think" | **Does not exist** | — |
| Admin dashboard | Working; **no admin assigned** | `admin_roles` = 0 |
| Push notifications / webhook | Function deployed; **webhook + secrets not configured** | — |
| Android app | Builds (Metro bundle); **never run on device**, no EAS project | — |
| Capital / Test | **Not implemented** (correctly) | — |

Live data: 1 user (owner), 0 completed profiles, 0 Think projects, 0 connections.

## C. Database and authentication assessment

* **Strengths to keep:** deny-by-default RLS, privileged-column trigger, definer RPCs with `search_path=''`,
  revoked default EXECUTE, Think private by default (staff excluded), usage ledger without prompt text,
  deletion cascade with anonymisation. All verified against the live database.
* **Gaps relevant to Think-first:**
  1. No table for anonymous output — Quick Validate needs a short-lived, non-readable store and a secure
     claim mechanism.
  2. `think_projects` is not linked to `startup_projects`, so a venture cannot yet own its analyses
     (needed for the four-pillar model).
  3. Onboarding is a hard gate for the whole app, which conflicts with progressive registration.
  4. `ai_usage_logs.feature` check constraint has no value for anonymous usage.
  5. Auth configuration (Site URL, SMTP sender domain) is incomplete — operational, not code.
* **Supabase branching** is not available on the free plan → no staging database. Migrations are therefore
  tested on the local Postgres suite and applied to the live project **only after approval**.

## E. Phase 1 implementation plan

### E.1 Scope (this branch)
1. **Think-first homepage** — Quick Validate is the hero; ecosystem section shows the four pillars with honest
   status (Think: available · Connect: available to members · Capital, Test: planned, no links/forms).
2. **Anonymous Quick Validate** (`/validate`) — idea + optional context → **five-section preliminary report**:
   1. Idea snapshot · 2. Customer & problem · 3. Biggest risks · 4. Assumptions to test · 5. Next steps (experiments).
   Evidence labels on every point; an **assumptions summary** collected across sections. AI when an approved free
   provider is enabled; otherwise a clearly labelled non-AI guided version built from the user's own inputs.
3. **Secure attachment after registration** — the browser holds a one-time claim token (only its SHA-256 hash is
   stored); after sign-in `claim_quick_report()` converts it into a private Think project. Unclaimed reports expire
   after 7 days.
4. **Progressive, email-first registration** — step 1 is email + 18+ + terms; a magic link signs the user in
   (password optional, can be set in Settings). Profile is completed later, only when using Connect.
5. **Workspace & navigation** — Think-first nav (Home · Think · Connect · Profile), Connect pages gated by a
   friendly "complete your profile" state instead of a global redirect; report section navigation, evidence legend,
   assumptions summary; quick reports can be upgraded to the full 20-section analysis.
6. **Empty states, responsive and accessibility pass** on the touched screens.

### E.2 Explicitly not in Phase 1
Capital and Test functionality, investor/tester profiles, fake or placeholder data, new paid AI usage, Android
redesign (Android keeps working unchanged; its Quick Validate comes later), production deploy without approval.

### E.3 Execution & environments
* All work on branch `think-first` → Vercel **preview** (staging). `main`/production untouched until approved.
* New migration is **additive only** (new tables/columns/functions, widened check constraints). Tested locally;
  applied to the live DB only after approval. The new edge function `think-quick` is deployed only after approval.
* Until both are approved, the preview shows Quick Validate's UI but submissions fail gracefully.

### E.4 Assumptions to confirm
1. Five report sections as listed in E.1.2.
2. Anonymous limits: 3 Quick Validates per IP per day, 200 per day globally; inputs ≤ 2,000 chars.
3. Magic-link (passwordless) registration as the email-first step; password login retained.
4. Connect remains usable but secondary; Capital/Test appear only as "planned" in the ecosystem section.

## F. Risks, affected files, migration requirements

| Risk | Mitigation |
|---|---|
| Anonymous endpoint abuse / cost | Per-IP (hashed) and global daily caps; free providers only; non-AI fallback; input limits; no paid fallback (existing rules). |
| Leaking anonymous ideas | Table has RLS with **no** policies; only service role and a definer RPC that requires the token; token stored hashed; 7-day expiry; disclosure on the form. |
| Claim-token theft (shared device) | Token lives in `localStorage` of the browser that created it; single use; tied to the first account that claims it. |
| Breaking existing users by removing the onboarding gate | Gate moves to Connect pages; server-side RPCs already require `onboarding_completed` for connection requests; discovery only shows onboarded profiles. |
| Email delivery | Magic links depend on SMTP; until the Resend domain is verified only the owner receives mail (operational). |
| Preview uses production DB | Previews are protected by Vercel Authentication; new tables are inert until migration approval. |

**Affected files (planned):** `packages/shared/src/think.ts`, `packages/shared/src/api.ts`, new
`supabase/migrations/20261107000001_think_first_foundation.sql`, new `supabase/functions/think-quick/`,
`supabase/tests/30_think_first.sql`, web: `(marketing)/page.tsx`, new `(marketing)/validate/*`, `(auth)/register/*`,
`components/app/AppShell.tsx`, `AppProvider.tsx`, `(shell)/layout.tsx`, Connect pages (gate), `think/[id]`,
`ThinkUI.tsx`, new `components/think/*`, `SiteHeader.tsx`; docs.

**Migration requirements:** one additive migration (no drops of tables/columns, no data rewrites). Requires
approval to apply to the live project, plus approval to deploy `think-quick`.
