-- =============================================================================
-- Groundwork — core schema
-- Identity, profiles, taxonomy, startup projects, discovery, connections,
-- messaging, notifications, safety, admin, analytics.
-- All tables live in `public` and have RLS enabled in migration 0002.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_intent as enum (
  'founder',               -- I am building a startup
  'cofounder_seeker',      -- I want to join a startup as a co-founder
  'professional',          -- I am a professional / builder
  'startup_collaborator'   -- I want to collaborate with startups (contract, part-time, advisory)
);

create type public.startup_stage as enum ('idea', 'validation', 'mvp', 'launched', 'growth');
create type public.availability_level as enum ('full_time', 'part_time', 'weekends', 'advisory', 'exploring');
create type public.work_mode as enum ('remote', 'hybrid', 'in_person', 'flexible');
create type public.profile_visibility as enum ('members', 'connections', 'hidden');
create type public.project_visibility as enum ('private', 'connections', 'members');
create type public.account_status as enum ('active', 'restricted', 'suspended', 'pending_deletion');
create type public.connection_status as enum ('pending', 'accepted', 'rejected', 'withdrawn', 'cancelled');
create type public.report_reason as enum ('spam', 'harassment', 'fake_profile', 'inappropriate', 'scam', 'other');
create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');
create type public.admin_role as enum ('admin', 'moderator');
create type public.link_kind as enum ('linkedin', 'github', 'website', 'portfolio', 'project', 'other');

-- ---------------------------------------------------------------------------
-- Taxonomy (reference data, readable by everyone signed in)
-- ---------------------------------------------------------------------------
create table public.skill_categories (
  slug text primary key,
  name text not null,
  sort_order int not null default 0
);

create table public.skills (
  id serial primary key,
  slug text not null unique,
  name text not null,
  category text not null references public.skill_categories(slug),
  is_active boolean not null default true
);
create index skills_category_idx on public.skills(category);
create index skills_name_trgm_idx on public.skills using gin (name extensions.gin_trgm_ops);

-- Roles people can hold or look for. `categories` maps a role to the skill
-- categories that satisfy it — the backbone of complementarity matching.
create table public.roles (
  slug text primary key,
  name text not null,
  categories text[] not null default '{}',
  is_cofounder_role boolean not null default false,
  sort_order int not null default 0
);

create table public.industries (
  slug text primary key,
  name text not null,
  sort_order int not null default 0
);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  headline text not null default '' check (char_length(headline) <= 140),
  bio text not null default '' check (char_length(bio) <= 2000),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  city text check (city is null or char_length(city) <= 80),
  timezone text check (timezone is null or char_length(timezone) <= 64),
  years_experience smallint check (years_experience is null or years_experience between 0 and 60),
  intents public.user_intent[] not null default '{}',
  primary_role text references public.roles(slug),
  seeking_roles text[] not null default '{}',
  industries text[] not null default '{}',
  preferred_stages public.startup_stage[] not null default '{}',
  availability public.availability_level,
  work_mode public.work_mode,
  commitment_note text check (commitment_note is null or char_length(commitment_note) <= 300),
  visibility public.profile_visibility not null default 'members',
  onboarding_completed boolean not null default false,
  is_adult_confirmed boolean not null default false,
  email_verified boolean not null default false,
  account_status public.account_status not null default 'active',
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(display_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(headline, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(bio, '')), 'C')
  ) stored
);
create index profiles_search_idx on public.profiles using gin (search_vector);
create index profiles_name_trgm_idx on public.profiles using gin (display_name extensions.gin_trgm_ops);
create index profiles_intents_idx on public.profiles using gin (intents);
create index profiles_seeking_idx on public.profiles using gin (seeking_roles);
create index profiles_industries_idx on public.profiles using gin (industries);
create index profiles_discoverable_idx on public.profiles (last_active_at desc)
  where onboarding_completed and account_status = 'active' and visibility <> 'hidden';
