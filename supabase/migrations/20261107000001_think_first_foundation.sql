-- =============================================================================
-- Think-first foundation (Phase 1). ADDITIVE ONLY: no tables or columns are
-- dropped and no existing data is rewritten.
--   1. Venture link: think_projects can belong to a startup_projects row
--      (the shared "venture" anchor for Think / Connect / Capital / Test).
--   2. Report kinds: think_analyses distinguishes the 5-section quick report
--      from the 20-section full analysis.
--   3. Anonymous Quick Validate store + secure claim after registration.
--   4. Anonymous rate-limit ledger (hashed client keys, no raw IPs).
-- =============================================================================

-- 1. Venture link ---------------------------------------------------------------
alter table public.think_projects
  add column if not exists startup_project_id uuid references public.startup_projects(id) on delete set null,
  add column if not exists source text not null default 'workspace'
    check (source in ('workspace', 'quick_validate'));
create index if not exists think_projects_venture_idx on public.think_projects(startup_project_id)
  where startup_project_id is not null;

-- A Think project may only be linked to a venture its owner owns.
create or replace function public.tg_think_project_venture_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.startup_project_id is not null and not exists (
    select 1 from public.startup_projects sp where sp.id = new.startup_project_id and sp.owner_id = new.owner_id
  ) then
    raise exception 'venture_not_owned' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists think_projects_venture_owner on public.think_projects;
create trigger think_projects_venture_owner before insert or update of startup_project_id, owner_id on public.think_projects
  for each row execute function public.tg_think_project_venture_owner();

-- 2. Report kinds ---------------------------------------------------------------
alter table public.think_analyses
  add column if not exists report_kind text not null default 'full' check (report_kind in ('full', 'quick'));

-- widen the usage-ledger feature list (same values + think_quick)
alter table public.ai_usage_logs drop constraint if exists ai_usage_logs_feature_check;
alter table public.ai_usage_logs add constraint ai_usage_logs_feature_check
  check (feature in ('think_analysis', 'think_followup', 'think_checklist', 'think_quick'));

-- 3. Anonymous Quick Validate ---------------------------------------------------
-- Readable by NOBODY through the API: RLS on, no policies, privileges revoked.
-- Written by the `think-quick` edge function (service role); converted into a
-- private Think project by claim_quick_report(). Only a SHA-256 hash of the
-- claim token is stored; the token itself lives in the creator's browser.
create table if not exists public.think_quick_reports (
  id uuid primary key default gen_random_uuid(),
  claim_token_hash text not null unique check (claim_token_hash ~ '^[0-9a-f]{64}$'),
  inputs jsonb not null check (pg_column_size(inputs) <= 16384),
  report jsonb not null,
  mode text not null check (mode in ('ai', 'checklist')),
  provider text,
  model text,
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index if not exists think_quick_reports_expiry_idx on public.think_quick_reports(expires_at);
alter table public.think_quick_reports enable row level security;
revoke all on public.think_quick_reports from anon, authenticated;

-- 4. Anonymous rate limits --------------------------------------------------------
create table if not exists public.anon_rate_limits (
  id bigint generated always as identity primary key,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  action text not null check (char_length(action) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists anon_rate_limits_idx on public.anon_rate_limits(key_hash, action, created_at desc);
create index if not exists anon_rate_limits_action_idx on public.anon_rate_limits(action, created_at desc);
alter table public.anon_rate_limits enable row level security;
revoke all on public.anon_rate_limits from anon, authenticated;

-- Atomic per-client + global sliding-window check for anonymous actions.
-- Service role only (called by edge functions).
create or replace function public.check_anon_rate_limit(p_key_hash text, p_action text, p_per_key int, p_global int, p_window interval)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('anon_rl:' || p_action));
  if (select count(*) from public.anon_rate_limits
      where action = p_action and created_at > now() - p_window) >= p_global then
    return 'global_limit';
  end if;
  if (select count(*) from public.anon_rate_limits
      where key_hash = p_key_hash and action = p_action and created_at > now() - p_window) >= p_per_key then
    return 'client_limit';
  end if;
  insert into public.anon_rate_limits(key_hash, action) values (p_key_hash, p_action);
  return 'ok';
end $$;
revoke execute on function public.check_anon_rate_limit(text, text, int, int, interval) from public, anon, authenticated;
grant execute on function public.check_anon_rate_limit(text, text, int, int, interval) to service_role;

-- Convert an anonymous quick report into the caller's private Think project.
-- Single use: the anonymous row is deleted once claimed.
create or replace function public.claim_quick_report(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  h text;
  q public.think_quick_reports%rowtype;
  pid uuid;
  idea text;
  title text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  if not public.check_rate_limit('claim_quick_report', 20, interval '1 hour') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  h := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into q from public.think_quick_reports
    where claim_token_hash = h and expires_at > now() for update;
  if not found then raise exception 'quick_report_not_found' using errcode = 'P0002'; end if;

  idea := left(coalesce(q.inputs->>'idea', ''), 6000);
  title := left(coalesce(nullif(btrim(q.inputs->>'title'), ''),
                         nullif(btrim(split_part(idea, E'\n', 1)), ''), 'My startup idea'), 120);
  if char_length(title) > 80 then title := left(title, 77) || '…'; end if;

  insert into public.think_projects(owner_id, title, idea, context, source)
  values (uid, title, idea,
          jsonb_strip_nulls(jsonb_build_object(
            'target_customer', nullif(left(q.inputs->>'customer', 500), ''),
            'existing_alternatives', nullif(left(q.inputs->>'alternatives', 500), ''),
            'stage', nullif(left(q.inputs->>'stage', 500), ''))),
          'quick_validate')
  returning id into pid;

  insert into public.think_analyses(project_id, owner_id, status, mode, provider, model, input_snapshot, report,
                                    report_kind, created_at, completed_at)
  values (pid, uid, 'completed', q.mode, q.provider, q.model, q.inputs, q.report, 'quick', q.created_at, q.created_at);

  delete from public.think_quick_reports where id = q.id;
  return pid;
end $$;
revoke execute on function public.claim_quick_report(text) from public, anon;
grant execute on function public.claim_quick_report(text) to authenticated;

-- Housekeeping: expire unclaimed anonymous reports and old anonymous rate-limit rows.
create or replace function public.prune_platform_data() returns void
language sql security definer set search_path = '' as $$
  delete from public.rate_limit_events where created_at < now() - interval '3 days';
  delete from public.notifications where read_at is not null and created_at < now() - interval '180 days';
  delete from public.think_quick_reports where expires_at < now();
  delete from public.anon_rate_limits where created_at < now() - interval '2 days';
$$;
revoke execute on function public.prune_platform_data() from public, anon, authenticated;

-- Configuration (tunable in Admin → Feature flags)
insert into public.feature_flags(key, enabled, value, description, is_public) values
  ('pillar.think.quick_validate', true, '{"per_client_per_day": 3, "global_per_day": 200}',
   'Anonymous Quick Validate on the public site (5-section preliminary report).', false)
on conflict (key) do nothing;
