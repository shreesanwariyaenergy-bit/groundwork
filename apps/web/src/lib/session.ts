import 'server-only';
import { redirect } from 'next/navigation';
import type { Profile } from '@groundwork/shared';
import { getServerClient } from '@/lib/supabase/server';
import { isConfigured } from '@/lib/env';

/** Server-side session gate for /app and /admin. */
export async function requireSession() {
  if (!isConfigured) redirect('/login?error=not_configured');
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: profile }, { data: role }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('admin_roles').select('role').eq('user_id', user.id).maybeSingle(),
  ]);
  if (!profile) redirect('/login?error=profile_missing');
  return { supabase, user, profile: profile as Profile, adminRole: (role?.role ?? null) as 'admin' | 'moderator' | null };
}
