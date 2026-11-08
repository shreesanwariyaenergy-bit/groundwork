-- =============================================================================
-- Fix: creating a Think project (or startup project) and reading it back in the
-- same statement (INSERT ... RETURNING, as supabase-js .insert().select() does)
-- failed with "new row violates row-level security policy".
-- Cause: the SELECT policies only called a SECURITY DEFINER helper that
-- re-queries the table, and that query cannot see the row being inserted.
-- Fix: check ownership directly first. Access is unchanged — owners already
-- passed the helper; the helper still grants shared/connection access.
-- =============================================================================
drop policy if exists "owner or shared view" on public.think_projects;
create policy "owner or shared view" on public.think_projects for select to authenticated
  using (owner_id = auth.uid() or public.can_access_think_project(id));

drop policy if exists "view permitted projects" on public.startup_projects;
create policy "view permitted projects" on public.startup_projects for select to authenticated
  using (owner_id = auth.uid() or public.can_view_startup_project(id));
