-- =============================================================================
-- Think: free 7-parameter assessment + paid Deep Analysis (Phase 2).
-- ADDITIVE ONLY: no table or column is dropped and no existing row is rewritten.
--   1. New report kinds ('assessment', 'deep') and staged-generation progress.
--   2. Separate usage features (free assessment, regeneration, deep, research).
--   3. Deep Analysis access ("entitlements"). One available entitlement = one Deep
--      Analysis. Today they can only be granted by an admin (controlled test path);
--      a future payment integration will create them ONLY after verifying the
--      provider's server-side confirmation. No payment, order or subscription tables.
--   4. Service-role functions for atomic start / step locking / failure + refund.
--   5. think_status() gains assessment quota and Deep Analysis availability.
--   6. claim_quick_report() keeps the claimed report's kind (assessment vs quick).
--   7. Flags: think.deep_analysis (OFF by default, payments OFF), think.models.
-- =============================================================================

-- 1. Report kinds and progress ----------------------------------------------------
alter table public.think_analyses drop constraint if exists think_analyses_report_kind_check;
alter table public.think_analyses add constraint think_analyses_report_kind_check
  check (report_kind in ('full', 'quick', 'assessment', 'deep'));
alter table public.think_analyses
  add column if not exists progress jsonb,
  add column if not exists locked_until timestamptz;
create index if not exists think_analyses_owner_kind_idx on public.think_analyses(owner_id, report_kind, created_at desc);

-- 2. Usage features ----------------------------------------------------------------
alter table public.ai_usage_logs drop constraint if exists ai_usage_logs_feature_check;
alter table public.ai_usage_logs add constraint ai_usage_logs_feature_check
  check (feature in ('think_analysis', 'think_followup', 'think_checklist', 'think_quick',
                     'think_assessment', 'think_assessment_regen', 'think_deep', 'think_research'));

-- 3. Deep Analysis access -----------------------------------------------------------
create table if not exists public.think_deep_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('admin_grant', 'test', 'payment')),
  status text not null default 'available' check (status in ('available', 'consumed', 'revoked')),
  -- For source = 'payment' only: the provider's verified payment reference (future).
  payment_reference text check (payment_reference is null or char_length(payment_reference) <= 200),
  note text check (note is null or char_length(note) <= 300),
  analysis_id uuid references public.think_analyses(id) on delete set null,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  constraint payment_needs_reference check (source <> 'payment' or payment_reference is not null)
);
create index if not exists think_deep_entitlements_user_idx on public.think_deep_entitlements(user_id, status, created_at);
alter table public.think_deep_entitlements enable row level security;
revoke all on public.think_deep_entitlements from anon;
revoke insert, update, delete on public.think_deep_entitlements from authenticated;
grant select on public.think_deep_entitlements to authenticated;
drop policy if exists "own entitlements" on public.think_deep_entitlements;
create policy "own entitlements" on public.think_deep_entitlements for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- 4. Service-role helpers (called only by the think-deep edge function) --------------

-- Atomically consume one available entitlement and create the running Deep Analysis row.
create or replace function public.think_start_deep(p_user uuid, p_project uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ent uuid;
  aid uuid;
begin
  if not exists (select 1 from public.think_projects where id = p_project and owner_id = p_user) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.think_analyses where project_id = p_project and report_kind = 'deep'
             and status = 'running' and created_at > now() - interval '30 minutes') then
    raise exception 'analysis_in_progress' using errcode = 'P0001';
  end if;
  select id into ent from public.think_deep_entitlements
    where user_id = p_user and status = 'available' order by created_at limit 1 for update skip locked;
  if ent is null then raise exception 'deep_access_required' using errcode = 'P0001'; end if;

  insert into public.think_analyses(project_id, owner_id, status, mode, report_kind, input_snapshot, progress)
  values (p_project, p_user, 'running', 'ai', 'deep', coalesce(p_input, '{}'::jsonb),
          jsonb_build_object('stage', 'research', 'failures', 0, 'entitlement_id', ent))
  returning id into aid;

  update public.think_deep_entitlements set status = 'consumed', analysis_id = aid, consumed_at = now() where id = ent;
  return aid;
end $$;

