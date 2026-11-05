# Architecture

Groundwork (working name — see `packages/shared/src/constants.ts → BRAND`) is a founder and startup-builder network with three
capabilities: co-founder matchmaking, professional matchmaking and **Think**, a structured AI idea-validation workspace.

## System overview

```
                ┌──────────────────────────┐        ┌──────────────────────────┐
                │  Web (Next.js 16, Vercel) │        │ Android (Expo SDK 58, EAS)│
                │  marketing · app · admin  │        │  native screens, push     │
                └────────────┬─────────────┘        └────────────┬─────────────┘
                             │  supabase-js (publishable key + user JWT)        │
                             │  shared typed client: packages/shared/src/api.ts │
                             ▼                                                  ▼
 ┌───────────────────────────────────────────────────────────────────────────────────┐
 │                         Supabase project (NEW, dedicated)                         │
 │                                                                                   │
 │  Auth (email+password, email verification, Google OAuth)                          │
 │                                                                                   │
 │  Postgres 17 ─ tables with RLS on every user-data table                           │
 │     └ business logic as SECURITY DEFINER RPCs (matching, search, connections,     │
 │       blocks, reports, conversations, export, admin)  ← single source of truth    │
 │                                                                                   │
 │  Realtime ─ messages, notifications, connection_requests (RLS-filtered)           │
 │  Storage  ─ avatars bucket (own-folder writes, images ≤ 2 MB)                     │
 │  pg_cron  ─ daily recommendation notifications, pruning                           │
 │                                                                                   │
 │  Edge Functions (Deno, service role, never exposed to clients)                    │
 │     think            → AI provider layer, quotas, cost ledger, checklist fallback │
 │     delete-account   → storage cleanup + auth user deletion (cascade)             │
 │     notify-dispatch  → Database Webhook on notifications INSERT → Expo push/email │
 └───────────────────────────────────────────────────────────────────────────────────┘
            │                                   │                         │
            ▼                                   ▼                         ▼
   AI providers (free tiers first:      Expo Push API → FCM         Resend (optional,
   Gemini / Groq / OpenRouter / Ollama)                             transactional only)
```

### Why this shape
* **One backend, two clients.** Every rule that matters (who can see whom, rate limits, connection state machine,
  messaging permissions, quotas) is enforced in Postgres or an Edge Function — never only in a UI. Web and Android
  call the same RPCs through the same typed client (`createApi()` in `packages/shared`).
* **No microservices.** Postgres functions + three edge functions cover the MVP. The matching engine is a SQL
  function whose weights live in `feature_flags`, so it is testable (`supabase/tests`) and tunable without deploys.
* **Provider-agnostic AI.** `supabase/functions/_shared/ai.ts` has adapters for Gemini, any OpenAI-compatible API
  (Groq, OpenRouter, Together, …) and Ollama. Adding a provider = one adapter + one row.

## Repository layout

```
apps/web            Next.js App Router (marketing, /app, /admin), Tailwind v4, proxy.ts session refresh
apps/mobile         Expo Router app (src/app), Android package com.groundwork.network
packages/shared     Types, zod validation, design tokens, Think report format + checklist, typed API client
supabase/migrations SQL migrations (schema, RLS, RPCs, seed taxonomy/config, cron)
supabase/functions  Edge functions (think, delete-account, notify-dispatch) + Deno tests
supabase/tests      Local SQL test suite (RLS + business logic) — bash supabase/tests/run-local.sh
docs/               This documentation
```

## Frontend / backend boundaries

| Concern | Where it lives | Notes |
|---|---|---|
| Authentication | Supabase Auth | Web: `@supabase/ssr` cookies + `proxy.ts`. Android: AsyncStorage + PKCE. |
| Authorization | Postgres RLS + RPC checks | UI hiding is never a security boundary (admin layout also checks server-side). |
| Matching & search | `compute_matches`, `get_recommendations`, `search_profiles` | Score never sent to clients; reasons are. |
| Connection lifecycle | `send/respond/withdraw_connection_request`, `remove_connection` | Direct table writes are denied. |
| Messaging | `messages` insert policy + triggers | Must be member + still connected + not blocked; rate limited. |
| Think AI | `think` edge function | Clients cannot write analyses; only the owner can run AI. |
| Notifications | DB triggers create rows; `notify-dispatch` delivers | Push body never contains message text. |
| Account deletion | `delete-account` edge function | In-app (web + Android) and public web page. |
| Admin | `admin_*` RPCs (role re-checked) + audit log | Admins have **no** access to private Think projects. |

