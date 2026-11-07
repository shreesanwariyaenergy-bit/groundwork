# Groundwork ecosystem architecture (four pillars)

Groundwork is one product with four pillars on a shared foundation. Only **Think** (and the existing **Connect**
code) is built; **Capital** and **Test** are documented here so that nothing built now has to be replaced later.

```
                 ┌────────────────────────────────────────────────────────────────┐
                 │                SHARED FOUNDATION (exists today)                │
                 │ auth.users · profiles · skills/roles/industries · visibility   │
                 │ startup_projects (the VENTURE) · notifications · messaging     │
                 │ blocks/reports · admin + audit · feature flags · analytics     │
                 └───────┬──────────────┬───────────────┬───────────────┬─────────┘
                         │              │               │               │
                 ┌───────▼─────┐ ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
                 │   THINK     │ │  CONNECT    │ │  CAPITAL    │ │    TEST     │
                 │ (Phase 1)   │ │ (built,     │ │ (planned)   │ │ (planned)   │
                 │             │ │  secondary) │ │             │ │             │
                 └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

## The venture is the anchor
`startup_projects` is the single record of "a startup". Every pillar attaches to it rather than inventing its own:

| Pillar | Attaches to the venture via | Status |
|---|---|---|
| Think | `think_projects.startup_project_id` (nullable; a Think project can exist before a venture does) | **Added in Phase 1** |
| Connect | `startup_project_members` (collaborators), `startup_project_skills` (have/need) | Exists |
| Capital | `capital_*` tables keyed by `startup_project_id` | Planned |
| Test | `test_campaigns.startup_project_id` | Planned |

Lifecycle: anonymous Quick Validate → claimed into a Think project → (optional) promoted into a venture
(`startup_projects`) → venture finds collaborators (Connect), investors (Capital), testers (Test).

## Domain boundaries

| Domain | Owns (tables) | Public API | Must not |
|---|---|---|---|
| Identity & profile (shared) | profiles, *_profiles, user_skills, links, experiences, preferences | profile reads (RLS), `export_my_data` | contain pillar-specific workflow state |
| Venture (shared) | startup_projects, members, skills | RLS + future `create_venture_from_think` | depend on any single pillar |
| Think | think_projects, think_analyses, think_messages, think_sources, think_project_shares, think_quick_reports | `think`, `think-quick` edge fns, `claim_quick_report`, `think_status` | be readable by staff or other pillars without explicit share |
| Connect | match_*, saved_profiles, connection_requests, connections | matching/search/connection RPCs | read Think content |
| Messaging & notifications (shared) | conversations, messages, notifications, device_tokens | RPCs + Realtime | assume a pillar; notification `type` is extended per pillar |
| Capital (planned) | investor_profiles, capital_interests, capital_updates | TBD RPCs | expose Think reports unless the founder shares a specific report |
| Test (planned) | test_campaigns, test_participants, test_feedback | TBD RPCs | collect tester data beyond the campaign's consent |

## Extension points (already present or added in Phase 1)
* **User intents** (`profiles.intents` enum): add `investor`, `tester` when those pillars launch — not before, so the
  UI never offers roles that do nothing.
* **Notifications**: `notifications.type` check constraint is widened per pillar (e.g. `capital_interest`, `test_feedback`).
* **Feature flags**: each pillar ships behind `pillar.<name>.enabled` (Phase 1 adds `pillar.think.quick_validate`).
* **Sharing model**: Think's explicit, revocable, connection-scoped share (`think_project_shares`) is the template for
  sharing a report with an investor or a test lead.
* **Rate-limit + usage ledgers**: `rate_limit_events`, `anon_rate_limits`, `ai_usage_logs` are pillar-agnostic.

## Planned data model sketches (NOT created)

**Capital**
* `investor_profiles(user_id pk → profiles, firm, check_size_min/max, stages startup_stage[], industries text[], geographies text[], visibility)`
* `capital_interests(id, startup_project_id, investor_id, status: requested|accepted|declined|withdrawn, message, created_at)` — mirrors the connection-request lifecycle; acceptance opens a conversation.
* `capital_updates(id, startup_project_id, author_id, body, visibility)` — founder updates to accepted investors.
* Compliance: investor verification and securities rules vary by country — legal review required before build.

**Test**
* `test_campaigns(id, startup_project_id, owner_id, title, brief, target_profile jsonb, status, starts_at, ends_at)`
* `test_participants(campaign_id, user_id, status: invited|accepted|completed, consent_at)`
* `test_feedback(id, campaign_id, participant_id, ratings jsonb, body, created_at)` — feeds back into Think
  (assumptions marked validated/invalidated).

## Navigation model
Web app nav is pillar-shaped: **Home · Think · Connect (Discover, Connections, Messages) · Profile**. Capital and Test
get nav entries only when they are functional. The marketing site presents all four pillars with honest status labels.

## Rules
1. One identity, one profile, one venture record — never per-pillar copies.
2. Private by default; cross-pillar visibility only through explicit, revocable shares.
3. No pillar ships UI before its backend works. No placeholder data.