-- Claim the right to run the next stage (prevents two tabs running the same stage).
create or replace function public.think_deep_claim(p_id uuid, p_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  update public.think_analyses set locked_until = now() + make_interval(secs => least(greatest(p_seconds, 10), 170))
    where id = p_id and report_kind = 'deep' and status = 'running' and (locked_until is null or locked_until < now())
  returning true into ok;
  return coalesce(ok, false);
end $$;

-- Mark a Deep Analysis failed and return its entitlement so the founder is not charged for a failure.
create or replace function public.think_deep_fail(p_id uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.think_analyses
    set status = 'failed', error_code = left(coalesce(p_code, 'failed'), 80), completed_at = now(), locked_until = null
    where id = p_id and report_kind = 'deep' and status = 'running';
  update public.think_deep_entitlements
    set status = 'available', analysis_id = null, consumed_at = null
    where analysis_id = p_id and status = 'consumed';
end $$;

revoke execute on function public.think_start_deep(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.think_deep_claim(uuid, int) from public, anon, authenticated;
revoke execute on function public.think_deep_fail(uuid, text) from public, anon, authenticated;
grant execute on function public.think_start_deep(uuid, uuid, jsonb) to service_role;
grant execute on function public.think_deep_claim(uuid, int) to service_role;
grant execute on function public.think_deep_fail(uuid, text) to service_role;

-- Admin: grant / revoke Deep Analysis access (controlled test path; audited).
create or replace function public.admin_grant_deep_entitlement(p_user uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare eid uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  insert into public.think_deep_entitlements(user_id, source, note, granted_by)
  values (p_user, 'admin_grant', left(p_note, 300), auth.uid()) returning id into eid;
  perform public.log_admin_action('grant_deep_entitlement', 'user', p_user::text, jsonb_build_object('entitlement_id', eid));
  return eid;
end $$;

create or replace function public.admin_revoke_deep_entitlement(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.think_deep_entitlements set status = 'revoked' where id = p_id and status = 'available' returning user_id into uid;
  if uid is null then raise exception 'not_revocable' using errcode = 'P0002'; end if;
  perform public.log_admin_action('revoke_deep_entitlement', 'user', uid::text, jsonb_build_object('entitlement_id', p_id));
end $$;
revoke execute on function public.admin_grant_deep_entitlement(uuid, text) from public, anon;
revoke execute on function public.admin_revoke_deep_entitlement(uuid) from public, anon;
grant execute on function public.admin_grant_deep_entitlement(uuid, text) to authenticated;
grant execute on function public.admin_revoke_deep_entitlement(uuid) to authenticated;

-- 5. think_status(): existing keys unchanged, new keys added -------------------------
create or replace function public.think_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lim jsonb := public.config_value('think.limits', '{}', '{"analyses_per_day": 3, "followups_per_day": 20}'::jsonb);
  deep jsonb := coalesce((select jsonb_build_object('enabled', enabled) || coalesce(value, '{}'::jsonb)
                          from public.feature_flags where key = 'think.deep_analysis'), '{"enabled": false}'::jsonb);
  think_on boolean;
  prov record;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select coalesce((select enabled from public.feature_flags where key = 'think.ai_enabled'), false) into think_on;
  select label, provider, model into prov from public.ai_provider_configs
    where is_enabled and (not is_paid or paid_approved) order by priority limit 1;
  return jsonb_build_object(
    'ai_available', think_on and prov.label is not null,
    'provider_label', prov.label,
    'analyses_used_today', (select count(*) from public.ai_usage_logs where user_id = uid
                             and feature = 'think_analysis' and status = 'success' and created_at >= date_trunc('day', now())),
    'analyses_per_day', (lim->>'analyses_per_day')::int,
    'followups_used_today', (select count(*) from public.ai_usage_logs where user_id = uid
                             and feature = 'think_followup' and status = 'success' and created_at >= date_trunc('day', now())),
    'followups_per_day', (lim->>'followups_per_day')::int,
    'disclosure_acknowledged', (select ai_processing_acknowledged_at is not null from public.profile_preferences where user_id = uid),
    -- new in phase 2
    'assessments_used_today', (select count(*) from public.ai_usage_logs where user_id = uid
                               and feature in ('think_assessment', 'think_assessment_regen') and status = 'success'
                               and created_at >= date_trunc('day', now())),
    'assessments_per_day', coalesce((lim->>'assessments_per_day')::int, 5),
    'provider_is_free', coalesce((select not is_paid from public.ai_provider_configs
                                  where is_enabled and (not is_paid or paid_approved) order by priority limit 1), true),
    'deep', jsonb_build_object(
      'enabled', coalesce((deep->>'enabled')::boolean, false),
      'payments_enabled', coalesce((deep->>'payments_enabled')::boolean, false),
      'price_label', deep->'price_label',
      'entitlements_available', (select count(*) from public.think_deep_entitlements where user_id = uid and status = 'available'),
      'research_enabled', coalesce((deep->>'research_enabled')::boolean, false))
  );
end $$;

-- 6. claim_quick_report(): keep the claimed report's kind ----------------------------
create or replace function public.claim_quick_report(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  h text;
  q public.think_quick_reports%rowtype;
  pid uuid;
  idea text;
  title text;
  kind text;
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
  kind := case when q.report->>'kind' = 'assessment' then 'assessment' else 'quick' end;

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
  values (pid, uid, 'completed', q.mode, q.provider, q.model, q.inputs, q.report, kind, q.created_at, q.created_at);

  delete from public.think_quick_reports where id = q.id;
  return pid;
end $$;
revoke execute on function public.claim_quick_report(text) from public, anon;
grant execute on function public.claim_quick_report(text) to authenticated;

-- 7. Configuration (tunable in Admin → Feature flags) -------------------------------
insert into public.feature_flags(key, enabled, value, description, is_public) values
  ('think.deep_analysis', false,
   '{"payments_enabled": false, "price_label": null, "per_user_per_day": 2, "global_per_day": 20, "research_enabled": true, "max_stage_failures": 2}',
   'Paid Deep Analysis. OFF by default. payments_enabled must stay false until a payment provider is integrated and approved; price_label is display text only.', false),
  ('think.models', true, '{"assessment": null, "deep": null, "research": null}',
   'Optional per-feature model override for the enabled provider (null = provider default model). Lets free assessments use a lighter model later.', false)
on conflict (key) do nothing;