## User journey

1. Visitor lands on the marketing site → **Join the network** (or installs the Android app).
2. Registers (email + password with 18+ confirmation, or Google) → verifies email.
3. Onboarding: intents → who they are looking for → about/location/availability → skills & links →
   (founders) startup details → visibility + age confirmation.
4. Home dashboard: completeness, recommendations with reasons, pending requests, conversations, Think projects.
5. Discover: recommendations by match type, search + filters, save/dismiss, view profile.
6. Connect with a short note → recipient accepts → a conversation opens (realtime).
7. Think: create a private project → acknowledge AI disclosure → AI report (or non-AI checklist) →
   follow-ups → export → optionally share read-only with a connection.
8. Settings: notifications, privacy, data export, blocked accounts, delete account.

## Milestone status (honest)

| # | Milestone | Status |
|---|---|---|
| 1 | Architecture, schema, RLS matrix, contracts, design system | **Done** (this folder, `packages/shared/src/tokens.ts`) |
| 2 | Foundation: repo, migrations, web + Expo apps, env config | **Done locally.** New Supabase project **not created** (free-plan 2-project limit); GitHub push blocked (invalid token) |
| 3 | Auth + onboarding | **Code complete**, untested against a live Supabase Auth |
| 4 | Profiles + discovery | **Code complete**; SQL logic tested locally |
| 5 | Matching + connections, rate limits, block/report | **Code complete**; SQL tests pass |
| 6 | Think (provider layer, quotas, export) | **Code complete**; adapters unit-tested with mock servers; no live provider call made |
| 7 | Messaging + notifications | **Code complete**; realtime/push untested live |
| 8 | Admin + operational controls | **Code complete** |
| 9 | Beta | **Not started** — needs a deployed backend and real users |
| 10 | Public launch | **Not started** |

## Risk register

| Risk | Likelihood | Impact | Mitigation in this codebase / plan |
|---|---|---|---|
| Insufficient matching density | High | High | Think works standalone; search alongside recs; honest empty states; invite links (`invitations`/`referrals`); launch wedge = founders × technical builders. No fake profiles anywhere. |
| Low-quality profiles | Med | Med | Structured onboarding, completeness guidance (not a trust score), reports, admin moderation. |
| Low-quality / hallucinated AI analysis | Med | High | Fixed 20-section schema, mandatory evidence labels, server-side `normalizeReport` downgrades unsourced "verified", market/competitor sections always "preliminary", disclaimers. |
| AI costs | Med | High | Providers ship disabled; master switch; per-user/global quotas; per-provider RPM/daily caps; paid requires approval + budget (DB constraint); no automatic paid fallback. |
| Startup idea privacy | Med | High | Think private by default; sharing only to connections; staff excluded by RLS; AI disclosure before first use; no prompt text in logs. |
| Spam / harassment | Med | High | Connection-gated messaging, link restrictions, rate limits (stricter when unverified), block/report, audit-logged moderation. |
| Play Store rejection | Med | Med | In-app + web deletion, accurate Data safety, target API 36, minimal permissions (blocked list in `app.json`). |
| Supabase free-tier limits | High (now) | Med | Project could not be created on the current org. Upgrade org or free a slot before Milestone 2 can be completed in the cloud. |
| Development complexity | Med | Med | Shared client + tokens; logic in SQL; strict MVP scope (no payments, investors, forums). |

## Project separation
This repository was created from an empty workspace. It references no other project's repository, Supabase project,
Vercel project, keys or users. The Android package ID (`com.groundwork.network`) and brand are placeholders to
confirm before the first Play upload. Existing Supabase projects in the organisation (`outflex`, `status-network`)
were **not** modified.
