'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createApi, avatarUrl, type Api, type Industry, type Profile, type Role, type Skill, type SkillCategory } from '@groundwork/shared';
import { getBrowserClient } from '@/lib/supabase/client';
import { SUPABASE_URL } from '@/lib/env';

interface Taxonomy { roles: Role[]; industries: Industry[]; skills: Skill[]; categories: SkillCategory[] }

interface AppCtx {
  user: User;
  profile: Profile;
  isStaff: boolean;
  api: Api;
  taxonomy: Taxonomy | null;
  refreshProfile: () => Promise<void>;
  avatar: (path: string | null | undefined) => string | null;
  roleName: (slug: string | null | undefined) => string;
  industryName: (slug: string | null | undefined) => string;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ user, initialProfile, isStaff, children }: { user: User; initialProfile: Profile; isStaff: boolean; children: React.ReactNode }) {
  const sb = getBrowserClient();
  const api = useMemo(() => createApi(sb), [sb]);
  const [profile, setProfile] = useState(initialProfile);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);

  useEffect(() => {
    let alive = true;
    api.taxonomy().then((t) => alive && setTaxonomy(t)).catch(() => {});
    api.touch('web').catch(() => {});
    return () => { alive = false; };
  }, [api]);

  const refreshProfile = useCallback(async () => {
    const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (data) setProfile(data as Profile);
  }, [sb, user.id]);

  const value = useMemo<AppCtx>(() => ({
    user, profile, isStaff, api, taxonomy, refreshProfile,
    avatar: (p) => avatarUrl(SUPABASE_URL, p),
    roleName: (s) => (s ? taxonomy?.roles.find((r) => r.slug === s)?.name ?? s.replace(/_/g, ' ') : ''),
    industryName: (s) => (s ? taxonomy?.industries.find((r) => r.slug === s)?.name ?? s : ''),
  }), [user, profile, isStaff, api, taxonomy, refreshProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** Minimal async-data hook with loading/error/retry. Deps must be JSON-serialisable. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(deps) + ':' + tick;
  const [state, setState] = useState<{ key: string | null; data: T | null; error: unknown }>({ key: null, data: null, error: null });
  useEffect(() => {
    let alive = true;
    fn().then((data) => alive && setState({ key, data, error: null }))
      .catch((error) => alive && setState({ key, data: null, error }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const loading = state.key !== key;
  return {
    data: state.data,
    error: loading ? null : state.error,
    loading,
    reload: () => setTick((t) => t + 1),
    setData: (d: T) => setState((s) => ({ ...s, data: d })),
  };
}
