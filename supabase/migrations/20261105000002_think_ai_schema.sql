-- =============================================================================
-- Think workspace + AI provider/usage tables
-- Think content is PRIVATE by default: only the owner (and users the owner has
-- explicitly shared a project with) can read it. It is never joined into
-- discovery, search or matching.
-- =============================================================================

create table public.think_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  idea text not null default '' check (char_length(idea) <= 6000),
  -- optional structured context: target_customer, region, stage, business_model,
  -- existing_alternatives, constraints, team_skills ... (validated by clients + edge fn)
  context jsonb not null default '{}' check (pg_column_size(context) <= 16384),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index think_projects_owner_idx on public.think_projects(owner_id, updated_at desc);
create trigger think_projects_updated_at before update on public.think_projects
  for each row execute function public.tg_set_updated_at();

-- One row per generated report (full history kept so users can revisit).
-- `report` holds the structured 20-section document (see packages/shared think schema).
create table public.think_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.think_projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  mode text not null check (mode in ('ai', 'checklist')),  -- checklist = non-AI, clearly labelled
  provider text,
  model text,
  input_snapshot jsonb not null default '{}',
  report jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index think_analyses_project_idx on public.think_analyses(project_id, created_at desc);

create table public.think_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.think_projects(id) on delete cascade,
  analysis_id uuid references public.think_analyses(id) on delete set null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  provider text,
  model text,
  created_at timestamptz not null default now()
);
create index think_messages_project_idx on public.think_messages(project_id, created_at);

-- External research sources attached to findings (only when real research ran).
create table public.think_sources (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.think_analyses(id) on delete cascade,
  section_key text not null,
  source_name text not null check (char_length(source_name) <= 200),
  url text not null check (url ~* '^https?://'),
  retrieved_at timestamptz not null,
  note text check (note is null or char_length(note) <= 500)
);
create index think_sources_analysis_idx on public.think_sources(analysis_id);

-- Explicit, permission-based sharing. Only connections can be granted access.
create table public.think_project_shares (
  project_id uuid not null references public.think_projects(id) on delete cascade,
  shared_with uuid not null references public.profiles(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, shared_with)
);
create index think_project_shares_user_idx on public.think_project_shares(shared_with);

-- ---------------------------------------------------------------------------
-- AI providers. API KEYS ARE NEVER STORED HERE: `api_key_env` names the Edge
-- Function secret that holds the key (e.g. GEMINI_API_KEY).
-- ---------------------------------------------------------------------------
create table public.ai_provider_configs (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_-]{2,40}$'),
  provider text not null check (provider in ('gemini', 'openai_compatible', 'ollama')),
  label text not null,
  model text not null,
  base_url text,
  api_key_env text check (api_key_env is null or api_key_env ~ '^[A-Z0-9_]{2,64}$'),
  is_enabled boolean not null default false,
  is_paid boolean not null default false,
  paid_approved boolean not null default false,  -- explicit admin approval to spend money
  priority int not null default 100,             -- lower runs first
  timeout_ms int not null default 45000 check (timeout_ms between 1000 and 120000),
  max_output_tokens int not null default 4096 check (max_output_tokens between 256 and 32768),
  max_input_chars int not null default 12000 check (max_input_chars between 500 and 100000),
  requests_per_minute int not null default 10 check (requests_per_minute > 0),
  daily_request_limit int not null default 200 check (daily_request_limit > 0),
  cost_per_1m_input_usd numeric(10,4) not null default 0,
  cost_per_1m_output_usd numeric(10,4) not null default 0,
  monthly_budget_usd numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A paid provider can only be enabled once it is explicitly approved AND has a budget.
  constraint paid_requires_approval check (
    not (is_paid and is_enabled) or (paid_approved and monthly_budget_usd > 0)
  )
);
create trigger ai_provider_configs_updated_at before update on public.ai_provider_configs
  for each row execute function public.tg_set_updated_at();

-- Usage ledger. Stores NO prompt or completion content.
create table public.ai_usage_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  provider_config_id uuid references public.ai_provider_configs(id) on delete set null,
  provider text,
  model text,
  feature text not null check (feature in ('think_analysis', 'think_followup', 'think_checklist')),
  status text not null check (status in ('success', 'error', 'quota_blocked', 'rate_limited', 'disabled')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  latency_ms int,
  error_code text,
  created_at timestamptz not null default now()
);
create index ai_usage_logs_user_idx on public.ai_usage_logs(user_id, feature, created_at desc);
create index ai_usage_logs_provider_idx on public.ai_usage_logs(provider_config_id, created_at desc);
create index ai_usage_logs_created_idx on public.ai_usage_logs(created_at desc);
