# Google Play submission checklist

| Item | Status / where |
|---|---|
| Unique application ID | `com.groundwork.network` in `apps/mobile/app.json` — **confirm brand first; permanent** |
| Production signing | EAS-managed upload key + Play App Signing. Back up credentials. |
| App icon / adaptive icon | `apps/mobile/assets/images/*` are template placeholders — **replace with final brand art** |
| Screenshots (phone, ≥2), feature graphic 1024×500 | To produce from the beta build with consenting test accounts (no fabricated people) |
| Title, short & full description | Draft below |
| Support email | `BRAND.supportEmail` placeholder in `packages/shared/src/constants.ts` — **replace** |
| Privacy Policy URL | `https://<domain>/privacy` (draft — legal review required) |
| Account deletion URL | `https://<domain>/delete-account` (works without the app) |
| In-app account deletion | Profile → Settings → Delete account (calls `delete-account`) |
| Content rating questionnaire | Social/communication app with user-to-user messaging; moderation + block/report exist |
| Target audience | 18+ only (age confirmation at sign-up) — do not select under-18 audiences |
| Target API level | 36 via `expo-build-properties`; re-check Play Console requirement before release |
| App access for review | Provide a reviewer test account (email + password) with completed onboarding |
| Permissions | Only `POST_NOTIFICATIONS` (+ INTERNET). Location, audio, contacts, overlay explicitly blocked. Photo picker uses the system picker. |
| Billing | No payments in v1 — no Play Billing needed. Revisit before any paid feature. |
| Crash monitoring | **Not yet added.** Recommended: Sentry (`@sentry/react-native`) — then declare it in Data safety |
| Device testing | Small (≤360dp) and large phones, Android 10–16, slow/no network, backgrounding, notification deep links |
| Testing track | Internal → closed testing (new personal developer accounts must run a closed test with testers for 14 days before production) |

## Data safety declaration (reflects current code — update if you add SDKs)
Data collected (all transmitted over TLS; users can request deletion):
* **Personal info**: name, email address, user IDs; optional city/country — *App functionality, Account management*.
* **Photos**: profile photo (optional) — *App functionality*.
* **Messages**: in-app messages — *App functionality*.
* **App activity**: in-app actions (product events), user-generated content (profiles, startup details, Think projects) — *App functionality, Analytics*.
* **Device or other IDs**: push notification token — *App functionality*.
Data shared with third parties: Think content is sent to the configured **AI provider** when the user requests an
analysis (declare as shared for *App functionality*). Service providers acting on your behalf (Supabase, Expo/FCM)
are processors. No advertising, no data sale. Not collected: location (precise/approximate via GPS), contacts,
financial info, health info, audio, web history.

## Draft listing copy
**Title:** Groundwork: Co-founders & Builders  
**Short description:** Find co-founders and startup builders. Validate ideas with a structured AI workspace.  
**Full description:** Groundwork is a focused network for founders and the people who build startups with them. Get
recommendations for people whose skills complement yours — technical co-founders, business co-founders, AI/ML
engineers, developers, designers, product and growth professionals — with clear reasons for every match. Connect
with a short personal note; messaging opens when both of you agree. Use Think to examine an idea across 20 areas,
from customer pain points to risks, validation experiments and next steps, with every point labelled as an
assumption, estimate or recommendation. Your Think projects are private unless you share them. Free to join. 18+.
(Do not add user counts, testimonials or traction claims.)
