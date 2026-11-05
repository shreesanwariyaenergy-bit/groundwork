# Database, RLS and security

Migrations: `supabase/migrations/` (apply in filename order).

| File | Contents |
|---|---|
| `…0001_core_schema.sql` | Enums, taxonomy, profiles & sub-tables, startup projects, matching, connections, messaging, notifications, safety, admin, analytics, invitations, deletion requests |
| `…0002_think_ai_schema.sql` | Think projects/analyses/messages/sources/shares, AI provider configs, AI usage ledger |
| `…0003_security_rls.sql` | Helper predicates, auth triggers, protected-column trigger, privileges, **all RLS policies** |
| `…0004_business_logic.sql` | Validation triggers, matching engine, search, connection lifecycle, blocks/reports, messaging triggers, notifications, export, admin RPCs, metrics |
| `…0005_grants_seed_platform.sql` | Function EXECUTE grants, taxonomy seed (skills/roles/industries — **no users**), default flags, disabled AI providers, storage bucket + policies, realtime publication |
| `…0006_recommendation_job.sql` | Recommendation notification job, pruning, pg_cron schedules |

## Schema notes (normalisation decisions)
* `profiles` holds common profile fields; `founder_profiles` / `professional_profiles` hold role-specific fields.
* The PRD's `startup_project_visibility` is a column (`startup_projects.visibility`) — one value per project.
* The PRD's `think_reports` is `think_analyses.report` (JSON, versioned by row) — every regeneration is a new row.
* The PRD's `message_read_status` is `conversation_members.last_read_at` — unread = messages newer than it.
* `users` is Supabase `auth.users`; nothing sensitive (email, password) is duplicated into `public`.
* Indexes cover discovery filters (GIN on arrays, trigram on names/skills, full-text `search_vector`),
  inbox ordering and the per-user ledgers.

## Principles
1. RLS is enabled on **every** table in `public` (loop in migration 0003). Tables without a policy are inaccessible.
2. `anon` has no table access except read-only taxonomy, and may call only `submit_deletion_request`.
3. State transitions go through SECURITY DEFINER functions that pin `search_path = ''` and check `auth.uid()`.
4. Function EXECUTE is revoked from `public/anon/authenticated` by default; only the API surface is granted.
5. Privileged profile columns (`email_verified`, `account_status`, …) are reset by a trigger on client updates.
6. Admins have **no** policy on Think tables: private ideas are invisible to staff.
7. Service-role and AI keys exist only as Edge Function secrets.

## RLS matrix

`own` = row belongs to `auth.uid()`; `visible` = `can_view_profile()`; `member` = conversation member; `RPC` = only via a SECURITY DEFINER function.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| skills, roles, industries, skill_categories | anyone | admin | admin | admin |
| profiles | visible (members-visibility, connections, pending-request counterpart, self, staff; never blocked/suspended) | trigger on signup | own (protected columns enforced) | via account deletion |
| founder_profiles, professional_profiles, user_skills, user_experiences, profile_links | visible | own | own | own |
| profile_preferences | own | own | own | own |
| startup_projects (+members, skills) | owner, member, staff, or per `visibility` | owner | owner | owner |
| match_recommendations | own | RPC | RPC | RPC |
| match_feedback | own | own | own | own |
| saved_profiles | own | own, target visible | own | own |
| connection_requests | sender, recipient, staff | RPC | RPC | — |
| connections | either party | RPC | — | RPC |
| conversations / conversation_members | member | RPC | RPC (`mark_conversation_read`, mute) | — |
| messages | member | sender = self AND member AND still connected AND not blocked AND account active | — | cascade |
| notifications | own | RPC/trigger | own (read_at) | own |
| device_tokens | own | RPC (`register_device_token`) | RPC | own |
| blocked_users | blocker | RPC | — | RPC |
| user_reports | reporter, staff | RPC | RPC (staff) | — |
| rate_limit_events | — | RPC | — | job |
| admin_roles | self, admin | RPC (admin) | RPC | RPC |
| admin_audit_logs | staff | RPC | — | — |
| feature_flags | public flags, staff | RPC (admin) | RPC (admin) | — |
| analytics_events | staff | own | — | — |
| invitations / referrals | own | RPC / signup trigger | — | — |
| account_deletion_requests | own, staff | RPC (anon allowed) | RPC (staff) | — |
| think_projects | owner, or grantee while still connected | owner | owner | owner |
| think_analyses / think_messages / think_sources | project access | **edge function only** | edge function | owner |
| think_project_shares | owner, grantee | owner → existing connection only | — | owner or grantee |
| ai_provider_configs / ai_usage_logs | staff | edge function / RPC | RPC (admin; paid-approval DB constraint) | — |

Storage `avatars`: public read (unguessable `uid/random.jpg` paths); insert/update/delete only inside `auth.uid()/`;
2 MB; JPEG/PNG/WebP only. Clients resize to 512 px before upload.

## Abuse controls (configurable in `feature_flags`)
* Connection requests: 25/day verified, **3/day unverified**, 30-day cooldown after reject/withdraw, no links in notes,
  one pending request per pair, cannot request hidden/connections-only/blocked/suspended users.
* Messages: 30/min, unverified accounts cannot send links, only between current connections.
* Search: 120/min. Reports: 10/day. Data export: 5/day. Public deletion form: dedup per email + global cap.
* Suspension cancels pending requests and removes the account from recommendations.

## Verified by tests
`supabase/tests/10_rls_and_logic.sql` (see `docs/TESTING.md`) asserts, among others: anon cannot read profiles/messages/
Think; hidden profiles never appear; users cannot edit others or forge privileged columns; direct inserts into
connections/requests/analyses are denied; non-members cannot read or post messages; blocking removes the connection,
visibility, messaging and Think sharing; admins cannot read private Think projects; admin RPCs reject non-admins and
write audit rows; deletion cascades and anonymises reports.

## Before launch (not done here)
* Run `get_advisors` (security + performance) on the real project and fix findings.
* Penetration-style checks against the deployed API (RLS bypass attempts with crafted PostgREST queries).
* Configure Auth: SMTP provider, email templates, redirect allow-list, leaked-password protection, CAPTCHA (Turnstile/hCaptcha) on sign-up.
* Legal review of Terms/Privacy/age/retention for each market. The policy pages are marked as drafts.
