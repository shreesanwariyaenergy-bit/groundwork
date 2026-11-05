-- =============================================================================
-- Security helpers, auth triggers, privileges and Row Level Security.
-- Principle: deny by default. Every user-data table has RLS enabled; sensitive
-- state transitions (connections, blocks, reports, admin actions, rate limits)
-- happen only inside SECURITY DEFINER functions that check auth.uid().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper predicates (SECURITY DEFINER so they can be used inside policies
-- without recursive RLS evaluation). All pin search_path.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_roles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_roles where user_id = auth.uid());
$$;

create or replace function public.is_blocked_pair(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.are_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.connections
    where user_a = least(a, b) and user_b = greatest(a, b)
  );
$$;

create or replace function public.has_pending_request(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.connection_requests
    where status = 'pending'
      and ((sender_id = a and recipient_id = b) or (sender_id = b and recipient_id = a))
  );
$$;

create or replace function public.current_account_status() returns public.account_status
language sql stable security definer set search_path = '' as $$
  select account_status from public.profiles where id = auth.uid();
$$;

-- Visibility rules (see docs/SECURITY.md):
--  members      -> any signed-in, active member (not blocked) can view; discoverable
--  connections  -> only connections + pending-request counterparts; not discoverable
--  hidden       -> as `connections`, and cannot receive new requests
create or replace function public.can_view_profile(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then false
    when target = auth.uid() then true
    when public.is_staff() then true
    else exists (
      select 1 from public.profiles p
      where p.id = target
        and p.account_status = 'active'
        and p.onboarding_completed
        and not public.is_blocked_pair(auth.uid(), target)
        and (
          p.visibility = 'members'
          or public.are_connected(auth.uid(), target)
          or public.has_pending_request(auth.uid(), target)
        )
    )
  end;
$$;

create or replace function public.is_conversation_member(conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members where conversation_id = conv and user_id = auth.uid()
  );
$$;

-- A member may post when: active account, member of the conversation, the
-- other member is still a connection and nobody has blocked anybody.
create or replace function public.can_post_message(conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_account_status() = 'active'
    and public.is_conversation_member(conv)
    and not exists (
      select 1 from public.conversation_members m
      where m.conversation_id = conv and m.user_id <> auth.uid()
        and (public.is_blocked_pair(auth.uid(), m.user_id) or not public.are_connected(auth.uid(), m.user_id))
    );
$$;

create or replace function public.can_access_think_project(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.think_projects where id = pid and owner_id = auth.uid())
      or exists (
        select 1 from public.think_project_shares s
        join public.think_projects t on t.id = s.project_id
        where s.project_id = pid and s.shared_with = auth.uid()
          and public.are_connected(t.owner_id, auth.uid())   -- sharing ends with the connection
      );
$$;

create or replace function public.can_view_startup_project(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.startup_projects sp
    where sp.id = pid and (
      sp.owner_id = auth.uid()
      or exists (select 1 from public.startup_project_members m where m.project_id = sp.id and m.user_id = auth.uid())
      or public.is_staff()
      or (sp.visibility = 'members' and public.can_view_profile(sp.owner_id))
      or (sp.visibility = 'connections' and public.are_connected(sp.owner_id, auth.uid()))
    )
  );
$$;

-- Read a numeric/JSON config value from feature_flags with a default.
create or replace function public.config_value(p_key text, p_path text[], p_default jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select value #> p_path from public.feature_flags where key = p_key), p_default);
$$;

-- Sliding-window rate limit. Returns true and records the event when allowed.
create or replace function public.check_rate_limit(p_action text, p_max int, p_window interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if auth.uid() is null then return false; end if;
  select count(*) into n from public.rate_limit_events
    where user_id = auth.uid() and action = p_action and created_at > now() - p_window;
  if n >= p_max then return false; end if;
  insert into public.rate_limit_events(user_id, action) values (auth.uid(), p_action);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Auth integration
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  inv public.invitations%rowtype;
begin
  insert into public.profiles (id, display_name, email_verified, is_adult_confirmed)
  values (
    new.id,
    left(coalesce(meta->>'full_name', meta->>'name', ''), 80),
    new.email_confirmed_at is not null,
    coalesce((meta->>'is_adult')::boolean, false)
  );
  insert into public.profile_preferences (user_id) values (new.id);

  if meta ? 'invite_code' then
    select * into inv from public.invitations where code = meta->>'invite_code';
    if found and inv.inviter_id <> new.id then
      insert into public.referrals (user_id, invitation_id) values (new.id, inv.id);
      update public.invitations set uses = uses + 1 where id = inv.id;
    end if;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email_verified = (new.email_confirmed_at is not null) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_email_confirmed();

-- Clients may not change privileged profile columns.
create or replace function public.tg_protect_profile_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.id := old.id;
    new.email_verified := old.email_verified;
    new.account_status := old.account_status;
    new.created_at := old.created_at;
    -- adult confirmation can only be turned on, never silently revoked/forged off->on twice
    if old.is_adult_confirmed then new.is_adult_confirmed := true; end if;
  end if;
  return new;
end $$;

create trigger profiles_protect_columns before update on public.profiles
  for each row execute function public.tg_protect_profile_columns();

-- Onboarding can only complete when the essentials exist.
create or replace function public.tg_validate_onboarding() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.onboarding_completed and not old.onboarding_completed then
    if char_length(btrim(new.display_name)) < 2
       or char_length(btrim(new.headline)) < 3
       or cardinality(new.intents) = 0
       or not new.is_adult_confirmed then
      raise exception 'onboarding_incomplete' using errcode = 'P0001',
        hint = 'Name, headline, at least one intent and age confirmation are required.';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_validate_onboarding before update on public.profiles
  for each row execute function public.tg_validate_onboarding();

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing for anon, explicit grants for authenticated.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.skill_categories, public.skills, public.roles, public.industries to anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Reference data -------------------------------------------------------------
create policy "taxonomy readable" on public.skill_categories for select using (true);
create policy "taxonomy readable" on public.skills for select using (true);
create policy "taxonomy readable" on public.roles for select using (true);
create policy "taxonomy readable" on public.industries for select using (true);
create policy "admins manage" on public.skill_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage" on public.skills for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage" on public.roles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage" on public.industries for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profiles -------------------------------------------------------------------
create policy "view permitted profiles" on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Profile sub-tables: readable when the profile is, writable by the owner.
do $$
declare t text;
begin
  foreach t in array array['founder_profiles','professional_profiles','user_skills','user_experiences','profile_links'] loop
    execute format('create policy "view with profile" on public.%I for select to authenticated using (public.can_view_profile(user_id))', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "owner update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

create policy "own preferences" on public.profile_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Startup projects -----------------------------------------------------------
create policy "view permitted projects" on public.startup_projects for select to authenticated
  using (public.can_view_startup_project(id));
create policy "owner insert" on public.startup_projects for insert to authenticated with check (owner_id = auth.uid());
create policy "owner update" on public.startup_projects for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete" on public.startup_projects for delete to authenticated using (owner_id = auth.uid());

create policy "view with project" on public.startup_project_members for select to authenticated
  using (public.can_view_startup_project(project_id));
create policy "owner manages members" on public.startup_project_members for all to authenticated
  using (exists (select 1 from public.startup_projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.startup_projects p where p.id = project_id and p.owner_id = auth.uid())
              and public.are_connected(auth.uid(), user_id));

create policy "view with project" on public.startup_project_skills for select to authenticated
  using (public.can_view_startup_project(project_id));
create policy "owner manages skills" on public.startup_project_skills for all to authenticated
  using (exists (select 1 from public.startup_projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.startup_projects p where p.id = project_id and p.owner_id = auth.uid()));

-- Discovery ------------------------------------------------------------------
create policy "own recommendations" on public.match_recommendations for select to authenticated
  using (user_id = auth.uid());
create policy "own feedback" on public.match_feedback for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own saved" on public.saved_profiles for select to authenticated using (user_id = auth.uid());
create policy "save visible" on public.saved_profiles for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_profile(saved_user_id));
create policy "update own saved" on public.saved_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "unsave" on public.saved_profiles for delete to authenticated using (user_id = auth.uid());

-- Connections (writes only through RPCs) ------------------------------------
create policy "participants view requests" on public.connection_requests for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_staff());
create policy "participants view connections" on public.connections for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- Messaging ------------------------------------------------------------------
create policy "members view conversations" on public.conversations for select to authenticated
  using (public.is_conversation_member(id));
create policy "members view membership" on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy "members read messages" on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy "connected members send" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_post_message(conversation_id));

-- Notifications & devices ----------------------------------------------------
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "update own notifications" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy "own devices" on public.device_tokens for select to authenticated using (user_id = auth.uid());
create policy "remove own devices" on public.device_tokens for delete to authenticated using (user_id = auth.uid());

-- Safety ---------------------------------------------------------------------
create policy "own blocks" on public.blocked_users for select to authenticated using (blocker_id = auth.uid());
create policy "own or staff reports" on public.user_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_staff());

-- Admin & platform -----------------------------------------------------------
create policy "self or admin" on public.admin_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "staff read audit" on public.admin_audit_logs for select to authenticated using (public.is_staff());
create policy "public or staff flags" on public.feature_flags for select to authenticated
  using (is_public or public.is_staff());
create policy "insert own events" on public.analytics_events for insert to authenticated
  with check (user_id = auth.uid());
create policy "staff read events" on public.analytics_events for select to authenticated using (public.is_staff());
create policy "own invitation" on public.invitations for select to authenticated using (inviter_id = auth.uid());
create policy "own referral" on public.referrals for select to authenticated using (user_id = auth.uid());
create policy "own or staff deletion requests" on public.account_deletion_requests for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- Think (private by default; staff have NO access) ---------------------------
create policy "owner or shared view" on public.think_projects for select to authenticated
  using (public.can_access_think_project(id));
create policy "owner insert" on public.think_projects for insert to authenticated with check (owner_id = auth.uid());
create policy "owner update" on public.think_projects for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete" on public.think_projects for delete to authenticated using (owner_id = auth.uid());

create policy "project access view" on public.think_analyses for select to authenticated
  using (public.can_access_think_project(project_id));
create policy "owner delete" on public.think_analyses for delete to authenticated using (owner_id = auth.uid());

create policy "project access view" on public.think_messages for select to authenticated
  using (public.can_access_think_project(project_id));
create policy "owner delete" on public.think_messages for delete to authenticated using (owner_id = auth.uid());

create policy "analysis access view" on public.think_sources for select to authenticated
  using (exists (select 1 from public.think_analyses a where a.id = analysis_id and public.can_access_think_project(a.project_id)));

create policy "owner or grantee view" on public.think_project_shares for select to authenticated
  using (shared_with = auth.uid() or exists (select 1 from public.think_projects t where t.id = project_id and t.owner_id = auth.uid()));
create policy "owner shares with connection" on public.think_project_shares for insert to authenticated
  with check (
    shared_by = auth.uid()
    and exists (select 1 from public.think_projects t where t.id = project_id and t.owner_id = auth.uid())
    and public.are_connected(auth.uid(), shared_with)
  );
create policy "owner revokes or grantee leaves" on public.think_project_shares for delete to authenticated
  using (shared_with = auth.uid() or exists (select 1 from public.think_projects t where t.id = project_id and t.owner_id = auth.uid()));

-- AI config & usage: staff only (clients use think_status()).
create policy "staff view providers" on public.ai_provider_configs for select to authenticated using (public.is_staff());
create policy "staff view usage" on public.ai_usage_logs for select to authenticated using (public.is_staff());

-- Tables intentionally WITHOUT client policies (definer-only access):
--   rate_limit_events
-- Any table not listed above with a policy is therefore inaccessible to clients.
