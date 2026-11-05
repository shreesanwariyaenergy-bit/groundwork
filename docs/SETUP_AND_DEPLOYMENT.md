# Setup and deployment

Prerequisites: Node 22+, pnpm 10, Supabase CLI, a **new** Supabase project, a **new** Vercel project,
an Expo account (EAS), a Google Play developer account. Keep local / staging / production as separate Supabase
projects with separate keys.

## 1. Install
```bash
pnpm install
```
```bash
pnpm test && pnpm typecheck
```

## 2. Supabase (backend)
Create the project (Dashboard → New project). On the free plan an organisation may own at most two active free
projects — the current organisation is at that limit, so either upgrade it or create a separate organisation.

```bash
supabase link --project-ref <project-ref>
```
```bash
supabase db push
```
Then in the Dashboard:
1. **Integrations → Cron**: migration 0006 enables `pg_cron` and schedules two jobs (`gw-recommendation-notifications`, `gw-prune`). Confirm they are listed.
2. **Auth → URL configuration**: Site URL = your web domain; redirect URLs = `https://<domain>/auth/callback` and `groundwork://auth/callback`.
3. **Auth → Providers**: Email (confirm email ON, min password 10). Google: create an OAuth client in Google Cloud and paste ID/secret.
4. **Auth → SMTP**: configure a real provider (e.g. Resend) — the built-in sender is heavily rate-limited.
5. **Auth → Bot protection**: enable CAPTCHA for sign-up before public launch.
6. **Edge Functions**:
   ```bash
   supabase functions deploy think
   ```
   ```bash
   supabase functions deploy delete-account
   ```
   ```bash
   supabase functions deploy notify-dispatch --no-verify-jwt
   ```
   ```bash
   supabase secrets set NOTIFY_WEBHOOK_SECRET=<random-64-chars> APP_URL=https://<domain> ALLOWED_ORIGINS=https://<domain>
   ```
   Optional: `RESEND_API_KEY`, `EMAIL_FROM`, `EXPO_ACCESS_TOKEN`, AI keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`).
7. **Database → Webhooks**: table `notifications`, event INSERT, type *Supabase Edge Function* `notify-dispatch`,
   HTTP header `x-webhook-secret: <NOTIFY_WEBHOOK_SECRET>`.
8. **Make yourself admin** (SQL editor, after signing up through the app):
   ```sql
   insert into public.admin_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com';
   ```
9. Run **Advisors** (security + performance) and resolve findings.

If `supabase/functions/_shared/think.ts` must change, edit `packages/shared/src/think.ts` and run
`pnpm --filter @groundwork/shared sync:functions`.

## 3. Website (Vercel)
1. New Vercel project from this repo; **Root Directory** `apps/web`; framework Next.js; install command `pnpm install`.
2. Environment variables (Production and Preview separately):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
   Never add the service-role key or AI keys to Vercel.
3. Deploy, add the custom domain, then update Supabase Auth Site URL / redirects.
4. Smoke test: register → verify email → onboarding → discover → Think checklist → settings export → delete account.

Local: `cp apps/web/.env.example apps/web/.env.local`, fill values, `pnpm dev:web`.

## 4. Android (EAS)
```bash
cd apps/mobile
```
```bash
npx eas-cli@latest login
```
```bash
npx eas-cli@latest init
```
This writes `extra.eas.projectId` (needed for push tokens). Then:
1. Confirm the package ID in `app.json` (`com.groundwork.network`) — it can never change after the first Play upload.
2. Set EAS environment variables for each environment (`development`, `preview`, `production`):
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SITE_URL`.
3. Push: create a Firebase project, add an Android app with the same package, then upload the **FCM V1 service
   account key** in EAS → Credentials → Android → Push notifications. (`google-services.json` is not committed.)
4. Builds:
   ```bash
   npx eas-cli@latest build --profile preview --platform android
   ```
   (internal APK for testers), and for the store:
   ```bash
   npx eas-cli@latest build --profile production --platform android
   ```
   EAS generates and stores the upload keystore — back it up (`eas credentials`).
5. Submit to the internal testing track:
   ```bash
   npx eas-cli@latest submit --platform android --profile production
   ```
   (needs a Play service-account JSON at `apps/mobile/play-service-account.json`, git-ignored).

Local development: `cp apps/mobile/.env.example apps/mobile/.env`, then `pnpm dev:mobile`. Push notifications and
Google sign-in need a development build (`eas build --profile development`), not Expo Go.

`targetSdkVersion`/`compileSdkVersion` are pinned to 36 via `expo-build-properties`; confirm the current Play
requirement in Play Console before each release.
