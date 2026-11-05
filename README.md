# Groundwork

A global network where founders find co-founders and startup builders, and validate ideas with **Think**,
a structured AI workspace. Web (Next.js) + Android (Expo) on one Supabase backend.

> "Groundwork" is a working name. Brand, package ID and support email are placeholders (see `docs/PLAY_STORE_CHECKLIST.md`).

| Path | What |
|---|---|
| `apps/web` | Marketing site, authenticated web app (`/app`), admin dashboard (`/admin`) |
| `apps/mobile` | Android app (Expo SDK 58, Expo Router) |
| `packages/shared` | Types, validation, design tokens, Think report format, typed API client |
| `supabase/` | Migrations (schema, RLS, RPCs), edge functions, SQL tests |
| `docs/` | Handover documentation |

## Quick start
```bash
pnpm install
```
```bash
pnpm test && pnpm typecheck && bash supabase/tests/run-local.sh
```
Then follow **[docs/SETUP_AND_DEPLOYMENT.md](docs/SETUP_AND_DEPLOYMENT.md)**.

## Documentation
* [Architecture, milestones, risk register](docs/ARCHITECTURE.md)
* [Database, RLS matrix, security](docs/SECURITY.md)
* [Setup & deployment (Supabase, Vercel, EAS)](docs/SETUP_AND_DEPLOYMENT.md)
* [Google Play checklist + Data safety](docs/PLAY_STORE_CHECKLIST.md)
* [AI usage & cost controls](docs/AI_COSTS.md)
* [Metrics & formulas](docs/ANALYTICS.md)
* [Testing](docs/TESTING.md)
* [Known limitations & blockers](docs/KNOWN_LIMITATIONS.md)

## Non-negotiables built into the code
No fake users, matches or traction. Think is private by default. RLS on every table. No secrets in clients.
No paid AI without explicit admin approval and a budget. Account deletion in-app and on the web.
