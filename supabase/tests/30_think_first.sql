\set QUIET on
set client_min_messages = warning;
-- Think-first foundation tests. Reuses fixtures left by 10_rls_and_logic.sql
-- (A = ...0a active founder with startup project; C = ...0c; E = ...0e suspended).

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

-- Fixture: two anonymous quick reports written by the "edge function" (superuser here).
insert into public.think_quick_reports(claim_token_hash, inputs, report, mode, client_hash, expires_at) values
  (encode(extensions.digest('tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'sha256'), 'hex'),
   '{"idea":"Scheduling assistant for independent dental clinics that reduces no-shows","customer":"Small dental clinics"}',
   '{"version":1,"kind":"quick","generated_by":"checklist","sections":[]}', 'checklist', repeat('a', 64), now() + interval '7 days'),
  (encode(extensions.digest('tok_expired_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'sha256'), 'hex'),
   '{"idea":"An expired idea that nobody claimed in time at all"}',
   '{"version":1}', 'checklist', repeat('b', 64), now() - interval '1 minute');

-- Nobody can read the anonymous store through the API.
select pg_temp.login(null);
select pg_temp.expect_error($q$select * from public.think_quick_reports$q$, 'permission denied');
select pg_temp.expect_error($q$select public.claim_quick_report('tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$q$, 'permission denied');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($q$select * from public.think_quick_reports$q$, 'permission denied');
select pg_temp.expect_error($q$select * from public.anon_rate_limits$q$, 'permission denied');
select pg_temp.expect_error($q$select public.check_anon_rate_limit(repeat('c',64), 'x', 1, 1, interval '1 day')$q$, 'permission denied');

-- Claiming
select pg_temp.expect_error($q$select public.claim_quick_report('short')$q$, 'invalid_token');
select pg_temp.expect_error($q$select public.claim_quick_report('tok_expired_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$q$, 'quick_report_not_found');
select pg_temp.expect_error($q$select public.claim_quick_report('tok_unknown_cccccccccccccccccccccccccccccccccc')$q$, 'quick_report_not_found');
create temp table claimed as select public.claim_quick_report('tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') as pid;
grant select on claimed to authenticated;
do $$ declare p public.think_projects%rowtype; a public.think_analyses%rowtype; begin
  select * into p from public.think_projects where id = (select pid from claimed);
  assert p.source = 'quick_validate', 'project source';
  assert p.owner_id = '00000000-0000-0000-0000-00000000000a', 'owned by claimer';
  assert p.title like 'Scheduling assistant%', 'title from idea: ' || p.title;
  assert p.context->>'target_customer' = 'Small dental clinics', 'context carried over';
  select * into a from public.think_analyses where project_id = p.id;
  assert a.report_kind = 'quick' and a.status = 'completed', 'quick analysis attached';
end $$;
-- single use
select pg_temp.expect_error($q$select public.claim_quick_report('tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$q$, 'quick_report_not_found');
-- claimed project stays private
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
do $$ begin assert not exists (select 1 from public.think_projects where id = (select pid from claimed)), 'claimed project private'; end $$;

-- Venture link: only to your own venture
select pg_temp.logout();
insert into public.startup_projects(id, owner_id, summary) values
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000c', 'C venture');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($q$update public.think_projects set startup_project_id = '22222222-2222-2222-2222-222222222222' where id = (select pid from claimed)$q$, 'venture_not_owned');
update public.think_projects set startup_project_id = (select id from public.startup_projects where owner_id = auth.uid() limit 1)
  where id = (select pid from claimed);
do $$ begin
  assert (select startup_project_id from public.think_projects where id = (select pid from claimed)) is not null, 'linked to own venture';
end $$;
-- usage ledger accepts the new feature value
select pg_temp.logout();
insert into public.ai_usage_logs(user_id, feature, status) values (null, 'think_quick', 'success');

-- Anonymous rate limit (service role path)
do $$ declare k text := repeat('d', 64); r text; begin
  assert public.check_anon_rate_limit(k, 'quick_validate_test', 2, 100, interval '1 day') = 'ok', 'first ok';
  assert public.check_anon_rate_limit(k, 'quick_validate_test', 2, 100, interval '1 day') = 'ok', 'second ok';
  r := public.check_anon_rate_limit(k, 'quick_validate_test', 2, 100, interval '1 day');
  assert r = 'client_limit', 'third blocked per client, got ' || r;
  assert public.check_anon_rate_limit(repeat('e', 64), 'quick_validate_test', 2, 2, interval '1 day') = 'global_limit', 'global cap reached by other clients';
end $$;

-- Pruning removes expired anonymous reports
select public.prune_platform_data();
do $$ begin
  assert not exists (select 1 from public.think_quick_reports where expires_at < now()), 'expired pruned';
end $$;
\warn '  think_first: all assertions passed'
