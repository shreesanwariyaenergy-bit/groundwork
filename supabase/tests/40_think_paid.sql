\set QUIET on
set client_min_messages = warning;
-- Phase 2: assessment / Deep Analysis kinds, entitlements, start/claim/fail, status, claim kind.
-- Fixtures from 10_rls_and_logic.sql: A = ...0a (active founder), C = ...0c, admin = ...ad.

create or replace function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  perform set_config('role', case when uid is null then 'anon' else 'authenticated' end, false);
end $$;
create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
create or replace function pg_temp.expect_error(sql text, needle text) returns void language plpgsql as $$
declare failed boolean := false; msg text;
begin
  begin execute sql; exception when others then failed := true; msg := sqlerrm; end;
  if not failed then raise exception 'expected error containing "%" but statement succeeded: %', needle, sql; end if;
  if needle <> '*' and position(needle in msg) = 0 then
    raise exception 'expected error containing "%" got "%" for: %', needle, msg, sql;
  end if;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Fixture: a Think project owned by A.
select pg_temp.logout();
insert into public.think_projects(id, owner_id, title, idea) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'Salt spray', 'A men''s sea salt spray D2C brand in India sold online and via marketplaces');

-- New report kinds accepted; unknown kinds and usage features rejected.
insert into public.think_analyses(project_id, owner_id, status, mode, report_kind, report)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'completed', 'ai', 'assessment', '{"kind":"assessment"}');
select pg_temp.expect_error($q$insert into public.think_analyses(project_id, owner_id, status, mode, report_kind) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'completed', 'ai', 'premium')$q$, 'check constraint');
insert into public.ai_usage_logs(user_id, feature, status) values ('00000000-0000-0000-0000-00000000000a', 'think_assessment', 'success'),
  ('00000000-0000-0000-0000-00000000000a', 'think_research', 'success'), ('00000000-0000-0000-0000-00000000000a', 'think_deep', 'success');
select pg_temp.expect_error($q$insert into public.ai_usage_logs(feature, status) values ('think_unknown', 'success')$q$, 'check constraint');

-- Users cannot grant themselves access or call service functions.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($q$insert into public.think_deep_entitlements(user_id, source) values (auth.uid(), 'test')$q$, 'permission denied');
select pg_temp.expect_error($q$select public.admin_grant_deep_entitlement(auth.uid(), 'self')$q$, 'forbidden');
select pg_temp.expect_error($q$select public.think_start_deep(auth.uid(), '00000000-0000-0000-0000-0000000000f1', '{}')$q$, 'permission denied');
select pg_temp.expect_error($q$select public.think_deep_claim('00000000-0000-0000-0000-0000000000f1', 60)$q$, 'permission denied');
select pg_temp.expect_error($q$select public.think_deep_fail('00000000-0000-0000-0000-0000000000f1', 'x')$q$, 'permission denied');
-- Payment-sourced access needs a verified reference (even for the service role).
select pg_temp.logout();
select pg_temp.expect_error($q$insert into public.think_deep_entitlements(user_id, source) values ('00000000-0000-0000-0000-00000000000a', 'payment')$q$, 'payment_needs_reference');

-- Status before access: Deep Analysis off by default, no entitlements.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ declare s jsonb := public.think_status(); begin
  assert (s->'deep'->>'enabled')::boolean = false, 'deep off by default';
  assert (s->'deep'->>'payments_enabled')::boolean = false, 'payments off by default';
  assert (s->'deep'->>'entitlements_available')::int = 0, 'no entitlements';
  assert (s->>'assessments_used_today')::int = 1, 'assessment usage counted: ' || (s->>'assessments_used_today');
  assert (s->>'assessments_per_day')::int = 5, 'default assessment quota';
  assert s ? 'analyses_per_day' and s ? 'disclosure_acknowledged', 'existing keys preserved';
end $$;

