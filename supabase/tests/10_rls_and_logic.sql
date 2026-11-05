-- =============================================================================
-- Database test suite: RLS boundaries + core business logic.
-- Runs as superuser and impersonates API users via SET ROLE + JWT claim.
-- Every check raises on failure (ON_ERROR_STOP aborts the run).
-- =============================================================================
\set QUIET on
set client_min_messages = warning;

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
  begin
    execute sql;
  exception when others then
    failed := true; msg := sqlerrm;
  end;
  if not failed then
    raise exception 'expected error containing "%" but statement succeeded: %', needle, sql;
  end if;
  if needle <> '*' and position(needle in msg) = 0 then
    raise exception 'expected error containing "%" got "%" for: %', needle, msg, sql;
  end if;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: test accounts (local test DB only)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local', now(), '{"full_name":"Ana Founder","is_adult":true}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', now(), '{"full_name":"Ben Engineer","is_adult":true}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.local', now(), '{"full_name":"Cleo Designer","is_adult":true}'),
  ('00000000-0000-0000-0000-00000000000d', 'd@test.local', now(), '{"full_name":"Dev Hidden","is_adult":true}'),
  ('00000000-0000-0000-0000-00000000000e', 'e@test.local', null,  '{"full_name":"Eve Unverified","is_adult":true}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local', now(), '{"full_name":"Admin","is_adult":true}');

do $$ begin
  assert (select count(*) from public.profiles) = 6, 'profiles auto-created by auth trigger';
  assert (select email_verified from public.profiles where id = '00000000-0000-0000-0000-00000000000e') = false, 'unverified flag';
  assert (select count(*) from public.profile_preferences) = 6, 'preferences auto-created';
end $$;

-- A: business founder looking for a technical co-founder, AI industry, Asia/Kolkata
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.profiles set headline = 'Building an AI tool for clinics', intents = '{founder}', primary_role = 'founder',
  seeking_roles = '{technical_cofounder,ai_ml_engineer}', industries = '{ai,healthtech}', availability = 'full_time',
  work_mode = 'remote', timezone = 'Asia/Kolkata', country_code = 'IN', onboarding_completed = true
  where id = auth.uid();
insert into public.startup_projects(owner_id, name, summary, industry, stage, visibility)
  values (auth.uid(), 'ClinicAI', 'Scheduling assistant for small clinics', 'healthtech', 'validation', 'members');
insert into public.user_skills(user_id, skill_id) select auth.uid(), id from public.skills where slug in ('b2b_sales','strategy');
-- privileged columns are ignored
update public.profiles set email_verified = true, account_status = 'active' where id = auth.uid();

-- B: technical co-founder seeker who wants a business co-founder, nearby timezone
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.profiles set headline = 'ML engineer, ex-startup', intents = '{cofounder_seeker,professional}', primary_role = 'ai_ml_engineer',
  seeking_roles = '{business_cofounder}', industries = '{ai}', preferred_stages = '{validation,mvp}', availability = 'full_time',
  work_mode = 'remote', timezone = 'Asia/Dubai', country_code = 'AE', onboarding_completed = true where id = auth.uid();
insert into public.user_skills(user_id, skill_id) select auth.uid(), id from public.skills where slug in ('python','machine_learning','llm_apps');

-- C: designer (professional), far timezone, different industry
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
update public.profiles set headline = 'Product designer', intents = '{professional}', primary_role = 'product_designer',
  industries = '{consumer}', availability = 'part_time', work_mode = 'remote', timezone = 'America/Los_Angeles',
  country_code = 'US', onboarding_completed = true where id = auth.uid();
insert into public.user_skills(user_id, skill_id) select auth.uid(), id from public.skills where slug in ('ui_design','figma');

-- D: technical but hidden
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
update public.profiles set headline = 'Backend engineer', intents = '{cofounder_seeker}', primary_role = 'backend_engineer',
  visibility = 'hidden', onboarding_completed = true where id = auth.uid();

-- E: unverified professional
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
update public.profiles set headline = 'Growth marketer', intents = '{professional}', primary_role = 'growth_professional',
  onboarding_completed = true where id = auth.uid();

