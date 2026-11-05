\set QUIET on
set client_min_messages = warning;
-- Uses fixtures from 10_rls_and_logic.sql (A, C, E remain).
do $$ declare n int; begin
  n := public.notify_new_recommendations();
  assert n >= 0, 'job runs';
  assert (select count(*) from public.notifications where type = 'recommendation') = n, 'one notification per notified user';
  -- second run must not re-notify the same candidates
  assert public.notify_new_recommendations() = 0, 'no duplicate notifications';
end $$;
select public.prune_platform_data();
\warn '  jobs: all assertions passed'
