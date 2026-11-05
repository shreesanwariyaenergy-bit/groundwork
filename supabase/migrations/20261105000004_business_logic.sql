-- =============================================================================
-- Business logic shared by web and Android (exposed as Postgres RPCs).
-- Every SECURITY DEFINER function validates auth.uid() itself.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Validation triggers
-- ---------------------------------------------------------------------------
create or replace function public.tg_validate_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.timezone is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger profiles_validate_timezone before insert or update of timezone on public.profiles
  for each row execute function public.tg_validate_timezone();

create or replace function public.tg_validate_role_refs() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.seeking_roles) r where r not in (select slug from public.roles)) then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(new.industries) i where i not in (select slug from public.industries)) then
    raise exception 'invalid_industry' using errcode = '22023';
  end if;
  if cardinality(new.seeking_roles) > 8 or cardinality(new.industries) > 8 then
    raise exception 'too_many_values' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger profiles_validate_refs before insert or update of seeking_roles, industries on public.profiles
  for each row execute function public.tg_validate_role_refs();

create or replace function public.tg_limit_user_skills() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.user_skills where user_id = new.user_id) >= 25 then
    raise exception 'too_many_skills' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger user_skills_limit before insert on public.user_skills
  for each row execute function public.tg_limit_user_skills();

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
create or replace function public.tz_offset_hours(tz text) returns numeric
language plpgsql stable set search_path = '' as $$
begin
  if tz is null then return null; end if;
  return extract(epoch from (now() at time zone tz) - (now() at time zone 'UTC')) / 3600.0;
exception when others then
  return null;
end $$;

create or replace function public.role_categories(p_roles text[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct c), '{}')
  from public.roles r, unnest(r.categories) c
  where r.slug = any(p_roles);
$$;

-- Categories a user can contribute: primary role + their skills.
create or replace function public.user_categories(p_user uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct c), '{}') from (
    select unnest(r.categories) as c
      from public.profiles p join public.roles r on r.slug = p.primary_role
      where p.id = p_user
    union
    select s.category from public.user_skills us join public.skills s on s.id = us.skill_id
      where us.user_id = p_user
  ) x;
$$;

create or replace function public.array_overlap_count(a text[], b text[]) returns int
language sql immutable set search_path = '' as $$
  select count(*)::int from (select unnest(a) intersect select unnest(b)) x;
$$;

create or replace function public.card_skills(p_user uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(name order by level desc, name), '{}') from (
    select s.name, us.level from public.user_skills us join public.skills s on s.id = us.skill_id
    where us.user_id = p_user order by us.level desc, s.name limit 8
  ) x;
$$;

