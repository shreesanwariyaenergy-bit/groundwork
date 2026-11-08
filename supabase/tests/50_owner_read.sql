\set QUIET on
set client_min_messages = warning;
-- Regression: owners can insert-and-return their own rows (INSERT ... RETURNING), others still cannot read them.
create or replace function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  perform set_config('role', case when uid is null then 'anon' else 'authenticated' end, false);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
create temp table ins_ret as
  with x as (insert into public.think_projects(owner_id, title, idea)
             values (auth.uid(), 'Returning test', 'Checks that RETURNING works for the owner under RLS policies') returning id)
  select id from x;
do $$ begin assert (select count(*) from ins_ret) = 1, 'insert ... returning works for owner'; end $$;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin assert not exists (select 1 from public.think_projects where title = 'Returning test'), 'non-owner cannot read'; end $$;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ begin assert exists (select 1 from public.think_projects), 'shared/owned access still works for A'; end $$;
\warn '  owner_read: all assertions passed'
