-- =============================================================================
-- Periodic "new relevant people" notifications (no spam: capped per week,
-- respects push_recommendations, only for genuinely new high-scoring matches).
-- =============================================================================
create or replace function public.notify_new_recommendations(p_max_users int default 500)
returns int language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := public.config_value('notifications.recommendations', '{}', '{"min_score": 0.6, "max_per_week": 2}'::jsonb);
  flag_on boolean := coalesce((select enabled from public.feature_flags where key = 'notifications.recommendations'), false);
  u record;
  fresh int;
  sent int := 0;
begin
  if not flag_on then return 0; end if;
  for u in
    select p.id from public.profiles p
    join public.profile_preferences pp on pp.user_id = p.id
    where p.onboarding_completed and p.account_status = 'active'
      and p.last_active_at > now() - interval '14 days'
      and pp.push_recommendations
      and (select count(*) from public.notifications n where n.user_id = p.id and n.type = 'recommendation'
           and n.created_at > now() - interval '7 days') < (cfg->>'max_per_week')::int
    order by p.last_active_at desc
    limit p_max_users
  loop
    with m as (
      select * from public.compute_matches(u.id, 20) cm where cm.score >= (cfg->>'min_score')::numeric
    ), ins as (
      insert into public.match_recommendations(user_id, candidate_id, score, match_type, reasons, generated_at)
      select u.id, m.candidate_id, m.score, m.match_type, m.reasons, now() from m
      where not exists (select 1 from public.match_recommendations r where r.user_id = u.id and r.candidate_id = m.candidate_id)
      on conflict do nothing
      returning 1
    )
    select count(*) into fresh from ins;
    if fresh > 0 then
      perform public.notify_user(u.id, 'recommendation',
        case when fresh = 1 then '1 new person matches what you are looking for'
             else fresh || ' new people match what you are looking for' end,
        'See why they could be a good fit.', jsonb_build_object('path', '/discover'));
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end $$;

revoke execute on function public.notify_new_recommendations(int) from public, anon, authenticated;

-- Housekeeping: rate-limit ledger only needs a few days of history.
create or replace function public.prune_platform_data() returns void
language sql security definer set search_path = '' as $$
  delete from public.rate_limit_events where created_at < now() - interval '3 days';
  delete from public.notifications where read_at is not null and created_at < now() - interval '180 days';
$$;
revoke execute on function public.prune_platform_data() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('gw-recommendation-notifications', '17 9 * * *', 'select public.notify_new_recommendations()');
    perform cron.schedule('gw-prune', '41 3 * * *', 'select public.prune_platform_data()');
  end if;
end $$;