create or replace function public.log_admin_action(p_action text, p_target_type text, p_target_id text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_audit_logs(admin_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'));
$$;

create or replace function public.notify_user(p_user uuid, p_type text, p_title text, p_body text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  insert into public.notifications(user_id, type, title, body, data)
  values (p_user, p_type, left(p_title, 140), left(p_body, 500), coalesce(p_data, '{}'))
  returning id into nid;
  return nid;
end $$;

create or replace function public.require_active_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  st public.account_status;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select account_status into st from public.profiles where id = uid;
  if st is distinct from 'active' then raise exception 'account_not_active' using errcode = '42501'; end if;
  return uid;
end $$;

-- ---------------------------------------------------------------------------
-- Matching engine
-- Scores complementary fit between a viewer and candidates. Weights live in
-- feature_flags('matching.weights') so they can be tuned without deploys.
-- The numeric score is used for ranking only and is NOT shown to users.
-- ---------------------------------------------------------------------------
create or replace function public.availability_fit(a public.availability_level, b public.availability_level)
returns numeric language sql immutable set search_path = '' as $$
  select case
    when a is null or b is null then 0.5
    when a = b then 1.0
    when a = 'exploring' or b = 'exploring' then 0.5
    when a in ('full_time', 'part_time') and b in ('full_time', 'part_time') then 0.6
    when a in ('part_time', 'weekends') and b in ('part_time', 'weekends') then 0.7
    else 0.3 end;
$$;

create or replace function public.compute_matches(p_user uuid, p_limit int default 100)
returns table (candidate_id uuid, score numeric, match_type text, reasons text[])
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v public.profiles%rowtype;
  v_need text[];
  v_cats text[];
  v_industries text[];
  v_stage public.startup_stage;
  v_commit public.availability_level;
  v_tz numeric;
  w jsonb;
  min_score numeric;
begin
  select * into v from public.profiles where id = p_user;
  if not found then return; end if;

  w := public.config_value('matching.weights', '{}', '{
    "role": 0.25, "skill": 0.20, "mutual": 0.15, "intent": 0.15,
    "industry": 0.08, "stage": 0.05, "availability": 0.05, "timezone": 0.04, "work_mode": 0.03
  }'::jsonb);
  min_score := (public.config_value('matching.settings', array['min_score'], '0.35'::jsonb))::text::numeric;

  v_need := public.role_categories(v.seeking_roles);
  v_cats := public.user_categories(p_user);
  select sp.stage, coalesce(array_remove(v.industries || array[sp.industry], null), v.industries)
    into v_stage, v_industries
    from public.startup_projects sp where sp.owner_id = p_user and sp.is_primary;
  v_industries := coalesce(v_industries, v.industries);
  select fp.commitment_expectation into v_commit from public.founder_profiles fp where fp.user_id = p_user;
  v_commit := coalesce(v_commit, v.availability);
  v_tz := public.tz_offset_hours(v.timezone);

  return query
  with pool as (
    select c.*,
      public.user_categories(c.id) as c_cats,
      public.role_categories(c.seeking_roles) as c_need,
      (select sp.stage from public.startup_projects sp where sp.owner_id = c.id and sp.is_primary) as c_stage,
      public.tz_offset_hours(c.timezone) as c_tz
    from public.profiles c
    where c.id <> p_user
      and c.onboarding_completed
      and c.account_status = 'active'
      and c.visibility = 'members'
      and c.last_active_at > now() - interval '180 days'
      and not public.is_blocked_pair(p_user, c.id)
      and not public.are_connected(p_user, c.id)
      and not public.has_pending_request(p_user, c.id)
      and not exists (select 1 from public.match_feedback f
                      where f.user_id = p_user and f.candidate_id = c.id and f.kind in ('dismissed', 'not_relevant'))
    order by c.last_active_at desc
    limit 3000
  ),
  scored as (
    select p.id,
      -- does the candidate hold a role the viewer is looking for?
      case
        when cardinality(v.seeking_roles) = 0 then 0.3
        when p.primary_role = any(v.seeking_roles) then 1.0
        when p.c_cats && v_need then 0.7
        else 0 end as s_role,
      -- how much of what the viewer needs does the candidate cover?
      case
        when cardinality(v_need) > 0 then
          public.array_overlap_count(p.c_cats, v_need)::numeric / cardinality(v_need)
        when cardinality(p.c_cats) > 0 then
          0.6 * (cardinality(p.c_cats) - public.array_overlap_count(p.c_cats, v_cats))::numeric / cardinality(p.c_cats)
        else 0 end as s_skill,
      -- is the candidate looking for what the viewer offers?
      case
        when v.primary_role = any(p.seeking_roles) then 1.0
        when v_cats && p.c_need then 0.7
        else 0 end as s_mutual,
      case
        when 'founder' = any(v.intents) and p.intents && array['cofounder_seeker','founder']::public.user_intent[]
             and (exists (select 1 from public.roles r where r.slug = any(v.seeking_roles) and r.is_cofounder_role)
                  or 'cofounder_seeker' = any(p.intents)) then 'cofounder'
        when 'founder' = any(v.intents) and p.intents && array['professional','startup_collaborator']::public.user_intent[] then 'professional'
        when 'founder' = any(p.intents) and v.intents && array['cofounder_seeker','professional','startup_collaborator']::public.user_intent[] then 'collaborator'
        else 'none' end as m_type,
      case
        when cardinality(v_industries) = 0 or cardinality(p.industries) = 0 then 0.5
        when v_industries && p.industries then 1.0
        else 0 end as s_industry,
      case
        when v_stage is not null and v_stage = any(p.preferred_stages) then 1.0
        when p.c_stage is not null and p.c_stage = any(v.preferred_stages) then 1.0
        when (v_stage is null or cardinality(p.preferred_stages) = 0)
             and (p.c_stage is null or cardinality(v.preferred_stages) = 0) then 0.5
        else 0.2 end as s_stage,
      public.availability_fit(v_commit, p.availability) as s_avail,
      case
        when v_tz is null or p.c_tz is null then 0.5
        when abs(v_tz - p.c_tz) <= 3 then 1.0
        when abs(v_tz - p.c_tz) <= 6 then 0.6
        else 0.2 end as s_tz,
      case
        when v.work_mode in ('remote','flexible') and p.work_mode in ('remote','flexible') then 1.0
        when v.country_code is not null and v.country_code = p.country_code then
          case when v.city is not null and lower(v.city) = lower(p.city) then 1.0 else 0.8 end
        when v.work_mode is null or p.work_mode is null then 0.5
        else 0.2 end as s_mode,
      (v.country_code is not null and v.country_code = p.country_code) as same_country
    from pool p
  ),
  totals as (
    select s.*,
      ( coalesce((w->>'role')::numeric, 0) * s.s_role
      + coalesce((w->>'skill')::numeric, 0) * s.s_skill
      + coalesce((w->>'mutual')::numeric, 0) * s.s_mutual
      + coalesce((w->>'intent')::numeric, 0) * (case when s.m_type = 'none' then 0.2 else 1.0 end)
      + coalesce((w->>'industry')::numeric, 0) * s.s_industry
      + coalesce((w->>'stage')::numeric, 0) * s.s_stage
      + coalesce((w->>'availability')::numeric, 0) * s.s_avail
      + coalesce((w->>'timezone')::numeric, 0) * s.s_tz
      + coalesce((w->>'work_mode')::numeric, 0) * s.s_mode
      ) / nullif(
        coalesce((w->>'role')::numeric, 0) + coalesce((w->>'skill')::numeric, 0)
      + coalesce((w->>'mutual')::numeric, 0) + coalesce((w->>'intent')::numeric, 0)
      + coalesce((w->>'industry')::numeric, 0) + coalesce((w->>'stage')::numeric, 0)
      + coalesce((w->>'availability')::numeric, 0) + coalesce((w->>'timezone')::numeric, 0)
      + coalesce((w->>'work_mode')::numeric, 0), 0) as total
    from scored s
  )
  select t.id,
    round(t.total, 4),
    case when t.m_type = 'none' then 'collaborator' else t.m_type end,
    array_remove(array[
      case when t.s_role >= 0.7 and t.s_skill >= 0.5 then 'complementary_skills' end,
      case when t.s_role = 1.0 then 'role_fit' end,
      case when t.s_mutual >= 0.7 then 'seeking_your_expertise' end,
      case when t.s_industry = 1.0 then 'shared_industry' end,
      case when t.s_stage = 1.0 then 'stage_fit' end,
      case when t.s_avail = 1.0 then 'availability_fit' end,
      case when t.s_tz = 1.0 then 'timezone_fit' end,
      case when t.same_country then 'same_country' end
    ], null)
  from totals t
  where t.total >= min_score
  order by t.total desc, t.id
  limit greatest(1, least(p_limit, 200));
end $$;

-- Refresh the cached recommendation list for the current user.
create or replace function public.refresh_recommendations() returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  create temporary table if not exists _gw_matches (candidate_id uuid, score numeric, match_type text, reasons text[]) on commit drop;
  truncate _gw_matches;
  insert into _gw_matches select * from public.compute_matches(uid, 100);

  delete from public.match_recommendations r
    where r.user_id = uid and not exists (select 1 from _gw_matches m where m.candidate_id = r.candidate_id);
  insert into public.match_recommendations(user_id, candidate_id, score, match_type, reasons, generated_at)
    select uid, m.candidate_id, m.score, m.match_type, m.reasons, now() from _gw_matches m
  on conflict (user_id, candidate_id) do update
    set score = excluded.score, match_type = excluded.match_type, reasons = excluded.reasons, generated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Recommendation cards for the current user (refreshes cache when stale).
create or replace function public.get_recommendations(p_limit int default 20, p_offset int default 0, p_match_type text default null)
returns table (
  id uuid, display_name text, headline text, avatar_path text, country_code text, city text, timezone text,
  primary_role text, availability public.availability_level, intents public.user_intent[], years_experience smallint,
  skills text[], match_type text, reasons text[], is_saved boolean, is_new boolean
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  last_gen timestamptz;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select max(generated_at) into last_gen from public.match_recommendations where user_id = uid;
  if last_gen is null or last_gen < now() - interval '6 hours' then
    perform public.refresh_recommendations();
  end if;

  return query
  with page as (
    select r.* from public.match_recommendations r
    join public.profiles p on p.id = r.candidate_id
    where r.user_id = uid
      and (p_match_type is null or r.match_type = p_match_type)
      and p.account_status = 'active' and p.visibility = 'members'
      and not public.is_blocked_pair(uid, r.candidate_id)
      and not public.are_connected(uid, r.candidate_id)
      and not public.has_pending_request(uid, r.candidate_id)
      and not exists (select 1 from public.match_feedback f where f.user_id = uid and f.candidate_id = r.candidate_id
                      and f.kind in ('dismissed','not_relevant'))
    order by r.score desc, r.candidate_id
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
  ), marked as (
    update public.match_recommendations r set first_shown_at = now()
    from page where r.user_id = uid and r.candidate_id = page.candidate_id and r.first_shown_at is null
    returning r.candidate_id
  )
  select p.id, p.display_name, p.headline, p.avatar_path, p.country_code, p.city, p.timezone,
    p.primary_role, p.availability, p.intents, p.years_experience,
    public.card_skills(p.id), pg.match_type, pg.reasons,
    exists (select 1 from public.saved_profiles s where s.user_id = uid and s.saved_user_id = p.id),
    pg.first_shown_at is null
  from page pg join public.profiles p on p.id = pg.candidate_id
  order by pg.score desc, pg.candidate_id;
end $$;

-- Free-text + filter search over discoverable profiles.
create or replace function public.search_profiles(
  p_query text default null,
  p_roles text[] default null,          -- candidate primary role
  p_seeking text[] default null,        -- candidate is looking for these roles
  p_skills text[] default null,         -- skill slugs (any)
  p_industries text[] default null,
  p_stages public.startup_stage[] default null,
  p_availability public.availability_level[] default null,
  p_intents public.user_intent[] default null,
  p_work_modes public.work_mode[] default null,
  p_country text default null,
  p_max_tz_diff numeric default null,
  p_min_experience int default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid, display_name text, headline text, avatar_path text, country_code text, city text, timezone text,
  primary_role text, availability public.availability_level, intents public.user_intent[], years_experience smallint,
  skills text[], is_saved boolean
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  my_tz numeric;
  q text := nullif(btrim(left(coalesce(p_query, ''), 100)), '');
  tsq tsquery;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.check_rate_limit('search', 120, interval '1 minute') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select public.tz_offset_hours(timezone) into my_tz from public.profiles where profiles.id = uid;
  if q is not null then tsq := websearch_to_tsquery('english', q); end if;

  return query
  select p.id, p.display_name, p.headline, p.avatar_path, p.country_code, p.city, p.timezone,
    p.primary_role, p.availability, p.intents, p.years_experience, public.card_skills(p.id),
    exists (select 1 from public.saved_profiles s where s.user_id = uid and s.saved_user_id = p.id)
  from public.profiles p
  where p.id <> uid
    and p.onboarding_completed and p.account_status = 'active' and p.visibility = 'members'
    and not public.is_blocked_pair(uid, p.id)
    and (q is null or p.search_vector @@ tsq or p.display_name ilike '%' || q || '%' or p.headline ilike '%' || q || '%'
         or exists (select 1 from public.user_skills us join public.skills s on s.id = us.skill_id
                    where us.user_id = p.id and s.name ilike q || '%'))
    and (p_roles is null or cardinality(p_roles) = 0 or p.primary_role = any(p_roles))
    and (p_seeking is null or cardinality(p_seeking) = 0 or p.seeking_roles && p_seeking)
    and (p_skills is null or cardinality(p_skills) = 0 or exists (
          select 1 from public.user_skills us join public.skills s on s.id = us.skill_id
          where us.user_id = p.id and s.slug = any(p_skills)))
    and (p_industries is null or cardinality(p_industries) = 0 or p.industries && p_industries
         or exists (select 1 from public.startup_projects sp where sp.owner_id = p.id and sp.industry = any(p_industries)
                    and sp.visibility = 'members'))
    and (p_stages is null or cardinality(p_stages) = 0 or p.preferred_stages && p_stages
         or exists (select 1 from public.startup_projects sp where sp.owner_id = p.id and sp.stage = any(p_stages)
                    and sp.visibility = 'members'))
    and (p_availability is null or cardinality(p_availability) = 0 or p.availability = any(p_availability))
    and (p_intents is null or cardinality(p_intents) = 0 or p.intents && p_intents)
    and (p_work_modes is null or cardinality(p_work_modes) = 0 or p.work_mode = any(p_work_modes))
    and (p_country is null or p.country_code = upper(p_country))
    and (p_min_experience is null or coalesce(p.years_experience, 0) >= p_min_experience)
    and (p_max_tz_diff is null or my_tz is null
         or abs(coalesce(public.tz_offset_hours(p.timezone), 99) - my_tz) <= p_max_tz_diff)
  order by
    case when tsq is not null then ts_rank(p.search_vector, tsq) else 0 end desc,
    p.last_active_at desc, p.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------
create or replace function public.send_connection_request(p_recipient uuid, p_message text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  me public.profiles%rowtype;
  rec public.profiles%rowtype;
  per_day int;
  cooldown int;
  rid uuid;
  msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if p_recipient = uid then raise exception 'cannot_connect_self' using errcode = '22023'; end if;
  select * into me from public.profiles where id = uid;
  if not me.onboarding_completed then raise exception 'complete_onboarding_first' using errcode = 'P0001'; end if;
  select * into rec from public.profiles where id = p_recipient;
  if not found or rec.account_status <> 'active' or not rec.onboarding_completed or rec.visibility = 'hidden' then
    raise exception 'recipient_unavailable' using errcode = 'P0002';
  end if;
  if rec.visibility = 'connections' then raise exception 'recipient_unavailable' using errcode = 'P0002'; end if;
  if public.is_blocked_pair(uid, p_recipient) then raise exception 'recipient_unavailable' using errcode = 'P0002'; end if;
  if public.are_connected(uid, p_recipient) then raise exception 'already_connected' using errcode = 'P0001'; end if;
  if public.has_pending_request(uid, p_recipient) then raise exception 'request_already_pending' using errcode = 'P0001'; end if;
  if msg is not null and msg ~* '(https?://|www\.|\.[a-z]{2,}/)' then
    raise exception 'links_not_allowed_in_requests' using errcode = '22023';
  end if;

  cooldown := (public.config_value('limits.connections', array['rerequest_cooldown_days'], '30'::jsonb))::text::int;
  if exists (select 1 from public.connection_requests
             where sender_id = uid and recipient_id = p_recipient
               and status in ('rejected', 'withdrawn')
               and coalesce(responded_at, created_at) > now() - make_interval(days => cooldown)) then
    raise exception 'request_cooldown' using errcode = 'P0001';
  end if;

  per_day := case when me.email_verified
    then (public.config_value('limits.connections', array['verified_per_day'], '25'::jsonb))::text::int
    else (public.config_value('limits.connections', array['unverified_per_day'], '3'::jsonb))::text::int end;
  if not public.check_rate_limit('connection_request', per_day, interval '1 day') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.connection_requests(sender_id, recipient_id, message)
    values (uid, p_recipient, left(msg, 300)) returning id into rid;

  perform public.notify_user(p_recipient, 'connection_request',
    coalesce(nullif(me.display_name, ''), 'Someone') || ' wants to connect',
    coalesce(left(msg, 200), nullif(me.headline, '')),
    jsonb_build_object('request_id', rid, 'user_id', uid, 'path', '/connections'));
  return rid;
end $$;

create or replace function public.respond_connection_request(p_request uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  r public.connection_requests%rowtype;
  conv uuid;
  me_name text;
begin
  select * into r from public.connection_requests where id = p_request for update;
  if not found or r.recipient_id <> uid then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'request_not_pending' using errcode = 'P0001'; end if;

  if not p_accept then
    update public.connection_requests set status = 'rejected', responded_at = now() where id = r.id;
    return null;
  end if;

  if public.is_blocked_pair(r.sender_id, uid) then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  update public.connection_requests set status = 'accepted', responded_at = now() where id = r.id;
  insert into public.connections(user_a, user_b, request_id)
    values (least(r.sender_id, uid), greatest(r.sender_id, uid), r.id)
    on conflict do nothing;

  insert into public.conversations(direct_key)
    values (least(r.sender_id, uid)::text || ':' || greatest(r.sender_id, uid)::text)
    on conflict (direct_key) do update set direct_key = excluded.direct_key
    returning id into conv;
  insert into public.conversation_members(conversation_id, user_id) values (conv, r.sender_id), (conv, uid)
    on conflict do nothing;

  select display_name into me_name from public.profiles where id = uid;
  perform public.notify_user(r.sender_id, 'connection_accepted',
    coalesce(nullif(me_name, ''), 'Someone') || ' accepted your request',
    'You can now message each other.',
    jsonb_build_object('user_id', uid, 'conversation_id', conv, 'path', '/messages/' || conv));
  return conv;
end $$;

create or replace function public.withdraw_connection_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.connection_requests set status = 'withdrawn', responded_at = now()
    where id = p_request and sender_id = uid and status = 'pending';
  if not found then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  delete from public.notifications where type = 'connection_request' and data->>'request_id' = p_request::text;
end $$;

create or replace function public.remove_connection(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from public.connections where user_a = least(uid, p_other) and user_b = greatest(uid, p_other);
  -- end any Think sharing between the two
  delete from public.think_project_shares s using public.think_projects t
    where s.project_id = t.id and ((t.owner_id = uid and s.shared_with = p_other) or (t.owner_id = p_other and s.shared_with = uid));
end $$;

create or replace function public.get_connection_requests(p_direction text default 'received')
returns table (
  request_id uuid, status public.connection_status, message text, created_at timestamptz,
  user_id uuid, display_name text, headline text, avatar_path text, primary_role text, country_code text
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select r.id, r.status, r.message, r.created_at, p.id, p.display_name, p.headline, p.avatar_path, p.primary_role, p.country_code
  from public.connection_requests r
  join public.profiles p on p.id = case when p_direction = 'sent' then r.recipient_id else r.sender_id end
  where r.status = 'pending'
    and case when p_direction = 'sent' then r.sender_id = uid else r.recipient_id = uid end
    and not public.is_blocked_pair(uid, p.id)
    and p.account_status = 'active'
  order by r.created_at desc
  limit 200;
end $$;

create or replace function public.get_connections(p_limit int default 50, p_offset int default 0)
returns table (
  user_id uuid, display_name text, headline text, avatar_path text, primary_role text, country_code text,
  connected_at timestamptz, conversation_id uuid
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select p.id, p.display_name, p.headline, p.avatar_path, p.primary_role, p.country_code, c.created_at,
    (select cv.id from public.conversations cv
      where cv.direct_key = least(uid, p.id)::text || ':' || greatest(uid, p.id)::text)
  from public.connections c
  join public.profiles p on p.id = case when c.user_a = uid then c.user_b else c.user_a end
  where (c.user_a = uid or c.user_b = uid) and p.account_status <> 'suspended'
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Blocking & reporting
-- ---------------------------------------------------------------------------
create or replace function public.block_user(p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if uid = p_target then raise exception 'cannot_block_self' using errcode = '22023'; end if;
  insert into public.blocked_users(blocker_id, blocked_id) values (uid, p_target) on conflict do nothing;
  update public.connection_requests set status = 'cancelled', responded_at = now()
    where status = 'pending' and ((sender_id = uid and recipient_id = p_target) or (sender_id = p_target and recipient_id = uid));
  perform public.remove_connection(p_target);
  delete from public.saved_profiles where (user_id = uid and saved_user_id = p_target) or (user_id = p_target and saved_user_id = uid);
  delete from public.match_recommendations where (user_id = uid and candidate_id = p_target) or (user_id = p_target and candidate_id = uid);
end $$;

create or replace function public.unblock_user(p_target uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.blocked_users where blocker_id = auth.uid() and blocked_id = p_target;
$$;

create or replace function public.get_blocked_users()
returns table (user_id uuid, display_name text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, b.created_at from public.blocked_users b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid() order by b.created_at desc;
$$;

create or replace function public.report_user(p_target uuid, p_reason public.report_reason, p_details text default null, p_message uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  excerpt text;
  rid uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if uid = p_target then raise exception 'cannot_report_self' using errcode = '22023'; end if;
  if not public.check_rate_limit('report', 10, interval '1 day') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if p_message is not null then
    select m.body into excerpt from public.messages m
      where m.id = p_message and m.sender_id = p_target
        and exists (select 1 from public.conversation_members cm where cm.conversation_id = m.conversation_id and cm.user_id = uid);
    if excerpt is null then raise exception 'message_not_found' using errcode = 'P0002'; end if;
  end if;
  insert into public.user_reports(reporter_id, reported_user_id, message_id, message_excerpt, reason, details)
    values (uid, p_target, p_message, left(excerpt, 1000), p_reason, left(p_details, 1000))
    returning id into rid;
  return rid;
end $$;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user is the client role for API calls.
create or replace function public.tg_before_message() returns trigger
language plpgsql set search_path = '' as $$
declare verified boolean;
begin
  new.created_at := now();
  new.body := btrim(new.body);
  if current_user in ('authenticated', 'anon') then
    if not public.check_rate_limit('message', 30, interval '1 minute') then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
    select email_verified into verified from public.profiles where id = new.sender_id;
    if not coalesce(verified, false) and new.body ~* '(https?://|www\.)' then
      raise exception 'verify_email_to_send_links' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.tg_before_message();

create or replace function public.tg_after_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sender_name text;
  m record;
  existing uuid;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_members set last_read_at = new.created_at
    where conversation_id = new.conversation_id and user_id = new.sender_id;
  select display_name into sender_name from public.profiles where id = new.sender_id;

  for m in select user_id, muted from public.conversation_members
           where conversation_id = new.conversation_id and user_id <> new.sender_id loop
    if m.muted then continue; end if;
    -- collapse bursts into one unread notification per conversation
    select id into existing from public.notifications
      where user_id = m.user_id and type = 'message' and read_at is null
        and data->>'conversation_id' = new.conversation_id::text
      limit 1;
    if existing is not null then
      update public.notifications set body = left(new.body, 140), created_at = now() where id = existing;
    else
      perform public.notify_user(m.user_id, 'message',
        'New message from ' || coalesce(nullif(sender_name, ''), 'a connection'),
        left(new.body, 140),
        jsonb_build_object('conversation_id', new.conversation_id, 'sender_id', new.sender_id,
                           'path', '/messages/' || new.conversation_id));
    end if;
  end loop;
  return null;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.tg_after_message();

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.conversation_members set last_read_at = now()
    where conversation_id = p_conversation and user_id = auth.uid();
  update public.notifications set read_at = now()
    where user_id = auth.uid() and type = 'message' and read_at is null
      and data->>'conversation_id' = p_conversation::text;
end $$;

create or replace function public.set_conversation_muted(p_conversation uuid, p_muted boolean)
returns void language sql security definer set search_path = '' as $$
  update public.conversation_members set muted = p_muted
    where conversation_id = p_conversation and user_id = auth.uid();
$$;

create or replace function public.get_conversations(p_limit int default 30, p_offset int default 0)
returns table (
  conversation_id uuid, peer_id uuid, peer_name text, peer_headline text, peer_avatar text,
  last_message text, last_message_at timestamptz, last_sender_id uuid, unread_count int,
  can_send boolean, muted boolean
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select c.id, p.id, p.display_name, p.headline, p.avatar_path,
    lm.body, c.last_message_at, lm.sender_id,
    (select count(*)::int from public.messages x
       where x.conversation_id = c.id and x.sender_id <> uid
         and x.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)),
    (public.are_connected(uid, p.id) and not public.is_blocked_pair(uid, p.id) and p.account_status = 'active'),
    me.muted
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_members other on other.conversation_id = c.id and other.user_id <> uid
  join public.profiles p on p.id = other.user_id
  left join lateral (
    select mm.body, mm.sender_id from public.messages mm where mm.conversation_id = c.id order by mm.created_at desc limit 1
  ) lm on true
  where me.user_id = uid
  order by coalesce(c.last_message_at, c.created_at) desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Notifications & devices
-- ---------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
$$;

create or replace function public.register_device_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_platform not in ('android', 'ios', 'web') or char_length(p_token) not between 10 and 300 then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  insert into public.device_tokens(user_id, token, platform) values (auth.uid(), p_token, p_platform)
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, last_seen_at = now();
  -- cap devices per user
  delete from public.device_tokens where id in (
    select id from public.device_tokens where user_id = auth.uid() order by last_seen_at desc offset 10);
end $$;

create or replace function public.unregister_device_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.device_tokens where token = p_token and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Activity, invites, analytics
-- ---------------------------------------------------------------------------
create or replace function public.touch_activity(p_platform text default 'web')
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  update public.profiles set last_active_at = now()
    where id = uid and last_active_at < now() - interval '5 minutes';
  if not exists (select 1 from public.analytics_events where user_id = uid and name = 'app_open'
                 and created_at >= date_trunc('day', now())) then
    insert into public.analytics_events(user_id, name, platform)
      values (uid, 'app_open', case when p_platform in ('web','android','ios') then p_platform else null end);
  end if;
end $$;

create or replace function public.get_my_invite_code() returns text
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.invitations(inviter_id) values (auth.uid()) on conflict (inviter_id) do nothing;
  select code into c from public.invitations where inviter_id = auth.uid();
  return c;
end $$;

-- ---------------------------------------------------------------------------
-- Think status (quota + availability; never exposes provider secrets)
-- ---------------------------------------------------------------------------
create or replace function public.think_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lim jsonb := public.config_value('think.limits', '{}', '{"analyses_per_day": 3, "followups_per_day": 20}'::jsonb);
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
    'disclosure_acknowledged', (select ai_processing_acknowledged_at is not null from public.profile_preferences where user_id = uid)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Data export (GDPR-style access request) — everything the user owns.
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.check_rate_limit('data_export', 5, interval '1 day') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at) from auth.users u where u.id = uid),
    'profile', (select to_jsonb(p) - 'search_vector' from public.profiles p where p.id = uid),
    'founder_profile', (select to_jsonb(f) from public.founder_profiles f where f.user_id = uid),
    'professional_profile', (select to_jsonb(f) from public.professional_profiles f where f.user_id = uid),
    'skills', (select coalesce(jsonb_agg(jsonb_build_object('skill', s.name, 'level', us.level)), '[]') from public.user_skills us join public.skills s on s.id = us.skill_id where us.user_id = uid),
    'experiences', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.user_experiences e where e.user_id = uid),
    'links', (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from public.profile_links l where l.user_id = uid),
    'preferences', (select to_jsonb(pp) from public.profile_preferences pp where pp.user_id = uid),
    'startup_projects', (select coalesce(jsonb_agg(to_jsonb(sp)), '[]') from public.startup_projects sp where sp.owner_id = uid),
    'think_projects', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object(
        'analyses', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from public.think_analyses a where a.project_id = t.id),
        'messages', (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]') from public.think_messages m where m.project_id = t.id)
      )), '[]') from public.think_projects t where t.owner_id = uid),
    'connections', (select coalesce(jsonb_agg(jsonb_build_object('user_id', case when c.user_a = uid then c.user_b else c.user_a end, 'since', c.created_at)), '[]')
                    from public.connections c where c.user_a = uid or c.user_b = uid),
    'connection_requests', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.connection_requests r where r.sender_id = uid or r.recipient_id = uid),
    'messages_sent', (select coalesce(jsonb_agg(jsonb_build_object('conversation_id', m.conversation_id, 'body', m.body, 'created_at', m.created_at) order by m.created_at), '[]')
                      from public.messages m where m.sender_id = uid),
    'saved_profiles', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.saved_profiles s where s.user_id = uid),
    'blocked_users', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.blocked_users b where b.blocker_id = uid),
    'reports_filed', (select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'details', r.details, 'status', r.status, 'created_at', r.created_at)), '[]')
                      from public.user_reports r where r.reporter_id = uid),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n)), '[]') from public.notifications n where n.user_id = uid),
    'ai_usage', (select coalesce(jsonb_agg(jsonb_build_object('feature', a.feature, 'status', a.status, 'provider', a.provider, 'created_at', a.created_at)), '[]')
                 from public.ai_usage_logs a where a.user_id = uid)
  );
