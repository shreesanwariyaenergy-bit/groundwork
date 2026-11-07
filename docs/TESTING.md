# Testing

## Automated (run in this repository)
| Suite | Command | What it covers | Result at handover |
|---|---|---|---|
| Database (RLS + logic) | `bash supabase/tests/run-local.sh` | Applies all migrations to a throwaway Postgres with a Supabase auth shim, then ~70 assertions: visibility rules, privileged-column protection, anon denial, matching ranks a complementary technical co-founder first with correct reasons/type, hidden profiles excluded, search filters, connection lifecycle & duplicates, link blocking, unverified rate limit, messaging permissions & unread counts, Think privacy & sharing, blocking side-effects, admin boundaries & audit, metrics, export, deletion cascade, recommendation job idempotency | **Pass** (PostgreSQL 16) |
| Shared logic | `pnpm test` | Think report normalisation (20 sections, unsourced "verified" downgraded, preliminary flags), checklist fallback, JSON extraction, prompt data isolation, Markdown export, profile completion, validation | **10/10 pass** |
| Edge function adapters | `deno test --allow-net --allow-env supabase/functions/tests/ai_test.ts` (from `supabase/functions`, with `--config deno.json`) | OpenAI-compatible + Gemini adapters against mock servers, auth headers, token accounting, 429/missing-key errors, cost estimate | **4/4 pass** |
| Type checks | `pnpm typecheck`, `deno check …` | shared, web, mobile, edge functions | **Pass** |
| Lint | `pnpm --filter web lint` | Next.js + React hooks rules | **Pass** |
| Web build | `pnpm build:web` | Production build; `/app` and `/admin` forced dynamic | **Pass** |
| Database on live Supabase | rolled-back transaction via SQL (same assertions as the local suite) | Real Supabase auth schema, triggers on `auth.users`, RLS, grants | **Pass** (2026-11-07) |
| Live API smoke test | `curl` with the publishable key | anon can read taxonomy only; profiles/Think/admin/matching RPCs denied; edge functions return 401/403 without credentials | **Pass** |
| Android bundle | `cd apps/mobile && npx expo export --platform android` | Metro + Hermes bundle of the full app incl. workspace package | **Pass** |

The local DB suite uses plain PostgreSQL with a minimal `auth` shim (`supabase/tests/00_supabase_shim.sql`); it does
not exercise Supabase Storage, Realtime or the real GoTrue service.

## Not yet tested (requires the live Supabase project)
* Real sign-up / email verification / password reset / Google OAuth on web and Android.
* PostgREST behaviour of every RPC call from the apps (shapes are typed but unverified against a live API).
* Realtime delivery of messages and notification badges under RLS.
* Storage uploads and bucket policies.
* Edge functions deployed end-to-end (`think` with a real free-tier provider, `delete-account`, `notify-dispatch` + webhook).
* Push notifications on physical Android devices (Android 13+ permission prompt, token refresh, deep links from a killed app).
* Cross-device matrix: small/large screens, Android 10–16, slow/lost network, backgrounding.

## Manual beta test script (per release)
1. Register two accounts (A founder seeking technical co-founder; B ML engineer seeking business co-founder) on web and Android.
2. Verify email; confirm unverified accounts are limited to 3 requests/day.
3. Complete onboarding on both; confirm A sees B in recommendations with reasons.
4. A sends request with a link → rejected; without link → B notified (in-app + push).
5. B accepts → conversation opens on both; realtime messages both directions; unread badges clear.
6. A creates a Think project, runs checklist; enables AI (admin) → acknowledges disclosure → report renders; follow-up; export.
7. A shares project with B → B reads it; A removes connection → B loses access.
8. B blocks A → profile/messaging hidden; A reports B with a message → appears in Admin → Reports.
9. Admin suspends an account → it disappears from discovery; audit log entry exists.
10. Export data on both platforms; delete account on Android; confirm row cascade and public `/delete-account` form.

## Security tests to run against the deployed API
Use a normal user's JWT with `curl`/PostgREST to attempt: reading another user's `think_projects`, `messages`,
`profile_preferences`; inserting into `connections`, `think_analyses`, `admin_roles`; updating another profile;
calling `admin_*` RPCs; calling `compute_matches` directly; uploading to another user's storage folder; uploading a
non-image. All must fail. Then run Supabase Advisors.