create index profiles_country_idx on public.profiles (country_code);
create index profiles_primary_role_idx on public.profiles (primary_role);

-- Founder-specific details (co-founder requirements). The venture itself lives
-- in startup_projects so a founder can describe it with its own visibility.
create table public.founder_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  looking_for_cofounder boolean not null default false,
  cofounder_requirements text check (cofounder_requirements is null or char_length(cofounder_requirements) <= 1000),
  commitment_expectation public.availability_level,
  previous_ventures text check (previous_ventures is null or char_length(previous_ventures) <= 1000),
  updated_at timestamptz not null default now()
);

create table public.professional_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  expertise_summary text check (expertise_summary is null or char_length(expertise_summary) <= 1000),
  open_to text[] not null default '{}'   -- cofounder, advisory, part_time, contract, full_time
    check (open_to <@ array['cofounder','advisory','part_time','contract','full_time']::text[]),
  updated_at timestamptz not null default now()
);

create table public.user_skills (
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id int not null references public.skills(id) on delete cascade,
  level smallint not null default 2 check (level between 1 and 3), -- 1 familiar, 2 proficient, 3 expert
  created_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);
create index user_skills_skill_idx on public.user_skills(skill_id);

create table public.user_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  organization text check (organization is null or char_length(organization) <= 120),
  start_date date,
  end_date date,
  description text check (description is null or char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index user_experiences_user_idx on public.user_experiences(user_id);

create table public.profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.link_kind not null,
  url text not null check (url ~* '^https://[^\s]{3,500}$'),
  label text check (label is null or char_length(label) <= 60),
  created_at timestamptz not null default now()
);
create index profile_links_user_idx on public.profile_links(user_id);

-- Notification + communication preferences (one row per user).
create table public.profile_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_connection_requests boolean not null default true,
  push_messages boolean not null default true,
  push_recommendations boolean not null default true,
  push_think boolean not null default true,
  email_connection_requests boolean not null default true,
  email_messages boolean not null default false,
  email_account boolean not null default true,       -- security / account notices
  email_product_updates boolean not null default false, -- promotional: opt-in only
  ai_processing_acknowledged_at timestamptz,          -- disclosure for external AI providers
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Startup projects (the venture a founder is building — NOT Think projects)
-- ---------------------------------------------------------------------------
create table public.startup_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text check (name is null or char_length(name) <= 100),
  summary text not null default '' check (char_length(summary) <= 1000),
  problem text check (problem is null or char_length(problem) <= 1000),
  target_customer text check (target_customer is null or char_length(target_customer) <= 500),
  industry text references public.industries(slug),
  stage public.startup_stage not null default 'idea',
  team_size smallint not null default 1 check (team_size between 1 and 500),
  commitment_expectation public.availability_level,
  work_mode public.work_mode,
  visibility public.project_visibility not null default 'members',
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index startup_projects_owner_idx on public.startup_projects(owner_id);
create unique index startup_projects_one_primary on public.startup_projects(owner_id) where is_primary;

create table public.startup_project_members (
  project_id uuid not null references public.startup_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text check (role is null or char_length(role) <= 60),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index startup_project_members_user_idx on public.startup_project_members(user_id);

create table public.startup_project_skills (
  project_id uuid not null references public.startup_projects(id) on delete cascade,
  skill_id int not null references public.skills(id) on delete cascade,
  kind text not null check (kind in ('have', 'need')),
  primary key (project_id, skill_id, kind)
);

-- ---------------------------------------------------------------------------
-- Discovery & matching
-- ---------------------------------------------------------------------------
create table public.match_recommendations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  score numeric(5,4) not null,
  match_type text not null check (match_type in ('cofounder', 'professional', 'collaborator')),
  reasons text[] not null default '{}',
  generated_at timestamptz not null default now(),
  first_shown_at timestamptz,
  primary key (user_id, candidate_id)
);
create index match_recommendations_rank_idx on public.match_recommendations(user_id, score desc);