-- Onboarding guard
select pg_temp.login('00000000-0000-0000-0000-0000000000ad');
select pg_temp.expect_error($q$update public.profiles set onboarding_completed = true where id = auth.uid()$q$, 'onboarding_incomplete');
-- invalid timezone / role rejected
select pg_temp.expect_error($q$update public.profiles set timezone = 'Mars/Olympus' where id = auth.uid()$q$, 'invalid_timezone');
select pg_temp.expect_error($q$update public.profiles set seeking_roles = '{wizard}' where id = auth.uid()$q$, 'invalid_role');
select pg_temp.logout();

do $$ begin
  assert (select email_verified from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = true,
    'A remains verified (from auth)';
end $$;

-- ---------------------------------------------------------------------------
-- Profile visibility
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'A sees B';
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000d'), 'A cannot see hidden D';
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000ad'), 'A cannot see un-onboarded admin';
  assert not exists (select 1 from public.user_skills where user_id = '00000000-0000-0000-0000-00000000000d'), 'hidden skills invisible';
end $$;
-- cannot edit someone else
update public.profiles set headline = 'hacked' where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_error($q$insert into public.user_skills(user_id, skill_id) values ('00000000-0000-0000-0000-00000000000b', 1)$q$, 'row-level security');
select pg_temp.logout();
do $$ begin
  assert (select headline from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'ML engineer, ex-startup', 'B unchanged';
end $$;

select pg_temp.login(null);  -- anon
select pg_temp.expect_error($q$select * from public.profiles$q$, 'permission denied');
select pg_temp.expect_error($q$select * from public.think_projects$q$, 'permission denied');
select pg_temp.expect_error($q$select * from public.messages$q$, 'permission denied');
do $$ begin assert (select count(*) from public.skills) > 20, 'anon reads taxonomy'; end $$;
select public.submit_deletion_request('someone@example.com', 'cannot sign in');
select pg_temp.expect_error($q$select public.get_recommendations()$q$, 'permission denied');
select pg_temp.logout();

-- ---------------------------------------------------------------------------
-- Matching: complementary ranking with reasons
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table recs_a as select * from public.get_recommendations(20, 0, null);
do $$
declare first_id uuid; b_reasons text[]; b_type text;
begin
  select id into first_id from recs_a limit 1;
  assert first_id = '00000000-0000-0000-0000-00000000000b', 'B (technical co-founder seeker) ranks first for A, got ' || coalesce(first_id::text, 'none');
  assert not exists (select 1 from recs_a where id = '00000000-0000-0000-0000-00000000000d'), 'hidden D never recommended';
  select reasons, match_type into b_reasons, b_type from recs_a where id = '00000000-0000-0000-0000-00000000000b';
  assert 'seeking_your_expertise' = any(b_reasons), 'B is seeking A''s expertise: ' || b_reasons::text;
  assert 'complementary_skills' = any(b_reasons), 'complementary skills reason: ' || b_reasons::text;
  assert b_type = 'cofounder', 'B is a co-founder match, got ' || b_type;
end $$;
-- users cannot compute matches for others directly
select pg_temp.expect_error($q$select * from public.compute_matches('00000000-0000-0000-0000-00000000000b')$q$, 'permission denied');

-- search with filters
do $$ begin
  assert exists (select 1 from public.search_profiles(p_query => 'ML', p_skills => '{python}')
                 where id = '00000000-0000-0000-0000-00000000000b'), 'search finds B by text+skill';
  assert not exists (select 1 from public.search_profiles(p_query => 'Backend')), 'search hides hidden D';
  assert not exists (select 1 from public.search_profiles(p_max_tz_diff => 2) where id = '00000000-0000-0000-0000-00000000000c'),
    'timezone filter excludes LA for Kolkata';
end $$;

-- dismiss removes from recommendations
insert into public.match_feedback(user_id, candidate_id, kind) values (auth.uid(), '00000000-0000-0000-0000-00000000000c', 'dismissed');
do $$ begin
  assert not exists (select 1 from public.get_recommendations(20, 0, null) where id = '00000000-0000-0000-0000-00000000000c'), 'dismissed hidden';
end $$;

-- ---------------------------------------------------------------------------
-- Connections + messaging
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($q$select public.send_connection_request('00000000-0000-0000-0000-00000000000b', 'see https://spam.example')$q$, 'links_not_allowed');
select public.send_connection_request('00000000-0000-0000-0000-00000000000b', 'Would love to talk about ClinicAI.');
select pg_temp.expect_error($q$select public.send_connection_request('00000000-0000-0000-0000-00000000000b')$q$, 'request_already_pending');
select pg_temp.expect_error($q$select public.send_connection_request('00000000-0000-0000-0000-00000000000d')$q$, 'recipient_unavailable');
select pg_temp.expect_error($q$insert into public.connection_requests(sender_id, recipient_id) values (auth.uid(), '00000000-0000-0000-0000-00000000000c')$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.connections(user_a, user_b) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c')$q$, 'row-level security');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert not exists (select 1 from public.connection_requests), 'C cannot see A->B request';
end $$;

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
create temp table conv_ab as
  select public.respond_connection_request((select request_id from public.get_connection_requests('received') limit 1), true) as id;
grant select on conv_ab to authenticated;
do $$ begin
  assert (select id from conv_ab) is not null, 'conversation created on accept';
  assert public.are_connected('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'), 'connected';
end $$;

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert exists (select 1 from public.notifications where type = 'connection_accepted'), 'A notified of accept';
end $$;
insert into public.messages(conversation_id, sender_id, body) select id, auth.uid(), 'Hi Ben — great to connect!' from conv_ab;
select pg_temp.expect_error($q$insert into public.messages(conversation_id, sender_id, body) select id, '00000000-0000-0000-0000-00000000000b', 'spoof' from conv_ab$q$, 'row-level security');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select unread_count from public.get_conversations() limit 1) = 1, 'B has one unread';
  assert exists (select 1 from public.notifications where type = 'message'), 'B notified of message';
end $$;
select public.mark_conversation_read((select id from conv_ab));
do $$ begin
  assert (select unread_count from public.get_conversations() limit 1) = 0, 'read clears unread';
end $$;

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert not exists (select 1 from public.messages), 'C cannot read A/B messages';
  assert not exists (select 1 from public.conversations), 'C cannot see A/B conversation';
end $$;
select pg_temp.expect_error($q$insert into public.messages(conversation_id, sender_id, body) select id, auth.uid(), 'intrude' from conv_ab$q$, '*');
select pg_temp.expect_error($q$insert into public.conversation_members(conversation_id, user_id) select id, auth.uid() from conv_ab$q$, '*');

-- ---------------------------------------------------------------------------
-- Rate limiting for unverified accounts
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select public.send_connection_request('00000000-0000-0000-0000-00000000000a');
select public.send_connection_request('00000000-0000-0000-0000-00000000000b');
select public.send_connection_request('00000000-0000-0000-0000-00000000000c');
select pg_temp.logout();
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000f', 'f@test.local', now(), '{"full_name":"Fay","is_adult":true}');
update public.profiles set headline = 'Operator', intents = '{professional}', onboarding_completed = true
  where id = '00000000-0000-0000-0000-00000000000f';
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($q$select public.send_connection_request('00000000-0000-0000-0000-00000000000f')$q$, 'rate_limited');

-- ---------------------------------------------------------------------------
-- Think privacy + explicit sharing
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.think_projects(id, owner_id, title, idea)
  values ('11111111-1111-1111-1111-111111111111', auth.uid(), 'ClinicAI', 'Confidential: AI scheduling for clinics');
-- cannot share with a non-connection
select pg_temp.expect_error($q$insert into public.think_project_shares(project_id, shared_with, shared_by) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', auth.uid())$q$, 'row-level security');
-- cannot write analyses directly (edge function / service role only)
select pg_temp.expect_error($q$insert into public.think_analyses(project_id, owner_id, mode) values ('11111111-1111-1111-1111-111111111111', auth.uid(), 'ai')$q$, 'row-level security');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin assert not exists (select 1 from public.think_projects), 'B cannot see A''s private project'; end $$;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.think_project_shares(project_id, shared_with, shared_by)
  values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b', auth.uid());
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin assert exists (select 1 from public.think_projects), 'B sees shared project'; end $$;
update public.think_projects set title = 'pwned';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ begin assert (select title from public.think_projects) = 'ClinicAI', 'grantee cannot edit'; end $$;

-- ---------------------------------------------------------------------------
-- Blocking ends connection, messaging, sharing and visibility
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select public.block_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert not public.are_connected('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'), 'block removes connection';
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'blocked profile invisible';
  assert (select can_send from public.get_conversations() limit 1) = false, 'conversation read-only after block';
end $$;
select pg_temp.expect_error($q$insert into public.messages(conversation_id, sender_id, body) select id, auth.uid(), 'still there?' from conv_ab$q$, 'row-level security');
select pg_temp.expect_error($q$select public.send_connection_request('00000000-0000-0000-0000-00000000000b')$q$, 'recipient_unavailable');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin assert not exists (select 1 from public.think_projects), 'sharing revoked by block'; end $$;

-- report with message evidence
select public.report_user('00000000-0000-0000-0000-00000000000a', 'spam', 'test report',
  (select id from public.messages limit 1));

-- ---------------------------------------------------------------------------
-- Admin boundaries
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($q$select public.admin_metrics(30)$q$, 'forbidden');
select pg_temp.expect_error($q$select public.admin_set_account_status('00000000-0000-0000-0000-00000000000e', 'suspended')$q$, 'forbidden');
select pg_temp.expect_error($q$insert into public.admin_roles(user_id, role) values (auth.uid(), 'admin')$q$, 'row-level security');
update public.feature_flags set enabled = true where key = 'think.ai_enabled';  -- silently filtered by RLS
do $$ begin assert (select enabled from public.feature_flags where key = 'think.ai_enabled') = false, 'user cannot flip flags'; end $$;
do $$ begin
  assert not exists (select 1 from public.user_reports), 'reported user cannot see reports about them';
  assert not exists (select 1 from public.ai_provider_configs), 'users cannot read provider config';
  assert not exists (select 1 from public.feature_flags where not is_public), 'users cannot read private flags';
end $$;
select pg_temp.logout();
insert into public.admin_roles(user_id, role) values ('00000000-0000-0000-0000-0000000000ad', 'admin');

select pg_temp.login('00000000-0000-0000-0000-0000000000ad');
do $$ declare m jsonb; begin
  m := public.admin_metrics(30);
  assert (m->>'users_total')::int = 7, 'metrics users_total ' || (m->>'users_total');
  assert (m->>'reports_open')::int = 1, 'one open report';
end $$;
select public.admin_set_account_status('00000000-0000-0000-0000-00000000000e', 'suspended', 'spam test');
select public.admin_update_report((select id from public.user_reports limit 1), 'dismissed', 'test');
select public.admin_set_flag('think.limits', true, '{"analyses_per_day": 5, "followups_per_day": 20}');
do $$ begin
  assert (select count(*) from public.admin_audit_logs) = 3, 'admin actions audited';
  assert not exists (select 1 from public.think_projects), 'admins cannot read private Think projects';
  assert (select count(*) from public.admin_list_users()) = 7, 'admin lists users';
end $$;

select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($q$select public.send_connection_request('00000000-0000-0000-0000-00000000000f')$q$, 'account_not_active');

-- ---------------------------------------------------------------------------
-- Export + deletion cascade
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ declare d jsonb; begin
  d := public.export_my_data();
  assert d->'profile'->>'display_name' = 'Ana Founder', 'export profile';
  assert jsonb_array_length(d->'think_projects') = 1, 'export includes Think';
  assert jsonb_array_length(d->'messages_sent') = 1, 'export includes messages';
end $$;
select pg_temp.logout();

delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'profile deleted';
  assert not exists (select 1 from public.user_skills where user_id = '00000000-0000-0000-0000-00000000000b'), 'skills deleted';
  assert exists (select 1 from public.user_reports where reporter_id is null), 'report kept, reporter anonymised';
  assert (select count(*) from public.account_deletion_requests) = 1, 'public deletion request recorded';
end $$;

\warn '  rls_and_logic: all assertions passed'