-- No access → cannot start.
select pg_temp.logout();
select pg_temp.expect_error($q$select public.think_start_deep('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '{}')$q$, 'deep_access_required');

-- Admin grants one test entitlement (audited).
select pg_temp.login('00000000-0000-0000-0000-0000000000ad');
select public.admin_grant_deep_entitlement('00000000-0000-0000-0000-00000000000a', 'staging test');
select pg_temp.logout();
do $$ begin
  assert exists (select 1 from public.admin_audit_logs where action = 'grant_deep_entitlement'), 'grant audited';
end $$;

-- Owner sees own entitlement; others do not.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
do $$ begin assert (select count(*) from public.think_deep_entitlements) = 0, 'C cannot see A''s access'; end $$;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ begin assert (select count(*) from public.think_deep_entitlements where status = 'available') = 1, 'A sees own access'; end $$;

-- Start: wrong owner rejected; then consume atomically.
select pg_temp.logout();
select pg_temp.expect_error($q$select public.think_start_deep('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000f1', '{}')$q$, 'project_not_found');
create temp table run1 as select public.think_start_deep('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '{"answers":{"category":"d2c"}}') as id;
do $$ declare a public.think_analyses%rowtype; begin
  select * into a from public.think_analyses where id = (select id from run1);
  assert a.report_kind = 'deep' and a.status = 'running' and a.progress->>'stage' = 'research', 'running deep row';
  assert (select status from public.think_deep_entitlements where analysis_id = a.id) = 'consumed', 'entitlement consumed';
end $$;
-- A second concurrent run on the same project is refused.
select pg_temp.expect_error($q$select public.think_start_deep('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '{}')$q$, 'analysis_in_progress');

-- Step lock: one holder at a time.
do $$ begin
  assert public.think_deep_claim((select id from run1), 60) = true, 'first claim';
  assert public.think_deep_claim((select id from run1), 60) = false, 'second claim blocked while locked';
end $$;

-- Owner can read the running row (RLS), cannot modify it.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ begin assert exists (select 1 from public.think_analyses where report_kind = 'deep'), 'owner reads deep row'; end $$;
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
do $$ begin assert not exists (select 1 from public.think_analyses where report_kind = 'deep'), 'others cannot'; end $$;

-- Failure refunds the entitlement.
select pg_temp.logout();
select public.think_deep_fail((select id from run1), 'provider_timeout');
do $$ begin
  assert (select status from public.think_analyses where id = (select id from run1)) = 'failed', 'marked failed';
  assert (select count(*) from public.think_deep_entitlements where user_id = '00000000-0000-0000-0000-00000000000a' and status = 'available') = 1, 'refunded';
  assert public.think_deep_claim((select id from run1), 60) = false, 'failed run cannot be claimed';
end $$;

-- Admin revoke works only on available access.
select pg_temp.login('00000000-0000-0000-0000-0000000000ad');
select public.admin_revoke_deep_entitlement((select id from public.think_deep_entitlements where user_id = '00000000-0000-0000-0000-00000000000a' limit 1));
select pg_temp.expect_error($q$select public.admin_revoke_deep_entitlement((select id from public.think_deep_entitlements where user_id = '00000000-0000-0000-0000-00000000000a' limit 1))$q$, 'not_revocable');

-- claim_quick_report keeps the assessment kind.
select pg_temp.logout();
insert into public.think_quick_reports(claim_token_hash, inputs, report, mode, client_hash) values
  (encode(extensions.digest('tok_assess_dddddddddddddddddddddddddddddddddddd', 'sha256'), 'hex'),
   '{"idea":"An AI support desk for small online shops that answers order questions"}',
   '{"version":1,"kind":"assessment","generated_by":"ai","sections":[]}', 'ai', repeat('f', 64));
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
create temp table claimed2 as select public.claim_quick_report('tok_assess_dddddddddddddddddddddddddddddddddddd') as pid;
select pg_temp.logout();
do $$ begin
  assert (select report_kind from public.think_analyses where project_id = (select pid from claimed2)) = 'assessment', 'assessment kind kept';
end $$;

-- Flags exist with safe defaults.
do $$ begin
  assert (select enabled from public.feature_flags where key = 'think.deep_analysis') = false, 'deep flag off';
  assert (select (value->>'payments_enabled')::boolean from public.feature_flags where key = 'think.deep_analysis') = false, 'payments off';
  assert exists (select 1 from public.feature_flags where key = 'think.models'), 'models flag';
end $$;
\warn '  think_paid: all assertions passed'