create table public.match_feedback (
  user_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('dismissed', 'relevant', 'not_relevant')),
  created_at timestamptz not null default now(),
  primary key (user_id, candidate_id)
);

create table public.saved_profiles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  saved_user_id uuid not null references public.profiles(id) on delete cascade,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  primary key (user_id, saved_user_id),
  check (user_id <> saved_user_id)
);

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------
create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text check (message is null or char_length(message) <= 300),
  status public.connection_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);
-- At most one pending request per pair, regardless of direction.
create unique index connection_requests_one_pending
  on public.connection_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status = 'pending';
create index connection_requests_recipient_idx on public.connection_requests(recipient_id, status, created_at desc);
create index connection_requests_sender_idx on public.connection_requests(sender_id, status, created_at desc);

create table public.connections (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.connection_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index connections_user_b_idx on public.connections(user_b);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- canonical pair key for direct conversations (least:greatest)
  direct_key text unique,
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,   -- read status: messages created after this are unread
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members(user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages(conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications & devices
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in (
    'connection_request', 'connection_accepted', 'message', 'recommendation', 'think_report', 'account'
  )),
  title text not null check (char_length(title) <= 140),
  body text check (body is null or char_length(body) <= 500),
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (char_length(token) <= 300),
  platform text not null check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens(user_id);

-- ---------------------------------------------------------------------------
-- Safety
-- ---------------------------------------------------------------------------
create table public.blocked_users (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocked_users_blocked_idx on public.blocked_users(blocked_id);

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  message_excerpt text,  -- snapshot so moderators can act even if the message is deleted
  reason public.report_reason not null,
  details text check (details is null or char_length(details) <= 1000),
  status public.report_status not null default 'open',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now()
);
create index user_reports_status_idx on public.user_reports(status, created_at desc);
create index user_reports_reported_idx on public.user_reports(reported_user_id);

-- Generic sliding-window rate-limit ledger (written only by security-definer functions).
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_idx on public.rate_limit_events(user_id, action, created_at desc);

-- ---------------------------------------------------------------------------
-- Admin & platform
-- ---------------------------------------------------------------------------
create table public.admin_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.admin_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);

-- Feature flags and runtime configuration (limits, weights, switches).
create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  enabled boolean not null default true,
  value jsonb not null default '{}',
  description text,
  is_public boolean not null default false, -- readable by clients
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_.]{2,64}$'),
  properties jsonb not null default '{}' check (pg_column_size(properties) <= 4096),
  platform text check (platform in ('web', 'android', 'ios', 'server')),
  created_at timestamptz not null default now()
);
create index analytics_events_name_idx on public.analytics_events(name, created_at desc);
create index analytics_events_user_idx on public.analytics_events(user_id, created_at desc);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  uses int not null default 0,
  created_at timestamptz not null default now()
);
create unique index invitations_one_per_user on public.invitations(inviter_id);

-- Who invited whom (private to the invited user; used for cold-start analytics).
create table public.referrals (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  invitation_id uuid references public.invitations(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Public account-deletion requests for people who cannot sign in.
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email extensions.citext not null,
  source text not null check (source in ('in_app', 'web_form')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'completed', 'rejected')),
  note text check (note is null or char_length(note) <= 500),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
create index account_deletion_requests_status_idx on public.account_deletion_requests(status, requested_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger founder_profiles_updated_at before update on public.founder_profiles
  for each row execute function public.tg_set_updated_at();
create trigger professional_profiles_updated_at before update on public.professional_profiles
  for each row execute function public.tg_set_updated_at();
create trigger profile_preferences_updated_at before update on public.profile_preferences
  for each row execute function public.tg_set_updated_at();
create trigger startup_projects_updated_at before update on public.startup_projects
  for each row execute function public.tg_set_updated_at();
create trigger feature_flags_updated_at before update on public.feature_flags
  for each row execute function public.tg_set_updated_at();