end $$;

-- Public (unauthenticated) deletion request for people who cannot sign in.
-- Always returns without revealing whether the email has an account.
create or replace function public.submit_deletion_request(p_email text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  em text := lower(btrim(p_email));
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 254 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if (select count(*) from public.account_deletion_requests where requested_at > now() - interval '1 day') > 500 then
    return; -- global flood guard
  end if;
  if exists (select 1 from public.account_deletion_requests where email = em::extensions.citext and status = 'pending'
             and requested_at > now() - interval '7 days') then
    return;
  end if;
  insert into public.account_deletion_requests(user_id, email, source, note)
  values ((select id from auth.users where lower(email) = em limit 1), em, 'web_form', left(p_note, 500));
end $$;

-- ---------------------------------------------------------------------------
-- Admin (server-side role checks + audit log on every mutation)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users(p_search text default null, p_status public.account_status default null,
  p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, display_name text, headline text, account_status public.account_status,
  onboarding_completed boolean, email_verified boolean, created_at timestamptz, last_active_at timestamptz,
  open_reports int, admin_role public.admin_role)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select p.id, u.email::text, p.display_name, p.headline, p.account_status, p.onboarding_completed, p.email_verified,
    p.created_at, p.last_active_at,
    (select count(*)::int from public.user_reports r where r.reported_user_id = p.id and r.status in ('open','reviewing')),
    ar.role
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.admin_roles ar on ar.user_id = p.id
  where (p_status is null or p.account_status = p_status)
    and (p_search is null or p.display_name ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%')
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_set_account_status(p_user uuid, p_status public.account_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare old_status public.account_status;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot_moderate_self' using errcode = '22023'; end if;
  if exists (select 1 from public.admin_roles where user_id = p_user) and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select account_status into old_status from public.profiles where id = p_user for update;
  if not found then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  update public.profiles set account_status = p_status where id = p_user;
  if p_status in ('suspended') then
    update public.connection_requests set status = 'cancelled', responded_at = now()
      where status = 'pending' and (sender_id = p_user or recipient_id = p_user);
    delete from public.match_recommendations where candidate_id = p_user;
  end if;
  if p_status <> 'active' then
    perform public.notify_user(p_user, 'account', 'Your account status changed',
      'Your account is now ' || p_status::text || '. Contact support if you believe this is a mistake.', '{}');
  end if;
  perform public.log_admin_action('set_account_status', 'user', p_user::text,
    jsonb_build_object('from', old_status, 'to', p_status, 'note', p_note));
end $$;

create or replace function public.admin_update_report(p_report uuid, p_status public.report_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.user_reports set status = p_status, resolution_note = left(p_note, 1000),
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_report;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  perform public.log_admin_action('update_report', 'report', p_report::text, jsonb_build_object('status', p_status, 'note', p_note));
end $$;

create or replace function public.admin_set_flag(p_key text, p_enabled boolean, p_value jsonb default null, p_description text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare old jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(f) into old from public.feature_flags f where key = p_key;
  insert into public.feature_flags(key, enabled, value, description, updated_by)
    values (p_key, p_enabled, coalesce(p_value, '{}'), p_description, auth.uid())
  on conflict (key) do update set enabled = excluded.enabled,
    value = coalesce(p_value, public.feature_flags.value),
    description = coalesce(p_description, public.feature_flags.description),
    updated_by = auth.uid();
  perform public.log_admin_action('set_flag', 'feature_flag', p_key,
    jsonb_build_object('before', old, 'enabled', p_enabled, 'value', p_value));
end $$;

create or replace function public.admin_update_ai_provider(p_id uuid, p_changes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare old jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(c) into old from public.ai_provider_configs c where id = p_id for update;
  if old is null then raise exception 'provider_not_found' using errcode = 'P0002'; end if;
  update public.ai_provider_configs set
    label = coalesce(p_changes->>'label', label),
    model = coalesce(p_changes->>'model', model),
    base_url = case when p_changes ? 'base_url' then p_changes->>'base_url' else base_url end,
    api_key_env = case when p_changes ? 'api_key_env' then p_changes->>'api_key_env' else api_key_env end,
    is_enabled = coalesce((p_changes->>'is_enabled')::boolean, is_enabled),
    is_paid = coalesce((p_changes->>'is_paid')::boolean, is_paid),
    paid_approved = coalesce((p_changes->>'paid_approved')::boolean, paid_approved),
    priority = coalesce((p_changes->>'priority')::int, priority),
    timeout_ms = coalesce((p_changes->>'timeout_ms')::int, timeout_ms),
    max_output_tokens = coalesce((p_changes->>'max_output_tokens')::int, max_output_tokens),
    max_input_chars = coalesce((p_changes->>'max_input_chars')::int, max_input_chars),
    requests_per_minute = coalesce((p_changes->>'requests_per_minute')::int, requests_per_minute),
    daily_request_limit = coalesce((p_changes->>'daily_request_limit')::int, daily_request_limit),
    cost_per_1m_input_usd = coalesce((p_changes->>'cost_per_1m_input_usd')::numeric, cost_per_1m_input_usd),
    cost_per_1m_output_usd = coalesce((p_changes->>'cost_per_1m_output_usd')::numeric, cost_per_1m_output_usd),
    monthly_budget_usd = coalesce((p_changes->>'monthly_budget_usd')::numeric, monthly_budget_usd),
    notes = coalesce(p_changes->>'notes', notes)
  where id = p_id;
  perform public.log_admin_action('update_ai_provider', 'ai_provider', p_id::text,
    jsonb_build_object('before', old, 'changes', p_changes));
end $$;

create or replace function public.admin_grant_role(p_user uuid, p_role public.admin_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.admin_roles(user_id, role, granted_by) values (p_user, p_role, auth.uid())
    on conflict (user_id) do update set role = excluded.role, granted_by = auth.uid();
  perform public.log_admin_action('grant_role', 'user', p_user::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_revoke_role(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot_revoke_self' using errcode = '22023'; end if;
  delete from public.admin_roles where user_id = p_user;
  perform public.log_admin_action('revoke_role', 'user', p_user::text, '{}');
end $$;

create or replace function public.admin_update_deletion_request(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('verified', 'completed', 'rejected') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.account_deletion_requests set status = p_status, note = coalesce(left(p_note, 500), note),
    completed_at = case when p_status in ('completed','rejected') then now() else completed_at end
  where id = p_id;
  perform public.log_admin_action('update_deletion_request', 'deletion_request', p_id::text,
    jsonb_build_object('status', p_status, 'note', p_note));
end $$;

-- Aggregate product + AI metrics. Formulas documented in docs/ANALYTICS.md.
create or replace function public.admin_metrics(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  month_start timestamptz := date_trunc('month', now());
  sent int; accepted int;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*) into sent from public.connection_requests where created_at >= since;
  select count(*) into accepted from public.connection_requests where created_at >= since and status = 'accepted';
  return jsonb_build_object(
    'window_days', p_days,
    'users_total', (select count(*) from public.profiles),
    'registrations', (select count(*) from public.profiles where created_at >= since),
    'onboarding_completed', (select count(*) from public.profiles where onboarding_completed),
    'onboarding_completed_in_window', (select count(*) from public.profiles where created_at >= since and onboarding_completed),
    'wau', (select count(distinct user_id) from public.analytics_events where name = 'app_open' and created_at >= now() - interval '7 days'),
    'mau', (select count(distinct user_id) from public.analytics_events where name = 'app_open' and created_at >= now() - interval '30 days'),
    'searches', (select count(*) from public.rate_limit_events where action = 'search' and created_at >= since),
    'connection_requests', sent,
    'connections_accepted', accepted,
    'acceptance_rate', case when sent > 0 then round(accepted::numeric / sent, 4) else null end,
    'conversations_started', (select count(*) from public.conversations c where c.created_at >= since
                              and exists (select 1 from public.messages m where m.conversation_id = c.id)),
    'messages', (select count(*) from public.messages where created_at >= since),
    'think_projects', (select count(*) from public.think_projects where created_at >= since),
    'think_reports', (select count(*) from public.think_analyses where created_at >= since and status = 'completed'),
    'think_followups', (select count(*) from public.think_messages where created_at >= since and role = 'user'),
    'reports_open', (select count(*) from public.user_reports where status in ('open','reviewing')),
    'blocks', (select count(*) from public.blocked_users where created_at >= since),
    'suspended_accounts', (select count(*) from public.profiles where account_status = 'suspended'),
    'deletion_requests_pending', (select count(*) from public.account_deletion_requests where status = 'pending'),
    'retention', (select jsonb_object_agg(k, v) from (
      select 'd' || d as k,
        (select case when count(*) = 0 then null else round(count(*) filter (where exists (
            select 1 from public.analytics_events e where e.user_id = p.id and e.name = 'app_open'
              and e.created_at >= p.created_at + make_interval(days => d)
              and e.created_at <  p.created_at + make_interval(days => d + 1)))::numeric / count(*), 4) end
         from public.profiles p
         where p.created_at >= since - make_interval(days => d) and p.created_at < now() - make_interval(days => d + 1)) as v
      from unnest(array[1, 7, 30]) d) r),
    'ai_month', (select coalesce(jsonb_agg(x), '[]') from (
      select provider, model,
        count(*) as requests,
        count(*) filter (where status = 'success') as successes,
        count(*) filter (where status = 'error') as errors,
        count(*) filter (where status in ('rate_limited','quota_blocked')) as limited,
        sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
        round(sum(estimated_cost_usd), 4) as estimated_cost_usd
      from public.ai_usage_logs where created_at >= month_start
      group by provider, model order by requests desc) x)
  );
end $$;
