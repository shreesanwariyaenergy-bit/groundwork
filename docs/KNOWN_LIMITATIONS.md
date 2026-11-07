# Known limitations and blockers

## Blockers (need you)
1. ~~Supabase project not created.~~ **Done (2026-11-07):** project `groundwork` (ref `vovupikwumeckppuotgk`, region
   ap-south-1) created after `outflex` was paused. All 6 migrations applied; edge functions `think`, `delete-account`,
   `notify-dispatch` deployed; the full RLS/logic test suite passed against the live database (in a rolled-back
   transaction). Still to do in the dashboard: Auth URLs/SMTP/Google, the notifications Database Webhook, secrets
   (`NOTIFY_WEBHOOK_SECRET`, `APP_URL`, `ALLOWED_ORIGINS`, AI keys) — see `docs/SETUP_AND_DEPLOYMENT.md`.
2. ~~GitHub repository not created.~~ **Done:** https://github.com/shreesanwariyaenergy-bit/groundwork (`main`).
3. **Website deployed** to Vercel project `groundwork` (root `apps/web`, Node 22) — production URL
   https://groundwork-shreesanwariyaenergy-bit.vercel.app ; every push to `main` deploys automatically. Vercel
   Authentication protects preview deployments only. **Android not yet built** (no EAS project or Play listing).

## Product / technical limitations
* Database logic and RLS are verified on the live project; real sign-up/email, Realtime, Storage uploads and AI calls through the deployed functions are not yet exercised end-to-end (see `docs/TESTING.md`).
* Think performs **no external research**; market and competitor findings are always marked preliminary. `think_sources`
  exists for a future research step.
* AI analysis is synchronous (20–60 s typical; edge function wall-clock limits apply). A queue would be needed at scale.
* Matching computes on request (cached 6 h per user, candidate pool capped at 3,000 most-recently-active profiles).
  Fine for early stage; move to batch scoring if the network grows large.
* Avatars are in a public bucket with unguessable paths: a hidden profile's photo URL stays reachable if someone saved it.
* Messaging is text-only, 1:1, no editing/deleting individual messages.
* Mobile Think export uses the Android share sheet (Markdown text); web offers Markdown download and browser print-to-PDF.
* Android profile editing omits the experience editor (available on web); experience shows on profiles from both.
* Homepage "product previews" are rendered UI with clearly labelled illustrative content, not screenshots — replace
  with real screenshots from consenting beta users.
* Brand name "Groundwork", package ID, support email, app icons and splash are placeholders.
* Legal pages are drafts requiring legal review; no cookie banner (no non-essential cookies are set today).
* No crash reporting / error monitoring SDK yet (Sentry recommended; update Privacy + Data safety if added).
* No CAPTCHA on sign-up yet (enable Supabase bot protection before public launch).
* Localisation: English only; strings are not yet extracted for i18n.
* iOS: architecture-compatible (Expo), but not configured, built or tested — out of scope as requested.
* Email notifications require configuring Resend (or adapting `notify-dispatch` to another provider).
* `expo install` could not reach Expo's API from this environment; native dependency versions were resolved from the
  SDK's bundled module map (`EXPO_OFFLINE=1`). Run `npx expo-doctor` once online.
